import { describe, expect, it, vi } from 'vitest';
import { D1AuditLogger, sanitizeDetails } from '../../src/core/audit';

describe('Audit Logger & Detail Sanitizer', () => {
  it('redacts sensitive keys from audit log details', () => {
    const rawDetails = {
      username: 'admin',
      password: 'MySecretPassword123',
      nested: {
        token: 'secret-token-xyz',
        publicInfo: 'ok',
      },
      safeKey: 'safeValue',
    };

    const sanitized = sanitizeDetails(rawDetails);

    expect(sanitized.username).toBe('admin');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.safeKey).toBe('safeValue');
    const nested = sanitized.nested as Record<string, string>;
    expect(nested.token).toBe('[REDACTED]');
    expect(nested.publicInfo).toBe('ok');
  });

  it('logs events to D1 with sanitized details', async () => {
    const runMock = vi.fn().mockResolvedValue({ success: true });
    const bindMock = vi.fn().mockReturnValue({ run: runMock });
    const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

    const mockDb = {
      prepare: prepareMock,
    } as unknown as D1Database;

    const logger = new D1AuditLogger(mockDb);
    await logger.log({
      eventType: 'AUTH_LOGIN_SUCCESS',
      entityType: 'admin_user',
      entityId: 'user-1',
      actor: 'admin',
      details: {
        username: 'admin',
        password: 'should-be-redacted',
      },
    });

    expect(prepareMock).toHaveBeenCalledTimes(1);
    expect(bindMock).toHaveBeenCalledTimes(1);
    const boundArgs = bindMock.mock.calls[0] as unknown[];
    expect(boundArgs).toBeDefined();
    expect(boundArgs[1]).toBe('AUTH_LOGIN_SUCCESS');
    expect(boundArgs[2]).toBe('admin_user');
    expect(boundArgs[3]).toBe('user-1');
    expect(boundArgs[4]).toBe('admin');

    const detailsJson = JSON.parse(boundArgs[5] as string);
    expect(detailsJson.username).toBe('admin');
    expect(detailsJson.password).toBe('[REDACTED]');
  });
});
