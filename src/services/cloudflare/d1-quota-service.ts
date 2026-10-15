/**
 * NorthSoft.AI.ContentCreator — D1 Quota & Usage Monitor Service
 *
 * Implements multi-tier monitoring and automated limit protection for Cloudflare D1.
 * Prevents exceeding Workers Free tier limits (100,000 rows_written / day).
 *
 * Protection thresholds:
 *  - 50%: Warning (Informational banner)
 *  - 70%: Elevated Warning (Action needed alert)
 *  - 85%: Protective Mode (Defers non-critical background automation tasks)
 *
 * Strict guarantees:
 *  - In-memory aggregation buffer: does NOT write to D1 for every query measurement.
 *  - Clear attribution: differentiates verified Cloudflare GraphQL telemetry from local application measurements.
 *  - Graceful degradation: protective mode defers background work without corrupting in-flight tasks.
 *  - Manual control preserved: administrator can always view history and run manual actions.
 */

import { CloudflareD1Usage, CloudflareUsageService } from './cloudflare-usage-service';

export type D1ProtectionTier = 'NORMAL' | 'WARNING' | 'ELEVATED_WARNING' | 'PROTECTIVE_MODE';

export interface D1ProtectionConfig {
  dailyWriteLimit: number;
  warningThresholdPct: number;
  elevatedWarningThresholdPct: number;
  protectiveModeThresholdPct: number;
}

export const DEFAULT_D1_CONFIG: D1ProtectionConfig = {
  dailyWriteLimit: 100_000,
  warningThresholdPct: 50,
  elevatedWarningThresholdPct: 70,
  protectiveModeThresholdPct: 85,
};

export interface D1UsageTelemetryStatus {
  tier: D1ProtectionTier;
  telemetrySource: 'CLOUDFLARE_VERIFIED' | 'LOCAL_MEASURED' | 'ESTIMATED_FALLBACK';
  rowsWritten: number;
  rowsRead: number;
  writeQueries: number;
  readQueries: number;
  dailyWriteLimit: number;
  usagePercentage: number;
  isProtectiveModeActive: boolean;
  reason: string;
  config: D1ProtectionConfig;
  cloudflareTelemetry?: CloudflareD1Usage;
  lastUpdated: string;
}

interface LocalUsageBuffer {
  date: string;
  rowsWritten: number;
  rowsRead: number;
  writeQueries: number;
  readQueries: number;
  unflushedWrites: number;
}

let localBuffer: LocalUsageBuffer = {
  date: new Date().toISOString().split('T')[0] ?? '',
  rowsWritten: 0,
  rowsRead: 0,
  writeQueries: 0,
  readQueries: 0,
  unflushedWrites: 0,
};

export class D1QuotaService {
  private config: D1ProtectionConfig;

  constructor(customConfig?: Partial<D1ProtectionConfig>) {
    this.config = {
      dailyWriteLimit: customConfig?.dailyWriteLimit ?? DEFAULT_D1_CONFIG.dailyWriteLimit,
      warningThresholdPct: customConfig?.warningThresholdPct ?? DEFAULT_D1_CONFIG.warningThresholdPct,
      elevatedWarningThresholdPct: customConfig?.elevatedWarningThresholdPct ?? DEFAULT_D1_CONFIG.elevatedWarningThresholdPct,
      protectiveModeThresholdPct: customConfig?.protectiveModeThresholdPct ?? DEFAULT_D1_CONFIG.protectiveModeThresholdPct,
    };
  }

  /**
   * Records D1 query execution metadata in memory.
   * Flushes to database only when unflushed write count exceeds threshold or upon explicit flush.
   */
  public static recordLocalExecution(
    meta?: { rows_written?: number; rows_read?: number; changes?: number },
    isWrite = false,
  ): void {
    const today = new Date().toISOString().split('T')[0] ?? '';
    if (localBuffer.date !== today) {
      localBuffer = {
        date: today,
        rowsWritten: 0,
        rowsRead: 0,
        writeQueries: 0,
        readQueries: 0,
        unflushedWrites: 0,
      };
    }

    const written = meta?.rows_written ?? (isWrite ? Math.max(meta?.changes ?? 1, 1) : 0);
    const read = meta?.rows_read ?? (isWrite ? 0 : 1);

    localBuffer.rowsWritten += written;
    localBuffer.rowsRead += read;
    if (isWrite || written > 0) {
      localBuffer.writeQueries += 1;
      localBuffer.unflushedWrites += written;
    } else {
      localBuffer.readQueries += 1;
    }
  }

  /**
   * Atomically flushes accumulated in-memory metrics to the D1 database.
   * Single statement update per day prevents write amplification.
   */
  public static async flushLocalUsage(db: D1Database): Promise<void> {
    if (localBuffer.unflushedWrites === 0 && localBuffer.readQueries === 0) {
      return;
    }

    const writtenToFlush = localBuffer.unflushedWrites;
    const readsToFlush = localBuffer.rowsRead;
    const writeQueriesToFlush = localBuffer.writeQueries;
    const readQueriesToFlush = localBuffer.readQueries;

    const today = localBuffer.date || (new Date().toISOString().split('T')[0] ?? '');
    const nowIso = new Date().toISOString();

    try {
      await db
        .prepare(
          `INSERT INTO d1_daily_usage (date, rows_written, rows_read, write_queries, read_queries, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(date) DO UPDATE SET
             rows_written = rows_written + excluded.rows_written,
             rows_read = rows_read + excluded.rows_read,
             write_queries = write_queries + excluded.write_queries,
             read_queries = read_queries + excluded.read_queries,
             updated_at = excluded.updated_at`,
        )
        .bind(today, writtenToFlush, readsToFlush, writeQueriesToFlush, readQueriesToFlush, nowIso)
        .run();

      localBuffer.unflushedWrites = 0;
    } catch {
      // Metric persistence is best-effort and must not throw
    }
  }

  /**
   * Retrieves overall D1 usage and calculates protection tier.
   * Prioritizes official Cloudflare account telemetry if available.
   */
  public async getD1UsageStatus(
    db: D1Database,
    cfUsageService?: CloudflareUsageService,
    options?: { forceRefresh?: boolean },
  ): Promise<D1UsageTelemetryStatus> {
    const today = new Date().toISOString().split('T')[0] ?? '';
    const nowIso = new Date().toISOString();

    // 1. Fetch official Cloudflare verified telemetry
    let cfTelemetry: CloudflareD1Usage | undefined;
    if (cfUsageService) {
      try {
        cfTelemetry = await cfUsageService.getVerifiedD1Usage({ forceRefresh: options?.forceRefresh });
      } catch {
        cfTelemetry = undefined;
      }
    }

    // 2. Query local persistent usage from D1
    let localRowsWritten = localBuffer.rowsWritten;
    let localRowsRead = localBuffer.rowsRead;
    let localWriteQueries = localBuffer.writeQueries;
    let localReadQueries = localBuffer.readQueries;

    try {
      const dbRow = await db
        .prepare('SELECT rows_written, rows_read, write_queries, read_queries FROM d1_daily_usage WHERE date = ?')
        .bind(today)
        .first<{ rows_written: number; rows_read: number; write_queries: number; read_queries: number }>();

      if (dbRow) {
        localRowsWritten = Math.max(localRowsWritten, dbRow.rows_written + localBuffer.unflushedWrites);
        localRowsRead = Math.max(localRowsRead, dbRow.rows_read);
        localWriteQueries = Math.max(localWriteQueries, dbRow.write_queries);
        localReadQueries = Math.max(localReadQueries, dbRow.read_queries);
      }
    } catch {
      // Local query fallback
    }

    // 3. Determine primary telemetry source
    let effectiveWritten: number;
    let effectiveRead: number;
    let effectiveWriteQueries: number;
    let effectiveReadQueries: number;
    let telemetrySource: D1UsageTelemetryStatus['telemetrySource'];

    if (cfTelemetry && cfTelemetry.status === 'VERIFIED' && cfTelemetry.rowsWritten !== null) {
      effectiveWritten = cfTelemetry.rowsWritten;
      effectiveRead = cfTelemetry.rowsRead ?? localRowsRead;
      effectiveWriteQueries = cfTelemetry.writeQueries ?? localWriteQueries;
      effectiveReadQueries = cfTelemetry.readQueries ?? localReadQueries;
      telemetrySource = 'CLOUDFLARE_VERIFIED';
    } else {
      effectiveWritten = localRowsWritten;
      effectiveRead = localRowsRead;
      effectiveWriteQueries = localWriteQueries;
      effectiveReadQueries = localReadQueries;
      telemetrySource = 'LOCAL_MEASURED';
    }

    const usagePct = Number(((effectiveWritten / this.config.dailyWriteLimit) * 100).toFixed(1));

    // 4. Determine protection tier
    let tier: D1ProtectionTier = 'NORMAL';
    let isProtectiveModeActive = false;
    let reason = `D1 usage is within normal operational limits (${usagePct}% of daily allocation).`;

    if (usagePct >= this.config.protectiveModeThresholdPct) {
      tier = 'PROTECTIVE_MODE';
      isProtectiveModeActive = true;
      reason = `Protective Mode Active: ${effectiveWritten.toLocaleString()} / ${this.config.dailyWriteLimit.toLocaleString()} rows written (${usagePct}%). Non-critical background generation paused to preserve free tier quota.`;
    } else if (usagePct >= this.config.elevatedWarningThresholdPct) {
      tier = 'ELEVATED_WARNING';
      reason = `Elevated Warning: ${effectiveWritten.toLocaleString()} / ${this.config.dailyWriteLimit.toLocaleString()} rows written (${usagePct}%). Nearing daily budget ceiling.`;
    } else if (usagePct >= this.config.warningThresholdPct) {
      tier = 'WARNING';
      reason = `Warning: ${effectiveWritten.toLocaleString()} / ${this.config.dailyWriteLimit.toLocaleString()} rows written (${usagePct}%). Moderate write activity.`;
    }

    return {
      tier,
      telemetrySource,
      rowsWritten: effectiveWritten,
      rowsRead: effectiveRead,
      writeQueries: effectiveWriteQueries,
      readQueries: effectiveReadQueries,
      dailyWriteLimit: this.config.dailyWriteLimit,
      usagePercentage: usagePct,
      isProtectiveModeActive,
      reason,
      config: { ...this.config },
      cloudflareTelemetry: cfTelemetry,
      lastUpdated: nowIso,
    };
  }

  /**
   * Decides whether a given pipeline stage should be deferred in protective mode.
   * Manual admin requests are never blocked.
   */
  public shouldDeferStage(
    stage: 'topics' | 'posts' | 'images' | 'scheduling' | 'facebook_sync',
    status: D1UsageTelemetryStatus,
    isManual = false,
  ): { defer: boolean; reason?: string } {
    if (isManual) {
      return { defer: false };
    }

    if (!status.isProtectiveModeActive) {
      return { defer: false };
    }

    // Critical time-sensitive publishing/scheduling operations are never deferred
    if (stage === 'scheduling') {
      return { defer: false };
    }

    // Heavy background generation/scouting tasks are deferred in protective mode
    return {
      defer: true,
      reason: `Automated ${stage} stage deferred: D1 Protective Mode Active (${status.rowsWritten.toLocaleString()} / ${status.dailyWriteLimit.toLocaleString()} rows written, ${status.usagePercentage}%).`,
    };
  }

  /**
   * Safely purges old automation runs and D1 daily usage metrics.
   * Default retention is 30 days.
   */
  public static async purgeRetentionLogs(db: D1Database, retentionDays = 30): Promise<{ purgedRuns: number; purgedDailyMetrics: number }> {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const cutoffDay = cutoffDate.split('T')[0] ?? '';

    let purgedRuns = 0;
    let purgedDailyMetrics = 0;

    try {
      const resRuns = await db
        .prepare('DELETE FROM orchestrator_runs WHERE created_at < ?')
        .bind(cutoffDate)
        .run();
      purgedRuns = resRuns.meta?.changes ?? 0;
    } catch {
      // Best-effort
    }

    try {
      const resMetrics = await db
        .prepare('DELETE FROM d1_daily_usage WHERE date < ?')
        .bind(cutoffDay)
        .run();
      purgedDailyMetrics = resMetrics.meta?.changes ?? 0;
    } catch {
      // Best-effort
    }

    return { purgedRuns, purgedDailyMetrics };
  }

  /**
   * Helper to reset in-memory buffer (primarily for unit testing).
   */
  public static resetBufferForTesting(): void {
    localBuffer = {
      date: new Date().toISOString().split('T')[0] ?? '',
      rowsWritten: 0,
      rowsRead: 0,
      writeQueries: 0,
      readQueries: 0,
      unflushedWrites: 0,
    };
  }
}
