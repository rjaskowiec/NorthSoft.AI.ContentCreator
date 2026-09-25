import { describe, expect, it, vi } from 'vitest';
import { app } from '../../src/index';
import { generateSalt, hashPassword } from '../../src/core/auth/crypto';

interface ApiErrorResponse {
  error: string;
  message?: string;
}

interface LoginSuccessResponse {
  success: boolean;
  user: {
    id: string;
    username: string;
    status: string;
  };
  csrfToken: string;
}

interface SessionCheckResponse {
  authenticated: boolean;
  user?: {
    username: string;
  };
}

describe('Auth API Integration', () => {
  it('handles login with missing fields', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as ApiErrorResponse;
    expect(data.error).toBe('Bad Request');
  });

  it('rejects invalid credentials with generic error message', async () => {
    const runMock = vi.fn().mockResolvedValue({ success: true });
    const firstMock = vi.fn().mockResolvedValue(null); // User not found
    const bindMock = vi.fn().mockReturnValue({ first: firstMock, run: runMock });
    const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

    const mockEnv = {
      DB: { prepare: prepareMock } as unknown as D1Database,
      ENVIRONMENT: 'staging',
      META_PUBLISH_ENABLED: 'false',
      LOG_LEVEL: 'debug',
    };

    const res = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'nonexistent', password: 'wrongpassword123' }),
      },
      mockEnv,
    );

    expect(res.status).toBe(401);
    const data = (await res.json()) as ApiErrorResponse;
    expect(data.error).toBe('Unauthorized');
    expect(data.message).toBe('Invalid credentials.');
  });

  it('logs in successfully with valid credentials and sets HttpOnly cookie', async () => {
    const password = 'SuperValidPassword123!';
    const salt = generateSalt(16);
    const hash = await hashPassword(password, salt, 60000);

    const userRow = {
      id: 'user-001',
      username: 'rjaskowiec',
      password_hash: hash,
      password_salt: salt,
      status: 'active',
    };

    const runMock = vi.fn().mockResolvedValue({ success: true });

    const prepareMock = vi.fn((sql: string) => {
      if (sql.includes('login_attempts')) {
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ failed_count: 0 }),
            run: runMock,
          }),
        };
      }
      if (sql.includes('SELECT id, username')) {
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(userRow),
          }),
        };
      }
      return {
        bind: vi.fn().mockReturnValue({ run: runMock }),
      };
    });

    const mockEnv = {
      DB: { prepare: prepareMock } as unknown as D1Database,
      ENVIRONMENT: 'staging',
      META_PUBLISH_ENABLED: 'false',
      LOG_LEVEL: 'debug',
    };

    const res = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'rjaskowiec', password }),
      },
      mockEnv,
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as LoginSuccessResponse;
    expect(data.success).toBe(true);
    expect(data.user.username).toBe('rjaskowiec');
    expect(data.csrfToken).toBeDefined();

    // Verify HttpOnly cookie header
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain('admin_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
  });

  it('returns authenticated status false when session cookie is missing', async () => {
    const res = await app.request('/api/auth/session');
    expect(res.status).toBe(200);
    const data = (await res.json()) as SessionCheckResponse;
    expect(data.authenticated).toBe(false);
  });
});
