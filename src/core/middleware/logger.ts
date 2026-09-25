/**
 * Request Logger Middleware
 *
 * Logs incoming requests with timing information.
 * NEVER logs secrets, access tokens, or authorization headers.
 */

import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../../index';

/**
 * Sensitive headers that must NEVER appear in logs.
 */
const REDACTED_HEADERS = new Set(['authorization', 'cookie', 'x-api-key', 'x-auth-token']);

export function requestLogger(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const start = Date.now();
    const method = c.req.method;
    const path = c.req.path;
    const requestId = crypto.randomUUID();

    // Attach request ID for tracing
    c.header('X-Request-Id', requestId);

    try {
      await next();
    } finally {
      const duration = Date.now() - start;
      const status = c.res.status;

      // Safe log entry — no secrets
      const logEntry = {
        requestId,
        method,
        path,
        status,
        durationMs: duration,
        // Only log safe headers
        userAgent: c.req.header('user-agent') ?? 'unknown',
        cfRay: c.req.header('cf-ray') ?? undefined,
      };

      if (status >= 500) {
        console.error('[REQUEST]', JSON.stringify(logEntry));
      } else if (status >= 400) {
        console.warn('[REQUEST]', JSON.stringify(logEntry));
      } else {
        console.log('[REQUEST]', JSON.stringify(logEntry));
      }
    }
  };
}

/**
 * Redact a header value if it's sensitive.
 */
export function safeHeaderValue(name: string, value: string): string {
  if (REDACTED_HEADERS.has(name.toLowerCase())) {
    return '[REDACTED]';
  }
  return value;
}
