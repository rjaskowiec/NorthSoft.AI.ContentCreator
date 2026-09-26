/**
 * NorthSoft.AI.ContentCreator — Audit Log Presentation Formatter
 *
 * Formats raw audit log entries into human-readable, accessible UI components.
 */

export interface EventTypeFormatting {
  title: string;
  category: string;
  badgeClass: string;
}

export interface ActorFormatting {
  label: string;
  subtext?: string;
  badgeClass: string;
}

export interface EntityFormatting {
  typeLabel: string;
  truncatedId: string;
  fullId: string;
}

export interface DetailItem {
  key: string;
  label: string;
  value: string;
}

export interface TimestampFormatting {
  compact: string;
  full: string;
}

/**
 * Format raw audit event type into human readable title, category badge, and CSS class.
 */
export function formatAuditEventType(eventType: string): EventTypeFormatting {
  const norm = (eventType || '').toUpperCase().trim();
  switch (norm) {
    case 'AUTH_LOGIN_SUCCESS':
      return { title: 'Login successful', category: 'SUCCESS', badgeClass: 'status-healthy' };
    case 'AUTH_LOGIN_FAILURE':
      return { title: 'Login failed', category: 'FAILED', badgeClass: 'status-alert' };
    case 'AUTH_LOGOUT':
      return { title: 'User signed out', category: 'INFO', badgeClass: 'status-disabled' };
    case 'SESSION_CREATED':
      return { title: 'Session created', category: 'INFO', badgeClass: 'status-active' };
    case 'SESSION_REVOKED':
      return { title: 'Session revoked', category: 'INFO', badgeClass: 'status-disabled' };
    case 'ADMIN_PASSWORD_CHANGED':
      return { title: 'Password changed', category: 'SUCCESS', badgeClass: 'status-healthy' };
    case 'ADMIN_PASSWORD_RESET_REQUESTED':
      return { title: 'Password reset requested', category: 'INFO', badgeClass: 'status-disabled' };
    case 'ADMIN_PASSWORD_RESET_COMPLETED':
      return {
        title: 'Password reset completed',
        category: 'SUCCESS',
        badgeClass: 'status-healthy',
      };
    case 'ADMIN_PASSWORD_RESET_FAILED':
      return { title: 'Password reset failed', category: 'FAILED', badgeClass: 'status-alert' };
    case 'ADMIN_RECOVERY_EMAIL_UPDATED':
      return { title: 'Recovery email updated', category: 'UPDATED', badgeClass: 'status-active' };
    case 'RESEARCH_STARTED':
    case 'RESEARCH_RUN_STARTED':
    case 'AI_RESEARCH_STARTED':
      return { title: 'Research started', category: 'STARTED', badgeClass: 'status-active' };
    case 'RESEARCH_COMPLETED':
    case 'RESEARCH_RUN_COMPLETED':
    case 'AI_RESEARCH_COMPLETED':
      return { title: 'Research completed', category: 'SUCCESS', badgeClass: 'status-healthy' };
    case 'POST_GENERATED':
    case 'POST_GENERATION_STARTED':
      return { title: 'Post draft generated', category: 'CREATED', badgeClass: 'status-active' };
    case 'QUALITY_GATE':
      return {
        title: 'Quality gate evaluation',
        category: 'EVALUATION',
        badgeClass: 'status-active',
      };
    case 'POST_APPROVED':
    case 'QA_PASSED':
    case 'POLICY_REVIEW_PASSED':
    case 'STATIC_VALIDATION_PASSED':
      return { title: 'Post approved', category: 'APPROVED', badgeClass: 'status-healthy' };
    case 'POST_BLOCKED':
    case 'POST_REJECTED':
    case 'QA_FAILED':
    case 'POLICY_REVIEW_FAILED':
    case 'STATIC_VALIDATION_FAILED':
      return { title: 'Post rejected / blocked', category: 'BLOCKED', badgeClass: 'status-alert' };
    case 'POST_SCHEDULED':
    case 'PUBLICATION_SCHEDULED':
    case 'PUBLICATION_CREATED':
      return { title: 'Publication scheduled', category: 'SCHEDULED', badgeClass: 'status-active' };
    case 'PUBLICATION_STARTED':
    case 'FACEBOOK_PUBLISH_ATTEMPT':
      return { title: 'Publication attempt', category: 'ATTEMPT', badgeClass: 'status-active' };
    case 'PUBLICATION_SUCCEEDED':
    case 'FACEBOOK_PUBLISH_SUCCESS':
      return { title: 'Publication succeeded', category: 'SUCCESS', badgeClass: 'status-healthy' };
    case 'PUBLICATION_FAILED':
    case 'FACEBOOK_PUBLISH_FAILED':
      return { title: 'Publication failed', category: 'FAILED', badgeClass: 'status-alert' };
    case 'CONFIG_CHANGED':
      return { title: 'Configuration updated', category: 'CONFIG', badgeClass: 'status-active' };
    case 'SYSTEM_ERROR':
    case 'WORKFLOW_FAILED':
      return { title: 'System error', category: 'ERROR', badgeClass: 'status-alert' };
    default: {
      const words = norm
        .split('_')
        .filter(Boolean)
        .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
        .join(' ');
      const isErr =
        norm.includes('FAIL') ||
        norm.includes('ERR') ||
        norm.includes('BLOCK') ||
        norm.includes('REJECT');
      const isSucc = norm.includes('SUCCESS') || norm.includes('COMPLET') || norm.includes('PASS');
      return {
        title: words || 'System Event',
        category: isErr ? 'FAILED' : isSucc ? 'SUCCESS' : 'INFO',
        badgeClass: isErr ? 'status-alert' : isSucc ? 'status-healthy' : 'status-disabled',
      };
    }
  }
}

/**
 * Format audit actor into label, badge class, and optional username subtext.
 */
export function formatAuditActor(
  actor: string,
  details?: Record<string, unknown>,
): ActorFormatting {
  const act = (actor || 'system').toLowerCase().trim();
  let label = 'SYSTEM';
  let badgeClass = 'status-disabled';

  if (act === 'admin') {
    label = 'ADMIN';
    badgeClass = 'status-active';
  } else if (act === 'ai') {
    label = 'AI ENGINE';
    badgeClass = 'status-healthy';
  }

  const username = details?.username || details?.actorName;
  const subtext = typeof username === 'string' && username.trim() ? username.trim() : undefined;

  return { label, subtext, badgeClass };
}

/**
 * Format audit entity type and truncate UUID.
 */
export function formatAuditEntity(entityType: string, entityId: string): EntityFormatting {
  const typeMap: Record<string, string> = {
    admin_user: 'Admin user',
    admin_session: 'Admin session',
    publication: 'Publication',
    post: 'Post draft',
    post_version: 'Post version',
    topic: 'Research topic',
    research_run: 'Research run',
    orchestrator: 'Orchestrator',
  };

  const rawType = (entityType || '').toLowerCase().trim();
  const typeLabel =
    typeMap[rawType] ||
    rawType
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ') ||
    'System';

  const fullId = String(entityId || '—');
  let truncatedId = fullId;
  if (fullId.length > 14) {
    truncatedId = fullId.substring(0, 8) + '…';
  }

  return { typeLabel, truncatedId, fullId };
}

/**
 * Format audit details into human-readable key-value pairs.
 */
export function formatAuditDetails(detailsInput: unknown): DetailItem[] {
  let details: Record<string, unknown> = {};
  if (typeof detailsInput === 'string') {
    try {
      details = JSON.parse(detailsInput);
    } catch {
      details = { info: detailsInput };
    }
  } else if (detailsInput && typeof detailsInput === 'object') {
    details = detailsInput as Record<string, unknown>;
  }

  const labelMap: Record<string, string> = {
    username: 'Username',
    clientIp: 'IP',
    emailConfigured: 'Email',
    expiresAt: 'Expires',
    adminUserId: 'User ID',
    triggerType: 'Trigger',
    trigger: 'Trigger',
    reason: 'Reason',
    status: 'Status',
    neuronsUsed: 'Est. Neurons',
    neurons: 'Est. Neurons',
    errorMessage: 'Error',
    error: 'Error',
  };

  const items: DetailItem[] = [];

  for (const [key, rawVal] of Object.entries(details)) {
    if (rawVal === undefined || rawVal === null) continue;
    const label =
      labelMap[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());

    let value: string;
    if (typeof rawVal === 'boolean') {
      value = rawVal ? 'Configured' : 'Not configured';
    } else if (typeof rawVal === 'object') {
      value = JSON.stringify(rawVal);
    } else if (key.toLowerCase().includes('time') || key.toLowerCase().includes('expires')) {
      const parsedDate = new Date(String(rawVal));
      value = isNaN(parsedDate.getTime()) ? String(rawVal) : parsedDate.toLocaleString();
    } else {
      value = String(rawVal);
    }

    if (value.length > 36) {
      value = value.substring(0, 33) + '…';
    }

    items.push({ key, label, value });
  }

  return items;
}

/**
 * Format ISO timestamp into compact UTC display string and full UTC ISO string.
 */
export function formatAuditTimestamp(isoDate: string): TimestampFormatting {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) {
    return { compact: isoDate || '—', full: isoDate || '—' };
  }

  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const day = d.getUTCDate();
  const month = monthNames[d.getUTCMonth()];
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const mins = String(d.getUTCMinutes()).padStart(2, '0');
  const secs = String(d.getUTCSeconds()).padStart(2, '0');

  const compact = `${day} ${month}, ${hours}:${mins} UTC`;
  const full = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')} ${hours}:${mins}:${secs} UTC`;

  return { compact, full };
}
