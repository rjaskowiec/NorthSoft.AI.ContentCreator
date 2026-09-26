/**
 * NorthSoft.AI.ContentCreator — Secure Session Management
 *
 * Implements server-side session lifecycle backed by D1:
 * creation, validation, invalidation, fixation protection, and secure cookies.
 */

import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { generateRandomToken, hashToken } from './crypto';

export const SESSION_COOKIE_NAME = 'admin_session';
export const DEFAULT_SESSION_TTL_HOURS = 24;

export interface AdminUser {
  id: string;
  username: string;
  status: 'active' | 'disabled';
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface AdminSession {
  id: string;
  admin_user_id: string;
  token_hash: string;
  csrf_secret: string;
  expires_at: string;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

export interface SessionValidationResult {
  valid: boolean;
  user?: AdminUser;
  session?: AdminSession;
  reason?: 'not_found' | 'expired' | 'revoked' | 'user_disabled';
}

export interface CreatedSession {
  rawToken: string;
  csrfSecret: string;
  sessionId: string;
  expiresAt: string;
}

/**
 * Creates a new secure admin session in D1.
 */
export async function createSession(
  db: D1Database,
  userId: string,
  ipAddress?: string,
  userAgent?: string,
  ttlHours = DEFAULT_SESSION_TTL_HOURS,
): Promise<CreatedSession> {
  const rawToken = generateRandomToken(32);
  const csrfSecret = generateRandomToken(32);
  const tokenHash = await hashToken(rawToken);
  const sessionId = crypto.randomUUID();

  const now = new Date();
  const expiresAtDate = new Date(now.getTime() + ttlHours * 3600 * 1000);
  const createdAt = now.toISOString();
  const expiresAt = expiresAtDate.toISOString();

  await db
    .prepare(
      `INSERT INTO admin_sessions (
        id, admin_user_id, token_hash, csrf_secret, expires_at, created_at, last_seen_at, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      sessionId,
      userId,
      tokenHash,
      csrfSecret,
      expiresAt,
      createdAt,
      createdAt,
      ipAddress || null,
      userAgent || null,
    )
    .run();

  return {
    rawToken,
    csrfSecret,
    sessionId,
    expiresAt,
  };
}

/**
 * Validates a session using the raw token string.
 */
export async function validateSession(
  db: D1Database,
  rawToken: string,
): Promise<SessionValidationResult> {
  if (!rawToken || typeof rawToken !== 'string') {
    return { valid: false, reason: 'not_found' };
  }

  const tokenHash = await hashToken(rawToken);

  const row = await db
    .prepare(
      `SELECT 
        s.id as session_id, s.admin_user_id, s.token_hash, s.csrf_secret, s.expires_at,
        s.created_at as session_created_at, s.last_seen_at, s.revoked_at, s.ip_address, s.user_agent,
        u.id as user_id, u.username, u.status as user_status, u.created_at as user_created_at,
        u.updated_at as user_updated_at, u.last_login_at
       FROM admin_sessions s
       JOIN admin_users u ON s.admin_user_id = u.id
       WHERE s.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<{
      session_id: string;
      admin_user_id: string;
      token_hash: string;
      csrf_secret: string;
      expires_at: string;
      session_created_at: string;
      last_seen_at: string;
      revoked_at: string | null;
      ip_address: string | null;
      user_agent: string | null;
      user_id: string;
      username: string;
      user_status: string;
      user_created_at: string;
      user_updated_at: string;
      last_login_at: string | null;
    }>();

  if (!row) {
    return { valid: false, reason: 'not_found' };
  }

  if (row.revoked_at !== null) {
    return { valid: false, reason: 'revoked' };
  }

  const nowIso = new Date().toISOString();
  if (row.expires_at < nowIso) {
    return { valid: false, reason: 'expired' };
  }

  if (row.user_status !== 'active') {
    return { valid: false, reason: 'user_disabled' };
  }

  // Asynchronously update last_seen_at
  db.prepare('UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?')
    .bind(nowIso, row.session_id)
    .run()
    .catch(() => {
      // Non-blocking log/ignore update failure
    });

  const user: AdminUser = {
    id: row.user_id,
    username: row.username,
    status: row.user_status as 'active' | 'disabled',
    created_at: row.user_created_at,
    updated_at: row.user_updated_at,
    last_login_at: row.last_login_at,
  };

  const session: AdminSession = {
    id: row.session_id,
    admin_user_id: row.admin_user_id,
    token_hash: row.token_hash,
    csrf_secret: row.csrf_secret,
    expires_at: row.expires_at,
    created_at: row.session_created_at,
    last_seen_at: row.last_seen_at,
    revoked_at: row.revoked_at,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
  };

  return { valid: true, user, session };
}

/**
 * Revokes a single session.
 */
export async function revokeSession(db: D1Database, rawToken: string): Promise<void> {
  const tokenHash = await hashToken(rawToken);
  await db
    .prepare("UPDATE admin_sessions SET revoked_at = datetime('now') WHERE token_hash = ?")
    .bind(tokenHash)
    .run();
}

/**
 * Revokes all sessions for a specific user.
 */
export async function revokeAllUserSessions(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare(
      "UPDATE admin_sessions SET revoked_at = datetime('now') WHERE admin_user_id = ? AND revoked_at IS NULL",
    )
    .bind(userId)
    .run();
}

/**
 * Sets session cookie with proper secure flags on Hono context.
 */
export function setSessionCookie(
  c: Context,
  rawToken: string,
  maxAgeSeconds = DEFAULT_SESSION_TTL_HOURS * 3600,
): void {
  const url = new URL(c.req.url);
  const isSecure = url.protocol === 'https:' || c.req.header('x-forwarded-proto') === 'https';

  setCookie(c, SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'Strict',
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

/**
 * Clears session cookie.
 */
export function clearSessionCookie(c: Context): void {
  const url = new URL(c.req.url);
  const isSecure = url.protocol === 'https:' || c.req.header('x-forwarded-proto') === 'https';

  setCookie(c, SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'Strict',
    path: '/',
    maxAge: 0,
  });
}

/**
 * Extracts session token from request cookie or Authorization header fallback.
 */
export function getSessionTokenFromCookie(c: Context): string | null {
  const cookieToken = getCookie(c, SESSION_COOKIE_NAME);
  if (cookieToken) {
    return cookieToken;
  }

  // Optional Bearer token header fallback for APIs
  const authHeader = c.req.header('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.substring(7).trim();
  }

  return null;
}
