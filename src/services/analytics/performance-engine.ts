/**
 * NorthSoft.AI.ContentCreator — Content Performance Engine
 *
 * Provides a dynamic feedback loop learning from actual social publication results.
 * Calculates engagement rate, dynamic median benchmarks, freshness-decay weighting,
 * and extracts compact actionable performance profiles for the post generator.
 */

export interface PerformanceMetricInput {
  postId: string;
  publicationId?: string;
  facebookPostId?: string;
  views?: number;
  uniqueViews?: number;
  reactions?: number;
  comments?: number;
  shares?: number;
  clicks?: number;
  measuredAt?: string;
}

export type PerformanceClassification =
  | 'INSUFFICIENT_DATA'
  | 'OUTPERFORMING'
  | 'STRONG'
  | 'AVERAGE'
  | 'WEAK'
  | 'UNDERPERFORMING';

export interface PostPerformanceRecord {
  id: string;
  postId: string;
  publicationId?: string;
  facebookPostId?: string;
  measuredAt: string;
  views: number;
  uniqueViews: number;
  reactions: number;
  comments: number;
  shares: number;
  clicks: number;
  engagementRate: number;
  performanceScore: number;
  relativePerformance: number;
  classification: PerformanceClassification;
  createdAt: string;
}

export interface ContentPerformanceProfile {
  summary: string;
  successfulPatterns: string[];
  failurePatterns: string[];
  successfulExamples: Array<{ postId: string; title: string; snippet: string; score: number }>;
  poorExamples: Array<{ postId: string; title: string; snippet: string; score: number }>;
  metricsSummary: {
    totalEvaluated: number;
    medianEngagementRate: number;
    outperformingCount: number;
    underperformingCount: number;
  };
  generatedAt: string;
}

export const MIN_EXPOSURE_THRESHOLD = 20;

export class PerformanceEngineService {
  /**
   * Calculates weighted engagement score based on available Meta Graph API metrics.
   * Reactions (1.0), Comments (2.0), Shares (3.0), Clicks (1.5).
   */
  public static computeWeightedEngagement(
    reactions = 0,
    comments = 0,
    shares = 0,
    clicks = 0,
  ): number {
    return reactions * 1.0 + comments * 2.0 + shares * 3.0 + clicks * 1.5;
  }

  /**
   * Evaluates exposure using unique_views (reach) or fallback to views (impressions).
   */
  public static computeExposure(uniqueViews = 0, views = 0): number {
    return uniqueViews > 0 ? uniqueViews : views > 0 ? views : 0;
  }

  /**
   * Computes engagement rate as weighted engagement divided by exposure.
   */
  public static computeEngagementRate(weightedEngagement: number, exposure: number): number {
    if (exposure <= 0) return 0;
    return Number((weightedEngagement / exposure).toFixed(4));
  }

  /**
   * Calculates time-decay freshness weight based on post age in days.
   * 0-14 days: 1.0 | 15-30 days: 0.8 | 31-60 days: 0.5 | 61-90 days: 0.3 | >90 days: 0.1
   */
  public static computeFreshnessWeight(dateIso: string): number {
    const ageMs = Math.max(0, Date.now() - new Date(dateIso).getTime());
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    if (ageDays <= 14) return 1.0;
    if (ageDays <= 30) return 0.8;
    if (ageDays <= 60) return 0.5;
    if (ageDays <= 90) return 0.3;
    return 0.1;
  }

  /**
   * Calculates median of a numeric array.
   */
  public static calculateMedian(values: number[]): number {
    if (!values || values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return Number(((sorted[mid - 1]! + sorted[mid]!) / 2).toFixed(4));
    }
    return Number(sorted[mid]!.toFixed(4));
  }

  /**
   * Classifies relative performance against median benchmark.
   */
  public static classifyPerformance(
    exposure: number,
    relativePerformance: number,
  ): PerformanceClassification {
    if (exposure < MIN_EXPOSURE_THRESHOLD) {
      return 'INSUFFICIENT_DATA';
    }
    if (relativePerformance >= 1.5) return 'OUTPERFORMING';
    if (relativePerformance >= 1.15) return 'STRONG';
    if (relativePerformance >= 0.85) return 'AVERAGE';
    if (relativePerformance >= 0.5) return 'WEAK';
    return 'UNDERPERFORMING';
  }

  /**
   * Records a performance metric snapshot into D1 database.
   */
  public async recordMetricSnapshot(
    db: D1Database,
    input: PerformanceMetricInput,
  ): Promise<PostPerformanceRecord> {
    const id = crypto.randomUUID();
    const measuredAt = input.measuredAt || new Date().toISOString();
    const nowIso = new Date().toISOString();

    const views = Math.max(0, input.views || 0);
    const uniqueViews = Math.max(0, input.uniqueViews || 0);
    const reactions = Math.max(0, input.reactions || 0);
    const comments = Math.max(0, input.comments || 0);
    const shares = Math.max(0, input.shares || 0);
    const clicks = Math.max(0, input.clicks || 0);

    const weightedEng = PerformanceEngineService.computeWeightedEngagement(
      reactions,
      comments,
      shares,
      clicks,
    );
    const exposure = PerformanceEngineService.computeExposure(uniqueViews, views);
    const engagementRate = PerformanceEngineService.computeEngagementRate(weightedEng, exposure);

    // Initial placeholder score & classification before benchmark calculation
    const freshnessWeight = PerformanceEngineService.computeFreshnessWeight(measuredAt);
    const performanceScore = Number((engagementRate * freshnessWeight * 100).toFixed(2));

    const record: PostPerformanceRecord = {
      id,
      postId: input.postId,
      publicationId: input.publicationId,
      facebookPostId: input.facebookPostId,
      measuredAt,
      views,
      uniqueViews,
      reactions,
      comments,
      shares,
      clicks,
      engagementRate,
      performanceScore,
      relativePerformance: 1.0,
      classification: exposure < MIN_EXPOSURE_THRESHOLD ? 'INSUFFICIENT_DATA' : 'AVERAGE',
      createdAt: nowIso,
    };

    await db
      .prepare(
        `INSERT INTO post_performance_metrics (
          id, post_id, publication_id, facebook_post_id, measured_at, views, unique_views,
          reactions, comments, shares, clicks, engagement_rate, performance_score, relative_performance, classification, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.id,
        record.postId,
        record.publicationId || null,
        record.facebookPostId || null,
        record.measuredAt,
        record.views,
        record.uniqueViews,
        record.reactions,
        record.comments,
        record.shares,
        record.clicks,
        record.engagementRate,
        record.performanceScore,
        record.relativePerformance,
        record.classification,
        record.createdAt,
      )
      .run();

    return record;
  }

  /**
   * Re-evaluates post performance against dynamic rolling benchmark and generates active Performance Profile.
   */
  public async evaluateAndGenerateProfile(db: D1Database): Promise<ContentPerformanceProfile> {
    const nowIso = new Date().toISOString();

    // 1. Fetch latest published posts with versions and performance metrics
    const rows = await db
      .prepare(
        `SELECT p.id as post_id, p.title as post_title, pv.content as post_content,
                pub.id as publication_id, pub.facebook_post_id, pub.published_at,
                pm.views, pm.unique_views, pm.reactions, pm.comments, pm.shares, pm.clicks, pm.measured_at
         FROM posts p
         JOIN post_versions pv ON p.id = pv.post_id AND p.current_version = pv.version_number
         JOIN publications pub ON pub.post_id = p.id AND pub.status = 'published'
         LEFT JOIN post_performance_metrics pm ON pm.id = (
           SELECT id FROM post_performance_metrics WHERE post_id = p.id ORDER BY measured_at DESC LIMIT 1
         )
         ORDER BY pub.published_at DESC LIMIT 50`,
      )
      .all<{
        post_id: string;
        post_title: string;
        post_content: string;
        publication_id: string;
        facebook_post_id?: string;
        published_at: string;
        views?: number;
        unique_views?: number;
        reactions?: number;
        comments?: number;
        shares?: number;
        clicks?: number;
        measured_at?: string;
      }>();

    const items = rows.results || [];

    // Calculate rates for candidates
    const evaluatedPosts: Array<{
      postId: string;
      title: string;
      content: string;
      exposure: number;
      engagementRate: number;
      freshnessWeight: number;
      weightedScore: number;
      publishedAt: string;
    }> = [];

    for (const item of items) {
      const views = item.views || 0;
      const uniqueViews = item.unique_views || 0;
      const reactions = item.reactions || 0;
      const comments = item.comments || 0;
      const shares = item.shares || 0;
      const clicks = item.clicks || 0;

      const weightedEng = PerformanceEngineService.computeWeightedEngagement(reactions, comments, shares, clicks);
      const exposure = PerformanceEngineService.computeExposure(uniqueViews, views);
      const engagementRate = PerformanceEngineService.computeEngagementRate(weightedEng, exposure);
      const freshnessWeight = PerformanceEngineService.computeFreshnessWeight(item.published_at || item.measured_at || nowIso);
      const weightedScore = engagementRate * freshnessWeight;

      evaluatedPosts.push({
        postId: item.post_id,
        title: item.post_title,
        content: item.post_content,
        exposure,
        engagementRate,
        freshnessWeight,
        weightedScore,
        publishedAt: item.published_at || nowIso,
      });
    }

    const validSizedPosts = evaluatedPosts.filter((p) => p.exposure >= MIN_EXPOSURE_THRESHOLD);
    const rates = validSizedPosts.map((p) => p.engagementRate);
    const medianRate = PerformanceEngineService.calculateMedian(rates);

    // Group into outperforming vs underperforming
    const outperformingList: Array<{ postId: string; title: string; content: string; score: number }> = [];
    const underperformingList: Array<{ postId: string; title: string; content: string; score: number }> = [];

    for (const post of validSizedPosts) {
      const relativePerf = medianRate > 0 ? Number((post.engagementRate / medianRate).toFixed(2)) : 1.0;
      const classification = PerformanceEngineService.classifyPerformance(post.exposure, relativePerf);

      if (classification === 'OUTPERFORMING' || classification === 'STRONG') {
        outperformingList.push({
          postId: post.postId,
          title: post.title,
          content: post.content,
          score: relativePerf,
        });
      } else if (classification === 'UNDERPERFORMING' || classification === 'WEAK') {
        underperformingList.push({
          postId: post.postId,
          title: post.title,
          content: post.content,
          score: relativePerf,
        });
      }
    }

    // Default baseline if sample size is insufficient
    if (validSizedPosts.length < 3) {
      const defaultProfile: ContentPerformanceProfile = {
        summary: 'Baseline mode: Insufficient publication metrics data (minimum 3 evaluated posts required for dynamic benchmark).',
        successfulPatterns: [],
        failurePatterns: [],
        successfulExamples: [],
        poorExamples: [],
        metricsSummary: {
          totalEvaluated: validSizedPosts.length,
          medianEngagementRate: medianRate,
          outperformingCount: 0,
          underperformingCount: 0,
        },
        generatedAt: nowIso,
      };

      await this.saveActiveProfile(db, defaultProfile);
      return defaultProfile;
    }

    // Extract structural patterns deterministically
    const successfulPatterns: string[] = [];
    const failurePatterns: string[] = [];

    // Analyze high performers
    let bulletListCountInSuccess = 0;
    let questionInSuccess = 0;
    let avgLenSuccess = 0;

    for (const p of outperformingList) {
      avgLenSuccess += p.content.length;
      if (/^[-*•\d+.]/m.test(p.content)) bulletListCountInSuccess++;
      if (/\?/m.test(p.content)) questionInSuccess++;
    }
    if (outperformingList.length > 0) {
      avgLenSuccess = Math.round(avgLenSuccess / outperformingList.length);
      if (bulletListCountInSuccess / outperformingList.length >= 0.5) {
        successfulPatterns.push('Posts using structured bullet points or numbered lists currently achieve higher interaction.');
      }
      if (questionInSuccess / outperformingList.length >= 0.5) {
        successfulPatterns.push('Ending with an engaging question or interactive prompt correlates with above-average comments.');
      }
      if (avgLenSuccess >= 300 && avgLenSuccess <= 1200) {
        successfulPatterns.push('Medium-length educational posts (300-1200 characters) outperform concise short posts.');
      }
    }

    // Analyze low performers
    let shortCountInFailure = 0;
    for (const p of underperformingList) {
      if (p.content.length < 200) shortCountInFailure++;
    }
    if (underperformingList.length > 0) {
      if (shortCountInFailure / underperformingList.length >= 0.5) {
        failurePatterns.push('Overly short posts under 200 characters without contextual takeaway perform below current median.');
      }
      failurePatterns.push('Generic promotional openings without a strong hook lead to below-average reach.');
    }

    if (successfulPatterns.length === 0) {
      successfulPatterns.push('Focus on clear value-driven openings and direct actionable takeaways.');
    }
    if (failurePatterns.length === 0) {
      failurePatterns.push('Avoid repetitive buzzwords and unverified claims.');
    }

    // Select representative brief snippets (max 2-3)
    const successfulExamples = outperformingList.slice(0, 3).map((p) => ({
      postId: p.postId,
      title: p.title,
      snippet: p.content.slice(0, 220) + (p.content.length > 220 ? '...' : ''),
      score: p.score,
    }));

    const poorExamples = underperformingList.slice(0, 3).map((p) => ({
      postId: p.postId,
      title: p.title,
      snippet: p.content.slice(0, 220) + (p.content.length > 220 ? '...' : ''),
      score: p.score,
    }));

    const profile: ContentPerformanceProfile = {
      summary: `Active Performance Profile built from ${validSizedPosts.length} evaluated posts (median engagement rate: ${(medianRate * 100).toFixed(2)}%).`,
      successfulPatterns,
      failurePatterns,
      successfulExamples,
      poorExamples,
      metricsSummary: {
        totalEvaluated: validSizedPosts.length,
        medianEngagementRate: medianRate,
        outperformingCount: outperformingList.length,
        underperformingCount: underperformingList.length,
      },
      generatedAt: nowIso,
    };

    await this.saveActiveProfile(db, profile);
    return profile;
  }

  /**
   * Fetches current active Performance Profile from D1.
   */
  public async getActiveProfile(db: D1Database): Promise<ContentPerformanceProfile | null> {
    const row = await db
      .prepare('SELECT profile_json FROM performance_profiles WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1')
      .first<{ profile_json: string }>();

    if (!row || !row.profile_json) return null;

    try {
      return JSON.parse(row.profile_json) as ContentPerformanceProfile;
    } catch {
      return null;
    }
  }

  /**
   * Persists new active profile, deactivating old profiles.
   */
  private async saveActiveProfile(db: D1Database, profile: ContentPerformanceProfile): Promise<void> {
    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const jsonStr = JSON.stringify(profile);

    await db.batch([
      db.prepare('UPDATE performance_profiles SET is_active = 0 WHERE is_active = 1'),
      db.prepare(
        'INSERT INTO performance_profiles (id, profile_json, is_active, created_at) VALUES (?, ?, 1, ?)',
      ).bind(id, jsonStr, nowIso),
    ]);
  }
}
