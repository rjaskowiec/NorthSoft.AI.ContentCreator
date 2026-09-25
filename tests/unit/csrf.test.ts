import type { Context } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { csrfProtection, verifyCsrfToken } from '../../src/core/auth/csrf';
import type { AdminSession } from '../../src/core/auth/session';

describe('CSRF Protection', () => {
  const mockSession: AdminSession = {
    id: 'sess-123',
    admin_user_id: 'user-123',
    token_hash: 'hash',
    csrf_secret: 'valid-csrf-secret-1234567890',
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    created_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    revoked_at: null,
    ip_address: '127.0.0.1',
    user_agent: 'Vitest',
  };

  it('verifies valid CSRF tokens with constant-time equality', () => {
    expect(verifyCsrfToken('valid-csrf-secret-1234567890', 'valid-csrf-secret-1234567890')).toBe(
      true,
    );
    expect(verifyCsrfToken('invalid-secret', 'valid-csrf-secret-1234567890')).toBe(false);
    expect(verifyCsrfToken(null, 'valid-csrf-secret-1234567890')).toBe(false);
    expect(verifyCsrfToken('', 'valid-csrf-secret-1234567890')).toBe(false);
  });

  it('allows safe HTTP methods (GET, HEAD, OPTIONS) without token', async () => {
    const next = vi.fn().mockResolvedValue(new Response('OK'));
    const mockContext = {
      req: { method: 'GET', header: () => undefined },
    } as unknown as Context;

    await csrfProtection(mockContext, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects POST request when session is missing', async () => {
    const next = vi.fn();
    const jsonSpy = vi.fn((data, status) => new Response(JSON.stringify(data), { status }));
    const mockContext = {
      req: { method: 'POST', header: () => undefined },
      get: () => undefined,
      json: jsonSpy,
    } as unknown as Context;

    await csrfProtection(mockContext, next);
    expect(next).not.toHaveBeenCalled();
    expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({ error: 'Forbidden' }), 403);
  });

  it('rejects POST request with missing or invalid CSRF header', async () => {
    const next = vi.fn();
    const jsonSpy = vi.fn((data, status) => new Response(JSON.stringify(data), { status }));
    const mockContext = {
      req: { method: 'POST', header: () => 'wrong-csrf-token' },
      get: () => mockSession,
      json: jsonSpy,
    } as unknown as Context;

    await csrfProtection(mockContext, next);
    expect(next).not.toHaveBeenCalled();
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid or missing CSRF token' }),
      403,
    );
  });

  it('allows POST request with valid CSRF header', async () => {
    const next = vi.fn().mockResolvedValue(new Response('OK'));
    const mockContext = {
      req: {
        method: 'POST',
        header: (name: string) =>
          name.toLowerCase() === 'x-csrf-token' ? 'valid-csrf-secret-1234567890' : undefined,
      },
      get: () => mockSession,
    } as unknown as Context;

    await csrfProtection(mockContext, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
