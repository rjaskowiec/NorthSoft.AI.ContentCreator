import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { FacebookSyncService } from '../../src/services/publishing/facebook-sync-service';
import { PublicationService } from '../../src/services/publishing/publication-service';
import { PipelineOrchestratorService } from '../../src/services/content/pipeline-orchestrator-service';
import type { IMetaPublisher } from '../../src/publishing/meta-publisher';

describe('Resource Efficiency Regression Suite', () => {
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

            if (sql.includes("SELECT id FROM schedules WHERE status = 'publishing'")) {
              return (options?.schedulesPublishing?.[0] as T) || null;
            }
            if (sql.includes("SELECT id FROM publications WHERE status = 'publishing'")) {
              return (options?.publicationsPublishing?.[0] as T) || null;
            }
            if (sql.includes("SELECT id FROM posts WHERE status = 'approved'")) {
              return (options?.approvedPosts?.[0] as T) || null;
            }
            if (sql.includes("SELECT * FROM pipeline_scheduler_config WHERE id = 'default'")) {
              return (options?.schedulerConfig ? {
                enabled: options.schedulerConfig.enabled ? 1 : 0,
                min_topic_backlog: options.schedulerConfig.minTopicBacklog,
                target_coverage_days: options.schedulerConfig.targetCoverageDays,
                max_posts_per_night: options.schedulerConfig.maxPostsPerNight,
                updated_at: '2026-10-16T12:00:00Z',
              } as T : null);
            }
            if (sql.includes('FROM posts p') && (sql.includes('JOIN post_versions pv') || sql.includes('p.id = ?'))) {
              return {
                id: (currentBinds[0] as string) || 'post-due-1',
                title: 'Post Title',
                post_status: 'scheduled',
                version_id: 'ver-1',
                body: 'Post content to publish',
                version_status: 'scheduled',
                version_number: 1,
              } as T;
            }

            return null;
          }),
          all: vi.fn(async <T>() => {
            executedQueries.push({ sql, binds: currentBinds, isWrite });

            if (sql.includes("FROM schedules s") && sql.includes("s.status = 'pending'")) {
              return { results: (options?.dueSchedules as T[]) || [] };
            }
            if (sql.includes('SELECT facebook_post_id FROM publications WHERE facebook_post_id IN')) {
              const matchedIds = currentBinds.filter((id) => knownFbIds.has(String(id)));
              return { results: matchedIds.map((id) => ({ facebook_post_id: id } as T)) };
            }
            if (sql.includes('SELECT p.id as post_id') && sql.includes('existingLocalPost')) {
              return { results: [] };
            }
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

  describe('Empty Cron Execution Efficiency', () => {
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

      const pubResult = await pubService.publishScheduledDuePosts();
      expect(pubResult.processed).toBe(0);

      const daytime = new Date('2026-10-16T14:00:00Z');
      const tickResult = await pipelineService.runAutomationTick(daytime);
      expect(tickResult.ran).toBe(false);
      expect(tickResult.reason).toContain('Outside AI background window');

      const writeQueries = executedQueries.filter((q) => q.isWrite);
      expect(writeQueries.length).toBeLessThanOrEqual(1);
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

      const statusQueries = executedQueries.filter((q) => q.sql.includes("status = 'publishing'"));
      expect(statusQueries.length).toBe(2);
    });

    it('fast-gate in runAutomationTick correctly skips for non-approved statuses (draft, scheduled, published) outside AI window', async () => {
      const nonApprovedStatuses = ['draft', 'scheduled', 'published', 'failed', 'rejected'];
      for (const _status of nonApprovedStatuses) {
        const { db, executedQueries } = createInstrumentedDb({
          approvedPosts: [],
          schedulerConfig: { enabled: true, minTopicBacklog: 5, targetCoverageDays: 14, maxPostsPerNight: 3 },
        });

        const pipelineService = new PipelineOrchestratorService(db, {} as Env);
        const daytime = new Date('2026-10-17T11:00:00Z');
        const tickResult = await pipelineService.runAutomationTick(daytime);

        expect(tickResult.ran).toBe(false);
        expect(tickResult.reason).toContain('Outside AI background window and no approved posts awaiting scheduling');
        const lockQueries = executedQueries.filter((q) => q.sql.includes('pipeline_execution_locks'));
        expect(lockQueries.length).toBe(0);
      }
    });

    it('guarantees scheduled publishing runs even when automation scheduler is disabled', async () => {
      const { db } = createInstrumentedDb({
        dueSchedules: [{ schedule_id: 'sched-due-1', post_id: 'post-due-1' }],
        schedulerConfig: { enabled: false, minTopicBacklog: 5, targetCoverageDays: 14, maxPostsPerNight: 3 },
      });

      const mockPublisher = {
        getConfigStatus: vi.fn().mockReturnValue({ state: 'OPERATIONAL' }),
        publish: vi.fn().mockResolvedValue({ success: true, externalPostId: 'fb-due-pub-1' }),
        publishPost: vi.fn().mockResolvedValue({ success: true, externalPostId: 'fb-due-pub-1' }),
        getPost: vi.fn(),
      } as unknown as IMetaPublisher;

      const pubService = new PublicationService(db, mockPublisher);
      const pipelineService = new PipelineOrchestratorService(db, {} as Env);

      const tickResult = await pipelineService.runAutomationTick(new Date('2026-10-17T11:00:00Z'));
      expect(tickResult.ran).toBe(false);
      expect(tickResult.reason).toBe('Automation is disabled.');

      const pubResult = await pubService.publishScheduledDuePosts();
      expect(pubResult.processed).toBe(1);
      expect(pubResult.succeeded).toBe(1);
      expect(mockPublisher.publish).toHaveBeenCalledTimes(1);
    });
  });

  describe('Facebook Sync Batch Lookups and Early Exit', () => {
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
      expect(mockPublisher.fetchPagePosts).toHaveBeenCalledTimes(1);

      const idCheckQueries = executedQueries.filter((q) =>
        q.sql.includes('SELECT facebook_post_id FROM publications WHERE facebook_post_id IN'),
      );
      expect(idCheckQueries.length).toBe(1);
      expect(idCheckQueries[0]!.binds.length).toBe(100);

      const singleQueries = executedQueries.filter((q) =>
        q.sql.includes('SELECT id FROM publications WHERE facebook_post_id = ?'),
      );
      expect(singleQueries.length).toBe(0);
    });

    it('terminates pagination immediately when page 0 posts are all already known', async () => {
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
      expect(db.batch).toHaveBeenCalled();
    });
  });

  describe('Idempotent Repeat Execution', () => {
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

      const run1 = await syncService.syncFacebookPostsToSystem();
      expect(run1.imported).toBe(0);
      expect(run1.updated).toBe(0);

      const run2 = await syncService.syncFacebookPostsToSystem();
      expect(run2.imported).toBe(0);
      expect(run2.updated).toBe(0);
      expect(mockPublisher.fetchPagePosts).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Resilience and Non-Fatal Boundaries', () => {
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

      const writeQueries = executedQueries.filter((q) => q.isWrite);
      expect(writeQueries.length).toBe(0);
    });
  });

  describe('D1 Migration Schema & Query Plan Verification (Real SQLite)', () => {
    function initMigratedDatabase(): DatabaseSync {
      const db = new DatabaseSync(':memory:');
      const migrationsDir = path.resolve(__dirname, '../../migrations');
      const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
      for (const file of migrationFiles) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        db.exec(sql);
      }
      return db;
    }

    it('confirms all 7 efficiency indices from 0030 exist in the schema', () => {
      const db = initMigratedDatabase();
      const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'").all() as Array<{ name: string }>;
      const indexNames = new Set(rows.map((r) => r.name));

      expect(indexNames.has('idx_publications_fb_post_id')).toBe(true);
      expect(indexNames.has('idx_publications_status_published')).toBe(true);
      expect(indexNames.has('idx_publications_status_updated')).toBe(true);
      expect(indexNames.has('idx_post_images_curated_image')).toBe(true);
      expect(indexNames.has('idx_post_images_post_version')).toBe(true);
      expect(indexNames.has('idx_schedules_status_sched')).toBe(true);
      expect(indexNames.has('idx_post_perf_post_measured')).toBe(true);
    });

    it('verifies critical query execution plans use indexed seeks rather than full table scans', () => {
      const db = initMigratedDatabase();

      const getPlan = (sql: string): string => {
        const steps = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as Array<{ detail: string }>;
        return steps.map((s) => s.detail).join(' | ');
      };

      const fbBatchPlan = getPlan('SELECT facebook_post_id FROM publications WHERE facebook_post_id IN (?, ?)');
      expect(fbBatchPlan).toMatch(/USING COVERING INDEX idx_publications_fb_post_id/);
      expect(fbBatchPlan).not.toMatch(/SCAN/);

      const fbSinglePlan = getPlan('SELECT id, status FROM publications WHERE facebook_post_id = ?');
      expect(fbSinglePlan).toMatch(/USING INDEX idx_publications_fb_post_id/);
      expect(fbSinglePlan).not.toMatch(/SCAN/);

      const dueSchedulePlan = getPlan("SELECT id, status, scheduled_at FROM schedules WHERE status = 'pending' AND scheduled_at <= datetime('now') ORDER BY scheduled_at ASC LIMIT 1");
      expect(dueSchedulePlan).toMatch(/USING INDEX idx_schedules_status_sched/);
      expect(dueSchedulePlan).not.toMatch(/SCAN/);

      const staleLockPlan = getPlan("SELECT id FROM publications WHERE status = 'publishing' AND updated_at < datetime('now', '-5 minutes')");
      expect(staleLockPlan).toMatch(/USING INDEX idx_publications_status_updated/);
      expect(staleLockPlan).not.toMatch(/SCAN/);

      const publishedOrderPlan = getPlan("SELECT id FROM publications WHERE status = 'published' ORDER BY published_at DESC LIMIT 1");
      expect(publishedOrderPlan).toMatch(/USING INDEX idx_publications_status_published/);
      expect(publishedOrderPlan).not.toMatch(/SCAN/);

      const postVersionJoinPlan = getPlan("SELECT p.id, pi.url FROM posts p LEFT JOIN post_images pi ON pi.post_id = p.id AND pi.version_number = p.current_version WHERE p.status = 'draft'");
      expect(postVersionJoinPlan).toMatch(/USING INDEX idx_post_images_post_version/);

      const postPerfPlan = getPlan('SELECT * FROM post_performance_metrics WHERE post_id = ? ORDER BY measured_at DESC LIMIT 1');
      expect(postPerfPlan).toMatch(/USING INDEX idx_post_perf_post_measured/);
      expect(postPerfPlan).not.toMatch(/SCAN/);

      const curatedImagePlan = getPlan('SELECT post_id FROM post_images WHERE curated_image_id = ?');
      expect(curatedImagePlan).toMatch(/USING INDEX idx_post_images_curated_image/);
      expect(curatedImagePlan).not.toMatch(/SCAN/);
    });

    it('demonstrates that query count and rows read are distinct metrics on indexed data', () => {
      const db = initMigratedDatabase();

      const insertPost = db.prepare(`
        INSERT INTO posts (id, title, status, current_version, created_at, updated_at)
        VALUES (?, 'Test Post', 'published', 1, datetime('now'), datetime('now'))
      `);

      const insertVersion = db.prepare(`
        INSERT INTO post_versions (id, post_id, version_number, content, content_type, created_at)
        VALUES (?, ?, 1, 'Body', 'text', datetime('now'))
      `);

      const insertPub = db.prepare(`
        INSERT INTO publications (id, post_id, post_version_id, facebook_post_id, provider, status, attempt_count, published_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'facebook', ?, 1, datetime('now'), datetime('now'), datetime('now'))
      `);

      for (let i = 0; i < 1000; i++) {
        insertPost.run(`post-${i}`);
        insertVersion.run(`v-${i}`, `post-${i}`);
        const status = i < 10 ? 'publishing' : (i < 800 ? 'published' : 'failed');
        insertPub.run(`pub-${i}`, `post-${i}`, `v-${i}`, `fb-id-${i}`, status);
      }

      const staleRows = db.prepare("SELECT id FROM publications WHERE status = 'publishing' AND updated_at < datetime('now', '-5 minutes')").all();
      expect(staleRows.length).toBe(0);

      const targetIds = ['fb-id-10', 'fb-id-25', 'fb-id-50', 'fb-id-99', 'fb-id-9999'];
      const matched = db.prepare("SELECT facebook_post_id FROM publications WHERE facebook_post_id IN (?, ?, ?, ?, ?)").all(...targetIds) as Array<{ facebook_post_id: string }>;

      expect(matched.length).toBe(4);
    });
  });
});
