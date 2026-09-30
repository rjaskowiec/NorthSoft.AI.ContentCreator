import { describe, expect, it } from 'vitest';
import { PerformanceEngineService } from '../../src/services/analytics/performance-engine';

class MockD1Database {
  public posts: Array<any> = [];
  public versions: Array<any> = [];
  public publications: Array<any> = [];
  public metrics: Array<any> = [];
  public referencePosts: Array<any> = [];
  public guidelines: Array<any> = [];

  prepare(sql: string) {
    let boundArgs: any[] = [];
    const stmt = {
      bind: (...args: any[]) => {
        boundArgs = args;
        return stmt;
      },
      first: async <T = any>(): Promise<T | null> => {
        if (sql.includes('SELECT COUNT(*)')) {
          return { cnt: this.publications.filter((p) => p.status === 'published').length } as any;
        }
        return null;
      },
      all: async <T = any>(): Promise<{ results: T[] }> => {
        if (sql.includes('FROM posts p')) {
          const results = this.posts.map((p) => {
            const pub = this.publications.find((pub) => pub.post_id === p.id && pub.status === 'published');
            const v = this.versions.find((v) => v.post_id === p.id && v.version_number === p.current_version);
            const m = this.metrics.filter((m) => m.post_id === p.id).pop();
            return {
              post_id: p.id,
              post_title: p.title,
              post_content: v?.content || 'Post body content',
              publication_id: pub?.id || 'pub-1',
              facebook_post_id: pub?.facebook_post_id || 'fb-1',
              published_at: pub?.published_at || new Date().toISOString(),
              views: m?.views || 0,
              unique_views: m?.unique_views || 0,
              reactions: m?.reactions || 0,
              comments: m?.comments || 0,
              shares: m?.shares || 0,
              clicks: m?.clicks || 0,
              measured_at: m?.measured_at,
            };
          });
          return { results: results as any };
        }
        if (sql.includes('FROM generator_guidelines')) {
          return { results: this.guidelines as any };
        }
        if (sql.includes('FROM generator_reference_posts')) {
          return { results: this.referencePosts.filter((r) => r.is_active === 1) as any };
        }
        return { results: [] };
      },
      run: async () => {
        if (sql.includes('UPDATE generator_reference_posts SET is_active = 0')) {
          this.referencePosts.forEach((r) => (r.is_active = 0));
        } else if (sql.includes('INSERT INTO generator_reference_posts')) {
          this.referencePosts.push({
            id: boundArgs[0],
            post_id: boundArgs[1],
            classification: boundArgs[2],
            success_score: Number(boundArgs[3]),
            percentile: Number(boundArgs[4]),
            exposure_views: Number(boundArgs[5]),
            weighted_engagement: Number(boundArgs[6]),
            reason_for_inclusion: boundArgs[7],
            extracted_characteristics: boundArgs[8],
            rank: Number(boundArgs[9]),
            is_active: Number(boundArgs[10]),
            confidence: Number(boundArgs[11]),
            reference_value: Number(boundArgs[12]),
            evaluated_at: boundArgs[13],
            created_at: boundArgs[14],
          });
        }
        return { meta: { changes: 1 } };
      },
    };
    return stmt;
  }

  async batch() {
    return [];
  }
}

describe('PerformanceEngineService - Unit Tests', () => {
  describe('Mathematical Helper Functions', () => {
    it('computes weighted engagement correctly', () => {
      const weighted = PerformanceEngineService.computeWeightedEngagement(10, 5, 2, 4);
      // (10 * 1.0) + (5 * 2.0) + (2 * 3.0) + (4 * 1.5) = 10 + 10 + 6 + 6 = 32
      expect(weighted).toBe(32);
    });

    it('computes exposure preferring unique reach over total views', () => {
      expect(PerformanceEngineService.computeExposure(500, 800)).toBe(500);
      expect(PerformanceEngineService.computeExposure(0, 300)).toBe(300);
    });

    it('computes engagement rate accurately', () => {
      const rate = PerformanceEngineService.computeEngagementRate(20, 200);
      // 20 / 200 = 0.10
      expect(rate).toBeCloseTo(0.1, 4);
    });

    it('computes time decay freshness weights correctly', () => {
      const now = Date.now();
      const d5 = new Date(now - 5 * 86400 * 1000).toISOString();
      const d20 = new Date(now - 20 * 86400 * 1000).toISOString();
      const d40 = new Date(now - 40 * 86400 * 1000).toISOString();
      const d70 = new Date(now - 70 * 86400 * 1000).toISOString();
      const d100 = new Date(now - 100 * 86400 * 1000).toISOString();

      expect(PerformanceEngineService.computeFreshnessWeight(d5)).toBe(1.0);
      expect(PerformanceEngineService.computeFreshnessWeight(d20)).toBe(0.8);
      expect(PerformanceEngineService.computeFreshnessWeight(d40)).toBe(0.5);
      expect(PerformanceEngineService.computeFreshnessWeight(d70)).toBe(0.3);
      expect(PerformanceEngineService.computeFreshnessWeight(d100)).toBe(0.1);
    });

    it('calculates median deterministically for odd and even length arrays', () => {
      expect(PerformanceEngineService.calculateMedian([5, 1, 9])).toBe(5);
      expect(PerformanceEngineService.calculateMedian([1, 3, 5, 7])).toBe(4);
      expect(PerformanceEngineService.calculateMedian([])).toBe(0);
    });
  });

  describe('Adaptive Cold-Start & Reference Pool Sync', () => {
    it('populates Strong and Weak pools in EARLY mode with small set of 2 posts', async () => {
      const mockDb = new MockD1Database();
      mockDb.posts = [
        { id: 'post-1', title: 'Top Performing Guide', current_version: 1 },
        { id: 'post-2', title: 'Underperforming Update', current_version: 1 },
      ];
      mockDb.versions = [
        { post_id: 'post-1', version_number: 1, content: 'Detailed step-by-step guide with bullet points and clear value.' },
        { post_id: 'post-2', version_number: 1, content: 'Short update.' },
      ];
      mockDb.publications = [
        { id: 'pub-1', post_id: 'post-1', facebook_post_id: 'fb-1', published_at: new Date(Date.now() - 3600 * 1000).toISOString(), status: 'published' },
        { id: 'pub-2', post_id: 'post-2', facebook_post_id: 'fb-2', published_at: new Date(Date.now() - 3600 * 1000).toISOString(), status: 'published' },
      ];
      mockDb.metrics = [
        { post_id: 'post-1', views: 50, unique_views: 40, reactions: 5, comments: 2, shares: 1, clicks: 0 },
        { post_id: 'post-2', views: 10, unique_views: 8, reactions: 0, comments: 0, shares: 0, clicks: 0 },
      ];

      const engine = new PerformanceEngineService();
      const profile = await engine.evaluateAndGenerateProfile(mockDb as any);

      expect(profile.diagnostics?.learningMode).toBe('EARLY');
      expect(profile.diagnostics?.evaluatedPostsCount).toBe(2);
      expect(mockDb.referencePosts.filter((r) => r.is_active === 1 && r.classification === 'STRONG')).toHaveLength(1);
      expect(mockDb.referencePosts.filter((r) => r.is_active === 1 && r.classification === 'WEAK')).toHaveLength(1);
    });

    it('assigns LOW confidence to early posts with low exposure without dropping them', async () => {
      const mockDb = new MockD1Database();
      mockDb.posts = [{ id: 'post-low', title: 'Low Exposure Post', current_version: 1 }];
      mockDb.versions = [{ post_id: 'post-low', version_number: 1, content: 'Some early content' }];
      mockDb.publications = [{ id: 'pub-low', post_id: 'post-low', published_at: new Date(Date.now() - 3600 * 2).toISOString(), status: 'published' }];
      mockDb.metrics = [{ post_id: 'post-low', views: 2, unique_views: 2, reactions: 1, comments: 0, shares: 0, clicks: 0 }];

      const engine = new PerformanceEngineService();
      const profile = await engine.evaluateAndGenerateProfile(mockDb as any);

      expect(profile.diagnostics?.lowConfidenceCount).toBe(1);
      expect(mockDb.referencePosts.length).toBeGreaterThan(0);
      expect(mockDb.referencePosts[0].confidence).toBeLessThan(0.8);
    });

    it('handles zero posts gracefully without throwing', async () => {
      const mockDb = new MockD1Database();
      const engine = new PerformanceEngineService();
      const profile = await engine.evaluateAndGenerateProfile(mockDb as any);

      expect(profile.diagnostics?.learningMode).toBe('EARLY');
      expect(profile.diagnostics?.evaluatedPostsCount).toBe(0);
      expect(profile.successfulExamples).toHaveLength(0);
      expect(profile.poorExamples).toHaveLength(0);
    });

    it('updates active pool when benchmark shifts and older STRONG post drops', async () => {
      const mockDb = new MockD1Database();
      mockDb.posts = [
        { id: 'post-old-top', title: 'Old Top Post', current_version: 1 },
        { id: 'post-new-mega', title: 'New Mega Viral Post', current_version: 1 },
      ];
      mockDb.versions = [
        { post_id: 'post-old-top', version_number: 1, content: 'Good post content with clear value.' },
        { post_id: 'post-new-mega', version_number: 1, content: 'Viral post content with massive engagement and shares!' },
      ];
      mockDb.publications = [
        { id: 'pub-1', post_id: 'post-old-top', published_at: new Date(Date.now() - 86400 * 5 * 1000).toISOString(), status: 'published' },
        { id: 'pub-2', post_id: 'post-new-mega', published_at: new Date(Date.now() - 3600 * 2 * 1000).toISOString(), status: 'published' },
      ];
      mockDb.metrics = [
        { post_id: 'post-old-top', views: 100, unique_views: 80, reactions: 5, comments: 2, shares: 0, clicks: 0 },
        { post_id: 'post-new-mega', views: 5000, unique_views: 4000, reactions: 300, comments: 150, shares: 50, clicks: 80 },
      ];

      const engine = new PerformanceEngineService();
      const profile = await engine.evaluateAndGenerateProfile(mockDb as any);
      expect(profile).toBeDefined();

      const strongActive = mockDb.referencePosts.filter((r) => r.is_active === 1 && r.classification === 'STRONG');
      const weakActive = mockDb.referencePosts.filter((r) => r.is_active === 1 && r.classification === 'WEAK');

      expect(strongActive).toHaveLength(1);
      expect(strongActive[0].post_id).toBe('post-new-mega');
      expect(weakActive).toHaveLength(1);
      expect(weakActive[0].post_id).toBe('post-old-top');
    });

    it('builds Generator Context Preview containing active pools and learning mode', async () => {
      const mockDb = new MockD1Database();
      mockDb.referencePosts = [
        {
          id: 'ref-1',
          post_id: 'post-1',
          classification: 'STRONG',
          success_score: 1.8,
          percentile: 90,
          is_active: 1,
          reason_for_inclusion: 'Achieved top 10% benchmark',
        },
      ];

      const engine = new PerformanceEngineService();
      const preview = await engine.buildGeneratorContextPreview(mockDb as any);

      expect(preview.learningMode).toBeDefined();
      expect(preview.finalInstructionsText).toContain('SYSTEM RULES');
    });
  });
});

