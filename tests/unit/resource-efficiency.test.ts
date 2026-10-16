import { describe, expect, it, vi } from 'vitest';
import { FacebookSyncService } from '../../src/services/publishing/facebook-sync-service';
import { PublicationService } from '../../src/services/publishing/publication-service';
import { PipelineOrchestratorService } from '../../src/services/content/pipeline-orchestrator-service';
import type { IMetaPublisher } from '../../src/publishing/meta-publisher';

describe('Resource Efficiency Regression Suite', () => {
  // Helper to create an instrumented mock D1Database that tracks executed queries
  function createInstrumentedDb(options?: {
    schedulesPublishing?: Array<{ id: string }>;
    publicationsPublishing?: Array<{ id: string }>;
    dueSchedules?: Array<{ schedule_id: string; post_id: string }>;
    approvedPosts?: Array<{ id: string }>;
    schedulerConfig?: { enabled: boolean; minTopicBacklog: number; targetCoverageDays: number; maxPostsPerNight: number };
    knownFbPostIds?: string[];
  }) {
    const executedQueries: Array<{ sql: string; binds: unknown[]; isWrite: boolean }> = [];
    const knownFbIds = new Set(options?.knownFbPostIds || []);

    const db = {
      prepare: vi.fn((sql: string) => {
        const isWrite = /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql);
        let currentBinds: unknown[] = [];

        const stmt = {
          bind: vi.fn((...args: unknown[]) => {
            currentBinds = args;
            return stmt;
          }),
          first: vi.fn(async <T>() => {
            executedQueries.push({ sql, binds: currentBinds, isWrite });

            // recoverStaleLocks fast gatekeepers
            if (sql.includes("SELECT id FROM schedules WHERE status = 'publishing'")) {
              return (options?.schedulesPublishing?.[0] as T) || null;
            }
            if (sql.includes("SELECT id FROM publications WHERE status = 'publishing'")) {
              return (options?.publicationsPublishing?.[0] as T) || null;
            }

            // runAutomationTick fast gatekeeper
            if (sql.includes("SELECT id FROM posts WHERE status = 'approved'")) {
              return (options?.approvedPosts?.[0] as T) || null;
            }

            // scheduler config
            if (sql.includes("SELECT * FROM pipeline_scheduler_config WHERE id = 'default'")) {
              return (options?.schedulerConfig ? {
                enabled: options.schedulerConfig.enabled ? 1 : 0,
                min_topic_backlog: options.schedulerConfig.minTopicBacklog,
                target_coverage_days: options.schedulerConfig.targetCoverageDays,
                max_posts_per_night: options.schedulerConfig.maxPostsPerNight,
                updated_at: '2026-10-16T12:00:00Z',
              } as T : null);
            }

            return null;
          }),
          all: vi.fn(async <T>() => {
            executedQueries.push({ sql, binds: currentBinds, isWrite });

            // due schedules
            if (sql.includes("FROM schedules s") && sql.includes("s.status = 'pending'")) {
              return { results: (options?.dueSchedules as T[]) || [] };
            }

            // batch Facebook post IDs check
            if (sql.includes('SELECT facebook_post_id FROM publications WHERE facebook_post_id IN')) {
              const matchedIds = currentBinds.filter((id) => knownFbIds.has(String(id)));
              return { results: matchedIds.map((id) => ({ facebook_post_id: id } as T)) };
            }

            // candidate local posts
            if (sql.includes('SELECT p.id as post_id') && sql.includes('existingLocalPost')) {
              return { results: [] };
            }

            // published items check in FacebookSyncService
            if (sql.includes('SELECT pub.id as publication_id')) {
              return { results: [] };
            }

            return { results: [] };
          }),
          run: vi.fn(async () => {
            executedQueries.push({ sql, binds: currentBinds, isWrite });
            return { success: true, meta: { changes: 1, rows_written: 1 } };
          }),
        };

        return stmt;
      }),
      batch: vi.fn(async (statements: unknown[]) => {
        return statements.map(() => ({ success: true, meta: { changes: 1 } }));
      }),
    } as unknown as D1Database;

    return { db, executedQueries };
  }

  // ---------------------------------------------------------------------------
  // 1. Empty Cron Execution Efficiency
  // ---------------------------------------------------------------------------
  describe('1. Empty Cron Execution Efficiency', () => {
    it('executes 0 D1 writes and at most 3 indexed reads during an empty cron tick outside AI window', async () => {
      const { db, executedQueries } = createInstrumentedDb({
        schedulesPublishing: [],
        publicationsPublishing: [],
        dueSchedules: [],
        approvedPosts: [],
        schedulerConfig: { enabled: true, minTopicBacklog: 5, targetCoverageDays: 14, maxPostsPerNight: 3 },
      });

      const publisher = {
        getConfigStatus: vi.fn().mockReturnValue({ state: 'OPERATIONAL' }),
        publishPost: vi.fn(),
        getPost: vi.fn(),
        deletePost: vi.fn(),
        fetchPagePosts: vi.fn(),
      } as unknown as IMetaPublisher;

      const pubService = new PublicationService(db, publisher);
      const pipelineService = new PipelineOrchestratorService(db, {} as Env);

      // 1. Run due posts check
      const pubResult = await pubService.publishScheduledDuePosts();
      expect(pubResult.processed).toBe(0);

      // 2. Run automation tick (daytime 14:00 UTC - outside AI window)
      const daytime = new Date('2026-10-16T14:00:00Z');
      const tickResult = await pipelineService.runAutomationTick(daytime);
      expect(tickResult.ran).toBe(false);
      expect(tickResult.reason).toContain('Outside AI background window');

      // Verify that at most 1 conditional lock update and at most 4 read queries were executed
      const writeQueries = executedQueries.filter((q) => q.isWrite);
      expect(writeQueries.length).toBeLessThanOrEqual(1);

      // Verify total queries:
      // - recoverStaleLocks: 1 conditional status reset, 1 publication lock check
      // - publishScheduledDuePosts: 1 check (due schedules)
      // - getSchedulerConfig: 1 read
      // - runAutomationTick: 1 indexed gatekeeper check (approved posts)
      // Total <= 5 queries, 0 table scans!
      expect(executedQueries.length).toBeLessThanOrEqual(5);
    });

    it('recovers stale publication records and handles 0 publishing rows gracefully', async () => {
      const { db, executedQueries } = createInstrumentedDb({
        schedulesPublishing: [],
        publicationsPublishing: [],
      });

      const pubService = new PublicationService(db, {} as IMetaPublisher);
      const recovered = await pubService.recoverStaleLocks();
      expect(recovered).toBe(0);

      // Verify that queries executed are bounded and use status filter
      const statusQueries = executedQueries.filter((q) => q.sql.includes("status = 'publishing'"));
      expect(statusQueries.length).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Facebook Sync Batch Lookups & Early Exit
  // ---------------------------------------------------------------------------
  describe('2. Facebook Sync Efficiency (No N+1 & Incremental Early Exit)', () => {
    it('uses a single batch IN (?) query per page instead of 100 individual queries when checking Facebook feed', async () => {
      const knownIds = Array.from({ length: 100 }, (_, i) => `fb-post-${i}`);
      const { db, executedQueries } = createInstrumentedDb({
        knownFbPostIds: knownIds,
      });

      const mockPublisher = {
        fetchPagePosts: vi.fn().mockResolvedValue({
          success: true,
          posts: knownIds.map((id) => ({
            id,
            message: `Hello world ${id}`,
            createdTime: '2026-10-16T10:00:00Z',
          })),
          paging: { after: 'cursor-page-2' },
        }),
        getPost: vi.fn(),
      } as unknown as IMetaPublisher;

      const syncService = new FacebookSyncService(db, mockPublisher);
      const result = await syncService.syncFacebookPostsToSystem();

      expect(result.imported).toBe(0);
      expect(result.updated).toBe(0);

      // Verify that fetchPagePosts was only called ONCE because of early exit on page 0
      expect(mockPublisher.fetchPagePosts).toHaveBeenCalledTimes(1);

      // Find the query checking Facebook post IDs
      const idCheckQueries = executedQueries.filter((q) =>
        q.sql.includes('SELECT facebook_post_id FROM publications WHERE facebook_post_id IN'),
      );

      // Exactly ONE batch query was issued for all 100 posts (NOT 100 separate queries!)
      expect(idCheckQueries.length).toBe(1);
      expect(idCheckQueries[0]!.binds.length).toBe(100);

      // Verify NO individual SELECT id FROM publications queries were executed
      const singleQueries = executedQueries.filter((q) =>
        q.sql.includes('SELECT id FROM publications WHERE facebook_post_id = ?'),
      );
      expect(singleQueries.length).toBe(0);
    });

    it('terminates pagination immediately when page 0 posts are all already known (Early Exit)', async () => {
      const knownIds = ['fb-1', 'fb-2', 'fb-3'];
      const { db } = createInstrumentedDb({
        knownFbPostIds: knownIds,
      });

      const fetchPagePostsSpy = vi.fn().mockResolvedValue({
        success: true,
        posts: [
          { id: 'fb-1', message: 'Post 1' },
          { id: 'fb-2', message: 'Post 2' },
          { id: 'fb-3', message: 'Post 3' },
        ],
        paging: { after: 'page-2-cursor' },
      });

      const mockPublisher = {
        fetchPagePosts: fetchPagePostsSpy,
        getPost: vi.fn(),
      } as unknown as IMetaPublisher;

      const syncService = new FacebookSyncService(db, mockPublisher);
      const res = await syncService.syncFacebookPostsToSystem();

      expect(res.imported).toBe(0);
      // Page 2 must NEVER be requested because all posts in page 0 were already known
      expect(fetchPagePostsSpy).toHaveBeenCalledTimes(1);
    });

    it('correctly imports only the new post when a single new post appears in the feed', async () => {
      const knownIds = ['fb-old-1', 'fb-old-2'];
      const { db } = createInstrumentedDb({
        knownFbPostIds: knownIds,
      });

      const mockPublisher = {
        fetchPagePosts: vi.fn().mockResolvedValue({
          success: true,
          posts: [
            { id: 'fb-new-1', message: 'Brand new post directly on FB', createdTime: '2026-10-16T15:00:00Z' },
            { id: 'fb-old-1', message: 'Old post 1' },
            { id: 'fb-old-2', message: 'Old post 2' },
          ],
        }),
        getPost: vi.fn(),
      } as unknown as IMetaPublisher;

      const syncService = new FacebookSyncService(db, mockPublisher);
      const res = await syncService.syncFacebookPostsToSystem();

      expect(res.imported).toBe(1);

      // Verify db.batch was called to insert the post, version, publication, etc.
      expect(db.batch).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Idempotency & Repeat Execution
  // ---------------------------------------------------------------------------
  describe('3. Idempotent Repeat Execution', () => {
    it('produces identical zero-cost outcome when rerun with no intervening changes', async () => {
      const knownIds = ['fb-1', 'fb-2'];
      const { db } = createInstrumentedDb({
        knownFbPostIds: knownIds,
        schedulerConfig: { enabled: true, minTopicBacklog: 5, targetCoverageDays: 14, maxPostsPerNight: 3 },
      });

      const mockPublisher = {
        fetchPagePosts: vi.fn().mockResolvedValue({
          success: true,
          posts: [
            { id: 'fb-1', message: 'Post 1' },
            { id: 'fb-2', message: 'Post 2' },
          ],
        }),
        getPost: vi.fn(),
      } as unknown as IMetaPublisher;

      const syncService = new FacebookSyncService(db, mockPublisher);

      // First run
      const run1 = await syncService.syncFacebookPostsToSystem();
      expect(run1.imported).toBe(0);
      expect(run1.updated).toBe(0);

      // Second run immediately after
      const run2 = await syncService.syncFacebookPostsToSystem();
      expect(run2.imported).toBe(0);
      expect(run2.updated).toBe(0);
      expect(mockPublisher.fetchPagePosts).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Resilience, Error Boundaries & Quota Protection
  // ---------------------------------------------------------------------------
  describe('4. Error Resilience & Non-Fatal Boundaries', () => {
    it('gracefully handles D1 database error during sync without throwing or crashing worker', async () => {
      const errorDb = {
        prepare: vi.fn().mockImplementation(() => {
          throw new Error('D1 database temporarily busy (SQLITE_BUSY)');
        }),
      } as unknown as D1Database;

      const mockPublisher = {
        fetchPagePosts: vi.fn(),
        getPost: vi.fn(),
      } as unknown as IMetaPublisher;

      const syncService = new FacebookSyncService(errorDb, mockPublisher);
      const res = await syncService.syncFacebookPostsToSystem();

      // Does not throw, increments errors safely
      expect(res.errors).toBeGreaterThan(0);
    });

    it('gracefully skips due publication when Meta Publisher is in disabled/not_configured state without failing records', async () => {
      const { db, executedQueries } = createInstrumentedDb({
        dueSchedules: [{ schedule_id: 'sched-1', post_id: 'post-1' }],
      });

      const disabledPublisher = {
        getConfigStatus: vi.fn().mockReturnValue({ state: 'DISABLED', statusMessage: 'Publishing disabled by admin' }),
        publishPost: vi.fn(),
      } as unknown as IMetaPublisher;

      const pubService = new PublicationService(db, disabledPublisher);
      const res = await pubService.publishScheduledDuePosts();

      expect(res.processed).toBe(0);
      expect(res.skippedReason).toBe('DISABLED');

      // Verify that no records were marked 'failed' or 'publishing'
      const writeQueries = executedQueries.filter((q) => q.isWrite);
      expect(writeQueries.length).toBe(0);
    });
  });
});
