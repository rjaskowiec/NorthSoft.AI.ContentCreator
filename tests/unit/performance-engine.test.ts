import { describe, expect, it } from 'vitest';
import { PerformanceEngineService } from '../../src/services/analytics/performance-engine';

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
      expect(rate).toBeCloseTo(0.10, 4);
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

    it('classifies relative performance against benchmark correctly', () => {
      expect(PerformanceEngineService.classifyPerformance(100, 1.6)).toBe('OUTPERFORMING');
      expect(PerformanceEngineService.classifyPerformance(100, 1.2)).toBe('STRONG');
      expect(PerformanceEngineService.classifyPerformance(100, 1.0)).toBe('AVERAGE');
      expect(PerformanceEngineService.classifyPerformance(100, 0.6)).toBe('WEAK');
      expect(PerformanceEngineService.classifyPerformance(100, 0.3)).toBe('UNDERPERFORMING');

      // Low exposure safeguard (< 20 exposure)
      expect(PerformanceEngineService.classifyPerformance(10, 2.5)).toBe('INSUFFICIENT_DATA');
    });
  });

  describe('Performance Profile Generation & Fallback', () => {
    it('returns INSUFFICIENT_DATA default profile when no metrics exist', async () => {
      const mockDb = {
        prepare: () => ({
          bind: () => ({
            all: async () => ({ results: [] }),
            first: async () => null,
            run: async () => ({ success: true }),
          }),
          all: async () => ({ results: [] }),
          first: async () => null,
          run: async () => ({ success: true }),
        }),
        batch: async () => [],
      } as unknown as D1Database;

      const engine = new PerformanceEngineService();
      const profile = await engine.evaluateAndGenerateProfile(mockDb);

      expect(profile.successfulPatterns).toHaveLength(0);
      expect(profile.failurePatterns).toHaveLength(0);
      expect(profile.metricsSummary.totalEvaluated).toBe(0);
    });
  });
});
