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
    expect(config.discoveryEnabled).toBe(true);
    expect(config.frequency).toBe('daily');
    expect(config.publicationTime).toBe('09:00');
    expect(config.timezone).toBe('UTC');
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
          bind: vi.fn().mockImplementation((enabled, disc, gen, evalStage, pub, freq, time, tz, updated) => {
            storedConfig = {
              enabled,
              discovery_enabled: disc,
              generation_enabled: gen,
              evaluation_enabled: evalStage,
              publishing_enabled: pub,
              frequency: freq,
              publication_time: time,
              timezone: tz,
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
      frequency: '6h',
      publicationTime: '12:00',
    });

    expect(updated.enabled).toBe(true);
    expect(updated.frequency).toBe('6h');
    expect(updated.publicationTime).toBe('12:00');
  });
});
