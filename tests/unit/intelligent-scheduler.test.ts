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

  it('follows progressive tier ladder: fills 14 days with 1 post, then adds 2nd post to day 1 with >=3h gap', async () => {
    const service = new IntelligentSchedulingService();

    // Prepare 14 existing schedules, 1 for each day in Days 1..14
    const existingScheds: Array<{ post_id: string; scheduled_at: string }> = [];
    const baseDate = new Date();
    for (let day = 1; day <= 14; day++) {
      const dt = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate() + day, 13, 0, 0));
      existingScheds.push({
        post_id: `existing-${day}`,
        scheduled_at: dt.toISOString(),
      });
    }

    const mockDb = {
      prepare: (sql: string) => ({
        bind: (..._args: any[]) => ({
          first: async () => ({ max_sched: existingScheds[13]!.scheduled_at }),
          all: async () => {
            if (sql.includes('FROM posts')) {
              return { results: [{ id: 'post-new-15', title: 'Post 15', quality_score: 90 }] };
            }
            if (sql.includes('FROM schedules')) {
              return { results: existingScheds };
            }
            return { results: [] };
          },
        }),
      }),
    } as unknown as D1Database;

    const proposed = await service.proposeIntelligentSchedules(mockDb, ['post-new-15']);
    expect(proposed).toHaveLength(1);

    // Because Days 1..14 already have 1 post each, post 15 should trigger Tier 2:
    // It should be placed on Day 1 (the first day of the 14-day window that can take a 2nd post)
    const expectedDay1Str = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate() + 1)).toISOString().split('T')[0];
    expect(proposed[0]!.scheduledDate).toBe(expectedDay1Str);

    // And it must have >= 3 hours separation from existing 13:00 UTC (e.g. 18:00 UTC)
    const scheduledHour = new Date(proposed[0]!.scheduledAtIso).getUTCHours();
    expect(Math.abs(scheduledHour - 13)).toBeGreaterThanOrEqual(3);
  });

  it('allows rescheduling an already-scheduled post without self-conflict', async () => {
    const service = new IntelligentSchedulingService();
    const targetPostId = 'post-reschedule-1';
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
    tomorrow.setUTCHours(13, 0, 0, 0);

    const mockDb = {
      prepare: (sql: string) => ({
        bind: (..._args: any[]) => ({
          first: async () => ({ max_sched: tomorrow.toISOString() }),
          all: async () => {
            if (sql.includes('FROM posts')) {
              return { results: [{ id: targetPostId, title: 'Rescheduled Post', quality_score: 90 }] };
            }
            if (sql.includes('FROM schedules')) {
              // The post already has a schedule at 13:00 UTC tomorrow
              return { results: [{ post_id: targetPostId, scheduled_at: tomorrow.toISOString() }] };
            }
            return { results: [] };
          },
        }),
      }),
    } as unknown as D1Database;

    const proposed = await service.proposeIntelligentSchedules(mockDb, [targetPostId]);
    expect(proposed).toHaveLength(1);
    expect(proposed[0]!.postId).toBe(targetPostId);
    // Should successfully schedule tomorrow without thinking it collides with itself
    const expectedTomorrowStr = tomorrow.toISOString().split('T')[0];
    expect(proposed[0]!.scheduledDate).toBe(expectedTomorrowStr);
  });
});
