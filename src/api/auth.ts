/**
 * NorthSoft.AI.ContentCreator — Auth API Routes
 *
 * Implements login, logout, session state validation, and CSRF token endpoints.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../index';
import { D1AuditLogger } from '../core/audit';
import { verifyPassword } from '../core/auth/crypto';
import { csrfProtection } from '../core/auth/csrf';
import {
  checkRateLimit,
  cleanupLoginAttempts,
  recordLoginAttempt,
} from '../core/auth/rate-limiter';
import {
  clearSessionCookie,
  createSession,
  getSessionTokenFromCookie,
  revokeSession,
  setSessionCookie,
  validateSession,
} from '../core/auth/session';
import { requireAdmin } from '../core/middleware/auth';
import { PasswordRecoveryService } from '../services/auth/password-recovery-service';
import { NorthSoftMailGatewayClient } from '../services/mail/mail-service';

export const authRoutes = new Hono<AppEnv>();

/**
 * POST /api/auth/login
 * Validates credentials, checks rate limits, creates session, sets HttpOnly cookie.
 */
authRoutes.post('/login', async (c) => {
  let body: { username?: string; password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON body' }, 400);
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!username || !password) {
    return c.json({ error: 'Bad Request', message: 'Username and password are required' }, 400);
  }

  const clientIp =
    c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent') || '';
  const auditLogger = new D1AuditLogger(c.env.DB);

  // 1. Check Rate Limit
  const rateLimit = await checkRateLimit(c.env.DB, clientIp, username);
  if (!rateLimit.allowed) {
    await auditLogger.log({
      eventType: 'AUTH_LOGIN_FAILURE',
      entityType: 'admin_user',
      entityId: username,
      actor: 'system',
      details: {
        reason: 'rate_limited',
        clientIp,
        username,
      },
    });

    return c.json(
      {
        error: 'Too Many Requests',
        message: 'Too many failed login attempts. Please try again later.',
      },
      429,
    );
  }

  // 2. Fetch user from D1
  const userRow = await c.env.DB.prepare(
    'SELECT id, username, password_hash, password_salt, status FROM admin_users WHERE username = ?',
  )
    .bind(username)
    .first<{
      id: string;
      username: string;
      password_hash: string;
      password_salt: string;
      status: string;
    }>();

  // 3. Verify user existence and password
  let isValidPassword = false;
  if (userRow && userRow.status === 'active') {
    isValidPassword = await verifyPassword(password, userRow.password_salt, userRow.password_hash);
  }

  if (!userRow || userRow.status !== 'active' || !isValidPassword) {
    // Record failed attempt and log audit
    await recordLoginAttempt(c.env.DB, clientIp, username, false);
    await auditLogger.log({
      eventType: 'AUTH_LOGIN_FAILURE',
      entityType: 'admin_user',
      entityId: username,
      actor: 'system',
      details: {
        reason: 'invalid_credentials',
        clientIp,
      },
    });

    // Generic response (do not reveal if username exists)
    return c.json(
      {
        error: 'Unauthorized',
        message: 'Invalid credentials.',
      },
      401,
    );
  }

  // 4. Record successful attempt
  await recordLoginAttempt(c.env.DB, clientIp, username, true);

  // 5. Update user last_login_at
  const nowIso = new Date().toISOString();
  await c.env.DB.prepare('UPDATE admin_users SET last_login_at = ?, updated_at = ? WHERE id = ?')
    .bind(nowIso, nowIso, userRow.id)
    .run();

  // 6. Create session
  const createdSession = await createSession(c.env.DB, userRow.id, clientIp, userAgent);

  // 7. Set HttpOnly Cookie
  setSessionCookie(c, createdSession.rawToken);

  // 8. Audit logs
  await auditLogger.log({
    eventType: 'AUTH_LOGIN_SUCCESS',
    entityType: 'admin_user',
    entityId: userRow.id,
    actor: 'admin',
    details: {
      username: userRow.username,
      clientIp,
    },
  });

  await auditLogger.log({
    eventType: 'SESSION_CREATED',
    entityType: 'admin_session',
    entityId: createdSession.sessionId,
    actor: 'admin',
    details: {
      adminUserId: userRow.id,
      expiresAt: createdSession.expiresAt,
    },
  });

  // Background cleanup of old attempts
  cleanupLoginAttempts(c.env.DB).catch(() => {});

  return c.json({
    success: true,
    user: {
      id: userRow.id,
      username: userRow.username,
      status: userRow.status,
    },
    csrfToken: createdSession.csrfSecret,
  });
});

/**
 * POST /api/auth/logout
 * Revokes active session, clears HttpOnly cookie, logs audit.
 */
authRoutes.post('/logout', async (c) => {
  const token = getSessionTokenFromCookie(c);
  const auditLogger = new D1AuditLogger(c.env.DB);

  if (token) {
    const sessionRes = await validateSession(c.env.DB, token);
    if (sessionRes.valid && sessionRes.session) {
      await revokeSession(c.env.DB, token);

      await auditLogger.log({
        eventType: 'AUTH_LOGOUT',
        entityType: 'admin_user',
        entityId: sessionRes.user?.id || 'unknown',
        actor: 'admin',
        details: {
          username: sessionRes.user?.username,
        },
      });

      await auditLogger.log({
        eventType: 'SESSION_REVOKED',
        entityType: 'admin_session',
        entityId: sessionRes.session.id,
        actor: 'admin',
        details: {
          reason: 'user_logout',
        },
      });
    }
  }

  clearSessionCookie(c);
  return c.json({
    success: true,
    message: 'Logged out successfully',
  });
});

/**
 * GET /api/auth/session
 * Returns authentication status and CSRF token if session is valid.
 */
authRoutes.get('/session', async (c) => {
  const token = getSessionTokenFromCookie(c);
  if (!token) {
    return c.json({ authenticated: false });
  }

  const result = await validateSession(c.env.DB, token);
  if (!result.valid || !result.user || !result.session) {
    return c.json({ authenticated: false });
  }

  return c.json({
    authenticated: true,
    user: {
      id: result.user.id,
      username: result.user.username,
      status: result.user.status,
      lastLoginAt: result.user.last_login_at,
    },
    csrfToken: result.session.csrf_secret,
  });
});

/**
 * GET /api/auth/csrf
 * Returns CSRF token for current authenticated session.
 */
authRoutes.get('/csrf', async (c) => {
  const token = getSessionTokenFromCookie(c);
  if (!token) {
    return c.json({ error: 'Unauthorized', message: 'Session required' }, 401);
  }

  const result = await validateSession(c.env.DB, token);
  if (!result.valid || !result.session) {
    return c.json({ error: 'Unauthorized', message: 'Session invalid' }, 401);
  }

  return c.json({ csrfToken: result.session.csrf_secret });
});

/**
 * GET /api/auth/recovery-email
 * Returns current password recovery email status for logged-in administrator.
 */
authRoutes.get('/recovery-email', requireAdmin, async (c) => {
  const user = c.get('adminUser');
  if (!user) {
    return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
  }

  const mailGateway = new NorthSoftMailGatewayClient(c.env);
  const auditLogger = new D1AuditLogger(c.env.DB);
  const recoveryService = new PasswordRecoveryService(c.env.DB, mailGateway, auditLogger);

  const status = await recoveryService.getRecoveryEmail(user.id);
  return c.json(status);
});

/**
 * PUT /api/auth/recovery-email
 * Updates recovery email for logged-in administrator.
 * Requires active session and valid CSRF token.
 */
authRoutes.put('/recovery-email', requireAdmin, csrfProtection, async (c) => {
  let body: { email?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON body' }, 400);
  }

  const user = c.get('adminUser');
  if (!user) {
    return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
  }

  const clientIp =
    c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1';

  const mailGateway = new NorthSoftMailGatewayClient(c.env);
  const auditLogger = new D1AuditLogger(c.env.DB);
  const recoveryService = new PasswordRecoveryService(c.env.DB, mailGateway, auditLogger);

  const result = await recoveryService.updateRecoveryEmail({
    userId: user.id,
    email: body.email || '',
    clientIp,
  });

  if (!result.success) {
    return c.json({ error: 'Bad Request', message: result.message }, 400);
  }

  return c.json(result);
});

/**
 * POST /api/auth/change-password
 * Allows authenticated administrator to change their password.
 * Requires active session and valid CSRF token.
 */
authRoutes.post('/change-password', requireAdmin, csrfProtection, async (c) => {
  let body: { currentPassword?: string; newPassword?: string; confirmPassword?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON body' }, 400);
  }

  const user = c.get('adminUser');
  if (!user) {
    return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
  }

  const clientIp =
    c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent') || '';

  const mailGateway = new NorthSoftMailGatewayClient(c.env);
  const auditLogger = new D1AuditLogger(c.env.DB);
  const recoveryService = new PasswordRecoveryService(c.env.DB, mailGateway, auditLogger);

  const result = await recoveryService.changePassword({
    userId: user.id,
    currentPassword: body.currentPassword || '',
    newPassword: body.newPassword || '',
    confirmPassword: body.confirmPassword || '',
    clientIp,
    userAgent,
  });

  if (!result.success) {
    return c.json({ error: 'Bad Request', message: result.message }, 400);
  }

  if (result.newSession) {
    setSessionCookie(c, result.newSession.rawToken);
    return c.json({
      success: true,
      message: result.message,
      csrfToken: result.newSession.csrfSecret,
    });
  }

  return c.json({ success: true, message: result.message });
});

/**
 * POST /api/auth/forgot-password
 * Initiates email-based password recovery.
 * Account Enumeration Protection: Always returns HTTP 200 with identical generic response.
 */
authRoutes.post('/forgot-password', async (c) => {
  let body: { email?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON body' }, 400);
  }

  const clientIp =
    c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1';
  const rawEmail = typeof body.email === 'string' ? body.email.trim() : '';

  // Rate Limiting
  const rateLimit = await checkRateLimit(c.env.DB, clientIp, rawEmail || 'forgot-password-attempt');
  if (!rateLimit.allowed) {
    return c.json(
      {
        error: 'Too Many Requests',
        message: 'Too many password recovery attempts. Please try again later.',
      },
      429,
    );
  }

  const requestOrigin = new URL(c.req.url).origin;
  const mailGateway = new NorthSoftMailGatewayClient(c.env);
  const auditLogger = new D1AuditLogger(c.env.DB);
  const recoveryService = new PasswordRecoveryService(c.env.DB, mailGateway, auditLogger);

  const result = await recoveryService.requestPasswordReset({
    email: rawEmail,
    clientIp,
    requestOrigin,
  });

  return c.json(result);
});

/**
 * POST /api/auth/reset-password
 * Resets administrator password using single-use reset token.
 */
authRoutes.post('/reset-password', async (c) => {
  let body: { token?: string; newPassword?: string; confirmPassword?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON body' }, 400);
  }

  const clientIp =
    c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1';
  const token = typeof body.token === 'string' ? body.token.trim() : '';

  // Rate Limiting
  const rateLimit = await checkRateLimit(c.env.DB, clientIp, 'reset-password-attempt');
  if (!rateLimit.allowed) {
    return c.json(
      {
        error: 'Too Many Requests',
        message: 'Too many password reset attempts. Please try again later.',
      },
      429,
    );
  }

  const mailGateway = new NorthSoftMailGatewayClient(c.env);
  const auditLogger = new D1AuditLogger(c.env.DB);
  const recoveryService = new PasswordRecoveryService(c.env.DB, mailGateway, auditLogger);

  const result = await recoveryService.resetPassword({
    token,
    newPassword: body.newPassword || '',
    confirmPassword: body.confirmPassword || '',
    clientIp,
  });

  if (!result.success) {
    return c.json({ error: 'Bad Request', message: result.message }, 400);
  }

  return c.json(result);
});
