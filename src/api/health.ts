/**
 * Health & Status API Routes
 *
 * Provides system health information and readiness checks.
 * These endpoints do NOT expose secrets or internal configuration.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../core/types';
import { CloudflareUsageService } from '../services/cloudflare/cloudflare-usage-service';

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

  // Check Cloudflare Analytics API telemetry health (without revealing secrets)
  let telemetryCheck: { status: string; source: string; reason?: string } = {
    status: 'unconfigured',
    source: 'None',
  };
  try {
    const cfUsage = CloudflareUsageService.fromEnv(env);
    const d1Usage = await cfUsage.getVerifiedD1Usage({ forceRefresh: true });
    telemetryCheck = {
      status: d1Usage.status,
      source: d1Usage.source,
      reason: d1Usage.reason,
    };
  } catch (tErr: unknown) {
    telemetryCheck = {
      status: 'error',
      source: 'Exception',
      reason: tErr instanceof Error ? tErr.message : String(tErr),
    };
  }

  const isHealthy = dbStatus === 'connected';

  return c.json(
    {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      environment: env?.ENVIRONMENT || 'development',
      version: '0.1.0',
      checks: {
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
        },
        worker: {
          status: 'operational',
        },
        telemetry: telemetryCheck,
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
