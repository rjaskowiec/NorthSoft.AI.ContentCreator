/**
 * NorthSoft.AI.ContentCreator — Content Performance & Intelligence Engine
 *
 * Provides a dynamic feedback loop learning from actual social publication results.
 * Computes multi-factor weighted Success Score, dynamic percentiles/rolling benchmarks,
 * exposure maturation checks, recency weighting, active reference pools (Strong & Weak),
 * learned vs manual guidelines, and prompt context building.
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
  | 'MATURING'
  | 'INSUFFICIENT_DATA'
  | 'STRONG'
  | 'AVERAGE'
  | 'WEAK'
  | 'POOR';

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

export interface ExtractedCharacteristics {
  hookStyle: string;
  lengthCategory: 'SHORT' | 'MEDIUM' | 'LONG';
  characterCount: number;
  paragraphCount: number;
  bulletUsage: boolean;
  questionUsage: boolean;
  ctaStyle: string;
  technicalDepth: 'BASIC' | 'PRACTICAL' | 'ADVANCED';
  tone: string;
  openingPattern: string;
  topicAngle?: string;
}

export interface ReferencePostRecord {
  id: string;
  postId: string;
  classification: 'STRONG' | 'WEAK';
  successScore: number;
  percentile: number;
  exposureViews: number;
  weightedEngagement: number;
  reasonForInclusion: string;
  extractedCharacteristics?: ExtractedCharacteristics;
  rank: number;
  isActive: boolean;
  evaluatedAt: string;
  createdAt: string;
  // Joined fields
  title?: string;
  snippet?: string;
}

export interface GeneratorGuideline {
  id: string;
  tier: 'SYSTEM' | 'MANUAL' | 'LEARNED';
  category: 'DO_MORE' | 'AVOID' | 'STYLE' | 'STRUCTURE' | 'BENCHMARK';
  guidelineText: string;
  evidenceCount: number;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContentPerformanceProfile {
  summary: string;
  successfulPatterns: string[];
  failurePatterns: string[];
  successfulExamples: Array<{ postId: string; title: string; snippet: string; score: number; percentile?: number }>;
  poorExamples: Array<{ postId: string; title: string; snippet: string; score: number; percentile?: number }>;
  manualGuidelines: string[];
  systemRules: string[];
  metricsSummary: {
    totalEvaluated: number;
    medianEngagementRate: number;
    outperformingCount: number;
    underperformingCount: number;
  };
  generatedAt: string;
}

export const MIN_EXPOSURE_THRESHOLD = 20;
export const MATURING_HOURS_THRESHOLD = 24;

export class PerformanceEngineService {
  /**
   * Computes weighted engagement score based on available Meta Graph API metrics.
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
   * Calculates percentile rank of a value in an array (0 to 100).
   */
  public static calculatePercentile(value: number, allValues: number[]): number {
    if (!allValues || allValues.length === 0) return 50;
    if (allValues.length === 1) return 100;
    const lowerOrEqual = allValues.filter((v) => v <= value).length;
    return Number(((lowerOrEqual / allValues.length) * 100).toFixed(1));
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
   * Classifies post performance with Maturing and Dynamic Percentile checks.
   */
  public static classifyPerformance(
    exposure: number,
    percentile: number,
    publishedAtIso: string,
  ): PerformanceClassification {
    const ageHours = (Date.now() - new Date(publishedAtIso).getTime()) / (1000 * 60 * 60);

    if (ageHours < MATURING_HOURS_THRESHOLD && exposure < MIN_EXPOSURE_THRESHOLD) {
      return 'MATURING';
    }

    if (exposure < MIN_EXPOSURE_THRESHOLD) {
      return 'INSUFFICIENT_DATA';
    }

    if (percentile >= 80) return 'STRONG';
    if (percentile >= 40) return 'AVERAGE';
    if (percentile >= 15) return 'WEAK';
    return 'POOR';
  }

  /**
   * Extracts structural characteristics deterministically from post content.
   */
  public static extractCharacteristics(content: string, title?: string): ExtractedCharacteristics {
    const charCount = content.length;
    const paragraphCount = content.split(/\n\s*\n/).filter(Boolean).length || 1;
    const bulletUsage = /^[-*•\d+.]/m.test(content);
    const questionUsage = /\?/m.test(content);

    let lengthCategory: 'SHORT' | 'MEDIUM' | 'LONG' = 'MEDIUM';
    if (charCount < 300) lengthCategory = 'SHORT';
    else if (charCount > 900) lengthCategory = 'LONG';

    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    const hookStyle = lines[0] ? (lines[0].length < 80 ? 'Concise Statement' : 'Detailed Narrative') : 'Standard Opening';
    const ctaStyle = questionUsage ? 'Interactive Question' : 'Direct Call to Action';

    return {
      hookStyle,
      lengthCategory,
      characterCount: charCount,
      paragraphCount,
      bulletUsage,
      questionUsage,
      ctaStyle,
      technicalDepth: 'PRACTICAL',
      tone: 'Conversational',
      openingPattern: lines[0]?.slice(0, 50) || title || '',
    };
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

    // Fetch published_at date to check maturing status
    const pubRow = await db
      .prepare('SELECT published_at FROM publications WHERE post_id = ? ORDER BY published_at DESC LIMIT 1')
      .bind(input.postId)
      .first<{ published_at: string }>();

    const publishedAt = pubRow?.published_at || measuredAt;
    const freshness = PerformanceEngineService.computeFreshnessWeight(publishedAt);
    const performanceScore = Number((engagementRate * freshness).toFixed(4));

    // Calculate percentile ranking against past snapshots
    const pastSnapshots = await db
      .prepare('SELECT engagement_rate FROM post_performance_metrics ORDER BY measured_at DESC LIMIT 50')
      .all<{ engagement_rate: number }>();
    const pastRates = (pastSnapshots.results || []).map((r) => r.engagement_rate);
    pastRates.push(engagementRate);

    const medianRate = PerformanceEngineService.calculateMedian(pastRates);
    const relativePerformance = medianRate > 0 ? Number((engagementRate / medianRate).toFixed(2)) : 1.0;
    const percentile = PerformanceEngineService.calculatePercentile(engagementRate, pastRates);
    const classification = PerformanceEngineService.classifyPerformance(exposure, percentile, publishedAt);

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
      relativePerformance,
      classification,
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
   * Re-evaluates post performance against dynamic rolling benchmark and updates reference pools & learned guidelines.
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

    const outperformingList: Array<{ postId: string; title: string; content: string; score: number; percentile: number; exposure: number; weightedEng: number }> = [];
    const underperformingList: Array<{ postId: string; title: string; content: string; score: number; percentile: number; exposure: number; weightedEng: number }> = [];

    for (const post of validSizedPosts) {
      const percentile = PerformanceEngineService.calculatePercentile(post.engagementRate, rates);
      const relativePerf = medianRate > 0 ? Number((post.engagementRate / medianRate).toFixed(2)) : 1.0;
      const classification = PerformanceEngineService.classifyPerformance(post.exposure, percentile, post.publishedAt);

      if (classification === 'STRONG') {
        outperformingList.push({
          postId: post.postId,
          title: post.title,
          content: post.content,
          score: relativePerf,
          percentile,
          exposure: post.exposure,
          weightedEng: post.engagementRate * post.exposure,
        });
      } else if (classification === 'WEAK' || classification === 'POOR') {
        underperformingList.push({
          postId: post.postId,
          title: post.title,
          content: post.content,
          score: relativePerf,
          percentile,
          exposure: post.exposure,
          weightedEng: post.engagementRate * post.exposure,
        });
      }
    }

    // Dynamic reference pool sync (top 5 strong, bottom 5 weak)
    try {
      await db.prepare('UPDATE generator_reference_posts SET is_active = 0').run();
      let rank = 1;
      for (const strong of outperformingList.slice(0, 5)) {
        const chars = PerformanceEngineService.extractCharacteristics(strong.content, strong.title);
        await db.prepare(
          `INSERT INTO generator_reference_posts (
            id, post_id, classification, success_score, percentile, exposure_views,
            weighted_engagement, reason_for_inclusion, extracted_characteristics, rank, is_active, evaluated_at, created_at
          ) VALUES (?, ?, 'STRONG', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
        ).bind(
          crypto.randomUUID(),
          strong.postId,
          strong.score,
          strong.percentile,
          strong.exposure,
          strong.weightedEng,
          `Achieved top ${100 - strong.percentile}% engagement benchmark (${strong.score}x median).`,
          JSON.stringify(chars),
          rank++,
          nowIso,
          nowIso
        ).run();
      }

      rank = 1;
      for (const weak of underperformingList.slice(0, 5)) {
        const chars = PerformanceEngineService.extractCharacteristics(weak.content, weak.title);
        await db.prepare(
          `INSERT INTO generator_reference_posts (
            id, post_id, classification, success_score, percentile, exposure_views,
            weighted_engagement, reason_for_inclusion, extracted_characteristics, rank, is_active, evaluated_at, created_at
          ) VALUES (?, ?, 'WEAK', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
        ).bind(
          crypto.randomUUID(),
          weak.postId,
          weak.score,
          weak.percentile,
          weak.exposure,
          weak.weightedEng,
          `Fell into lower ${weak.percentile}% engagement percentile (${weak.score}x median).`,
          JSON.stringify(chars),
          rank++,
          nowIso,
          nowIso
        ).run();
      }
    } catch {
      // Table may be pending or in test mocks
    }

    // Learned Guidelines Extraction
    const successfulPatterns: string[] = [];
    const failurePatterns: string[] = [];

    if (outperformingList.length > 0) {
      let bulletCount = 0;
      let questionCount = 0;
      let avgLen = 0;
      for (const p of outperformingList) {
        avgLen += p.content.length;
        if (/^[-*•\d+.]/m.test(p.content)) bulletCount++;
        if (/\?/m.test(p.content)) questionCount++;
      }
      avgLen = Math.round(avgLen / outperformingList.length);
      if (bulletCount / outperformingList.length >= 0.5) {
        successfulPatterns.push('Posts using structured bullet points or numbered lists currently achieve higher interaction.');
      }
      if (questionCount / outperformingList.length >= 0.5) {
        successfulPatterns.push('Ending with an engaging question or interactive prompt correlates with above-average comments.');
      }
      if (avgLen >= 300 && avgLen <= 1200) {
        successfulPatterns.push('Medium-length educational posts (300-1200 characters) outperform concise short posts.');
      }
    }

    if (underperformingList.length > 0) {
      let shortCount = 0;
      for (const p of underperformingList) {
        if (p.content.length < 200) shortCount++;
      }
      if (shortCount / underperformingList.length >= 0.5) {
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

    // Persist learned guidelines into generator_guidelines table
    try {
      await db.prepare("DELETE FROM generator_guidelines WHERE tier = 'LEARNED'").run();
      for (const p of successfulPatterns) {
        await db.prepare(
          "INSERT INTO generator_guidelines (id, tier, category, guideline_text, evidence_count, is_active, created_by, created_at, updated_at) VALUES (?, 'LEARNED', 'DO_MORE', ?, ?, 1, 'system', ?, ?)"
        ).bind(crypto.randomUUID(), p, outperformingList.length || 1, nowIso, nowIso).run();
      }
      for (const p of failurePatterns) {
        await db.prepare(
          "INSERT INTO generator_guidelines (id, tier, category, guideline_text, evidence_count, is_active, created_by, created_at, updated_at) VALUES (?, 'LEARNED', 'AVOID', ?, ?, 1, 'system', ?, ?)"
        ).bind(crypto.randomUUID(), p, underperformingList.length || 1, nowIso, nowIso).run();
      }
    } catch {
      // Table fallback
    }

    // Fetch manual guidelines for profile payload
    const manualGuidelinesList: string[] = [];
    try {
      const manualRows = await db
        .prepare("SELECT guideline_text FROM generator_guidelines WHERE tier = 'MANUAL' AND is_active = 1")
        .all<{ guideline_text: string }>();
      manualGuidelinesList.push(...(manualRows.results || []).map((r) => r.guideline_text));
    } catch {
      // Fallback if table pending
    }

    const systemRules = [
      'Strictly English ("en") language.',
      'No corporate buzzwords ("unlock potential", "game changer", "digital transformation").',
      'Fact preservation rule: retain 100% accurate statistics from source without inventing fake numbers.',
    ];

    const successfulExamples = outperformingList.slice(0, 3).map((p) => ({
      postId: p.postId,
      title: p.title,
      snippet: p.content.slice(0, 220) + (p.content.length > 220 ? '...' : ''),
      score: p.score,
      percentile: p.percentile,
    }));

    const poorExamples = underperformingList.slice(0, 3).map((p) => ({
      postId: p.postId,
      title: p.title,
      snippet: p.content.slice(0, 220) + (p.content.length > 220 ? '...' : ''),
      score: p.score,
      percentile: p.percentile,
    }));

    const profile: ContentPerformanceProfile = {
      summary: `Active Performance Profile built from ${validSizedPosts.length} evaluated posts (median engagement rate: ${(medianRate * 100).toFixed(2)}%).`,
      successfulPatterns,
      failurePatterns,
      successfulExamples,
      poorExamples,
      manualGuidelines: manualGuidelinesList,
      systemRules,
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
