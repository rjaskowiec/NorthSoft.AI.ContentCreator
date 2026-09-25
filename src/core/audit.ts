/**
 * Audit Log Types
 *
 * Every important autonomous operation must be auditable.
 * Audit entries are stored in D1 and must NEVER contain secrets,
 * access tokens, or sensitive request headers.
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
  | 'SYSTEM_ERROR';

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
