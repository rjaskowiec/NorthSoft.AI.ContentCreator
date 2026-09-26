import { describe, expect, it, vi } from 'vitest';
import { checkRateLimit, recordLoginAttempt } from '../../src/core/auth/rate-limiter';

describe('Brute-Force Rate Limiter', () => {
  it('allows attempts under threshold', async () => {
    const firstMock = vi.fn().mockResolvedValue({ failed_count: 2 });
    const bindMock = vi.fn().mockReturnValue({ first: firstMock });
    const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

    const mockDb = { prepare: prepareMock } as unknown as D1Database;

    const res = await checkRateLimit(mockDb, '127.0.0.1', 'admin', 5, 15);
    expect(res.allowed).toBe(true);
    expect(res.remainingAttempts).toBe(3);
  });

  it('blocks attempts when threshold is reached', async () => {
    const firstMock = vi.fn().mockResolvedValue({ failed_count: 5 });
    const bindMock = vi.fn().mockReturnValue({ first: firstMock });
    const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

    const mockDb = { prepare: prepareMock } as unknown as D1Database;

    const res = await checkRateLimit(mockDb, '127.0.0.1', 'admin', 5, 15);
    expect(res.allowed).toBe(false);
    expect(res.remainingAttempts).toBe(0);
    expect(res.retryAfterSeconds).toBe(900); // 15 mins * 60s
  });

  it('records login attempt to D1', async () => {
    const runMock = vi.fn().mockResolvedValue({ success: true });
    const bindMock = vi.fn().mockReturnValue({ run: runMock });
    const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

    const mockDb = { prepare: prepareMock } as unknown as D1Database;

    await recordLoginAttempt(mockDb, '192.168.1.1', 'testuser', false);

    expect(prepareMock).toHaveBeenCalledTimes(1);
    expect(bindMock).toHaveBeenCalledTimes(1);
    const args = bindMock.mock.calls[0] as unknown[];
    expect(args).toBeDefined();
    expect(args[1]).toBe('192.168.1.1');
    expect(args[2]).toBe('testuser');
    expect(args[4]).toBe(0); // 0 for failure
  });
});
