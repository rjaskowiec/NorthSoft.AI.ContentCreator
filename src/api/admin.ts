/**
 * NorthSoft.AI.ContentCreator — Admin API Routes
 *
 * Provides system status, content pipeline metrics, recent audit events,
 * and content settings for the Admin Dashboard. Protected by requireAdmin middleware.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../index';
import { D1AuditLogger } from '../core/audit';
import { getEnvironment, isFacebookPublishEnabled } from '../core/environment';
import { requireAdmin } from '../core/middleware/auth';

export const adminRoutes = new Hono<AppEnv>();

// Apply requireAdmin middleware to all /api/admin/* endpoints
adminRoutes.use('*', requireAdmin);

/**
 * GET /api/admin/dashboard
 * Returns system status, content pipeline counts, recent activity, and security status.
 */
adminRoutes.get('/dashboard', async (c) => {
  const db = c.env.DB;
  const envName = getEnvironment(c.env?.ENVIRONMENT);
  const fbEnabled = isFacebookPublishEnabled(c.env?.FACEBOOK_PUBLISH_ENABLED, envName);

  // 1. Check Database connection & query pipeline counts
  let dbConnected = false;
  let pipelineCounts = {
    ideas: 0,
    drafts: 0,
    awaitingQa: 0,
    approved: 0,
    scheduled: 0,
    published: 0,
    blocked: 0,
  };

  try {
    const countsResult = await db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM content_ideas) as ideas,
          (SELECT COUNT(*) FROM posts WHERE status = 'draft') as drafts,
          (SELECT COUNT(*) FROM posts WHERE status = 'in_review') as awaiting_qa,
          (SELECT COUNT(*) FROM posts WHERE status = 'approved') as approved,
          (SELECT COUNT(*) FROM posts WHERE status = 'scheduled') as scheduled,
          (SELECT COUNT(*) FROM posts WHERE status = 'published') as published,
          (SELECT COUNT(*) FROM posts WHERE status = 'blocked') as blocked`,
      )
      .first<{
        ideas: number;
        drafts: number;
        awaiting_qa: number;
        approved: number;
        scheduled: number;
        published: number;
        blocked: number;
      }>();

    if (countsResult) {
      dbConnected = true;
      pipelineCounts = {
        ideas: countsResult.ideas || 0,
        drafts: countsResult.drafts || 0,
        awaitingQa: countsResult.awaiting_qa || 0,
        approved: countsResult.approved || 0,
        scheduled: countsResult.scheduled || 0,
        published: countsResult.published || 0,
        blocked: countsResult.blocked || 0,
      };
    }
  } catch {
    dbConnected = false;
  }

  // 2. Fetch Recent Audit Activity
  let recentActivity: Array<{
    id: string;
    eventType: string;
    actor: string;
    timestamp: string;
    summary: string;
  }> = [];

  try {
    const auditLogger = new D1AuditLogger(db);
    const logs = await auditLogger.query({ limit: 10 });
    recentActivity = logs.map((log) => ({
      id: log.id || '',
      eventType: log.eventType,
      actor: log.actor,
      timestamp: log.timestamp,
      summary: `${log.actor.toUpperCase()} performed ${log.eventType} on ${log.entityType}:${log.entityId}`,
    }));
  } catch {
    // Keep default empty array
  }

  return c.json({
    systemStatus: {
      application: 'NorthSoft AI — Content Creator',
      environment: envName.charAt(0).toUpperCase() + envName.slice(1),
      worker: 'Healthy',
      database: dbConnected ? 'Connected' : 'Error',
      aiProvider: 'Not configured',
      facebookPublisher: 'Not configured',
      publishing: fbEnabled ? 'Enabled' : 'Disabled',
    },
    pipeline: pipelineCounts,
    securityStatus: {
      authentication: 'Enabled',
      sessionType: 'HttpOnly Secure Cookie',
      csrfProtection: 'Enabled',
      bruteForceProtection: 'Enabled (D1 rate limited)',
      facebookPublishing: fbEnabled ? 'ENABLED' : 'DISABLED',
      aiProvider: 'Not configured',
    },
    recentActivity,
  });
});

/**
 * GET /api/admin/settings
 * Returns content brand settings.
 */
adminRoutes.get('/settings', async (c) => {
  const db = c.env.DB;
  const rows = await db
    .prepare('SELECT key, value, description, updated_at FROM content_settings ORDER BY key ASC')
    .all<{
      key: string;
      value: string;
      description: string;
      updated_at: string;
    }>();

  return c.json({
    settings: rows.results || [],
  });
});
