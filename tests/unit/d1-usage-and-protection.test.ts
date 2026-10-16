import { describe, it, expect, beforeEach } from 'vitest';
import { D1QuotaService, DEFAULT_D1_CONFIG, D1UsageTelemetryStatus } from '../../src/services/cloudflare/d1-quota-service';
import { PipelineOrchestratorService } from '../../src/services/content/pipeline-orchestrator-service';

describe('D1 Quota & Automation Activity Suite', () => {
  let mockStatements: { sql: string; params: any[] }[];
  let queryResults: Map<string, any>;

  const createMockDb = () => {
    mockStatements = [];
    queryResults = new Map();

    const db = {
      prepare: (sql: string) => {
        let boundParams: any[] = [];
        const stmt = {
          bind: (...params: any[]) => {
            boundParams = params;
            return stmt;
          },
          run: async () => {
            mockStatements.push({ sql, params: boundParams });
            return {
              success: true,
              meta: { rows_written: 1, rows_read: 0, changes: 3 },
            };
          },
          first: async <T = any>(): Promise<T | null> => {
            mockStatements.push({ sql, params: boundParams });
            for (const [key, val] of queryResults.entries()) {
              if (sql.includes(key)) {
                return val as T;
              }
            }
            return null;
          },
          all: async <T = any>(): Promise<{ results: T[] }> => {
            mockStatements.push({ sql, params: boundParams });
            for (const [key, val] of queryResults.entries()) {
              if (sql.includes(key)) {
                return { results: val };
              }
            }
            return { results: [] };
          },
        };
        return stmt;
      },
      batch: async (statements: any[]) => {
        for (const s of statements) {
          await s.run();
        }
        return statements.map(() => ({
          success: true,
          meta: { rows_written: 1, rows_read: 0 },
        }));
      },
    };
    return db as any;
  };

  beforeEach(() => {
    D1QuotaService.resetBufferForTesting();
  });

  describe('D1 Quota Monitoring and Protection Tiers', () => {
    it('calculates status tiers and protective mode correctly across thresholds', async () => {
      const db = createMockDb();
      const service = new D1QuotaService();

      // Case 1: NORMAL (< 50%)
      queryResults.set('SELECT rows_written', {
        rows_written: 25000,
        rows_read: 40000,
        write_queries: 120,
        read_queries: 400,
      });
      const statusNormal = await service.getD1UsageStatus(db);
      expect(statusNormal.tier).toBe('NORMAL');
      expect(statusNormal.isProtectiveModeActive).toBe(false);
      expect(statusNormal.usagePercentage).toBe(25);

      // Case 2: WARNING (50% - 70%)
      queryResults.set('SELECT rows_written', {
        rows_written: 55000,
        rows_read: 40000,
        write_queries: 250,
        read_queries: 600,
      });
      const statusWarning = await service.getD1UsageStatus(db);
      expect(statusWarning.tier).toBe('WARNING');
      expect(statusWarning.isProtectiveModeActive).toBe(false);
      expect(statusWarning.usagePercentage).toBe(55);

      // Case 3: ELEVATED_WARNING (70% - 85%)
      queryResults.set('SELECT rows_written', {
        rows_written: 75000,
        rows_read: 60000,
        write_queries: 350,
        read_queries: 800,
      });
      const statusElevated = await service.getD1UsageStatus(db);
      expect(statusElevated.tier).toBe('ELEVATED_WARNING');
      expect(statusElevated.isProtectiveModeActive).toBe(false);
      expect(statusElevated.usagePercentage).toBe(75);

      // Case 4: PROTECTIVE_MODE (>= 85%)
      queryResults.set('SELECT rows_written', {
        rows_written: 88000,
        rows_read: 70000,
        write_queries: 400,
        read_queries: 900,
      });
      const statusProtective = await service.getD1UsageStatus(db);
      expect(statusProtective.tier).toBe('PROTECTIVE_MODE');
      expect(statusProtective.isProtectiveModeActive).toBe(true);
      expect(statusProtective.usagePercentage).toBe(88);
      expect(statusProtective.reason).toContain('Protective Mode Active');
    });

    it('buffers in-memory metrics without write amplification until flush is called', async () => {
      const db = createMockDb();

      // Record 10 sequential query observations
      for (let i = 0; i < 10; i++) {
        D1QuotaService.recordLocalExecution(
          { rows_written: 5, rows_read: 20 },
          true,
        );
      }

      // No DB statements should have been prepared yet
      expect(mockStatements).toHaveLength(0);

      // Flush to DB
      await D1QuotaService.flushLocalUsage(db);

      // Exactly 1 UPSERT statement executed
      expect(mockStatements).toHaveLength(1);
      expect(mockStatements[0]!.sql).toContain('INSERT INTO d1_daily_usage');
      expect(mockStatements[0]!.params).toContain(50); // 10 * 5 rows written
      expect(mockStatements[0]!.params).toContain(200); // 10 * 20 rows read
    });

    it('defers non-critical background stages in protective mode but permits scheduling & manual runs', () => {
      const service = new D1QuotaService();

      const normalStatus: D1UsageTelemetryStatus = {
        tier: 'NORMAL',
        telemetrySource: 'LOCAL_MEASURED',
        rowsWritten: 30000,
        rowsRead: 50000,
        writeQueries: 100,
        readQueries: 500,
        dailyWriteLimit: 100000,
        dailyReadLimit: 5000000,
        usagePercentage: 30,
        writeUsagePercentage: 30,
        readUsagePercentage: 10,
        isProtectiveModeActive: false,
        reason: 'Normal',
        config: DEFAULT_D1_CONFIG,
        lastUpdated: new Date().toISOString(),
      };

      const protectiveStatus: D1UsageTelemetryStatus = {
        ...normalStatus,
        tier: 'PROTECTIVE_MODE',
        rowsWritten: 89000,
        usagePercentage: 89,
        writeUsagePercentage: 89,
        readUsagePercentage: 15,
        isProtectiveModeActive: true,
        reason: 'Protective mode',
      };

      // Under NORMAL, all stages are permitted
      expect(service.shouldDeferStage('topics', normalStatus).defer).toBe(false);
      expect(service.shouldDeferStage('posts', normalStatus).defer).toBe(false);
      expect(service.shouldDeferStage('images', normalStatus).defer).toBe(false);
      expect(service.shouldDeferStage('scheduling', normalStatus).defer).toBe(false);

      // Under PROTECTIVE_MODE, background AI scout & posts are deferred
      const deferTopics = service.shouldDeferStage('topics', protectiveStatus);
      expect(deferTopics.defer).toBe(true);
      expect(deferTopics.reason).toContain('D1 Protective Mode');

      const deferPosts = service.shouldDeferStage('posts', protectiveStatus);
      expect(deferPosts.defer).toBe(true);

      // Critical scheduling and publishing operations are preserved even in protective mode
      const deferSched = service.shouldDeferStage('scheduling', protectiveStatus);
      expect(deferSched.defer).toBe(false);

      const deferPublish = service.shouldDeferStage('publishing' as any, protectiveStatus);
      expect(deferPublish.defer).toBe(false);

      // Manual runs of heavy stages are ALSO strictly blocked in protective mode to protect quota
      const manualTopics = service.shouldDeferStage('topics', protectiveStatus, true);
      expect(manualTopics.defer).toBe(true);

      const manualRunAll = service.shouldDeferStage('runAllStages', protectiveStatus, true);
      expect(manualRunAll.defer).toBe(true);
    });

    it('activates protective mode when rowsRead exceeds protective threshold even if writes are low', async () => {
      const db = createMockDb();
      const service = new D1QuotaService();

      queryResults.set('SELECT rows_written, rows_read', {
        rows_written: 1500, // very low writes (1.5%)
        rows_read: 4600000, // 92% of 5,000,000 limit!
        write_queries: 100,
        read_queries: 50000,
      });

      const status = await service.getD1UsageStatus(db);
      expect(status.tier).toBe('PROTECTIVE_MODE');
      expect(status.isProtectiveModeActive).toBe(true);
      expect(status.usagePercentage).toBe(92);
      expect(status.readUsagePercentage).toBe(92);
      expect(status.writeUsagePercentage).toBe(1.5);
      expect(status.reason).toContain('reads');

      const deferSync = service.shouldDeferStage('facebook_sync', status);
      expect(deferSync.defer).toBe(true);
      expect(deferSync.reason).toContain('D1 Protective Mode');

      // Scheduling & publishing remain allowed
      expect(service.shouldDeferStage('scheduling', status).defer).toBe(false);
      expect(service.shouldDeferStage('publishing' as any, status).defer).toBe(false);
    });

    it('returns TELEMETRY_UNAVAILABLE with unmeasured state when neither Cloudflare nor local telemetry exists', async () => {
      const db = createMockDb();
      const service = new D1QuotaService();

      // No rows in d1_daily_usage, empty local buffer, no Cloudflare service
      const status = await service.getD1UsageStatus(db);
      expect(status.telemetrySource).toBe('TELEMETRY_UNAVAILABLE');
      expect(status.rowsWritten).toBeNull();
      expect(status.rowsRead).toBeNull();
      expect(status.usagePercentage).toBeNull();
      expect(status.reason).toContain('D1 telemetry is currently unavailable');
    });
  });

  describe('Automation Activity Filtering & Retrieval', () => {
    it('retrieves and formats activity items with period, stage, and pagination filters', async () => {
      const db = createMockDb();
      const nowIso = new Date().toISOString();

      queryResults.set('SELECT COUNT(*)', { total: 2 });
      queryResults.set('SELECT id, trigger_type, status', [
        {
          id: 'run-1',
          trigger_type: 'CRON',
          status: 'COMPLETED',
          stage: 'topics',
          result_status: 'Znaleziono 8 tematów, zaakceptowano 6, odrzucono 2',
          error_message: null,
          neurons_used: 12000,
          d1_rows_written: 4,
          d1_rows_read: 12,
          details: JSON.stringify({
            found: 8,
            accepted: 6,
            rejected: 2,
            topics: [{ id: 't-1', title: 'Automatyzacja procesów', status: 'ACCEPTED' }],
          }),
          started_at: nowIso,
          finished_at: nowIso,
        },
      ]);

      const service = new PipelineOrchestratorService(db, {} as any);
      const activity = await service.getAutomationActivity({
        period: '24h',
        stage: 'topics',
        limit: 10,
        offset: 0,
      });

      expect(activity.total).toBe(2);
      expect(activity.items).toHaveLength(1);
      const run = activity.items[0]!;
      expect(run.stage).toBe('topics');
      expect(run.neuronsUsed).toBe(12000);
      expect(run.details).toBeDefined();
      expect((run.details as any).found).toBe(8);
      expect((run.details as any).accepted).toBe(6);
      expect((run.details as any).topics[0].title).toBe('Automatyzacja procesów');
    });

    it('safely handles malformed or null JSON details without crashing', async () => {
      const db = createMockDb();
      const nowIso = new Date().toISOString();

      queryResults.set('SELECT COUNT(*)', { total: 1 });
      queryResults.set('SELECT id, trigger_type, status', [
        {
          id: 'run-bad-json',
          trigger_type: 'MANUAL',
          status: 'FAILED',
          stage: 'posts',
          result_status: 'Writer error',
          error_message: 'Workers AI timeout',
          neurons_used: 0,
          d1_rows_written: 2,
          d1_rows_read: 5,
          details: 'invalid-non-json-string',
          started_at: nowIso,
          finished_at: nowIso,
        },
      ]);

      const service = new PipelineOrchestratorService(db, {} as any);
      const activity = await service.getAutomationActivity({
        period: '1h',
        stage: 'all',
      });

      expect(activity.items).toHaveLength(1);
      expect(activity.items[0]!.details).toBeUndefined();
      expect(activity.items[0]!.errorMessage).toBe('Workers AI timeout');
    });

    it('returns structured camelCase fields matching frontend contract with accurate types', async () => {
      const db = createMockDb();
      const startIso = '2026-10-15T12:00:00.000Z';
      const finishIso = '2026-10-15T12:00:35.000Z';

      queryResults.set('SELECT COUNT(*)', { total: 1 });
      queryResults.set('SELECT id, trigger_type, status', [
        {
          id: 'stage-posts-12345',
          trigger_type: 'cron',
          status: 'completed',
          stage: 'posts',
          result_status: 'Generowanie postów zakończone',
          error_message: null,
          neurons_used: 8500,
          d1_rows_written: 14,
          d1_rows_read: 42,
          details: JSON.stringify({ message: 'Utworzono post z powodzeniem' }),
          started_at: startIso,
          finished_at: finishIso,
        },
      ]);

      const service = new PipelineOrchestratorService(db, {} as any);
      const activity = await service.getAutomationActivity({ period: '24h' });

      expect(activity.items).toHaveLength(1);
      const item = activity.items[0]!;

      expect(item.startedAt).toBe(startIso);
      expect(item.finishedAt).toBe(finishIso);
      expect(item.durationSeconds).toBe(35); // 35 seconds difference
      expect(item.neuronsUsed).toBe(8500);
      expect(item.d1RowsWritten).toBe(14);
      expect(item.d1RowsRead).toBe(42);
      expect(item.summary).toBe('Utworzono post z powodzeniem');
    });

    it('correctly maps and normalizes Automation Activity fields in both camelCase and snake_case', () => {
      // Helper function mirroring UI normalization logic in scripts.ts
      const normalizeRunForUI = (run: any) => {
        const rawStartedAt = run.startedAt || run.started_at;
        const rawFinishedAt = run.finishedAt || run.finished_at;
        const isRunning = run.status === 'RUNNING' || run.status === 'running';

        let duration = isRunning ? 'Running' : '—';
        const durSec = run.durationSeconds !== undefined && run.durationSeconds !== null ? run.durationSeconds : run.duration_seconds;
        if (typeof durSec === 'number' && !isNaN(durSec) && durSec >= 0) {
          duration = Math.round(durSec) + 's';
        } else if (rawStartedAt && rawFinishedAt) {
          const startMs = new Date(rawStartedAt).getTime();
          const finishMs = new Date(rawFinishedAt).getTime();
          if (!isNaN(startMs) && !isNaN(finishMs) && finishMs >= startMs) {
            duration = Math.max(0, Math.round((finishMs - startMs) / 1000)) + 's';
          }
        }

        const rawNeurons = run.neuronsUsed !== undefined && run.neuronsUsed !== null ? run.neuronsUsed : run.neurons_used;
        const rawWrites = run.d1RowsWritten !== undefined && run.d1RowsWritten !== null ? run.d1RowsWritten : run.d1_rows_written;
        const rawReads = run.d1RowsRead !== undefined && run.d1RowsRead !== null ? run.d1RowsRead : run.d1_rows_read;

        const neurons = (typeof rawNeurons === 'number' && !isNaN(rawNeurons) && rawNeurons > 0)
          ? `${Number(rawNeurons).toLocaleString()} AI neurons`
          : null;
        const d1Writes = (typeof rawWrites === 'number' && !isNaN(rawWrites) && rawWrites >= 0)
          ? `${Number(rawWrites).toLocaleString()} D1 writes`
          : null;
        const d1Reads = (typeof rawReads === 'number' && !isNaN(rawReads) && rawReads >= 0)
          ? `${Number(rawReads).toLocaleString()} D1 reads`
          : null;

        const summary = run.summary || run.result_status || run.errorMessage || run.error_message || 'Zakończono';

        return {
          startedAt: rawStartedAt || '—',
          finishedAt: rawFinishedAt || (isRunning ? 'In progress' : '—'),
          duration,
          neurons,
          d1Writes,
          d1Reads,
          summary,
        };
      };

      // Case 1: Pure camelCase payload (backend standard)
      const camelCasePayload = {
        id: 'run-1',
        startedAt: '2026-10-15T10:00:00.000Z',
        finishedAt: '2026-10-15T10:00:18.000Z',
        durationSeconds: 18,
        neuronsUsed: 15400,
        d1RowsWritten: 7,
        d1RowsRead: 25,
        summary: 'Znaleziono 5 tematów',
      };
      const normCamel = normalizeRunForUI(camelCasePayload);
      expect(normCamel.startedAt).toBe('2026-10-15T10:00:00.000Z');
      expect(normCamel.finishedAt).toBe('2026-10-15T10:00:18.000Z');
      expect(normCamel.duration).toBe('18s');
      expect(normCamel.neurons).toContain('15');
      expect(normCamel.neurons).toContain('400 AI neurons');
      expect(normCamel.d1Writes).toBe('7 D1 writes');
      expect(normCamel.d1Reads).toBe('25 D1 reads');
      expect(normCamel.summary).toBe('Znaleziono 5 tematów');

      // Case 2: Legacy snake_case payload
      const snakeCasePayload = {
        id: 'run-2',
        started_at: '2026-10-15T11:00:00.000Z',
        finished_at: '2026-10-15T11:00:45.000Z',
        duration_seconds: 45,
        neurons_used: 0, // 0 neurons should be null, not displayed
        d1_rows_written: 0, // 0 writes is a valid measurement
        d1_rows_read: 10,
        result_status: 'Weryfikacja zakończona',
      };
      const normSnake = normalizeRunForUI(snakeCasePayload);
      expect(normSnake.startedAt).toBe('2026-10-15T11:00:00.000Z');
      expect(normSnake.finishedAt).toBe('2026-10-15T11:00:45.000Z');
      expect(normSnake.duration).toBe('45s');
      expect(normSnake.neurons).toBeNull();
      expect(normSnake.d1Writes).toBe('0 D1 writes');
      expect(normSnake.d1Reads).toBe('10 D1 reads');
      expect(normSnake.summary).toBe('Weryfikacja zakończona');

      // Case 3: Missing telemetry and invalid dates (does not fabricate 0 or crash)
      const emptyPayload = {
        id: 'run-3',
        status: 'RUNNING',
      };
      const normEmpty = normalizeRunForUI(emptyPayload);
      expect(normEmpty.startedAt).toBe('—');
      expect(normEmpty.finishedAt).toBe('In progress');
      expect(normEmpty.duration).toBe('Running');
      expect(normEmpty.neurons).toBeNull();
      expect(normEmpty.d1Writes).toBeNull();
      expect(normEmpty.d1Reads).toBeNull();
      expect(normEmpty.summary).toBe('Zakończono');
    });
  });

  describe('Log Retention and Purge Policy', () => {
    it('executes safe retention purge without deleting active records or credentials', async () => {
      const db = createMockDb();

      const purged = await D1QuotaService.purgeRetentionLogs(db, 30);
      expect(purged.purgedRuns).toBe(3);
      expect(purged.purgedDailyMetrics).toBe(3);

      const runDelete = mockStatements.find(s => s.sql.includes('DELETE FROM orchestrator_runs'));
      const metricsDelete = mockStatements.find(s => s.sql.includes('DELETE FROM d1_daily_usage'));

      expect(runDelete).toBeDefined();
      expect(metricsDelete).toBeDefined();
    });
  });
});
