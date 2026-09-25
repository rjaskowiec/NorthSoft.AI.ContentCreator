/**
 * Audit Log Types & Implementation
 *
 * Every important autonomous and authentication operation must be auditable.
 * Audit entries are stored in D1 and must NEVER contain secrets,
 * access tokens, password hashes, or sensitive request headers.
 */

/**
 * All auditable event types in the system.
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

/**
 * An entry in the audit log.
 */
export interface AuditEntry {
  id?: string;
  eventType: AuditEventType;
  entityType: string;
  entityId: string;
  actor: 'system' | 'admin' | 'ai';
  details: Record<string, unknown>;
  timestamp: string;
}

/**
 * Audit logger interface.
 */
export interface IAuditLogger {
  /**
   * Log an auditable event.
   * The implementation must sanitize details to remove any secrets.
   */
  log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void>;

  /**
   * Query audit log entries.
   */
  query(filters: {
    eventType?: AuditEventType;
    entityType?: string;
    entityId?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }): Promise<AuditEntry[]>;
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
]);

/**
 * Recursively sanitizes details object to remove any sensitive key/value pairs.
 */
export function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeDetails(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * D1 Database backed Audit Logger implementation.
 */
export class D1AuditLogger implements IAuditLogger {
  constructor(private db: D1Database) {}

  async log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void> {
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const sanitizedDetails = sanitizeDetails(entry.details || {});

    await this.db
      .prepare(
        `INSERT INTO audit_log (id, event_type, entity_type, entity_id, actor, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        entry.eventType,
        entry.entityType,
        entry.entityId,
        entry.actor,
        JSON.stringify(sanitizedDetails),
        timestamp,
      )
      .run();
  }

  async query(filters: {
    eventType?: AuditEventType;
    entityType?: string;
    entityId?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }): Promise<AuditEntry[]> {
    let sql =
      'SELECT id, event_type, entity_type, entity_id, actor, details, created_at FROM audit_log WHERE 1=1';
    const params: unknown[] = [];

    if (filters.eventType) {
      sql += ' AND event_type = ?';
      params.push(filters.eventType);
    }
    if (filters.entityType) {
      sql += ' AND entity_type = ?';
      params.push(filters.entityType);
    }
    if (filters.entityId) {
      sql += ' AND entity_id = ?';
      params.push(filters.entityId);
    }
    if (filters.from) {
      sql += ' AND created_at >= ?';
      params.push(filters.from);
    }
    if (filters.to) {
      sql += ' AND created_at <= ?';
      params.push(filters.to);
    }

    sql += ' ORDER BY created_at DESC';

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(sql);
    const boundStmt = stmt.bind(...params);
    const rows = await boundStmt.all<{
      id: string;
      event_type: string;
      entity_type: string;
      entity_id: string;
      actor: 'system' | 'admin' | 'ai';
      details: string;
      created_at: string;
    }>();

    return (rows.results || []).map((row) => {
      let parsedDetails: Record<string, unknown>;
      try {
        parsedDetails = row.details ? (JSON.parse(row.details) as Record<string, unknown>) : {};
      } catch {
        parsedDetails = { raw: row.details };
      }

      return {
        id: row.id,
        eventType: row.event_type as AuditEventType,
        entityType: row.entity_type,
        entityId: row.entity_id,
        actor: row.actor,
        details: parsedDetails,
        timestamp: row.created_at,
      };
    });
  }
}
