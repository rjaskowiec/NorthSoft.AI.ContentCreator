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
        usagePercentage: 30,
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
      expect(deferTopics.reason).toContain('Protective Mode Active');

      const deferPosts = service.shouldDeferStage('posts', protectiveStatus);
      expect(deferPosts.defer).toBe(true);

      // Critical scheduling operation is preserved even in protective mode
      const deferSched = service.shouldDeferStage('scheduling', protectiveStatus);
      expect(deferSched.defer).toBe(false);

      // Manual runs are NEVER deferred regardless of protective mode
      const manualTopics = service.shouldDeferStage('topics', protectiveStatus, true);
      expect(manualTopics.defer).toBe(false);
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
  });

  describe('Log Retention and Purge Policy', () => {
    it('executes safe retention purge without deleting active records or credentials', async () => {
      const db = createMockDb();

      const purged = await D1QuotaService.purgeRetentionLogs(db, 30);
      expect(purged.purgedRuns).toBe(3);
      expect(purged.purgedDailyMetrics).toBe(3);

      // Verify orchestrator_runs and d1_daily_usage older than 30 days are targeted
      const runDelete = mockStatements.find(s => s.sql.includes('DELETE FROM orchestrator_runs'));
      const metricsDelete = mockStatements.find(s => s.sql.includes('DELETE FROM d1_daily_usage'));

      expect(runDelete).toBeDefined();
      expect(metricsDelete).toBeDefined();
    });
  });
});
