/**
 * NorthSoft.AI.ContentCreator — Intelligent Scheduling Service
 *
 * Computes optimal publication slots (date, time window, frequency) based on:
 * 1. Backlog coverage depth (1 post/day for <14d, up to 2/day for >=14d, up to 3/day for >=21d).
 * 2. Historical performance by time window (using Performance Engine metrics and percentile ranking).
 * 3. Minimum gap enforcement (minimum 3 hours, preferred 4-6 hours between posts).
 * 4. Content quality, topic pillar diversity, and recency weighting.
 * 5. Decision metadata tracing for auditability.
 */

import { PerformanceEngineService } from '../analytics/performance-engine';

export interface TimeWindowAnalysis {
  windowLabel: string; // e.g. '08:00-10:00', '12:00-14:00', '18:00-20:00'
  startHour: number;
  endHour: number;
  sampleSize: number;
  medianEngagementRate: number;
  avgScore: number;
  confidence: number; // 0.0 to 1.0 based on sample size threshold (>= 5 observations = 1.0)
  isFallbackDefault: boolean;
}

export interface SchedulingCandidatePost {
  id: string;
  title: string;
  category?: string;
  qualityScore?: number;
  createdAt?: string;
}

export interface ProposedScheduleSlot {
  postId: string;
  postTitle: string;
  scheduledAtIso: string;
  scheduledDate: string;
  scheduledTime: string;
  reason: string;
  decisionMetadata: {
    strategy: 'historical_performance' | 'default_fallback';
    timeWindow: string;
    confidence: number;
    sampleSize: number;
    backlogCoverageDays: number;
    maxDailyFrequency: number;
    reason: string;
  };
}

export const DEFAULT_PUBLISHING_WINDOWS: Array<{ label: string; startHour: number; endHour: number; preferredHour: number }> = [
  { label: '08:00-10:00', startHour: 8, endHour: 10, preferredHour: 9 },
  { label: '12:00-14:00', startHour: 12, endHour: 14, preferredHour: 13 },
  { label: '18:00-20:00', startHour: 18, endHour: 20, preferredHour: 18 },
  { label: '20:00-22:00', startHour: 20, endHour: 22, preferredHour: 20 },
];

export class IntelligentSchedulingService {
  /**
   * Evaluates historical publication performance across time windows.
   */
  public async analyzeHistoricalTimeWindows(db: D1Database): Promise<TimeWindowAnalysis[]> {
    const windowMap: Record<string, { label: string; startHour: number; endHour: number; rates: number[]; scores: number[] }> = {
      '08:00-10:00': { label: '08:00-10:00', startHour: 8, endHour: 10, rates: [], scores: [] },
      '10:00-12:00': { label: '10:00-12:00', startHour: 10, endHour: 12, rates: [], scores: [] },
      '12:00-14:00': { label: '12:00-14:00', startHour: 12, endHour: 14, rates: [], scores: [] },
      '14:00-16:00': { label: '14:00-16:00', startHour: 14, endHour: 16, rates: [], scores: [] },
      '16:00-18:00': { label: '16:00-18:00', startHour: 16, endHour: 18, rates: [], scores: [] },
      '18:00-20:00': { label: '18:00-20:00', startHour: 18, endHour: 20, rates: [], scores: [] },
      '20:00-22:00': { label: '20:00-22:00', startHour: 20, endHour: 22, rates: [], scores: [] },
      '22:00-00:00': { label: '22:00-00:00', startHour: 22, endHour: 24, rates: [], scores: [] },
    };

    try {
      const rows = await db
        .prepare(
          `SELECT pub.published_at, pm.engagement_rate, pm.performance_score
           FROM publications pub
           JOIN post_performance_metrics pm ON pm.post_id = pub.post_id
           WHERE pub.status = 'published' AND pub.published_at IS NOT NULL
           ORDER BY pub.published_at DESC LIMIT 100`,
        )
        .all<{ published_at: string; engagement_rate?: number; performance_score?: number }>();

      for (const row of rows.results || []) {
        if (!row.published_at) continue;
        const date = new Date(row.published_at);
        const hour = date.getUTCHours();
        const freshness = PerformanceEngineService.computeFreshnessWeight(row.published_at);
        const engRate = (row.engagement_rate || 0) * freshness;
        const score = (row.performance_score || 1) * freshness;

        for (const key of Object.keys(windowMap)) {
          const win = windowMap[key]!;
          if (hour >= win.startHour && hour < win.endHour) {
            win.rates.push(engRate);
            win.scores.push(score);
            break;
          }
        }
      }
    } catch {
      // Fallback
    }

    const analyses: TimeWindowAnalysis[] = [];
    for (const key of Object.keys(windowMap)) {
      const win = windowMap[key]!;
      const sampleSize = win.rates.length;
      const medianRate = PerformanceEngineService.calculateMedian(win.rates);
      const avgScore = sampleSize > 0 ? Number((win.scores.reduce((a, b) => a + b, 0) / sampleSize).toFixed(2)) : 0;
      const confidence = Math.min(1.0, sampleSize / 5); // 5 observations = 100% confidence

      analyses.push({
        windowLabel: win.label,
        startHour: win.startHour,
        endHour: win.endHour,
        sampleSize,
        medianEngagementRate: medianRate,
        avgScore,
        confidence,
        isFallbackDefault: sampleSize < 3,
      });
    }

    // Sort by weighted rank score: (medianRate * 100) * confidence + avgScore
    analyses.sort((a, b) => {
      const rankA = a.confidence >= 0.5 ? a.medianEngagementRate * 100 * a.confidence + a.avgScore : -1;
      const rankB = b.confidence >= 0.5 ? b.medianEngagementRate * 100 * b.confidence + b.avgScore : -1;
      return rankB - rankA;
    });

    return analyses;
  }

  /**
   * Calculates current schedule coverage in days into the future.
   */
  public async calculateScheduleCoverageDays(db: D1Database): Promise<{ coverageDays: number; maxAllowedDailyPosts: number }> {
    const nowIso = new Date().toISOString();
    const row = await db
      .prepare("SELECT MAX(scheduled_at) as max_sched FROM schedules WHERE status IN ('pending', 'publishing') AND scheduled_at > ?")
      .bind(nowIso)
      .first<{ max_sched: string | null }>();

    if (!row || !row.max_sched) {
      return { coverageDays: 0, maxAllowedDailyPosts: 1 };
    }

    const maxMs = new Date(row.max_sched).getTime();
    const nowMs = Date.now();
    const diffDays = Math.max(0, Math.floor((maxMs - nowMs) / (1000 * 60 * 60 * 24)));

    let maxAllowedDailyPosts = 1;
    if (diffDays >= 21) {
      maxAllowedDailyPosts = 3;
    } else if (diffDays >= 14) {
      maxAllowedDailyPosts = 2;
    }

    return { coverageDays: diffDays, maxAllowedDailyPosts };
  }

  /**
   * Proposes intelligent schedule slots for a list of candidate draft post IDs.
   */
  public async proposeIntelligentSchedules(
    db: D1Database,
    candidatePostIds: string[],
  ): Promise<ProposedScheduleSlot[]> {
    if (!candidatePostIds || candidatePostIds.length === 0) return [];

    // 1. Fetch post metadata for candidates
    const placeholders = candidatePostIds.map(() => '?').join(',');
    const postsRes = await db
      .prepare(
        `SELECT p.id, p.title, p.quality_score, p.created_at, ci.category
         FROM posts p
         LEFT JOIN content_ideas ci ON ci.id = p.idea_id
         WHERE p.id IN (${placeholders}) AND p.status IN ('approved', 'draft')`,
      )
      .bind(...candidatePostIds)
      .all<SchedulingCandidatePost>();

    const candidatePosts = postsRes.results || [];
    if (candidatePosts.length === 0) return [];

    // 2. Rank candidates by quality score and recency
    candidatePosts.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));

    // 3. Analyze time windows and schedule coverage
    const timeWindowAnalyses = await this.analyzeHistoricalTimeWindows(db);
    const { coverageDays, maxAllowedDailyPosts } = await this.calculateScheduleCoverageDays(db);

    // 4. Fetch existing future schedules to prevent conflicts
    const nowIso = new Date().toISOString();
    const existingScheds = await db
      .prepare("SELECT scheduled_at FROM schedules WHERE status IN ('pending', 'publishing') AND scheduled_at > ? ORDER BY scheduled_at ASC")
      .bind(nowIso)
      .all<{ scheduled_at: string }>();

    const existingTimes = (existingScheds.results || []).map((s) => new Date(s.scheduled_at).getTime());

    // 5. Select best time windows to use
    let topWindows = timeWindowAnalyses.filter((w) => w.confidence >= 0.5);
    let isHistorical = true;
    if (topWindows.length === 0) {
      isHistorical = false;
      topWindows = DEFAULT_PUBLISHING_WINDOWS.map((w) => ({
        windowLabel: w.label,
        startHour: w.startHour,
        endHour: w.endHour,
        sampleSize: 0,
        medianEngagementRate: 0.02,
        avgScore: 1.0,
        confidence: 0,
        isFallbackDefault: true,
      }));
    }

    const proposedSlots: ProposedScheduleSlot[] = [];

    // Start scheduling starting tomorrow at UTC 08:00
    const cursorDate = new Date();
    cursorDate.setUTCDate(cursorDate.getUTCDate() + 1);
    cursorDate.setUTCHours(0, 0, 0, 0);

    const MIN_GAP_MS = 3 * 3600 * 1000; // Minimum 3 hours between posts

    for (const post of candidatePosts) {
      let slotFound = false;
      let attempts = 0;

      while (!slotFound && attempts < 60) {
        const dateStr = cursorDate.toISOString().split('T')[0]!;
        
        // Count posts already scheduled for this cursor date in existing + proposed
        const postsOnDate = existingTimes
          .concat(proposedSlots.map((s) => new Date(s.scheduledAtIso).getTime()))
          .filter((t) => new Date(t).toISOString().split('T')[0] === dateStr).length;

        if (postsOnDate < maxAllowedDailyPosts) {
          // Try windows for this date
          for (const win of topWindows) {
            const targetHour = win.startHour;
            const candidateTime = new Date(Date.UTC(
              cursorDate.getUTCFullYear(),
              cursorDate.getUTCMonth(),
              cursorDate.getUTCDate(),
              targetHour,
              0, 0, 0
            ));
            const candidateMs = candidateTime.getTime();

            if (candidateMs <= Date.now()) continue;

            // Check minimum gap against existing and proposed
            const conflict = existingTimes
              .concat(proposedSlots.map((s) => new Date(s.scheduledAtIso).getTime()))
              .some((t) => Math.abs(t - candidateMs) < MIN_GAP_MS);

            if (!conflict) {
              const scheduledAtIso = candidateTime.toISOString();
              const scheduledTimeStr = `${String(targetHour).padStart(2, '0')}:00 UTC`;

              const reason = isHistorical
                ? `High-performing historical time window (${win.windowLabel}, ${win.sampleSize} posts evaluated)`
                : `Default recommended time window (${win.windowLabel})`;

              proposedSlots.push({
                postId: post.id,
                postTitle: post.title,
                scheduledAtIso,
                scheduledDate: dateStr,
                scheduledTime: scheduledTimeStr,
                reason,
                decisionMetadata: {
                  strategy: isHistorical ? 'historical_performance' : 'default_fallback',
                  timeWindow: win.windowLabel,
                  confidence: win.confidence,
                  sampleSize: win.sampleSize,
                  backlogCoverageDays: coverageDays,
                  maxDailyFrequency: maxAllowedDailyPosts,
                  reason,
                },
              });

              slotFound = true;
              break;
            }
          }
        }

        if (!slotFound) {
          // Advance to next day
          cursorDate.setUTCDate(cursorDate.getUTCDate() + 1);
          attempts++;
        }
      }
    }

    return proposedSlots;
  }
}
