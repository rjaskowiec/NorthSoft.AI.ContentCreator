import { describe, expect, it } from 'vitest';
import {
  formatAuditActor,
  formatAuditDetails,
  formatAuditEntity,
  formatAuditEventType,
  formatAuditTimestamp,
} from '../../src/admin/ui/audit-formatter.js';

describe('Audit Presentation Formatter', () => {
  it('formats event types into human readable title and status badge', () => {
    const login = formatAuditEventType('AUTH_LOGIN_SUCCESS');
    expect(login.title).toBe('Login successful');
    expect(login.category).toBe('SUCCESS');
    expect(login.badgeClass).toBe('status-healthy');

    const resetReq = formatAuditEventType('ADMIN_PASSWORD_RESET_REQUESTED');
    expect(resetReq.title).toBe('Password reset requested');
    expect(resetReq.category).toBe('INFO');

    const pubFailed = formatAuditEventType('PUBLICATION_FAILED');
    expect(pubFailed.title).toBe('Publication failed');
    expect(pubFailed.category).toBe('FAILED');
    expect(pubFailed.badgeClass).toBe('status-alert');

    const unknown = formatAuditEventType('CUSTOM_UNKNOWN_EVENT');
    expect(unknown.title).toBe('Custom Unknown Event');
    expect(unknown.category).toBe('INFO');
  });

  it('formats audit actors with optional subtext', () => {
    const adminActor = formatAuditActor('admin', { username: 'rjaskowiec' });
    expect(adminActor.label).toBe('ADMIN');
    expect(adminActor.subtext).toBe('rjaskowiec');
    expect(adminActor.badgeClass).toBe('status-active');

    const sysActor = formatAuditActor('system');
    expect(sysActor.label).toBe('SYSTEM');
    expect(sysActor.subtext).toBeUndefined();
    expect(sysActor.badgeClass).toBe('status-disabled');

    const aiActor = formatAuditActor('ai');
    expect(aiActor.label).toBe('AI ENGINE');
    expect(aiActor.badgeClass).toBe('status-healthy');
  });

  it('formats audit entities with truncated IDs', () => {
    const sessionEntity = formatAuditEntity(
      'admin_session',
      '1e672c5a-f722-4fea-8595-cb0325e3608f',
    );
    expect(sessionEntity.typeLabel).toBe('Admin session');
    expect(sessionEntity.truncatedId).toBe('1e672c5a…');
    expect(sessionEntity.fullId).toBe('1e672c5a-f722-4fea-8595-cb0325e3608f');

    const shortEntity = formatAuditEntity('admin_user', 'usr-100');
    expect(shortEntity.typeLabel).toBe('Admin user');
    expect(shortEntity.truncatedId).toBe('usr-100');
  });

  it('formats audit details into structured key-value pairs', () => {
    const rawJson = JSON.stringify({
      username: 'rjaskowiec',
      clientIp: '31.209.158.49',
      emailConfigured: false,
    });

    const items = formatAuditDetails(rawJson);
    expect(items.length).toBe(3);
    expect(items[0]).toEqual({ key: 'username', label: 'Username', value: 'rjaskowiec' });
    expect(items[1]).toEqual({ key: 'clientIp', label: 'IP', value: '31.209.158.49' });
    expect(items[2]).toEqual({ key: 'emailConfigured', label: 'Email', value: 'Not configured' });
  });

  it('formats timestamps into compact and full UTC strings', () => {
    const ts = formatAuditTimestamp('2026-09-25T22:12:24.395Z');
    expect(ts.compact).toBe('25 Sep, 22:12 UTC');
    expect(ts.full).toBe('2026-09-25 22:12:24 UTC');
  });
});
