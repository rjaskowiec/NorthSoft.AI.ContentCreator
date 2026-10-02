/**
 * Admin API — Dashboard Route Handler
 *
 * Operational Overview Endpoint for NorthSoft AI Content Creator.
 * Returns operational truth: system state, next publication date calculated from real D1 schedules,
 * Facebook connection details, attention alerts, and recent user-facing activity.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../../index';
import { D1AuditLogger } from '../../core/audit';
import { getEnvironment, isFacebookPublishEnabled } from '../../core/environment';
import { FacebookPublisher } from '../../publishing/facebook-publisher';
import { QuotaManager } from '../../services/ai/quota-manager';

export const dashboardRouter = new Hono<AppEnv>();

/**
 * GET /api/admin/dashboard
 * Returns operational summary: status, real next publication from D1 schedules, pipeline counts, attention alerts.
 */
dashboardRouter.get('/dashboard', async (c) => {
  const db = c.env.DB;
  const envName = getEnvironment(c.env?.ENVIRONMENT);
  const fbFlag = c.env?.FACEBOOK_PUBLISH_ENABLED;
  const fbEnabled = isFacebookPublishEnabled(fbFlag, envName);
  const fbPublisher = new FacebookPublisher(c.env);
  const fbConfig = fbPublisher.getConfigStatus();

  let dbConnected = false;
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

  try {
    const countsRes = await db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM content_ideas WHERE status = 'discovered') as ideas,
           (SELECT COUNT(*) FROM posts WHERE status = 'draft' AND (quality_decision IS NULL OR quality_decision != 'IMPORTED')) as drafts,
           (SELECT COUNT(*) FROM posts WHERE status IN ('qa_pending', 'policy_pending', 'review_pending') AND (quality_decision IS NULL OR quality_decision != 'IMPORTED')) as awaitingQa,
           (SELECT COUNT(*) FROM posts WHERE status = 'approved' AND (quality_decision IS NULL OR quality_decision != 'IMPORTED')) as approved,
           (SELECT COUNT(*) FROM schedules WHERE status = 'pending') as scheduled,
           (SELECT COUNT(*) FROM posts WHERE status = 'published' AND (quality_decision IS NULL OR quality_decision != 'IMPORTED')) as published,
           (SELECT COUNT(*) FROM posts WHERE status IN ('rejected', 'blocked') AND (quality_decision IS NULL OR quality_decision != 'IMPORTED')) as blocked`,
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

  // 2. Calculate REAL Next Scheduled Publication from D1 schedules table!
  let nextPublication: {
    scheduledAt: string | null;
    postId: string | null;
    postTitle: string | null;
    isOverdue: boolean;
    remainingCount: number;
  } = {
    scheduledAt: null,
    postId: null,
    postTitle: null,
    isOverdue: false,
    remainingCount: 0,
  };

  if (dbConnected) {
    try {
      const nextScheduleRow = await db
        .prepare(
          `SELECT s.id, s.post_id, s.scheduled_at, p.title as post_title
           FROM schedules s
           JOIN posts p ON s.post_id = p.id
           WHERE s.status IN ('pending', 'publishing')
           ORDER BY s.scheduled_at ASC
           LIMIT 1`,
        )
        .first<{ id: string; post_id: string; scheduled_at: string; post_title: string }>();

      if (nextScheduleRow) {
        const nowMs = Date.now();
        const schedMs = new Date(nextScheduleRow.scheduled_at).getTime();
        const isOverdue = !isNaN(schedMs) && schedMs <= nowMs;

        const countRes = await db
          .prepare(`SELECT COUNT(*) as cnt FROM schedules WHERE status = 'pending'`)
          .first<{ cnt: number }>();

        nextPublication = {
          scheduledAt: nextScheduleRow.scheduled_at,
          postId: nextScheduleRow.post_id,
          postTitle: nextScheduleRow.post_title,
          isOverdue,
          remainingCount: countRes?.cnt || 1,
        };
      }
    } catch (err) {
      console.error('Error fetching next schedule for dashboard:', err);
    }
  }

  // 3. Fetch Last Successful Publication for Facebook status
  let lastPublishedAt: string | null = null;
  if (dbConnected) {
    try {
      const lastPubRow = await db
        .prepare(`SELECT published_at FROM publications WHERE status = 'published' ORDER BY published_at DESC LIMIT 1`)
        .first<{ published_at: string }>();
      lastPublishedAt = lastPubRow?.published_at || null;
    } catch {
      lastPublishedAt = null;
    }
  }

  // 4. Determine Attention / Alert Items
  const attentionItems: Array<{ type: 'error' | 'warning'; title: string; message: string; actionUrl?: string }> = [];

  if (!dbConnected) {
    attentionItems.push({
      type: 'error',
      title: 'Database Disconnected',
      message: 'Cloudflare D1 database connection failed.',
    });
  }

  if (fbConfig.state !== 'READY') {
    attentionItems.push({
      type: fbConfig.state === 'DISABLED' ? 'warning' : 'error',
      title: 'Facebook Integration Note',
      message: fbConfig.statusMessage || 'Facebook publishing is disabled or not configured.',
    });
  }

  if (nextPublication.isOverdue && nextPublication.scheduledAt) {
    attentionItems.push({
      type: 'warning',
      title: 'Overdue Publication Pending',
      message: `A post scheduled for ${nextPublication.scheduledAt} is overdue and waiting for automated publishing.`,
    });
  }

  if (dbConnected) {
    try {
      const failedPubs = await db
        .prepare(
          `SELECT COUNT(*) as cnt FROM publications WHERE status = 'failed' AND updated_at >= datetime('now', '-24 hours')`,
        )
        .first<{ cnt: number }>();
      if (failedPubs && failedPubs.cnt > 0) {
        attentionItems.push({
          type: 'error',
          title: 'Publication Failures',
          message: `${failedPubs.cnt} publication attempt(s) failed in the last 24 hours. Check Publications tab.`,
        });
      }
    } catch {
      // ignore
    }
  }

  // 5. Overall System Operational Status
  let overallStatus: 'operational' | 'degraded' | 'attention_required' = 'operational';
  if (!dbConnected) {
    overallStatus = 'attention_required';
  } else if (attentionItems.some((i) => i.type === 'error')) {
    overallStatus = 'attention_required';
  } else if (attentionItems.some((i) => i.type === 'warning')) {
    overallStatus = 'degraded';
  }

  // 6. Recent Human-Readable Activity
  const auditLogger = new D1AuditLogger(db);
  let recentActivity: unknown[];
  try {
    recentActivity = await auditLogger.query({ limit: 5 });
  } catch {
    recentActivity = [];
  }

  const aiQuotaManager = new QuotaManager();
  const aiUsage = await aiQuotaManager.getUsageSummary(db, c.env);

  return c.json({
    operationalStatus: overallStatus,
    systemStatus: {
      application: 'NorthSoft AI — Content Creator',
      environment: envName.charAt(0).toUpperCase() + envName.slice(1),
      worker: 'Healthy',
      database: dbConnected ? 'Connected' : 'Error',
      aiProvider: 'CLOUDFLARE-WORKERS-AI',
      facebookPublisher: fbConfig.state,
      publishing: fbEnabled ? 'Enabled' : 'Disabled',
    },
    facebook: {
      status: fbConfig.state === 'READY' ? 'Connected' : fbConfig.state === 'DISABLED' ? 'Disabled' : 'Not Configured',
      pageConfigured: fbConfig.pageIdConfigured,
      tokenConfigured: fbConfig.tokenConfigured,
      lastPublishedAt,
    },
    automation: {
      status: fbEnabled ? 'Active' : 'Disabled',
      schedule: 'Cron (Every 5 minutes)',
    },
    nextPublication,
    pipeline: pipelineCounts,
    attentionItems,
    securityStatus: {
      authentication: 'Enabled',
      sessionType: 'HttpOnly Secure Cookie',
      csrfProtection: 'Enabled',
      bruteForceProtection: 'Enabled (D1 rate limited)',
      facebookPublishing: fbEnabled ? 'ENABLED' : 'DISABLED',
      aiProvider: 'CLOUDFLARE-WORKERS-AI',
    },
    aiUsage,
    recentActivity,
    updatedAt: new Date().toISOString(),
  });
});
