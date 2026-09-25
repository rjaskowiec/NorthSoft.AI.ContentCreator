/**
 * Admin API — Dashboard Route Handler
 */

import { Hono } from 'hono';
import type { AppEnv } from '../../index';
import { getAIProvider } from '../../ai/factory';
import { D1AuditLogger } from '../../core/audit';
import { getEnvironment, isFacebookPublishEnabled } from '../../core/environment';
import { FacebookPublisher } from '../../publishing/facebook-publisher';
import { QuotaManager } from '../../services/ai/quota-manager';

export const dashboardRouter = new Hono<AppEnv>();

/**
 * GET /api/admin/dashboard
 * Returns system status, content pipeline counts, recent activity, security status, and AI quota usage.
 */
dashboardRouter.get('/dashboard', async (c) => {
  const db = c.env.DB;
  const envName = getEnvironment(c.env?.ENVIRONMENT);
  const fbEnabled = isFacebookPublishEnabled(c.env?.FACEBOOK_PUBLISH_ENABLED, envName);
  const fbPublisher = new FacebookPublisher(c.env);
  const fbConfig = fbPublisher.getConfigStatus();

  // 1. Pipeline Status Counts
  let pipelineCounts = {
    ideas: 0,
    drafts: 0,
    awaitingQa: 0,
    approved: 0,
    scheduled: 0,
    published: 0,
    blocked: 0,
    discoveredTopics: 0,
    underReview: 0,
    rejected: 0,
  };

  let dbConnected = false;
  try {
    const countsRes = await db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM content_ideas WHERE status = 'discovered') as ideas,
           (SELECT COUNT(*) FROM posts WHERE status = 'draft') as drafts,
           (SELECT COUNT(*) FROM posts WHERE status IN ('qa_pending', 'policy_pending', 'review_pending')) as awaitingQa,
           (SELECT COUNT(*) FROM posts WHERE status = 'approved') as approved,
           (SELECT COUNT(*) FROM schedules WHERE status = 'pending') as scheduled,
           (SELECT COUNT(*) FROM posts WHERE status = 'published') as published,
           (SELECT COUNT(*) FROM posts WHERE status IN ('rejected', 'blocked')) as blocked`,
      )
      .first<{
        ideas: number;
        drafts: number;
        awaitingQa: number;
        approved: number;
        scheduled: number;
        published: number;
        blocked: number;
      }>();

    if (countsRes) {
      dbConnected = true;
      pipelineCounts = {
        ideas: countsRes.ideas || 0,
        drafts: countsRes.drafts || 0,
        awaitingQa: countsRes.awaitingQa || 0,
        approved: countsRes.approved || 0,
        scheduled: countsRes.scheduled || 0,
        published: countsRes.published || 0,
        blocked: countsRes.blocked || 0,
        discoveredTopics: countsRes.ideas || 0,
        underReview: countsRes.awaitingQa || 0,
        rejected: countsRes.blocked || 0,
      };
    }
  } catch {
    // dbConnected remains false
  }

  // 2. Fetch Recent Activity from Audit Log
  const auditLogger = new D1AuditLogger(db);
  let recentActivity: unknown[];
  try {
    recentActivity = await auditLogger.query({ limit: 10 });
  } catch {
    recentActivity = [];
  }

  // AI Quota Summary
  const quotaManager = new QuotaManager();
  const aiUsage = await quotaManager.getUsageSummary(db);

  // 3. Fetch Last Orchestrator Run Metrics
  let lastRun: Record<string, unknown> | null;
  try {
    const runRow = await db
      .prepare(
        'SELECT id, trigger_type, status, started_at, finished_at, topics_discovered, topics_selected, neurons_used, result_status, error_message FROM orchestrator_runs ORDER BY started_at DESC LIMIT 1',
      )
      .first<Record<string, unknown>>();
    lastRun = runRow || null;
  } catch {
    lastRun = null;
  }

  // AI Provider status
  const aiProvider = getAIProvider(c.env, 'researcher');
  const aiProviderStatus =
    aiProvider.name === 'mock' ? 'Mock (Development)' : `${aiProvider.name.toUpperCase()}`;

  return c.json({
    systemStatus: {
      application: 'NorthSoft AI — Content Creator',
      environment: envName.charAt(0).toUpperCase() + envName.slice(1),
      worker: 'Healthy',
      database: dbConnected ? 'Connected' : 'Error',
      aiProvider: aiProviderStatus,
      facebookPublisher: fbConfig.state,
      metaPublisherStatus: fbConfig,
      publishing: fbEnabled ? 'Enabled' : 'Disabled',
    },
    pipeline: pipelineCounts,
    lastRun,
    securityStatus: {
      authentication: 'Enabled',
      sessionType: 'HttpOnly Secure Cookie',
      csrfProtection: 'Enabled',
      bruteForceProtection: 'Enabled (D1 rate limited)',
      facebookPublishing: fbEnabled ? 'ENABLED' : 'DISABLED',
      aiProvider: aiProviderStatus,
      zeroCostConstraint: 'ENFORCED (MAX_ALLOWED_AI_COST = 0)',
    },
    aiUsage,
    recentActivity,
  });
});
