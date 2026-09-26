/**
 * Password Recovery & Management — Unit & Security Tests
 */

import { describe, expect, it, vi } from 'vitest';
import { D1AuditLogger } from '../../src/core/audit.js';
import { generateSalt, hashPassword } from '../../src/core/auth/crypto.js';
import {
  PasswordRecoveryService,
  validateRecoveryEmail,
} from '../../src/services/auth/password-recovery-service.js';
import {
  MockMailGatewayClient,
  NorthSoftMailGatewayClient,
} from '../../src/services/mail/mail-service.js';

describe('NorthSoftMailGatewayClient Unit Tests', () => {
  it('should report error when GATEWAY_TOKEN is missing', async () => {
    const client = new NorthSoftMailGatewayClient({});
    const res = await client.sendEmail({
      to: 'admin@northsoft.is',
      subject: 'Test',
      text: 'Test',
      html: '<p>Test</p>',
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('GATEWAY_TOKEN is not configured');
  });

  it('should make POST request to NorthSoft Mail Gateway when configured', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messageId: 'msg-12345' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new NorthSoftMailGatewayClient({
      GATEWAY_TOKEN: 'valid_gateway_token_xyz',
    });

    const res = await client.sendEmail({
      to: 'admin@northsoft.is',
      subject: 'Reset Password',
      text: 'Reset body',
      html: '<p>Reset body</p>',
    });

    expect(res.success).toBe(true);
    expect(res.messageId).toBe('msg-12345');
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0]![0]).toBe('https://mail.northsoft.is/api/send');

    const headers = mockFetch.mock.calls[0]![1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer valid_gateway_token_xyz');

    const sentBody = JSON.parse(mockFetch.mock.calls[0]![1]?.body as string);
    expect(sentBody.from.email).toBe('no-reply@northsoft.is');
    expect(sentBody.to[0].email).toBe('admin@northsoft.is');
    expect(sentBody.subject).toBe('Reset Password');

    vi.unstubAllGlobals();
  });
});

describe('Email Validation Unit Tests', () => {
  it('should validate valid email addresses', () => {
    expect(validateRecoveryEmail('admin@northsoft.is').valid).toBe(true);
    expect(validateRecoveryEmail('  USER.NAME@Domain.COM  ').normalized).toBe(
      'user.name@domain.com',
    );
  });

  it('should reject missing, empty, or whitespace email addresses', () => {
    expect(validateRecoveryEmail('').valid).toBe(false);
    expect(validateRecoveryEmail('   ').valid).toBe(false);
  });

  it('should reject email header injection or HTML injection', () => {
    expect(validateRecoveryEmail('user@domain.com\r\nBcc: evil@hacker.com').valid).toBe(false);
    expect(validateRecoveryEmail('<script>alert(1)</script>@domain.com').valid).toBe(false);
  });

  it('should reject malformed email formats', () => {
    expect(validateRecoveryEmail('notanemail').valid).toBe(false);
    expect(validateRecoveryEmail('user@').valid).toBe(false);
    expect(validateRecoveryEmail('@domain.com').valid).toBe(false);
  });
});

describe('PasswordRecoveryService Unit Tests', () => {
  const createMockDb = () => {
    const mockUser: {
      id: string;
      username: string;
      email: string | null;
      password_hash: string;
      password_salt: string;
      status: string;
    } = {
      id: 'usr-100',
      username: 'rjaskowiec',
      email: null, // Admin user starts with NULL email by default
      password_hash: '',
      password_salt: '',
      status: 'active',
    };

    const tokens: Array<{
      id: string;
      admin_user_id: string;
      token_hash: string;
      expires_at: string;
      used_at: string | null;
    }> = [];

    const sessions: Array<{
      id: string;
      admin_user_id: string;
      token_hash: string;
      csrf_secret: string;
      expires_at: string;
      revoked_at: string | null;
    }> = [];

    const prepare = vi.fn((sql: string) => {
      return {
        bind: (...args: unknown[]) => ({
          first: async <T>() => {
            if (sql.includes('SELECT email FROM admin_users WHERE id = ?')) {
              return { email: mockUser.email } as unknown as T;
            }
            if (sql.includes('SELECT id, username, password_hash')) {
              return mockUser as unknown as T;
            }
            if (sql.includes('SELECT id, username, email, status FROM admin_users')) {
              const emailArg = String(args[0]).toLowerCase();
              if (mockUser.email && emailArg === mockUser.email.toLowerCase()) {
                return mockUser as unknown as T;
              }
              return null as unknown as T;
            }
            if (sql.includes('FROM admin_password_reset_tokens')) {
              const hashArg = String(args[0]);
              const found = tokens.find((t) => t.token_hash === hashArg);
              if (found) {
                return {
                  token_id: found.id,
                  admin_user_id: found.admin_user_id,
                  expires_at: found.expires_at,
                  used_at: found.used_at,
                  username: mockUser.username,
                  user_status: mockUser.status,
                } as unknown as T;
              }
              return null as unknown as T;
            }
            return null as unknown as T;
          },
          run: async () => {
            if (sql.includes('UPDATE admin_users SET email = ?')) {
              mockUser.email = String(args[0]);
              return { success: true, meta: { changes: 1 } };
            }
            if (sql.includes('INSERT INTO admin_password_reset_tokens')) {
              tokens.push({
                id: String(args[0]),
                admin_user_id: String(args[1]),
                token_hash: String(args[2]),
                expires_at: String(args[3]),
                used_at: null,
              });
              return { success: true, meta: { changes: 1 } };
            }
            if (sql.includes('UPDATE admin_password_reset_tokens SET used_at = ?')) {
              const usedAt = String(args[0]);
              const id = String(args[1]);
              const token = tokens.find((t) => t.id === id && t.used_at === null);
              if (token) {
                token.used_at = usedAt;
                return { success: true, meta: { changes: 1 } };
              }
              return { success: true, meta: { changes: 0 } };
            }
            if (sql.includes('UPDATE admin_users SET password_hash = ?')) {
              mockUser.password_hash = String(args[0]);
              mockUser.password_salt = String(args[1]);
              return { success: true, meta: { changes: 1 } };
            }
            if (sql.includes('INSERT INTO admin_sessions')) {
              sessions.push({
                id: String(args[0]),
                admin_user_id: String(args[1]),
                token_hash: String(args[2]),
                csrf_secret: String(args[3]),
                expires_at: String(args[4]),
                revoked_at: null,
              });
              return { success: true, meta: { changes: 1 } };
            }
            if (sql.includes('UPDATE admin_sessions SET revoked_at')) {
              const userId = String(args[0]);
              sessions.forEach((s) => {
                if (s.admin_user_id === userId) s.revoked_at = new Date().toISOString();
              });
              return { success: true, meta: { changes: sessions.length } };
            }
            return { success: true, meta: { changes: 1 } };
          },
        }),
      };
    });

    return {
      db: { prepare } as unknown as D1Database,
      mockUser,
      tokens,
      sessions,
    };
  };

  it('should default to email = NULL for newly provisioned admin and report configured: false', async () => {
    const { db, mockUser } = createMockDb();
    expect(mockUser.email).toBeNull();

    const mockMail = new MockMailGatewayClient();
    const mockAudit = { log: vi.fn(), query: vi.fn() } as unknown as D1AuditLogger;
    const service = new PasswordRecoveryService(db, mockMail, mockAudit);

    const status = await service.getRecoveryEmail(mockUser.id);
    expect(status.configured).toBe(false);
    expect(status.email).toBeNull();
  });

  it('should update recovery email when authenticated admin saves valid email in D1', async () => {
    const { db, mockUser } = createMockDb();
    const mockMail = new MockMailGatewayClient();
    const mockAudit = { log: vi.fn(), query: vi.fn() } as unknown as D1AuditLogger;
    const service = new PasswordRecoveryService(db, mockMail, mockAudit);

    const res = await service.updateRecoveryEmail({
      userId: mockUser.id,
      email: '  rjaskowiec@northsoft.is  ',
      clientIp: '127.0.0.1',
    });

    expect(res.success).toBe(true);
    expect(res.email).toBe('rjaskowiec@northsoft.is');
    expect(mockUser.email).toBe('rjaskowiec@northsoft.is');

    const status = await service.getRecoveryEmail(mockUser.id);
    expect(status.configured).toBe(true);
    expect(status.email).toBe('rjaskowiec@northsoft.is');

    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'ADMIN_RECOVERY_EMAIL_UPDATED',
        actor: 'admin',
      }),
    );
  });

  it('should NEVER send email or generate token when admin_users.email is NULL (No fallback recipient)', async () => {
    const { db, mockUser, tokens } = createMockDb();
    expect(mockUser.email).toBeNull();

    const mockMail = new MockMailGatewayClient();
    const mockAudit = { log: vi.fn(), query: vi.fn() } as unknown as D1AuditLogger;
    const service = new PasswordRecoveryService(db, mockMail, mockAudit);

    // Request reset when email IS NULL
    const res = await service.requestPasswordReset({
      email: 'admin@northsoft.is',
      clientIp: '1.2.3.4',
    });

    // 1. Account enumeration protection: Generic HTTP 200 response
    expect(res.success).toBe(true);
    expect(res.message).toBe(
      'If an account matches this information, a password reset email has been sent.',
    );

    // 2. CRITICAL SAFETY: Zero emails sent, zero tokens generated
    expect(mockMail.sentEmails.length).toBe(0);
    expect(tokens.length).toBe(0);

    // 3. Verify zero fallback to hardcoded admin@northsoft.is
    expect(mockMail.sentEmails).toEqual([]);
  });

  it('should generate reset token and call Mail Gateway only after recovery email is configured', async () => {
    const { db, mockUser, tokens } = createMockDb();
    const mockMail = new MockMailGatewayClient();
    const mockAudit = { log: vi.fn(), query: vi.fn() } as unknown as D1AuditLogger;
    const service = new PasswordRecoveryService(db, mockMail, mockAudit);

    // 1. Configure recovery email
    await service.updateRecoveryEmail({
      userId: mockUser.id,
      email: 'configured-admin@northsoft.is',
      clientIp: '127.0.0.1',
    });

    // 2. Request reset
    const res = await service.requestPasswordReset({
      email: 'configured-admin@northsoft.is',
      clientIp: '1.2.3.4',
    });

    expect(res.success).toBe(true);
    expect(tokens.length).toBe(1);
    expect(mockMail.sentEmails.length).toBe(1);
    expect(mockMail.sentEmails[0]!.to).toBe('configured-admin@northsoft.is');
  });

  it('should send reset email to new email after administrator changes recovery email', async () => {
    const { db, mockUser } = createMockDb();
    const mockMail = new MockMailGatewayClient();
    const mockAudit = { log: vi.fn(), query: vi.fn() } as unknown as D1AuditLogger;
    const service = new PasswordRecoveryService(db, mockMail, mockAudit);

    // Initial email
    await service.updateRecoveryEmail({
      userId: mockUser.id,
      email: 'old-email@northsoft.is',
      clientIp: '127.0.0.1',
    });

    // Change email
    await service.updateRecoveryEmail({
      userId: mockUser.id,
      email: 'new-email@northsoft.is',
      clientIp: '127.0.0.1',
    });

    await service.requestPasswordReset({
      email: 'new-email@northsoft.is',
      clientIp: '1.2.3.4',
    });

    expect(mockMail.sentEmails.length).toBe(1);
    expect(mockMail.sentEmails[0]!.to).toBe('new-email@northsoft.is');
  });

  it('should change password for authenticated user and invalidate all existing sessions', async () => {
    const { db, mockUser } = createMockDb();
    const salt = generateSalt(16);
    mockUser.password_salt = salt;
    mockUser.password_hash = await hashPassword('OldValidPassword123!', salt);

    const mockMail = new MockMailGatewayClient();
    const mockAudit = { log: vi.fn(), query: vi.fn() } as unknown as D1AuditLogger;
    const service = new PasswordRecoveryService(db, mockMail, mockAudit);

    const result = await service.changePassword({
      userId: mockUser.id,
      currentPassword: 'OldValidPassword123!',
      newPassword: 'BrandNewSecurePass123!',
      confirmPassword: 'BrandNewSecurePass123!',
      clientIp: '127.0.0.1',
    });

    expect(result.success).toBe(true);
    expect(result.message).toBe('Password changed successfully.');
    expect(result.newSession).toBeDefined();

    // Verify password hash updated
    const isNewValid = await hashPassword('BrandNewSecurePass123!', mockUser.password_salt);
    expect(isNewValid).toBe(mockUser.password_hash);

    // Verify audit event
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'ADMIN_PASSWORD_CHANGED',
        actor: 'admin',
      }),
    );
  });

  it('should reset password with valid single-use token and reject reused or expired tokens', async () => {
    const { db, mockUser, tokens } = createMockDb();
    const mockMail = new MockMailGatewayClient();
    const mockAudit = { log: vi.fn(), query: vi.fn() } as unknown as D1AuditLogger;
    const service = new PasswordRecoveryService(db, mockMail, mockAudit);

    // Configure email first
    await service.updateRecoveryEmail({
      userId: mockUser.id,
      email: 'admin@northsoft.is',
      clientIp: '127.0.0.1',
    });

    // Request reset
    await service.requestPasswordReset({
      email: 'admin@northsoft.is',
      clientIp: '1.2.3.4',
    });

    expect(tokens.length).toBe(1);
    const createdTokenRow = tokens[0]!;

    const emailBody = mockMail.sentEmails[0]!.text;
    const match = emailBody.match(/resetToken=([a-f0-9]+)/);
    expect(match).not.toBeNull();
    const rawToken = match![1]!;

    // 1. Valid reset execution
    const resetRes = await service.resetPassword({
      token: rawToken,
      newPassword: 'MyNewResetPassword2026!#',
      confirmPassword: 'MyNewResetPassword2026!#',
      clientIp: '1.2.3.4',
    });

    expect(resetRes.success).toBe(true);
    expect(resetRes.message).toContain('Password reset successfully.');
    expect(createdTokenRow.used_at).not.toBeNull();

    // 2. Attempt reuse of same token (must fail)
    const reuseRes = await service.resetPassword({
      token: rawToken,
      newPassword: 'AnotherPassword2026!#',
      confirmPassword: 'AnotherPassword2026!#',
      clientIp: '1.2.3.4',
    });

    expect(reuseRes.success).toBe(false);
    expect(reuseRes.message).toBe('This password reset link is invalid or has expired.');
  });
});
