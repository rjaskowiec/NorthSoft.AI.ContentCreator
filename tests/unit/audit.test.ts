import { describe, expect, it, vi } from 'vitest';
import { D1AuditLogger, sanitizeDetails, sanitizeStringValue, inferAuditLevel } from '../../src/core/audit';

describe('Audit Log Engine & Security Redaction', () => {
  describe('Sanitization & Security Redaction', () => {
    it('redacts sensitive keys from audit log details', () => {
      const rawDetails = {
        username: 'admin',
        password: 'MySecretPassword123',
        password_hash: 'hash123',
        access_token: 'EAACEdEose0cBA...',
        meta_page_access_token: 'EAACEdEose0cBA...',
        gateway_token: 'secret-gateway-token',
        nested: {
          token: 'secret-token-xyz',
          publicInfo: 'ok',
          resetToken: 'reset-12345',
        },
        safeKey: 'safeValue',
      };

      const sanitized = sanitizeDetails(rawDetails);

      expect(sanitized.username).toBe('admin');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.password_hash).toBe('[REDACTED]');
      expect(sanitized.access_token).toBe('[REDACTED]');
      expect(sanitized.meta_page_access_token).toBe('[REDACTED]');
      expect(sanitized.gateway_token).toBe('[REDACTED]');
      expect(sanitized.safeKey).toBe('safeValue');

      const nested = sanitized.nested as Record<string, string>;
      expect(nested.token).toBe('[REDACTED]');
      expect(nested.resetToken).toBe('[REDACTED]');
      expect(nested.publicInfo).toBe('ok');
    });

    it('redacts sensitive patterns in string values (URLs, Bearer headers, tokens)', () => {
      const urlWithToken = 'https://ai.northsoft.is/admin?resetToken=abc123secret&access_token=EAAC123';
      const bearerHeader = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secretpayload';

      expect(sanitizeStringValue(urlWithToken)).not.toContain('abc123secret');
      expect(sanitizeStringValue(urlWithToken)).not.toContain('EAAC123');
      expect(sanitizeStringValue(urlWithToken)).toContain('resetToken=[REDACTED]');
      expect(sanitizeStringValue(urlWithToken)).toContain('access_token=[REDACTED]');

      expect(sanitizeStringValue(bearerHeader)).toBe('Bearer [REDACTED]');
    });
  });

  describe('Audit Level Inference', () => {
    it('correctly infers level from status or event type', () => {
      expect(inferAuditLevel('AI_RESEARCH_STARTED', 'STARTED')).toBe('INFO');
      expect(inferAuditLevel('AI_RESEARCH_COMPLETED', 'COMPLETED')).toBe('SUCCESS');
      expect(inferAuditLevel('AI_RESEARCH_FAILED', 'FAILED')).toBe('ERROR');
      expect(inferAuditLevel('AI_QUOTA_EXCEEDED', 'DEFERRED')).toBe('WARNING');
      expect(inferAuditLevel('PUBLICATION_FAILED', 'FAILED')).toBe('ERROR');
      expect(inferAuditLevel('PUBLICATION_SUCCEEDED', 'COMPLETED')).toBe('SUCCESS');
      expect(inferAuditLevel('PUBLICATION_RETRY', 'DEFERRED')).toBe('WARNING');
    });
  });

  describe('Fault Isolation (Safe Persistence)', () => {
    it('catches database execution failures safely without throwing', async () => {
      const prepareMock = vi.fn().mockImplementation(() => {
        throw new Error('D1 connection failure');
      });

      const mockDb = { prepare: prepareMock } as unknown as D1Database;
      const logger = new D1AuditLogger(mockDb);

      // Must not throw an unhandled exception
      await expect(
        logger.log({
          eventType: 'AI_RESEARCH_STARTED',
          entityType: 'research_item',
          entityId: 'item-1',
          actor: 'ai',
        }),
      ).resolves.not.toThrow();
    });
  });

  describe('D1 Persistence & Querying', () => {
    it('logs structured events to D1 with level, operation, correlationId, and error details', async () => {
      const runMock = vi.fn().mockResolvedValue({ success: true });
      const bindMock = vi.fn().mockReturnValue({ run: runMock });
      const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

      const mockDb = { prepare: prepareMock } as unknown as D1Database;
      const logger = new D1AuditLogger(mockDb);

      await logger.log({
        eventType: 'AI_RESEARCH_FAILED',
        entityType: 'research_item',
        entityId: 'item-100',
        actor: 'ai',
        level: 'ERROR',
        status: 'FAILED',
        operation: 'Performance Improvements in .NET 11',
        correlationId: 'run-999',
        durationMs: 2840,
        error: {
          code: 'AI_COMPLETION_ERROR',
          message: 'Cloudflare Workers AI returned HTTP 500 Internal Server Error',
          stage: 'Workers AI completion',
          httpStatus: 500,
        },
        details: {
          model: '@cf/meta/llama-3.1-8b-instruct',
        },
      });

      expect(prepareMock).toHaveBeenCalledTimes(1);
      expect(bindMock).toHaveBeenCalledTimes(1);
      const args = bindMock.mock.calls[0] as unknown[];

      // Verify bound columns
      expect(args[1]).toBe('AI_RESEARCH_FAILED');
      expect(args[2]).toBe('research_item');
      expect(args[3]).toBe('item-100');
      expect(args[4]).toBe('ai');
      expect(args[7]).toBe('ERROR');
      expect(args[8]).toBe('Performance Improvements in .NET 11');
      expect(args[9]).toBe('FAILED');
      expect(args[10]).toBe(2840);
      expect(args[11]).toBe('run-999');
      expect(args[12]).toBe('AI_COMPLETION_ERROR');
      expect(args[13]).toBe('Cloudflare Workers AI returned HTTP 500 Internal Server Error');
      expect(args[14]).toBe('Workers AI completion');
      expect(args[15]).toBe(500);
    });
  });
});
