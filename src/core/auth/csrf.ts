/**
 * NorthSoft.AI.ContentCreator — CSRF Protection Module
 *
 * Implements session-bound CSRF token verification for all state-changing requests
 * (POST, PUT, PATCH, DELETE).
 */

import type { Context, Next } from 'hono';
import { timingSafeEqual } from './crypto';
import type { AdminSession } from './session';

export const CSRF_HEADER_NAME = 'x-csrf-token';
export const CSRF_FORM_PARAM = '_csrf';

/**
 * Validates CSRF token provided in request against expected CSRF secret.
 */
export function verifyCsrfToken(
  submittedToken: string | null | undefined,
  expectedSecret: string,
): boolean {
  if (!submittedToken || !expectedSecret) {
    return false;
  }
  return timingSafeEqual(submittedToken, expectedSecret);
}

/**
 * Middleware enforcing CSRF protection on state-changing admin requests.
 * Expects `session` to be set on context (via requireAdmin middleware).
 */
export async function csrfProtection(c: Context, next: Next): Promise<Response | void> {
  const method = c.req.method.toUpperCase();

  // Safe HTTP methods do not mutate state
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return await next();
  }

  // Retrieve session attached by requireAdmin middleware
  const session = c.get('session') as AdminSession | undefined;
  if (!session || !session.csrf_secret) {
    return c.json(
      {
        error: 'Forbidden',
        message: 'CSRF protection requires an active session',
      },
      403,
    );
  }

  // Extract CSRF token from request header or body
  let submittedToken = c.req.header(CSRF_HEADER_NAME);

  if (
    !submittedToken &&
    c.req.header('content-type')?.includes('application/x-www-form-urlencoded')
  ) {
    try {
      const body = await c.req.parseBody();
      submittedToken = body[CSRF_FORM_PARAM] as string;
    } catch {
      // Ignore body parse errors
    }
  }

  if (!verifyCsrfToken(submittedToken, session.csrf_secret)) {
    return c.json(
      {
        error: 'Forbidden',
        message: 'Invalid or missing CSRF token',
      },
      403,
    );
  }

  return await next();
}
