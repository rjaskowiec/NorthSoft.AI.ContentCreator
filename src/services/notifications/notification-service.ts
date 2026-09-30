/**
 * NorthSoft.AI.ContentCreator — Notification & Weekly Performance Digest Service
 *
 * Handles administrative email notifications (post published, error alerts)
 * and automated Weekly Performance Digest reports via NorthSoft.MailGateway.
 */

import { IMailGatewayClient } from '../mail/mail-service';
import { PerformanceEngineService } from '../analytics/performance-engine';

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
        .prepare("SELECT email FROM admin_users WHERE email IS NOT NULL AND email != '' AND status = 'active' ORDER BY created_at ASC LIMIT 1")
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

    const fbUrl = params.facebookPostId ? `https://facebook.com/${params.facebookPostId}` : '#';
    const dateFormatted = new Date(params.publishedAt).toUTCString();

    const subject = `NorthSoft AI Content Creator — Post published: ${params.title}`;

    const textBody = `Post Published Successfully

Topic: ${params.title}
Published: ${dateFormatted}

Content:
${params.body}

Facebook Post: ${fbUrl}
${params.imageUrl ? `Image: ${params.imageUrl}` : ''}
${params.license ? `License: ${params.license}` : ''}`;

    const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Inter, Arial, sans-serif; line-height: 1.6; color: #f3f4f6; background-color: #0b0f19; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #111827; padding: 28px; border-radius: 12px; border: 1px solid #1f2937;">
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; border-bottom: 1px solid #1f2937; padding-bottom: 15px;">
      <h2 style="color: #60a5fa; margin: 0; font-size: 1.2rem;">NorthSoft AI Content Creator</h2>
      <span style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); font-weight: bold; font-size: 0.75rem; padding: 4px 10px; border-radius: 9999px;">✓ PUBLISHED</span>
    </div>

    <h3 style="color: #ffffff; margin-top: 0; font-size: 1.1rem;">${escapeHtml(params.title)}</h3>
    <p style="color: #9ca3af; font-size: 0.85rem; margin-bottom: 20px;">Published UTC: <strong>${dateFormatted}</strong></p>

    <div style="background: #1f2937; padding: 16px; border-radius: 8px; font-size: 0.9rem; color: #e5e7eb; white-space: pre-wrap; word-break: break-word; margin-bottom: 20px;">${escapeHtml(params.body)}</div>

    ${params.imageUrl ? `
    <div style="margin-bottom: 20px;">
      <img src="${escapeHtml(params.imageUrl)}" alt="Post illustration" style="max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #374151;" />
      ${params.license ? `<p style="color: #9ca3af; font-size: 0.75rem; margin-top: 6px;">Source/License: ${escapeHtml(params.license)}</p>` : ''}
    </div>` : ''}

    <div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid #1f2937; display: flex; justify-content: space-between; align-items: center;">
      <a href="${fbUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #1877f2; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 0.875rem; display: inline-block;">View Live Post on Facebook &rarr;</a>
    </div>
  </div>
</body>
</html>`;

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

Suggested Action: ${params.suggestedAction || 'Check Admin Console logs for details.'}`;

    const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Inter, Arial, sans-serif; line-height: 1.6; color: #f3f4f6; background-color: #0b0f19; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #111827; padding: 28px; border-radius: 12px; border: 1px solid #1f2937;">
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; border-bottom: 1px solid #1f2937; padding-bottom: 15px;">
      <h2 style="color: #60a5fa; margin: 0; font-size: 1.2rem;">NorthSoft AI Content Creator</h2>
      <span style="background: rgba(244, 63, 94, 0.15); color: #fda4af; border: 1px solid rgba(244, 63, 94, 0.3); font-weight: bold; font-size: 0.75rem; padding: 4px 10px; border-radius: 9999px;">⚠ ALERT</span>
    </div>

    <h3 style="color: #ffffff; margin-top: 0; font-size: 1.1rem;">Publication Alert: ${escapeHtml(params.action)}</h3>
    ${params.title ? `<p style="color: #e5e7eb; font-size: 0.9rem;">Topic: <strong>${escapeHtml(params.title)}</strong></p>` : ''}

    <div style="background: rgba(244, 63, 94, 0.1); border: 1px solid rgba(244, 63, 94, 0.25); color: #fda4af; padding: 14px; border-radius: 8px; font-size: 0.875rem; margin-bottom: 20px;">
      <strong>Error Detail:</strong> ${escapeHtml(params.errorMessage)}
    </div>

    <p style="color: #9ca3af; font-size: 0.85rem;">
      <strong>Suggested Action:</strong> ${escapeHtml(params.suggestedAction || 'Log into the Admin Console to review publication queue status.')}
    </p>

    <div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid #1f2937;">
      <a href="https://ai.northsoft.is/admin" target="_blank" rel="noopener noreferrer" style="background-color: #374151; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 0.875rem; display: inline-block;">Open Admin Console &rarr;</a>
    </div>
  </div>
</body>
</html>`;

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
    const recipient = await this.getAdminRecipientEmail(db);
    if (!recipient) {
      return { success: false, error: 'No admin recipient email configured in database.' };
    }

    // 1. Determine Previous Full Calendar Week (Monday 00:00:00 UTC to Sunday 23:59:59 UTC)
    const now = new Date();
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
    const weekKey = options?.targetWeekKey || `weekly_digest:${weekYear}-W${String(weekNumber).padStart(2, '0')}`;
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
    const w1Stats = await this.queryPeriodMetrics(db, prevWeekMonday.toISOString(), prevWeekSunday.toISOString());
    // 4. Query Prior Week Metrics (W-2)
    const w2Stats = await this.queryPeriodMetrics(db, priorWeekMonday.toISOString(), priorWeekSunday.toISOString());

    // 5. Query Content Intelligence Profile
    const perfEngine = new PerformanceEngineService();
    const intelligence = await perfEngine.buildGeneratorContextPreview(db).catch(() => null);

    // 6. Calculate Trends
    const pubChange = computeTrend(w1Stats.publishedCount, w2Stats.publishedCount);
    const reachChange = computeTrend(w1Stats.totalReach, w2Stats.totalReach);
    const reactionsChange = computeTrend(w1Stats.totalReactions, w2Stats.totalReactions);
    const commentsChange = computeTrend(w1Stats.totalComments, w2Stats.totalComments);
    const sharesChange = computeTrend(w1Stats.totalShares, w2Stats.totalShares);
    const engPpChange = Number(((w1Stats.medianEngagementRate - w2Stats.medianEngagementRate) * 100).toFixed(2));
    const engPpLabel = engPpChange >= 0 ? `+${engPpChange} pp` : `${engPpChange} pp`;

    const subject = `NorthSoft AI Content Creator — Weekly Digest (${dateRangeLabel})`;

    // HTML Email Generation
    const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Inter, Arial, sans-serif; line-height: 1.6; color: #f3f4f6; background-color: #0b0f19; padding: 20px;">
  <div style="max-width: 640px; margin: 0 auto; background: #111827; padding: 28px; border-radius: 12px; border: 1px solid #1f2937;">
    
    <!-- Header -->
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; border-bottom: 1px solid #1f2937; padding-bottom: 15px;">
      <div>
        <h2 style="color: #60a5fa; margin: 0; font-size: 1.2rem;">NorthSoft AI Content Creator</h2>
        <p style="color: #9ca3af; margin: 4px 0 0 0; font-size: 0.85rem;">Weekly Content Performance Digest</p>
      </div>
      <span style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); font-weight: bold; font-size: 0.75rem; padding: 4px 10px; border-radius: 9999px;">${escapeHtml(dateRangeLabel)}</span>
    </div>

    <!-- Overview KPI Grid -->
    <h3 style="color: #ffffff; font-size: 1rem; margin-top: 0;">Weekly Overview</h3>
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 24px;">
      <div style="background: #1f2937; padding: 12px; border-radius: 8px; border: 1px solid #374151;">
        <div style="font-size: 0.725rem; color: #9ca3af; text-transform: uppercase;">Published Posts</div>
        <div style="font-size: 1.35rem; font-weight: bold; color: #ffffff;">${w1Stats.publishedCount}</div>
        <div style="font-size: 0.75rem; color: ${pubChange.color};">${pubChange.label} vs prior</div>
      </div>
      <div style="background: #1f2937; padding: 12px; border-radius: 8px; border: 1px solid #374151;">
        <div style="font-size: 0.725rem; color: #9ca3af; text-transform: uppercase;">Total Reach</div>
        <div style="font-size: 1.35rem; font-weight: bold; color: #ffffff;">${w1Stats.totalReach.toLocaleString()}</div>
        <div style="font-size: 0.75rem; color: ${reachChange.color};">${reachChange.label} vs prior</div>
      </div>
      <div style="background: #1f2937; padding: 12px; border-radius: 8px; border: 1px solid #374151;">
        <div style="font-size: 0.725rem; color: #9ca3af; text-transform: uppercase;">Engagement Rate</div>
        <div style="font-size: 1.35rem; font-weight: bold; color: #ffffff;">${(w1Stats.medianEngagementRate * 100).toFixed(2)}%</div>
        <div style="font-size: 0.75rem; color: ${engPpChange >= 0 ? '#34d399' : '#fda4af'};">${engPpLabel} vs prior</div>
      </div>
    </div>

    <!-- Engagement Breakdown -->
    <div style="background: #1f2937; padding: 16px; border-radius: 8px; border: 1px solid #374151; margin-bottom: 24px;">
      <div style="font-size: 0.85rem; font-weight: bold; color: #ffffff; margin-bottom: 8px;">Interaction Details</div>
      <div style="font-size: 0.85rem; color: #d1d5db;">
        • <strong>Reactions:</strong> ${w1Stats.totalReactions} (${reactionsChange.label})<br>
        • <strong>Comments:</strong> ${w1Stats.totalComments} (${commentsChange.label})<br>
        • <strong>Shares:</strong> ${w1Stats.totalShares} (${sharesChange.label})<br>
        • <strong>Follower / Non-Follower Breakdown:</strong> <span style="color: #9ca3af;">Not currently available for Meta Page feed scope.</span>
      </div>
    </div>

    <!-- Top Performing Posts -->
    <h3 style="color: #ffffff; font-size: 1rem; margin-top: 24px;">Top Performing Posts</h3>
    ${w1Stats.topPosts.length > 0 ? w1Stats.topPosts.map((p, idx) => `
      <div style="background: #1f2937; padding: 14px; border-radius: 8px; border: 1px solid #374151; margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="color: #60a5fa; font-size: 0.9rem;">${idx + 1}. ${escapeHtml(p.title)}</strong>
          <span style="color: #34d399; font-weight: bold; font-size: 0.8rem;">Score: ${p.score}x</span>
        </div>
        <div style="font-size: 0.8rem; color: #9ca3af; margin-top: 4px;">
          Reach: ${p.reach} | Engagement Rate: ${(p.engagementRate * 100).toFixed(2)}% | Reactions: ${p.reactions} | Comments: ${p.comments}
        </div>
        ${p.facebookPostId ? `<div style="margin-top: 6px;"><a href="https://facebook.com/${p.facebookPostId}" target="_blank" style="color: #60a5fa; font-size: 0.775rem; text-decoration: underline;">View on Facebook &rarr;</a></div>` : ''}
      </div>
    `).join('') : '<p style="color: #9ca3af; font-size: 0.85rem;">No publications recorded in this period.</p>'}

    <!-- Underperforming Posts -->
    ${w1Stats.weakPosts.length > 0 ? `
    <h3 style="color: #ffffff; font-size: 1rem; margin-top: 24px;">Posts Below Benchmark</h3>
    ${w1Stats.weakPosts.map((p) => `
      <div style="background: rgba(244, 63, 94, 0.05); padding: 12px; border-radius: 8px; border: 1px solid rgba(244, 63, 94, 0.2); margin-bottom: 10px;">
        <strong style="color: #fda4af; font-size: 0.875rem;">• ${escapeHtml(p.title)}</strong>
        <div style="font-size: 0.775rem; color: #9ca3af; margin-top: 4px;">
          Reach: ${p.reach} | Engagement Rate: ${(p.engagementRate * 100).toFixed(2)}% (${p.score}x benchmark)
        </div>
      </div>
    `).join('')}` : ''}

    <!-- Content Intelligence Summary -->
    <h3 style="color: #ffffff; font-size: 1rem; margin-top: 24px;">Content Intelligence Feedback Loop</h3>
    <div style="background: #1f2937; padding: 16px; border-radius: 8px; border: 1px solid #374151; font-size: 0.85rem; color: #d1d5db;">
      <div>• <strong>Learning Mode:</strong> <span style="color: #60a5fa; font-weight: bold;">${intelligence?.learningMode || 'MATURE'}</span></div>
      <div>• <strong>Active Strong Examples:</strong> ${intelligence?.activeStrongExamples.length || 0} active</div>
      <div>• <strong>Active Weak Examples:</strong> ${intelligence?.activeWeakExamples.length || 0} active</div>
      ${intelligence?.learnedGuidelines && intelligence.learnedGuidelines.length > 0 ? `
      <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #374151;">
        <strong>Active Learned Insights:</strong>
        <ul style="margin: 4px 0 0 0; padding-left: 20px; color: #9ca3af;">
          ${intelligence.learnedGuidelines.slice(0, 3).map((g) => `<li>${escapeHtml(g.guidelineText)}</li>`).join('')}
        </ul>
      </div>` : ''}
    </div>

    <!-- Footer -->
    <div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid #1f2937; text-align: center;">
      <a href="https://ai.northsoft.is/admin?#intelligence" target="_blank" rel="noopener noreferrer" style="background-color: #2563eb; color: #ffffff; padding: 10px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 0.875rem; display: inline-block;">Open Content Intelligence Panel &rarr;</a>
    </div>
  </div>
</body>
</html>`;

    const textBody = `NorthSoft AI Content Creator — Weekly Digest (${dateRangeLabel})

Weekly Overview:
- Published Posts: ${w1Stats.publishedCount} (${pubChange.label})
- Total Reach: ${w1Stats.totalReach} (${reachChange.label})
- Engagement Rate: ${(w1Stats.medianEngagementRate * 100).toFixed(2)}% (${engPpLabel})
- Reactions: ${w1Stats.totalReactions}
- Comments: ${w1Stats.totalComments}
- Shares: ${w1Stats.totalShares}

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
        metadata: JSON.stringify({ weekKey, dateRangeLabel, publishedCount: w1Stats.publishedCount }),
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
        .all<any>();

      const items = pubRows.results || [];
      let totalReach = 0;
      let totalReactions = 0;
      let totalComments = 0;
      let totalShares = 0;
      const engRates: number[] = [];

      const postList: Array<{ title: string; reach: number; reactions: number; comments: number; shares: number; engagementRate: number; score: number; facebookPostId?: string }> = [];

      for (const item of items) {
        const reach = Math.max(item.unique_views || item.views || 0, 0);
        const reactions = Math.max(item.reactions || 0, 0);
        const comments = Math.max(item.comments || 0, 0);
        const shares = Math.max(item.shares || 0, 0);
        const engRate = item.engagement_rate || 0;
        const score = item.relative_performance || 1.0;

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
          facebookPostId: item.facebook_post_id,
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
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

function escapeHtml(str: string): string {
  return (str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
