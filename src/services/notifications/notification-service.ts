/**
 * NorthSoft.AI.ContentCreator — Notification & Weekly Performance Digest Service
 *
 * Handles administrative email notifications (post published, error alerts)
 * and automated Weekly Performance Digest reports via NorthSoft.MailGateway.
 */

import { IMailGatewayClient } from '../mail/mail-service';
import { PerformanceEngineService } from '../analytics/performance-engine';
import { renderEmailShell, escapeHtml } from '../mail/email-template';

export interface PublicationNotifyParams {
  postId: string;
  title: string;
  body: string;
  publishedAt: string;
  facebookPostId?: string;
  imageUrl?: string;
  imageSourceUrl?: string;
  license?: string;
}

export interface ErrorNotifyParams {
  postId?: string;
  title?: string;
  action: string;
  errorMessage: string;
  suggestedAction?: string;
}

export interface WeeklyDigestResult {
  success: boolean;
  skipped?: boolean;
  reportKey?: string;
  error?: string;
}

export class NotificationService {
  /**
   * Retrieves administrative recipient email from existing database source (admin_users table used for recovery).
   */
  public static async getAdminRecipientEmail(db: D1Database): Promise<string | null> {
    try {
      const row = await db
        .prepare(
          "SELECT email FROM admin_users WHERE email IS NOT NULL AND email != '' AND status = 'active' ORDER BY created_at ASC LIMIT 1",
        )
        .first<{ email: string }>();

      const email = row?.email?.trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return null;
      }
      return email;
    } catch {
      return null;
    }
  }

  /**
   * Sends an immediate email notification upon successful Facebook post publication.
   */
  public static async sendPublicationSuccessNotification(
    db: D1Database,
    mailClient: IMailGatewayClient,
    params: PublicationNotifyParams,
  ): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
    const recipient = await this.getAdminRecipientEmail(db);
    if (!recipient) {
      return { success: false, error: 'No active admin email configured in admin_users database.' };
    }

    const reportKey = `pub_notify:${params.postId}`;

    // Idempotency check
    try {
      const existing = await db
        .prepare("SELECT id FROM sent_email_reports WHERE report_key = ? AND status = 'SENT'")
        .bind(reportKey)
        .first();
      if (existing) {
        return { success: true, skipped: true };
      }
    } catch {
      // Table fallback if schema pending
    }

    const fbUrl = params.facebookPostId ? `https://facebook.com/${params.facebookPostId}` : '';
    const dateFormatted = new Date(params.publishedAt).toUTCString();

    const subject = `NorthSoft AI Content Creator — Post published: ${params.title}`;

    const textBody = `Post Published Successfully

Topic: ${params.title}
Published: ${dateFormatted}

Content:
${params.body}

${fbUrl ? `Facebook Post: ${fbUrl}` : ''}
${params.imageUrl ? `Image: ${params.imageUrl}` : ''}
${params.license ? `License: ${params.license}` : ''}`;

    const contentHtml = `
      <h2 style="color: #ffffff; font-size: 18px; font-weight: 700; margin: 0 0 8px 0; line-height: 24px;">${escapeHtml(params.title)}</h2>
      <p style="color: #9ca3af; font-size: 13px; margin: 0 0 20px 0; line-height: 18px;">Published UTC: <strong style="color: #cbd5e1;">${dateFormatted}</strong></p>

      <div style="background-color: #1f2937; border: 1px solid #374151; border-radius: 8px; padding: 18px; font-size: 14px; line-height: 1.6; color: #e5e7eb; white-space: pre-wrap; word-break: break-word; margin-bottom: 20px;">${escapeHtml(params.body)}</div>

      ${
        params.imageUrl
          ? `
      <div style="margin-bottom: 20px;">
        <img src="${escapeHtml(params.imageUrl)}" alt="Post illustration" style="max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #374151; display: block;" />
        ${params.license ? `<p style="color: #9ca3af; font-size: 12px; margin: 8px 0 0 0;">Source / License: ${escapeHtml(params.license)}</p>` : ''}
      </div>`
          : ''
      }
    `;

    const htmlBody = renderEmailShell({
      brandTitle: 'NorthSoft AI Content Creator',
      preheaderText: `Published: ${params.title}`,
      badge: { text: 'PUBLISHED', variant: 'success' },
      contentHtml,
      button: fbUrl
        ? { text: 'View Live Post on Facebook →', url: fbUrl, variant: 'primary' }
        : undefined,
    });

    try {
      const mailRes = await mailClient.sendEmail({
        to: recipient,
        subject,
        text: textBody,
        html: htmlBody,
      });

      await this.recordReportLog(db, {
        reportKey,
        reportType: 'PUBLICATION_NOTIFICATION',
        recipient,
        subject,
        status: mailRes.success ? 'SENT' : 'FAILED',
        errorMessage: mailRes.error,
        metadata: JSON.stringify({ postId: params.postId, facebookPostId: params.facebookPostId }),
      });

      return { success: mailRes.success, error: mailRes.error };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Sends an error alert email when critical publication failures occur.
   */
  public static async sendPublicationErrorNotification(
    db: D1Database,
    mailClient: IMailGatewayClient,
    params: ErrorNotifyParams,
  ): Promise<{ success: boolean; error?: string }> {
    const recipient = await this.getAdminRecipientEmail(db);
    if (!recipient) {
      return { success: false, error: 'No admin recipient email configured.' };
    }

    const reportKey = `err_notify:${params.postId || 'generic'}:${Date.now()}`;
    const subject = `NorthSoft AI Content Creator — Publication alert: ${params.title || params.action}`;

    const textBody = `Publication Alert

Action: ${params.action}
Topic: ${params.title || 'N/A'}
Error: ${params.errorMessage}

Suggested Action: ${params.suggestedAction || 'Check Admin Console logs for details.'}
Admin Console: https://ai.northsoft.is/admin`;

    const contentHtml = `
      <h2 style="color: #ffffff; font-size: 18px; font-weight: 700; margin: 0 0 8px 0; line-height: 24px;">Publication Alert: ${escapeHtml(params.action)}</h2>
      ${params.title ? `<p style="color: #e5e7eb; font-size: 14px; margin: 0 0 16px 0;">Topic: <strong style="color: #ffffff;">${escapeHtml(params.title)}</strong></p>` : ''}

      <div style="background-color: rgba(244, 63, 94, 0.1); border: 1px solid rgba(244, 63, 94, 0.3); border-radius: 8px; padding: 16px; color: #fda4af; font-size: 14px; line-height: 1.5; margin-bottom: 16px;">
        <div style="font-weight: 700; color: #f43f5e; margin-bottom: 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Error Detail</div>
        <div style="word-break: break-word;">${escapeHtml(params.errorMessage)}</div>
      </div>

      <p style="color: #9ca3af; font-size: 13px; line-height: 1.5; margin: 0 0 4px 0;">
        <strong style="color: #cbd5e1;">Suggested Action:</strong> ${escapeHtml(params.suggestedAction || 'Log into the Admin Console to review publication queue status.')}
      </p>
    `;

    const htmlBody = renderEmailShell({
      brandTitle: 'NorthSoft AI Content Creator',
      preheaderText: `Alert: ${params.action} publication failed`,
      badge: { text: 'ALERT', variant: 'alert' },
      contentHtml,
      button: {
        text: 'Open Admin Console →',
        url: 'https://ai.northsoft.is/admin',
        variant: 'secondary',
      },
    });

    try {
      const mailRes = await mailClient.sendEmail({
        to: recipient,
        subject,
        text: textBody,
        html: htmlBody,
      });

      await this.recordReportLog(db, {
        reportKey,
        reportType: 'ERROR_NOTIFICATION',
        recipient,
        subject,
        status: mailRes.success ? 'SENT' : 'FAILED',
        errorMessage: mailRes.error,
        metadata: JSON.stringify({ action: params.action, postId: params.postId }),
      });

      return { success: mailRes.success, error: mailRes.error };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Generates and sends the automated Weekly Performance Digest for the previous full calendar week.
   */
  public static async sendWeeklyDigest(
    db: D1Database,
    mailClient: IMailGatewayClient,
    options?: { force?: boolean; targetWeekKey?: string },
  ): Promise<WeeklyDigestResult> {
    // 0. Time Window Check: Weekly digest should only run on Monday morning (08:00–10:00 UTC) unless explicitly forced or targeting a specific week
    const now = new Date();
    const isExplicitRun = options?.force || Boolean(options?.targetWeekKey);
    if (
      !isExplicitRun &&
      (now.getUTCDay() !== 1 || now.getUTCHours() < 8 || now.getUTCHours() > 10)
    ) {
      return { success: true, skipped: true, reportKey: 'outside_weekly_window' };
    }

    const recipient = await this.getAdminRecipientEmail(db);
    if (!recipient) {
      return { success: false, error: 'No admin recipient email configured in database.' };
    }

    // 1. Determine Previous Full Calendar Week (Monday 00:00:00 UTC to Sunday 23:59:59 UTC)
    const currentDayUtc = now.getUTCDay(); // 0 is Sunday, 1 is Monday
    const daysSinceLastMonday = currentDayUtc === 0 ? 6 : currentDayUtc - 1;

    // Last week Monday
    const prevWeekMonday = new Date(now);
    prevWeekMonday.setUTCDate(now.getUTCDate() - daysSinceLastMonday - 7);
    prevWeekMonday.setUTCHours(0, 0, 0, 0);

    // Last week Sunday
    const prevWeekSunday = new Date(prevWeekMonday);
    prevWeekSunday.setUTCDate(prevWeekMonday.getUTCDate() + 6);
    prevWeekSunday.setUTCHours(23, 59, 59, 999);

    // Prior week Monday (W-2) for comparison
    const priorWeekMonday = new Date(prevWeekMonday);
    priorWeekMonday.setUTCDate(prevWeekMonday.getUTCDate() - 7);
    priorWeekMonday.setUTCHours(0, 0, 0, 0);

    const priorWeekSunday = new Date(prevWeekMonday);
    priorWeekSunday.setUTCDate(prevWeekMonday.getUTCDate() - 1);
    priorWeekSunday.setUTCHours(23, 59, 59, 999);

    // Week Key formatting (ISO Week format)
    const weekYear = prevWeekMonday.getUTCFullYear();
    const weekNumber = getIsoWeekNumber(prevWeekMonday);
    const weekKey =
      options?.targetWeekKey || `weekly_digest:${weekYear}-W${String(weekNumber).padStart(2, '0')}`;
    const reportKey = weekKey;

    // 2. Idempotency Check
    if (!options?.force) {
      try {
        const existing = await db
          .prepare("SELECT id FROM sent_email_reports WHERE report_key = ? AND status = 'SENT'")
          .bind(weekKey)
          .first();
        if (existing) {
          return { success: true, skipped: true, reportKey: weekKey };
        }
      } catch {
        // Table fallback
      }
    }

    // Date range labels
    const dateRangeLabel = `${formatShortDate(prevWeekMonday)} – ${formatShortDate(prevWeekSunday)} ${weekYear}`;

    // 3. Query Previous Week Metrics (W-1)
    const w1Stats = await this.queryPeriodMetrics(
      db,
      prevWeekMonday.toISOString(),
      prevWeekSunday.toISOString(),
    );
    // 4. Query Prior Week Metrics (W-2)
    const w2Stats = await this.queryPeriodMetrics(
      db,
      priorWeekMonday.toISOString(),
      priorWeekSunday.toISOString(),
    );

    // 5. Query Content Intelligence Profile
    const perfEngine = new PerformanceEngineService();
    const intelligence = await perfEngine.buildGeneratorContextPreview(db).catch(() => null);

    // 6. Calculate Trends
    const pubChange = computeTrend(w1Stats.publishedCount, w2Stats.publishedCount);
    const reachChange = computeTrend(w1Stats.totalReach, w2Stats.totalReach);
    const reactionsChange = computeTrend(w1Stats.totalReactions, w2Stats.totalReactions);
    const commentsChange = computeTrend(w1Stats.totalComments, w2Stats.totalComments);
    const sharesChange = computeTrend(w1Stats.totalShares, w2Stats.totalShares);
    const engPpChange = Number(
      ((w1Stats.medianEngagementRate - w2Stats.medianEngagementRate) * 100).toFixed(2),
    );
    const engPpLabel = engPpChange >= 0 ? `+${engPpChange} pp` : `${engPpChange} pp`;

    const subject = `NorthSoft AI Content Creator — Weekly Digest (${dateRangeLabel})`;

    // HTML Email Generation
    const contentHtml = `
      <h2 style="color: #ffffff; font-size: 18px; font-weight: 700; margin: 0 0 4px 0; line-height: 24px;">Weekly Content Performance Digest</h2>
      <p style="color: #9ca3af; font-size: 13px; margin: 0 0 20px 0;">Summary of Facebook publishing activity and audience engagement.</p>

      <!-- Overview KPI Table -->
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px; border-collapse: separate;">
        <tr>
          <td class="metric-stack-col" width="32%" valign="top" style="padding-right: 2%;">
            <div style="background-color: #1f2937; border: 1px solid #374151; border-radius: 8px; padding: 14px;">
              <div style="font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">Published Posts</div>
              <div style="font-size: 22px; font-weight: 700; color: #ffffff; margin: 4px 0 2px 0;">${w1Stats.publishedCount}</div>
              <div style="font-size: 12px; color: ${pubChange.color}; font-weight: 500;">${pubChange.label} vs prior</div>
            </div>
          </td>
          <td class="metric-stack-col" width="32%" valign="top" style="padding-right: 2%;">
            <div style="background-color: #1f2937; border: 1px solid #374151; border-radius: 8px; padding: 14px;">
              <div style="font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">Total Reach</div>
              <div style="font-size: 22px; font-weight: 700; color: #ffffff; margin: 4px 0 2px 0;">${w1Stats.totalReach.toLocaleString()}</div>
              <div style="font-size: 12px; color: ${reachChange.color}; font-weight: 500;">${reachChange.label} vs prior</div>
            </div>
          </td>
          <td class="metric-stack-col" width="32%" valign="top">
            <div style="background-color: #1f2937; border: 1px solid #374151; border-radius: 8px; padding: 14px;">
              <div style="font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">Engagement Rate</div>
              <div style="font-size: 22px; font-weight: 700; color: #ffffff; margin: 4px 0 2px 0;">${(w1Stats.medianEngagementRate * 100).toFixed(2)}%</div>
              <div style="font-size: 12px; color: ${engPpChange >= 0 ? '#34d399' : '#fda4af'}; font-weight: 500;">${engPpLabel} vs prior</div>
            </div>
          </td>
        </tr>
      </table>

      <!-- Interaction Details -->
      <div style="background-color: #1f2937; border: 1px solid #374151; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <div style="font-size: 13px; font-weight: 700; color: #ffffff; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.05em;">Interaction Details</div>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="font-size: 13px; color: #d1d5db; padding: 3px 0;">
              • <strong>Reactions:</strong> ${w1Stats.totalReactions} <span style="color: ${reactionsChange.color};">(${reactionsChange.label})</span>
            </td>
          </tr>
          <tr>
            <td style="font-size: 13px; color: #d1d5db; padding: 3px 0;">
              • <strong>Comments:</strong> ${w1Stats.totalComments} <span style="color: ${commentsChange.color};">(${commentsChange.label})</span>
            </td>
          </tr>
          <tr>
            <td style="font-size: 13px; color: #d1d5db; padding: 3px 0;">
              • <strong>Shares:</strong> ${w1Stats.totalShares} <span style="color: ${sharesChange.color};">(${sharesChange.label})</span>
            </td>
          </tr>
        </table>
      </div>

      <!-- Top Performing Posts -->
      <h3 style="color: #ffffff; font-size: 15px; font-weight: 700; margin: 24px 0 12px 0;">Top Performing Posts</h3>
      ${
        w1Stats.topPosts.length > 0
          ? w1Stats.topPosts
              .map(
                (p, idx) => `
        <div style="background-color: #1f2937; border: 1px solid #374151; border-radius: 8px; padding: 14px; margin-bottom: 10px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td align="left" valign="middle">
                <strong style="color: #60a5fa; font-size: 14px;">${idx + 1}. ${escapeHtml(p.title)}</strong>
              </td>
              <td align="right" valign="middle" style="padding-left: 10px; white-space: nowrap;">
                <span style="color: #34d399; font-weight: 700; font-size: 12px;">Score: ${p.score}x</span>
              </td>
            </tr>
          </table>
          <div style="font-size: 12px; color: #9ca3af; margin-top: 6px;">
            Reach: ${p.reach} | Engagement Rate: ${(p.engagementRate * 100).toFixed(2)}% | Reactions: ${p.reactions} | Comments: ${p.comments}
          </div>
          ${
            p.facebookPostId
              ? `<div style="margin-top: 8px;"><a href="https://facebook.com/${p.facebookPostId}" target="_blank" rel="noopener noreferrer" style="color: #60a5fa; font-size: 12px; text-decoration: underline;">View on Facebook &rarr;</a></div>`
              : ''
          }
        </div>
      `,
              )
              .join('')
          : '<p style="color: #9ca3af; font-size: 13px;">No publications recorded in this period.</p>'
      }

      <!-- Underperforming Posts -->
      ${
        w1Stats.weakPosts.length > 0
          ? `
      <h3 style="color: #ffffff; font-size: 15px; font-weight: 700; margin: 24px 0 12px 0;">Posts Below Benchmark</h3>
      ${w1Stats.weakPosts
        .map(
          (p) => `
        <div style="background-color: rgba(244, 63, 94, 0.05); border: 1px solid rgba(244, 63, 94, 0.2); border-radius: 8px; padding: 12px; margin-bottom: 10px;">
          <strong style="color: #fda4af; font-size: 13px;">• ${escapeHtml(p.title)}</strong>
          <div style="font-size: 12px; color: #9ca3af; margin-top: 4px;">
            Reach: ${p.reach} | Engagement Rate: ${(p.engagementRate * 100).toFixed(2)}% (${p.score}x benchmark)
          </div>
        </div>
      `,
        )
        .join('')}`
          : ''
      }

      <!-- Content Intelligence Summary -->
      <h3 style="color: #ffffff; font-size: 15px; font-weight: 700; margin: 24px 0 12px 0;">Content Intelligence Feedback Loop</h3>
      <div style="background-color: #1f2937; border: 1px solid #374151; border-radius: 8px; padding: 16px; font-size: 13px; color: #d1d5db;">
        <div>• <strong>Learning Mode:</strong> <span style="color: #60a5fa; font-weight: 600;">${intelligence?.learningMode || 'MATURE'}</span></div>
        <div style="margin-top: 4px;">• <strong>Active Strong Examples:</strong> ${intelligence?.activeStrongExamples.length || 0} active</div>
        <div style="margin-top: 4px;">• <strong>Active Weak Examples:</strong> ${intelligence?.activeWeakExamples.length || 0} active</div>
        ${
          intelligence?.learnedGuidelines && intelligence.learnedGuidelines.length > 0
            ? `
        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #374151;">
          <strong style="color: #ffffff;">Active Learned Insights:</strong>
          <ul style="margin: 6px 0 0 0; padding-left: 20px; color: #9ca3af;">
            ${intelligence.learnedGuidelines
              .slice(0, 3)
              .map((g) => `<li style="margin-bottom: 4px;">${escapeHtml(g.guidelineText)}</li>`)
              .join('')}
          </ul>
        </div>`
            : ''
        }
      </div>
    `;

    const htmlBody = renderEmailShell({
      brandTitle: 'NorthSoft AI Content Creator',
      brandSubtitle: 'Weekly Content Performance Digest',
      preheaderText: `Weekly Digest: ${w1Stats.publishedCount} posts, ${(w1Stats.medianEngagementRate * 100).toFixed(2)}% engagement`,
      badge: { text: dateRangeLabel, variant: 'info' },
      contentHtml,
      button: {
        text: 'Open Content Intelligence Panel →',
        url: 'https://ai.northsoft.is/admin?#intelligence',
        variant: 'primary',
      },
      maxWidth: 640,
    });

    const textBody = `NorthSoft AI Content Creator — Weekly Digest (${dateRangeLabel})

Weekly Overview:
- Published Posts: ${w1Stats.publishedCount} (${pubChange.label})
- Total Reach: ${w1Stats.totalReach} (${reachChange.label})
- Engagement Rate: ${(w1Stats.medianEngagementRate * 100).toFixed(2)}% (${engPpLabel})
- Reactions: ${w1Stats.totalReactions} (${reactionsChange.label})
- Comments: ${w1Stats.totalComments} (${commentsChange.label})
- Shares: ${w1Stats.totalShares} (${sharesChange.label})

Top Performing Posts:
${w1Stats.topPosts.length > 0 ? w1Stats.topPosts.map((p, idx) => `${idx + 1}. ${p.title} (Score: ${p.score}x, Reach: ${p.reach}, Eng: ${(p.engagementRate * 100).toFixed(2)}%)`).join('\n') : 'No publications recorded in this period.'}

Content Intelligence Status:
- Learning Mode: ${intelligence?.learningMode || 'MATURE'}
- Active Strong Examples: ${intelligence?.activeStrongExamples.length || 0}
- Active Weak Examples: ${intelligence?.activeWeakExamples.length || 0}

Open Admin Console: https://ai.northsoft.is/admin`;

    try {
      const mailRes = await mailClient.sendEmail({
        to: recipient,
        subject,
        text: textBody,
        html: htmlBody,
      });

      await this.recordReportLog(db, {
        reportKey,
        reportType: 'WEEKLY_DIGEST',
        recipient,
        subject,
        status: mailRes.success ? 'SENT' : 'FAILED',
        errorMessage: mailRes.error,
        metadata: JSON.stringify({
          weekKey,
          dateRangeLabel,
          publishedCount: w1Stats.publishedCount,
        }),
      });

      return { success: mailRes.success, reportKey, error: mailRes.error };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { success: false, reportKey, error: errorMsg };
    }
  }

  /**
   * Period Metrics aggregator from D1 DB tables (publications, post_performance_metrics, posts).
   */
  private static async queryPeriodMetrics(db: D1Database, startIso: string, endIso: string) {
    try {
      interface NotificationPeriodPubRow {
        pub_id: string;
        post_id: string;
        facebook_post_id: string | null;
        published_at: string;
        title: string;
        views: number | null;
        unique_views: number | null;
        reactions: number | null;
        comments: number | null;
        shares: number | null;
        clicks: number | null;
        engagement_rate: number | null;
        relative_performance: string | null;
      }

      const pubRows = await db
        .prepare(
          `SELECT pub.id as pub_id, pub.post_id, pub.facebook_post_id, pub.published_at, p.title,
                  pm.views, pm.unique_views, pm.reactions, pm.comments, pm.shares, pm.clicks, pm.engagement_rate, pm.relative_performance
           FROM publications pub
           JOIN posts p ON pub.post_id = p.id
           LEFT JOIN post_performance_metrics pm ON pm.id = (
             SELECT id FROM post_performance_metrics WHERE post_id = p.id ORDER BY measured_at DESC LIMIT 1
           )
           WHERE pub.status = 'published'
             AND pub.published_at >= ?
             AND pub.published_at <= ?
           ORDER BY pub.published_at DESC`,
        )
        .bind(startIso, endIso)
        .all<NotificationPeriodPubRow>();

      const items = pubRows.results || [];
      let totalReach = 0;
      let totalReactions = 0;
      let totalComments = 0;
      let totalShares = 0;
      const engRates: number[] = [];

      const postList: Array<{
        title: string;
        reach: number;
        reactions: number;
        comments: number;
        shares: number;
        engagementRate: number;
        score: number;
        facebookPostId?: string;
      }> = [];

      for (const item of items) {
        const reach = Math.max(item.unique_views || item.views || 0, 0);
        const reactions = Math.max(item.reactions || 0, 0);
        const comments = Math.max(item.comments || 0, 0);
        const shares = Math.max(item.shares || 0, 0);
        const engRate = item.engagement_rate || 0;
        const rawPerf = item.relative_performance;
        const score =
          typeof rawPerf === 'number'
            ? rawPerf
            : typeof rawPerf === 'string'
              ? parseFloat(rawPerf) || 1.0
              : 1.0;

        totalReach += reach;
        totalReactions += reactions;
        totalComments += comments;
        totalShares += shares;
        engRates.push(engRate);

        postList.push({
          title: item.title || 'Untitled Post',
          reach,
          reactions,
          comments,
          shares,
          engagementRate: engRate,
          score,
          facebookPostId: item.facebook_post_id || undefined,
        });
      }

      postList.sort((a, b) => b.score - a.score);

      const medianEngRate = PerformanceEngineService.calculateMedian(engRates);

      return {
        publishedCount: items.length,
        totalReach,
        totalReactions,
        totalComments,
        totalShares,
        medianEngagementRate: medianEngRate,
        topPosts: postList.slice(0, 3),
        weakPosts: postList.filter((p) => p.score < 0.8).slice(-2),
      };
    } catch {
      return {
        publishedCount: 0,
        totalReach: 0,
        totalReactions: 0,
        totalComments: 0,
        totalShares: 0,
        medianEngagementRate: 0,
        topPosts: [],
        weakPosts: [],
      };
    }
  }

  /**
   * Helper to record email log into sent_email_reports table for auditability and idempotency.
   */
  private static async recordReportLog(
    db: D1Database,
    entry: {
      reportKey: string;
      reportType: 'PUBLICATION_NOTIFICATION' | 'ERROR_NOTIFICATION' | 'WEEKLY_DIGEST';
      recipient: string;
      subject: string;
      status: 'SENT' | 'FAILED';
      errorMessage?: string;
      metadata?: string;
    },
  ): Promise<void> {
    try {
      const id = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      await db
        .prepare(
          `INSERT INTO sent_email_reports (id, report_key, report_type, recipient_email, subject, status, error_message, metadata, sent_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          entry.reportKey,
          entry.reportType,
          entry.recipient,
          entry.subject,
          entry.status,
          entry.errorMessage || null,
          entry.metadata || null,
          nowIso,
        )
        .run();
    } catch {
      // Table fallback
    }
  }
}

function computeTrend(val1: number, val2: number): { label: string; color: string } {
  if (val2 <= 0) {
    return val1 > 0 ? { label: `+${val1}`, color: '#34d399' } : { label: '0%', color: '#9ca3af' };
  }
  const pct = Math.round(((val1 - val2) / val2) * 100);
  if (pct > 0) return { label: `↑ +${pct}%`, color: '#34d399' };
  if (pct < 0) return { label: `↓ ${pct}%`, color: '#fda4af' };
  return { label: '0%', color: '#9ca3af' };
}

function getIsoWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function formatShortDate(d: Date): string {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}
