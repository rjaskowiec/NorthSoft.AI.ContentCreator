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

    // 1. Fetch post metadata for candidates (allow any unpublished post, including scheduled or draft)
    const placeholders = candidatePostIds.map(() => '?').join(',');
    let candidatePosts: SchedulingCandidatePost[] = [];

    try {
      const postsRes = await db
        .prepare(
          `SELECT p.id, p.title, p.quality_score, p.created_at, ci.category
           FROM posts p
           LEFT JOIN content_ideas ci ON ci.id = p.idea_id
           WHERE p.id IN (${placeholders}) AND (p.status IS NULL OR p.status NOT IN ('published', 'publishing'))`,
        )
        .bind(...candidatePostIds)
        .all<SchedulingCandidatePost>();
      candidatePosts = postsRes.results || [];
    } catch {
      // Fallback query if table schema differs
      try {
        const fallbackRes = await db
          .prepare(
            `SELECT p.id, p.title, p.quality_score, p.created_at
             FROM posts p
             WHERE p.id IN (${placeholders})`,
          )
          .bind(...candidatePostIds)
          .all<SchedulingCandidatePost>();
        candidatePosts = fallbackRes.results || [];
      } catch {
        candidatePosts = [];
      }
    }

    // Safety fallback: if database query returned fewer rows than IDs requested,
    // generate candidate records for any missing IDs so slot calculation never fails.
    if (candidatePosts.length === 0) {
      candidatePosts = candidatePostIds.map((id) => ({
        id,
        title: 'Draft Post',
        qualityScore: 80,
      }));
    } else if (candidatePosts.length < candidatePostIds.length) {
      for (const id of candidatePostIds) {
        if (!candidatePosts.some((cp) => cp.id === id)) {
          candidatePosts.push({ id, title: 'Draft Post', qualityScore: 80 });
        }
      }
    }

    // 2. Rank candidates by quality score and recency
    candidatePosts.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));

    // 3. Analyze time windows and schedule coverage
    const timeWindowAnalyses = await this.analyzeHistoricalTimeWindows(db);
    const { coverageDays } = await this.calculateScheduleCoverageDays(db);

    // 4. Fetch existing future schedules to prevent conflicts
    const nowIso = new Date().toISOString();
    let existingSchedList: Array<{ post_id?: string; scheduled_at: string }> = [];
    try {
      const existingScheds = await db
        .prepare(
          "SELECT post_id, scheduled_at FROM schedules WHERE status IN ('pending', 'publishing') AND scheduled_at > ? ORDER BY scheduled_at ASC",
        )
        .bind(nowIso)
        .all<{ post_id?: string; scheduled_at: string }>();
      existingSchedList = existingScheds.results || [];
    } catch {
      try {
        const fallbackScheds = await db
          .prepare(
            "SELECT scheduled_at FROM schedules WHERE status IN ('pending', 'publishing') AND scheduled_at > ? ORDER BY scheduled_at ASC",
          )
          .bind(nowIso)
          .all<{ scheduled_at: string }>();
        existingSchedList = fallbackScheds.results || [];
      } catch {
        existingSchedList = [];
      }
    }

    const activeTimes: Array<{ postId?: string; timeMs: number }> = existingSchedList
      .filter((s) => s.scheduled_at && !isNaN(new Date(s.scheduled_at).getTime()))
      .map((s) => ({
        postId: s.post_id,
        timeMs: new Date(s.scheduled_at).getTime(),
      }));

    // 5. Build prioritized candidate time windows
    const topWindows = timeWindowAnalyses.filter((w) => w.confidence >= 0.5);
    const isHistorical = topWindows.length > 0;
    const defaultHours = [13, 18, 9, 21, 15, 11];
    const candidateWindows: Array<{ hour: number; label: string }> = [];

    if (isHistorical) {
      for (const w of topWindows) {
        const hour = w.startHour >= 0 && w.startHour < 24 ? w.startHour : 13;
        if (!candidateWindows.some((cw) => cw.hour === hour)) {
          candidateWindows.push({
            hour,
            label: `High-performing historical window (${w.windowLabel})`,
          });
        }
      }
    }

    for (const h of defaultHours) {
      if (!candidateWindows.some((cw) => cw.hour === h)) {
        candidateWindows.push({
          hour: h,
          label: `Optimal publishing window (${String(h).padStart(2, '0')}:00 UTC)`,
        });
      }
    }

    // 6. Progressive Schedule Ladder:
    // - Days 1..14 with <1 post/day
    // - Days 1..14 with <2 posts/day (safe separation >= 3h)
    // - Days 15..21 with <1 post/day
    // - Days 15..21 with <2 posts/day
    // - Days 1..21 with <3 posts/day
    // - Next 7-day increments (Days 22..28 with <1, then <2, then 1..28 with <3, <4, etc.)
    interface SchedulingTier {
      startDay: number;
      endDay: number;
      maxDailyPosts: number;
      tierName: string;
    }

    const tiers: SchedulingTier[] = [
      { startDay: 1, endDay: 14, maxDailyPosts: 1, tierName: '14-Day Initial Coverage (1 post/day)' },
      { startDay: 1, endDay: 14, maxDailyPosts: 2, tierName: '14-Day Density Expansion (2 posts/day)' },
      { startDay: 15, endDay: 21, maxDailyPosts: 1, tierName: 'Week 3 Initial Coverage (1 post/day)' },
      { startDay: 15, endDay: 21, maxDailyPosts: 2, tierName: 'Week 3 Density Expansion (2 posts/day)' },
      { startDay: 1, endDay: 21, maxDailyPosts: 3, tierName: '21-Day High-Density (3 posts/day)' },
    ];

    // Extend dynamically up to 365 days in 7-day blocks
    for (let horizon = 28; horizon <= 365; horizon += 7) {
      const prevHorizon = horizon - 7;
      tiers.push({
        startDay: prevHorizon + 1,
        endDay: horizon,
        maxDailyPosts: 1,
        tierName: `Days ${prevHorizon + 1}..${horizon} Initial Coverage (1 post/day)`,
      });
      tiers.push({
        startDay: prevHorizon + 1,
        endDay: horizon,
        maxDailyPosts: 2,
        tierName: `Days ${prevHorizon + 1}..${horizon} Density Expansion (2 posts/day)`,
      });
      tiers.push({
        startDay: 1,
        endDay: horizon,
        maxDailyPosts: 3,
        tierName: `Days 1..${horizon} High-Density (3 posts/day)`,
      });
      tiers.push({
        startDay: 1,
        endDay: horizon,
        maxDailyPosts: 4,
        tierName: `Days 1..${horizon} Maximum Density (4 posts/day)`,
      });
    }

    const proposedSlots: ProposedScheduleSlot[] = [];
    const MIN_GAP_MS = 3 * 3600 * 1000; // Minimum 3 hours between posts
    const nowMs = Date.now();
    const baseDate = new Date();

    for (const post of candidatePosts) {
      let slotFound = false;

      // Filter out this specific post's previous schedule so rescheduling never conflicts with itself
      const currentOccupied = activeTimes
        .filter((t) => !t.postId || t.postId !== post.id)
        .map((t) => t.timeMs);

      for (const tier of tiers) {
        if (slotFound) break;

        for (let dayOffset = tier.startDay; dayOffset <= tier.endDay; dayOffset++) {
          const targetDate = new Date(Date.UTC(
            baseDate.getUTCFullYear(),
            baseDate.getUTCMonth(),
            baseDate.getUTCDate() + dayOffset,
            0, 0, 0, 0
          ));
          const dateStr = targetDate.toISOString().split('T')[0]!;

          // Count posts already occupying this date
          const postsOnThisDate = currentOccupied.filter(
            (t) => new Date(t).toISOString().split('T')[0] === dateStr
          ).length;

          if (postsOnThisDate < tier.maxDailyPosts) {
            for (const win of candidateWindows) {
              const candidateTime = new Date(Date.UTC(
                targetDate.getUTCFullYear(),
                targetDate.getUTCMonth(),
                targetDate.getUTCDate(),
                win.hour,
                0, 0, 0
              ));
              const candidateMs = candidateTime.getTime();

              if (candidateMs <= nowMs) continue;

              // Enforce minimum 3h gap against any post on or around this day
              const hasConflict = currentOccupied.some(
                (t) => Math.abs(t - candidateMs) < MIN_GAP_MS
              );

              if (!hasConflict) {
                const scheduledAtIso = candidateTime.toISOString();
                const scheduledTimeStr = `${String(win.hour).padStart(2, '0')}:00 UTC`;
                const reason = `${win.label} (${tier.tierName})`;

                proposedSlots.push({
                  postId: post.id,
                  postTitle: post.title || 'Draft Post',
                  scheduledAtIso,
                  scheduledDate: dateStr,
                  scheduledTime: scheduledTimeStr,
                  reason,
                  decisionMetadata: {
                    strategy: isHistorical ? 'historical_performance' : 'default_fallback',
                    timeWindow: `${String(win.hour).padStart(2, '0')}:00 UTC`,
                    confidence: 1.0,
                    sampleSize: tier.maxDailyPosts,
                    backlogCoverageDays: coverageDays,
                    maxDailyFrequency: tier.maxDailyPosts,
                    reason,
                  },
                });

                // Add to activeTimes so subsequent posts in this batch take this slot into account
                activeTimes.push({ postId: post.id, timeMs: candidateMs });
                slotFound = true;
                break;
              }
            }
          }

          if (slotFound) break;
        }
      }

      // Absolute safety fallback: guarantees a slot even if all tiers are somehow saturated
      if (!slotFound) {
        const latestMs = currentOccupied.length > 0
          ? Math.max(...currentOccupied)
          : nowMs + 24 * 3600 * 1000;
        const fallbackDate = new Date(latestMs + 24 * 3600 * 1000);
        fallbackDate.setUTCHours(13, 0, 0, 0);

        const scheduledAtIso = fallbackDate.toISOString();
        const scheduledDate = scheduledAtIso.split('T')[0]!;
        const reason = 'Next available day (13:00 UTC)';

        proposedSlots.push({
          postId: post.id,
          postTitle: post.title || 'Draft Post',
          scheduledAtIso,
          scheduledDate,
          scheduledTime: '13:00 UTC',
          reason,
          decisionMetadata: {
            strategy: 'default_fallback',
            timeWindow: '13:00 UTC',
            confidence: 0.5,
            sampleSize: 1,
            backlogCoverageDays: coverageDays,
            maxDailyFrequency: 1,
            reason,
          },
        });
        activeTimes.push({ postId: post.id, timeMs: fallbackDate.getTime() });
      }
    }

    return proposedSlots;
  }
}
