/**
 * NorthSoft.AI.ContentCreator — Admin Authorization Middleware
 *
 * Enforces session authentication on protected admin routes.
 * Validates session against D1 and attaches current user/session to Context.
 */

import type { Context, Next } from 'hono';
import type { AppEnv } from '../../index';
import { getSessionTokenFromCookie, validateSession } from '../auth/session';

/**
 * Middleware requiring active admin session.
 */
export async function requireAdmin(c: Context<AppEnv>, next: Next): Promise<Response | void> {
  const token = getSessionTokenFromCookie(c);

  if (!token) {
    return c.json(
      {
        error: 'Unauthorized',
        message: 'Authentication required',
      },
      401,
    );
  }

  const result = await validateSession(c.env.DB, token);

  if (!result.valid || !result.user || !result.session) {
    return c.json(
      {
        error: 'Unauthorized',
        message: 'Session invalid or expired',
      },
      401,
    );
  }

  c.set('adminUser', result.user);
  c.set('session', result.session);

  return await next();
}
