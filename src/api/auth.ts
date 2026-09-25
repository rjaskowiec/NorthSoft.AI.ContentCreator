/**
 * NorthSoft.AI.ContentCreator — Auth API Routes
 *
 * Implements login, logout, session state validation, and CSRF token endpoints.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../index';
import { D1AuditLogger } from '../core/audit';
import { verifyPassword } from '../core/auth/crypto';
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
