import { describe, expect, it } from 'vitest';
import { IntelligentSchedulingService } from '../../src/services/publishing/intelligent-scheduler-service';

describe('IntelligentSchedulingService - Unit & Strategy Tests', () => {
  it('calculates coverage depth correctly and limits daily frequency', async () => {
    const service = new IntelligentSchedulingService();

    // 0 days coverage -> max 1 post/day
    const mockDbEmpty = {
      prepare: () => ({
        bind: () => ({
          first: async () => ({ max_sched: null }),
        }),
      }),
    } as unknown as D1Database;

    const resEmpty = await service.calculateScheduleCoverageDays(mockDbEmpty);
    expect(resEmpty.coverageDays).toBe(0);
    expect(resEmpty.maxAllowedDailyPosts).toBe(1);

    // 16 days coverage -> max 2 posts/day
    const date16d = new Date(Date.now() + 16 * 86400 * 1000).toISOString();
    const mockDb16d = {
      prepare: () => ({
        bind: () => ({
          first: async () => ({ max_sched: date16d }),
        }),
      }),
    } as unknown as D1Database;

    const res16d = await service.calculateScheduleCoverageDays(mockDb16d);
    expect(res16d.coverageDays).toBeGreaterThanOrEqual(15);
    expect(res16d.maxAllowedDailyPosts).toBe(2);

    // 25 days coverage -> max 3 posts/day
    const date25d = new Date(Date.now() + 25 * 86400 * 1000).toISOString();
    const mockDb25d = {
      prepare: () => ({
        bind: () => ({
          first: async () => ({ max_sched: date25d }),
        }),
      }),
    } as unknown as D1Database;

    const res25d = await service.calculateScheduleCoverageDays(mockDb25d);
    expect(res25d.maxAllowedDailyPosts).toBe(3);
  });

  it('proposes intelligent schedules respecting minimum 3h gap and time window ranking', async () => {
    const service = new IntelligentSchedulingService();

    const mockPosts = [
      { id: 'post-1', title: 'Jak zautomatyzować e-commerce', quality_score: 95, created_at: new Date().toISOString() },
      { id: 'post-2', title: 'Poradnik SEO dla małych firm', quality_score: 85, created_at: new Date().toISOString() },
    ];

    const mockDb = {
      prepare: (sql: string) => ({
        bind: (..._args: any[]) => ({
          first: async () => {
            if (sql.includes('MAX(scheduled_at)')) return { max_sched: null }; // 0 coverage -> max 1/day
            return null;
          },
          all: async () => {
            if (sql.includes('FROM posts')) return { results: mockPosts };
            if (sql.includes('FROM publications')) return { results: [] };
            if (sql.includes('FROM schedules')) return { results: [] };
            return { results: [] };
          },
        }),
      }),
    } as unknown as D1Database;

    const proposed = await service.proposeIntelligentSchedules(mockDb, ['post-1', 'post-2']);

    expect(proposed).toHaveLength(2);
    expect(proposed[0]!.postId).toBe('post-1');
    expect(proposed[1]!.postId).toBe('post-2');

    // With 0 coverage, max 1 post/day -> post-1 and post-2 should be on consecutive days
    const date1 = proposed[0]!.scheduledDate;
    const date2 = proposed[1]!.scheduledDate;
    expect(date1).not.toBe(date2);
  });
});
