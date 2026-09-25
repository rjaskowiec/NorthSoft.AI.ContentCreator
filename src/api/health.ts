/**
 * Health & Status API Routes
 *
 * Provides system health information and readiness checks.
 * These endpoints do NOT expose secrets or internal configuration.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../index';

export const healthRoutes = new Hono<AppEnv>();

/**
 * GET /api/health
 * Basic health check — returns operational status.
 */
healthRoutes.get('/', async (c) => {
  const env = c.env;

  // Check D1 connectivity
  let dbStatus: 'connected' | 'error' = 'error';
  let dbLatencyMs: number | null = null;
  try {
    const start = Date.now();
    await env.DB.prepare('SELECT 1 AS ok').first();
    dbLatencyMs = Date.now() - start;
    dbStatus = 'connected';
  } catch {
    // dbStatus remains 'error'
  }

  const isHealthy = dbStatus === 'connected';

  return c.json(
    {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      environment: env.ENVIRONMENT,
      version: '0.1.0',
      checks: {
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
        },
        worker: {
          status: 'operational',
        },
      },
    },
    isHealthy ? 200 : 503,
  );
});

/**
 * GET /api/health/ready
 * Readiness probe — confirms the system can accept work.
 */
healthRoutes.get('/ready', async (c) => {
  try {
    await c.env.DB.prepare('SELECT 1 AS ok').first();
    return c.json({ ready: true }, 200);
  } catch {
    return c.json({ ready: false, reason: 'database_unavailable' }, 503);
  }
});
