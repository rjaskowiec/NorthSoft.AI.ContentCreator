/**
 * NorthSoft.AI.ContentCreator — Audit Log Engine
 *
 * Implements structured, secure, operational audit logging.
 *
 * Guarantees:
 * 1. Fault isolation: Audit persistence failures NEVER break business operations.
 * 2. Strict sanitization: Secrets, access tokens, passwords, and sensitive headers are redacted before storage.
 * 3. Structured diagnostics: Retains detailed, un-truncated diagnostic error info and performance metrics.
 */

export type AuditEventType =
  | 'RESEARCH_STARTED'
  | 'RESEARCH_COMPLETED'
  | 'TOPIC_SELECTED'
  | 'POST_GENERATED'
  | 'STATIC_VALIDATION'
  | 'FACT_CHECK'
  | 'POLICY_CHECK'
  | 'QUALITY_GATE'
  | 'REGENERATION'
  | 'POST_SCHEDULED'
  | 'FACEBOOK_PUBLISH_ATTEMPT'
  | 'FACEBOOK_PUBLISH_SUCCESS'
  | 'FACEBOOK_PUBLISH_FAILED'
  | 'POST_BLOCKED'
  | 'POST_APPROVED'
  | 'POST_REJECTED'
  | 'ADMIN_ACTION'
  | 'CONFIG_CHANGED'
  | 'SYSTEM_ERROR'
  | 'AUTH_LOGIN_SUCCESS'
  | 'AUTH_LOGIN_FAILURE'
  | 'AUTH_LOGOUT'
  | 'SESSION_CREATED'
  | 'SESSION_REVOKED'
  | 'ADMIN_PASSWORD_CHANGED'
  | 'ADMIN_PASSWORD_RESET_REQUESTED'
  | 'ADMIN_PASSWORD_RESET_COMPLETED'
  | 'ADMIN_PASSWORD_RESET_FAILED'
  | 'ADMIN_RECOVERY_EMAIL_UPDATED'
  | 'RESEARCH_RUN_STARTED'
  | 'RESEARCH_RUN_COMPLETED'
  | 'RESEARCH_SOURCE_FETCHED'
  | 'RESEARCH_SOURCE_FAILED'
  | 'RESEARCH_ITEM_CREATED'
  | 'RESEARCH_ITEM_DUPLICATE'
  | 'TOPIC_CREATED'
  | 'AI_RESEARCH_STARTED'
  | 'AI_RESEARCH_COMPLETED'
  | 'AI_RESEARCH_FAILED'
  | 'AI_QUOTA_CHECK'
  | 'AI_QUOTA_EXCEEDED'
  | 'AI_QUOTA_DEFERRED'
  | 'RESEARCH_DEFERRED'
  | 'POST_GENERATION_STARTED'
  | 'POST_REGENERATION_STARTED'
  | 'STATIC_VALIDATION_PASSED'
  | 'STATIC_VALIDATION_FAILED'
  | 'POLICY_REVIEW_STARTED'
  | 'POLICY_REVIEW_PASSED'
  | 'POLICY_REVIEW_FAILED'
  | 'QA_STARTED'
  | 'QA_PASSED'
  | 'QA_FAILED'
  | 'ORCHESTRATOR_RUN_STARTED'
  | 'ORCHESTRATOR_RUN_COMPLETED'
  | 'ORCHESTRATOR_RUN_DEFERRED'
  | 'WORKFLOW_FAILED'
  | 'PUBLICATION_CREATED'
  | 'PUBLICATION_SCHEDULED'
  | 'PUBLICATION_STARTED'
  | 'PUBLICATION_SUCCEEDED'
  | 'PUBLICATION_FAILED'
  | 'PUBLICATION_RETRY'
  | 'PUBLICATION_BLOCKED';

export type AuditLevel = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
export type AuditStatus = 'STARTED' | 'COMPLETED' | 'FAILED' | 'DEFERRED';

export interface AuditErrorDetails {
  code?: string;
  message: string;
  stage?: string;
  httpStatus?: number;
}

export interface AuditEntry {
  id?: string;
  eventType: AuditEventType;
  level?: AuditLevel;
  operation?: string;
  actor: 'system' | 'admin' | 'ai';
  entityType: string;
  entityId: string;
  status?: AuditStatus;
  summary?: string;
  durationMs?: number;
  correlationId?: string;
  details?: Record<string, unknown>;
  error?: AuditErrorDetails;
  timestamp?: string;
}

export interface AuditQueryFilters {
  eventType?: AuditEventType;
  level?: AuditLevel;
  status?: AuditStatus;
  entityType?: string;
  entityId?: string;
  correlationId?: string;
  search?: string;
  category?: 'all' | 'errors' | 'warnings' | 'ai' | 'facebook' | 'auth' | 'system';
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface AuditQueryResult {
  events: AuditEntry[];
  totalCount: number;
}

export interface AuditStatsResult {
  totalEvents: number;
  errorCount: number;
  warningCount: number;
  successCount: number;
  aiOperations: number;
}

export interface IAuditLogger {
  log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void>;
  query(filters: AuditQueryFilters): Promise<AuditEntry[]>;
  queryWithCount(filters: AuditQueryFilters): Promise<AuditQueryResult>;
  getStats(): Promise<AuditStatsResult>;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'password_salt',
  'token',
  'rawtoken',
  'token_hash',
  'csrfsecret',
  'csrf_secret',
  'cookie',
  'authorization',
  'secret',
  'admin_auth_secret',
  'access_token',
  'page_access_token',
  'meta_page_access_token',
  'meta_secret',
  'gateway_token',
  'northsoft_mail_api_key',
  'resettoken',
  'reset_token',
  'bearer',
  'auth',
  'app_secret',
]);

/**
 * Redacts secret patterns inside string values (URLs, Bearer tokens, query parameters).
 */
export function sanitizeStringValue(str: string): string {
  if (typeof str !== 'string') return str;

  let sanitized = str;
  // Redact URL tokens: ?access_token=..., &token=..., resetToken=...
  sanitized = sanitized.replace(/(access_token|resetToken|token|secret|GATEWAY_TOKEN)=[^& \s]+/gi, '$1=[REDACTED]');
  // Redact Bearer headers
  sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]');

  return sanitized;
}

/**
 * Recursively sanitizes details object to remove any sensitive key/value pairs or token strings.
 */
export function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      sanitized[key] = sanitizeStringValue(value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeDetails(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item =>
        typeof item === 'string' ? sanitizeStringValue(item) :
        item && typeof item === 'object' ? sanitizeDetails(item as Record<string, unknown>) : item
      );
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Automatically infers AuditLevel from eventType if not explicitly provided.
 */
export function inferAuditLevel(eventType: AuditEventType, status?: AuditStatus): AuditLevel {
  if (status === 'FAILED') return 'ERROR';
  if (status === 'DEFERRED') return 'WARNING';
  if (status === 'COMPLETED') return 'SUCCESS';

  const evt = eventType.toUpperCase();
  if (evt.includes('FAILED') || evt.includes('ERROR') || evt.includes('BLOCKED') || evt.includes('EXCEEDED')) {
    return 'ERROR';
  }
  if (evt.includes('DEFERRED') || evt.includes('DUPLICATE') || evt.includes('RETRY') || evt.includes('WARNING')) {
    return 'WARNING';
  }
  if (evt.includes('COMPLETED') || evt.includes('PASSED') || evt.includes('SUCCESS') || evt.includes('APPROVED')) {
    return 'SUCCESS';
  }
  return 'INFO';
}

/**
 * D1 Database backed Audit Logger implementation.
 */
export class D1AuditLogger implements IAuditLogger {
  constructor(private db: D1Database) {}

  /**
   * Safe event logging. Audit log failures MUST NEVER crash business logic.
   */
  async log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void> {
    try {
      const id = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const level = entry.level || inferAuditLevel(entry.eventType, entry.status);
      const sanitizedDetails = sanitizeDetails(entry.details || {});

      const errCode = entry.error?.code || null;
      let errMsg = entry.error?.message ? sanitizeStringValue(entry.error.message) : null;
      const errStage = entry.error?.stage || null;
      const httpStatus = entry.error?.httpStatus || null;

      // Extract error details from details object if not explicitly provided in entry.error
      if (!errMsg && sanitizedDetails.error) {
        errMsg = typeof sanitizedDetails.error === 'string'
          ? sanitizeStringValue(sanitizedDetails.error)
          : JSON.stringify(sanitizedDetails.error);
      }

      const operation = entry.operation ? sanitizeStringValue(entry.operation) : null;

      await this.db
        .prepare(
          `INSERT INTO audit_log (
            id, event_type, entity_type, entity_id, actor, details, created_at,
            level, operation, status, duration_ms, correlation_id,
            error_code, error_message, error_stage, http_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          entry.eventType,
          entry.entityType,
          entry.entityId,
          entry.actor,
          JSON.stringify(sanitizedDetails),
          timestamp,
          level,
          operation,
          entry.status || null,
          entry.durationMs ?? null,
          entry.correlationId || null,
          errCode,
          errMsg,
          errStage,
          httpStatus,
        )
        .run();
    } catch (err: unknown) {
      // Fault Isolation: Log audit persistence error safely to console without throwing
      console.error('AuditLogger.log failed to write to D1:', err);
    }
  }

  async query(filters: AuditQueryFilters): Promise<AuditEntry[]> {
    const res = await this.queryWithCount(filters);
    return res.events;
  }

  async queryWithCount(filters: AuditQueryFilters): Promise<AuditQueryResult> {
    try {
      let sql = `SELECT id, event_type, entity_type, entity_id, actor, details, created_at,
                        level, operation, status, duration_ms, correlation_id,
                        error_code, error_message, error_stage, http_status
                 FROM audit_log WHERE 1=1`;
      let countSql = `SELECT COUNT(*) as cnt FROM audit_log WHERE 1=1`;

      const params: unknown[] = [];
      const countParams: unknown[] = [];

      let whereClause = '';

      if (filters.eventType) {
        whereClause += ' AND event_type = ?';
        params.push(filters.eventType);
        countParams.push(filters.eventType);
      }
      if (filters.level) {
        whereClause += ' AND level = ?';
        params.push(filters.level);
        countParams.push(filters.level);
      }
      if (filters.status) {
        whereClause += ' AND status = ?';
        params.push(filters.status);
        countParams.push(filters.status);
      }
      if (filters.entityType) {
        whereClause += ' AND entity_type = ?';
        params.push(filters.entityType);
        countParams.push(filters.entityType);
      }
      if (filters.entityId) {
        whereClause += ' AND entity_id = ?';
        params.push(filters.entityId);
        countParams.push(filters.entityId);
      }
      if (filters.correlationId) {
        whereClause += ' AND correlation_id = ?';
        params.push(filters.correlationId);
        countParams.push(filters.correlationId);
      }
      if (filters.from) {
        whereClause += ' AND created_at >= ?';
        params.push(filters.from);
        countParams.push(filters.from);
      }
      if (filters.to) {
        whereClause += ' AND created_at <= ?';
        params.push(filters.to);
        countParams.push(filters.to);
      }

      // Category filter mapping
      if (filters.category && filters.category !== 'all') {
        if (filters.category === 'errors') {
          whereClause += " AND (level = 'ERROR' OR status = 'FAILED')";
        } else if (filters.category === 'warnings') {
          whereClause += " AND (level = 'WARNING' OR status = 'DEFERRED')";
        } else if (filters.category === 'ai') {
          whereClause += " AND (event_type LIKE 'AI_%' OR actor = 'ai')";
        } else if (filters.category === 'facebook') {
          whereClause += " AND (event_type LIKE 'FACEBOOK_%' OR event_type LIKE 'PUBLICATION_%')";
        } else if (filters.category === 'auth') {
          whereClause += " AND (event_type LIKE 'AUTH_%' OR event_type LIKE 'SESSION_%' OR event_type LIKE 'ADMIN_%')";
        } else if (filters.category === 'system') {
          whereClause += " AND (event_type LIKE 'ORCHESTRATOR_%' OR event_type LIKE 'WORKFLOW_%' OR event_type = 'SYSTEM_ERROR')";
        }
      }

      // Search text filter across operation, event_type, entity_id, and error_message
      if (filters.search && filters.search.trim()) {
        const searchTerm = `%${filters.search.trim()}%`;
        whereClause += ' AND (operation LIKE ? OR event_type LIKE ? OR entity_id LIKE ? OR error_message LIKE ? OR details LIKE ?)';
        params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
        countParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
      }

      sql += whereClause + ' ORDER BY created_at DESC';
      countSql += whereClause;

      const limit = filters.limit || 50;
      const offset = filters.offset || 0;
      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const stmtCount = this.db.prepare(countSql).bind(...countParams);
      const countPromise = typeof stmtCount.first === 'function'
        ? stmtCount.first<{ cnt: number }>()
        : stmtCount.all<{ cnt: number }>().then(r => r.results?.[0] || null);

      const [rows, countRow] = await Promise.all([
        this.db.prepare(sql).bind(...params).all<{
          id: string;
          event_type: string;
          entity_type: string;
          entity_id: string;
          actor: 'system' | 'admin' | 'ai';
          details: string;
          created_at: string;
          level: string | null;
          operation: string | null;
          status: string | null;
          duration_ms: number | null;
          correlation_id: string | null;
          error_code: string | null;
          error_message: string | null;
          error_stage: string | null;
          http_status: number | null;
        }>(),
        countPromise,
      ]);

      const events: AuditEntry[] = (rows.results || []).map((row) => {
        let parsedDetails: Record<string, unknown>;
        try {
          parsedDetails = row.details ? (JSON.parse(row.details) as Record<string, unknown>) : {};
        } catch {
          parsedDetails = { raw: row.details };
        }

        const level = (row.level as AuditLevel) || inferAuditLevel(row.event_type as AuditEventType, row.status as AuditStatus);

        let errorObj: AuditErrorDetails | undefined;
        if (row.error_message || row.error_code || row.error_stage || row.http_status) {
          errorObj = {
            message: row.error_message || 'An error occurred',
            code: row.error_code || undefined,
            stage: row.error_stage || undefined,
            httpStatus: row.http_status || undefined,
          };
        } else if (parsedDetails.error) {
          errorObj = {
            message: typeof parsedDetails.error === 'string' ? parsedDetails.error : JSON.stringify(parsedDetails.error),
          };
        }

        return {
          id: row.id,
          eventType: row.event_type as AuditEventType,
          level,
          operation: row.operation || (parsedDetails.title as string) || (parsedDetails.sourceName as string) || undefined,
          actor: row.actor,
          entityType: row.entity_type,
          entityId: row.entity_id,
          status: (row.status as AuditStatus) || undefined,
          durationMs: row.duration_ms ?? (parsedDetails.durationMs as number) ?? undefined,
          correlationId: row.correlation_id || (parsedDetails.correlationId as string) || (parsedDetails.runId as string) || undefined,
          details: parsedDetails,
          error: errorObj,
          timestamp: row.created_at,
        };
      });

      return {
        events,
        totalCount: countRow?.cnt || events.length,
      };
    } catch (err: unknown) {
      console.error('AuditLogger.queryWithCount failed:', err);
      return { events: [], totalCount: 0 };
    }
  }

  async getStats(): Promise<AuditStatsResult> {
    try {
      const statsRow = await this.db
        .prepare(
          `SELECT
             COUNT(*) as totalEvents,
             SUM(CASE WHEN level = 'ERROR' OR status = 'FAILED' THEN 1 ELSE 0 END) as errorCount,
             SUM(CASE WHEN level = 'WARNING' OR status = 'DEFERRED' THEN 1 ELSE 0 END) as warningCount,
             SUM(CASE WHEN level = 'SUCCESS' OR status = 'COMPLETED' THEN 1 ELSE 0 END) as successCount,
             SUM(CASE WHEN event_type LIKE 'AI_%' OR actor = 'ai' THEN 1 ELSE 0 END) as aiOperations
           FROM audit_log`,
        )
        .first<{
          totalEvents: number;
          errorCount: number;
          warningCount: number;
          successCount: number;
          aiOperations: number;
        }>();

      return {
        totalEvents: statsRow?.totalEvents || 0,
        errorCount: statsRow?.errorCount || 0,
        warningCount: statsRow?.warningCount || 0,
        successCount: statsRow?.successCount || 0,
        aiOperations: statsRow?.aiOperations || 0,
      };
    } catch {
      return { totalEvents: 0, errorCount: 0, warningCount: 0, successCount: 0, aiOperations: 0 };
    }
  }
}
