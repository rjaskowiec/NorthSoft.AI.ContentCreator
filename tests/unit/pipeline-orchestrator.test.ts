import { describe, expect, it, vi } from 'vitest';
import { PipelineOrchestratorService } from '../../src/services/content/pipeline-orchestrator-service';

describe('PipelineOrchestratorService Unit Tests', () => {
  it('enforces idempotency locking and prevents concurrent full pipeline executions', async () => {
    let locked = false;

    const prepareMock = vi.fn((sql: string) => {
      if (sql.includes('DELETE FROM pipeline_execution_locks')) {
        return {
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockResolvedValue({ success: true }),
          }),
          run: vi.fn().mockResolvedValue({ success: true }),
        };
      }
      if (sql.includes('INSERT INTO pipeline_execution_locks')) {
        return {
          bind: vi.fn().mockImplementation(() => {
            if (locked) {
              throw new Error('UNIQUE constraint failed: pipeline_execution_locks.lock_key');
            }
            locked = true;
            return {
              run: vi.fn().mockResolvedValue({ success: true }),
            };
          }),
        };
      }
      return {
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      };
    });

    const mockDb = { prepare: prepareMock } as unknown as D1Database;
    const mockEnv = {} as Env;
    const service = new PipelineOrchestratorService(mockDb, mockEnv);

    // First acquire lock should succeed
    const firstLock = await service.acquireLock('test_lock', 'run-1', 'admin');
    expect(firstLock).toBe(true);

    // Second acquire lock while held should fail
    const secondLock = await service.acquireLock('test_lock', 'run-2', 'admin');
    expect(secondLock).toBe(false);

    // Release lock
    await service.releaseLock('test_lock');
  });

  it('getSchedulerConfig returns default configuration when DB record is missing', async () => {
    const prepareMock = vi.fn().mockReturnValue({
      first: vi.fn().mockResolvedValue(null),
    });

    const mockDb = { prepare: prepareMock } as unknown as D1Database;
    const mockEnv = {} as Env;
    const service = new PipelineOrchestratorService(mockDb, mockEnv);

    const config = await service.getSchedulerConfig();
    expect(config.enabled).toBe(false);
    expect(config.minTopicBacklog).toBe(5);
    expect(config.targetCoverageDays).toBe(14);
    expect(config.maxPostsPerNight).toBe(3);
  });

  it('updateSchedulerConfig persists and returns updated configuration', async () => {
    let storedConfig: Record<string, unknown> | null = null;

    const prepareMock = vi.fn((sql: string) => {
      if (sql.includes('SELECT * FROM pipeline_scheduler_config')) {
        return {
          first: vi.fn().mockResolvedValue(storedConfig),
        };
      }
      if (sql.includes('INSERT INTO pipeline_scheduler_config')) {
        return {
          bind: vi.fn().mockImplementation((enabled, minTopics, targetCov, maxPosts, updated) => {
            storedConfig = {
              enabled,
              min_topic_backlog: minTopics,
              target_coverage_days: targetCov,
              max_posts_per_night: maxPosts,
              updated_at: updated,
            };
            return {
              run: vi.fn().mockResolvedValue({ success: true }),
            };
          }),
        };
      }
      if (sql.includes('INSERT INTO audit_log')) {
        return {
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockResolvedValue({ success: true }),
          }),
        };
      }
      return {
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      };
    });

    const mockDb = { prepare: prepareMock } as unknown as D1Database;
    const mockEnv = {} as Env;
    const service = new PipelineOrchestratorService(mockDb, mockEnv);

    const updated = await service.updateSchedulerConfig({
      enabled: true,
      minTopicBacklog: 8,
      targetCoverageDays: 21,
      maxPostsPerNight: 2,
    });

    expect(updated.enabled).toBe(true);
    expect(updated.minTopicBacklog).toBe(8);
    expect(updated.targetCoverageDays).toBe(21);
    expect(updated.maxPostsPerNight).toBe(2);
  });

  it('blocks heavy stages (topics, posts, images, runAllStages) in execution layer when protective mode is active, even for admin', async () => {
    // Mock DB returning protective mode tier (>85% D1 usage)
    const prepareMock = vi.fn((sql: string) => {
      if (sql.includes('SELECT rows_written, rows_read')) {
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({
              rows_written: 90000,
              rows_read: 50000,
              write_queries: 400,
              read_queries: 1000,
            }),
          }),
        };
      }
      return {
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true }),
          first: vi.fn().mockResolvedValue(null),
        }),
        run: vi.fn().mockResolvedValue({ success: true }),
      };
    });

    const mockDb = { prepare: prepareMock } as unknown as D1Database;
    const mockEnv = {} as Env;
    const service = new PipelineOrchestratorService(mockDb, mockEnv);

    // 1. topics stage must be rejected with 409 PROTECTIVE_MODE_ACTIVE even for admin
    await expect(service.runStage('topics', 'admin')).rejects.toThrow(/D1 Protective Mode/);

    // 2. posts stage must be rejected with 409 PROTECTIVE_MODE_ACTIVE even for admin
    await expect(service.runStage('posts', 'admin')).rejects.toThrow(/D1 Protective Mode/);

    // 3. runAllStages must be rejected upfront
    await expect(service.runAllStages('admin')).rejects.toThrow(/D1 Protective Mode/);
  });
});
