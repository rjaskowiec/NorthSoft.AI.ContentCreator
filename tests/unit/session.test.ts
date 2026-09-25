import type { Context } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import {
  createSession,
  getSessionTokenFromCookie,
  revokeSession,
  validateSession,
} from '../../src/core/auth/session';

describe('Session Management', () => {
  it('creates session and stores token_hash in D1', async () => {
    const runMock = vi.fn().mockResolvedValue({ success: true });
    const bindMock = vi.fn().mockReturnValue({ run: runMock });
    const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

    const mockDb = { prepare: prepareMock } as unknown as D1Database;

    const created = await createSession(mockDb, 'user-123', '127.0.0.1', 'Vitest');

    expect(created.rawToken).toHaveLength(64);
    expect(created.csrfSecret).toHaveLength(64);
    expect(created.sessionId).toBeDefined();
    expect(prepareMock).toHaveBeenCalledTimes(1);

    const bindArgs = bindMock.mock.calls[0] as unknown[];
    expect(bindArgs[1]).toBe('user-123'); // userId
    expect(bindArgs[2]).not.toBe(created.rawToken); // token_hash should NOT equal rawToken
  });

  it('validates active session successfully', async () => {
    const mockRow = {
      session_id: 'sess-1',
      admin_user_id: 'user-1',
      token_hash: 'hash-1',
      csrf_secret: 'csrf-1',
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      session_created_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
      ip_address: '127.0.0.1',
      user_agent: 'Vitest',
      user_id: 'user-1',
      username: 'admin',
      user_status: 'active',
      user_created_at: new Date().toISOString(),
      user_updated_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
    };

    const catchMock = vi.fn();
    const runMock = vi.fn().mockReturnValue({ catch: catchMock });
    const bindUpdateMock = vi.fn().mockReturnValue({ run: runMock });

    const firstMock = vi.fn().mockResolvedValue(mockRow);
    const bindSelectMock = vi.fn().mockReturnValue({ first: firstMock });

    const prepareMock = vi.fn((sql: string) => {
      if (sql.includes('UPDATE')) {
        return { bind: bindUpdateMock };
      }
      return { bind: bindSelectMock };
    });

    const mockDb = { prepare: prepareMock } as unknown as D1Database;

    const res = await validateSession(mockDb, 'valid-token');

    expect(res.valid).toBe(true);
    expect(res.user?.username).toBe('admin');
    expect(res.session?.csrf_secret).toBe('csrf-1');
  });

  it('rejects expired session', async () => {
    const mockRow = {
      session_id: 'sess-1',
      admin_user_id: 'user-1',
      token_hash: 'hash-1',
      csrf_secret: 'csrf-1',
      expires_at: new Date(Date.now() - 3600000).toISOString(), // Expired 1h ago
      session_created_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
      user_id: 'user-1',
      username: 'admin',
      user_status: 'active',
    };

    const firstMock = vi.fn().mockResolvedValue(mockRow);
    const bindSelectMock = vi.fn().mockReturnValue({ first: firstMock });
    const prepareMock = vi.fn().mockReturnValue({ bind: bindSelectMock });

    const mockDb = { prepare: prepareMock } as unknown as D1Database;

    const res = await validateSession(mockDb, 'expired-token');

    expect(res.valid).toBe(false);
    expect(res.reason).toBe('expired');
  });

  it('revokes session in D1', async () => {
    const runMock = vi.fn().mockResolvedValue({ success: true });
    const bindMock = vi.fn().mockReturnValue({ run: runMock });
    const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

    const mockDb = { prepare: prepareMock } as unknown as D1Database;

    await revokeSession(mockDb, 'token-to-revoke');

    expect(prepareMock).toHaveBeenCalledTimes(1);
    const prepareArgs = prepareMock.mock.calls[0] as unknown[];
    expect(prepareArgs[0]).toContain('UPDATE admin_sessions SET revoked_at');
  });

  it('extracts session token from cookie and Authorization header', () => {
    const mockCookieCtx = {
      req: {
        raw: {
          headers: new Headers({ cookie: 'admin_session=cookie-token-123' }),
        },
        header: (name: string) =>
          name.toLowerCase() === 'cookie' ? 'admin_session=cookie-token-123' : undefined,
      },
    } as unknown as Context;

    expect(getSessionTokenFromCookie(mockCookieCtx)).toBe('cookie-token-123');

    const mockBearerCtx = {
      req: {
        raw: { headers: new Headers() },
        header: (name: string) =>
          name.toLowerCase() === 'authorization' ? 'Bearer bearer-token-456' : undefined,
      },
    } as unknown as Context;

    expect(getSessionTokenFromCookie(mockBearerCtx)).toBe('bearer-token-456');
  });
});
