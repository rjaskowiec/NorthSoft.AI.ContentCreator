import { describe, expect, it, vi } from 'vitest';
import {
  cleanupSignInActivity,
  extractEdgeLocation,
  extractTrustedClientIp,
  formatLocation,
  getRecentSignInActivity,
  recordSignInActivity,
} from '../../src/core/auth/sign-in-activity';
import { renderAdminHtml } from '../../src/admin/ui';

describe('Account Security Sign-in Activity Suite', () => {
  describe('IP Resolution & Anti-Spoofing', () => {
    it('authoritatively prefers CF-Connecting-IP over client-supplied X-Forwarded-For', () => {
      const headers = new Map([
        ['cf-connecting-ip', '203.0.113.50'],
        ['x-forwarded-for', '198.51.100.99, 10.0.0.1'],
      ]);
      const ip = extractTrustedClientIp(headers);
      expect(ip).toBe('203.0.113.50');
    });

    it('falls back to first X-Forwarded-For IP in non-Cloudflare/dev environments', () => {
      const headers = new Map([['x-forwarded-for', '198.51.100.99, 10.0.0.1']]);
      const ip = extractTrustedClientIp(headers);
      expect(ip).toBe('198.51.100.99');
    });

    it('returns Unknown IP when no IP headers are present', () => {
      const headers = new Map();
      const ip = extractTrustedClientIp(headers);
      expect(ip).toBe('Unknown IP');
    });

    it('trims whitespace and ignores empty IP header values', () => {
      const headers = new Map([
        ['cf-connecting-ip', '   '],
        ['x-forwarded-for', '  192.0.2.1  , 10.0.0.2'],
      ]);
      const ip = extractTrustedClientIp(headers);
      expect(ip).toBe('192.0.2.1');
    });
  });

  describe('Approximate Geolocation & Formatting', () => {
    it('formats city and country code into full English location', () => {
      expect(formatLocation('Reykjavík', 'IS')).toBe('Reykjavík, Iceland');
      expect(formatLocation('Warsaw', 'PL')).toBe('Warsaw, Poland');
      expect(formatLocation('New York', 'US')).toBe('New York, United States');
    });

    it('formats country-only location when city is missing', () => {
      expect(formatLocation(null, 'IS')).toBe('Iceland');
      expect(formatLocation('', 'DE')).toBe('Germany');
    });

    it('formats city-only location when country is missing', () => {
      expect(formatLocation('Reykjavík', null)).toBe('Reykjavík');
    });

    it('returns Unknown location when neither city nor country is available', () => {
      expect(formatLocation(null, null)).toBe('Unknown location');
      expect(formatLocation('', '')).toBe('Unknown location');
    });

    it('extracts edge location metadata from Cloudflare raw request', () => {
      const rawReq = {
        cf: {
          city: 'Reykjavík',
          region: 'Capital Region',
          country: 'IS',
        },
      };
      const loc = extractEdgeLocation(rawReq as any);
      expect(loc.city).toBe('Reykjavík');
      expect(loc.region).toBe('Capital Region');
      expect(loc.country).toBe('IS');
    });

    it('falls back to cf-ipcountry header if cf object country is missing', () => {
      const rawReq = { cf: { city: 'Reykjavík' } };
      const headers = new Map([['cf-ipcountry', 'IS']]);
      const loc = extractEdgeLocation(rawReq as any, headers);
      expect(loc.city).toBe('Reykjavík');
      expect(loc.country).toBe('IS');
    });

    it('handles undefined cf request gracefully without throwing', () => {
      const loc = extractEdgeLocation(undefined);
      expect(loc.city).toBeNull();
      expect(loc.region).toBeNull();
      expect(loc.country).toBeNull();
    });
  });

  describe('D1 Database Persistence & Isolation', () => {
    function createMockDb(initialRows: any[] = []) {
      const rows = [...initialRows];
      return {
        rows,
        prepare: vi.fn((sql: string) => {
          return {
            bind: vi.fn((...params: any[]) => {
              return {
                run: vi.fn(async () => {
                  if (sql.includes('INSERT INTO sign_in_activity')) {
                    const [
                      id,
                      userId,
                      username,
                      status,
                      ip,
                      city,
                      region,
                      country,
                      ua,
                      reason,
                      createdAt,
                    ] = params;
                    rows.push({
                      id,
                      admin_user_id: userId,
                      username,
                      status,
                      ip_address: ip,
                      city,
                      region,
                      country,
                      user_agent: ua,
                      failure_reason: reason,
                      created_at: createdAt,
                    });
                  } else if (sql.includes('DELETE FROM sign_in_activity WHERE created_at < ?')) {
                    const cutoff = params[0];
                    const filtered = rows.filter((r) => r.created_at >= cutoff);
                    rows.length = 0;
                    rows.push(...filtered);
                  }
                  return { success: true };
                }),
                all: vi.fn(async () => {
                  if (sql.includes('SELECT')) {
                    const [userId, username, limit] = params;
                    const matched = rows
                      .filter(
                        (r) =>
                          r.admin_user_id === userId ||
                          (!r.admin_user_id && r.username.toLowerCase() === username.toLowerCase()),
                      )
                      .sort((a, b) => (b.created_at > a.created_at ? 1 : -1))
                      .slice(0, limit);
                    return { results: matched };
                  }
                  return { results: [] };
                }),
              };
            }),
          };
        }),
      } as unknown as D1Database & { rows: any[] };
    }

    it('records a successful sign-in activity event with full edge metadata', async () => {
      const db = createMockDb();
      await recordSignInActivity(db, {
        userId: 'user-123',
        username: 'admin',
        status: 'success',
        ipAddress: '203.0.113.10',
        city: 'Reykjavík',
        region: 'Capital Region',
        country: 'IS',
      });

      expect(db.rows).toHaveLength(1);
      expect(db.rows[0].status).toBe('success');
      expect(db.rows[0].admin_user_id).toBe('user-123');
      expect(db.rows[0].username).toBe('admin');
      expect(db.rows[0].ip_address).toBe('203.0.113.10');
      expect(db.rows[0].city).toBe('Reykjavík');
      expect(db.rows[0].country).toBe('IS');
      expect(db.rows[0].created_at).toBeDefined();
    });

    it('records a failed sign-in attempt with failure reason without throwing', async () => {
      const db = createMockDb();
      await recordSignInActivity(db, {
        username: 'admin',
        status: 'failed',
        ipAddress: '198.51.100.25',
        failureReason: 'invalid_credentials',
      });

      expect(db.rows).toHaveLength(1);
      expect(db.rows[0].status).toBe('failed');
      expect(db.rows[0].failure_reason).toBe('invalid_credentials');
      expect(db.rows[0].admin_user_id).toBeNull();
    });

    it('does not throw or disrupt authentication if database insertion fails', async () => {
      const faultyDb = {
        prepare: vi.fn().mockImplementation(() => {
          throw new Error('D1 transient disk error');
        }),
      } as unknown as D1Database;

      // Must resolve cleanly without throwing
      await expect(
        recordSignInActivity(faultyDb, {
          username: 'admin',
          status: 'success',
          ipAddress: '127.0.0.1',
        }),
      ).resolves.not.toThrow();
    });

    it('strictly isolates sign-in activities to the authenticated user account', async () => {
      const db = createMockDb([
        {
          id: 'ev-1',
          admin_user_id: 'user-A',
          username: 'alice',
          status: 'success',
          ip_address: '203.0.113.10',
          city: 'Reykjavík',
          country: 'IS',
          created_at: '2026-10-21T10:00:00Z',
        },
        {
          id: 'ev-2',
          admin_user_id: 'user-B',
          username: 'bob',
          status: 'success',
          ip_address: '198.51.100.5',
          city: 'London',
          country: 'GB',
          created_at: '2026-10-21T11:00:00Z',
        },
        {
          id: 'ev-3',
          admin_user_id: null,
          username: 'alice',
          status: 'failed',
          ip_address: '192.0.2.1',
          failure_reason: 'invalid_credentials',
          created_at: '2026-10-21T12:00:00Z',
        },
      ]);

      // Query as Alice
      const aliceActivities = await getRecentSignInActivity(db, 'user-A', 'alice', 20);
      expect(aliceActivities).toHaveLength(2);
      expect(aliceActivities[0]!.status).toBe('failed');
      expect(aliceActivities[1]!.status).toBe('success');
      expect(aliceActivities[1]!.location).toBe('Reykjavík, Iceland');

      // Query as Bob
      const bobActivities = await getRecentSignInActivity(db, 'user-B', 'bob', 20);
      expect(bobActivities).toHaveLength(1);
      expect(bobActivities[0]!.id).toBe('ev-2');
      expect(bobActivities[0]!.location).toBe('London, United Kingdom');
    });

    it('cleans up entries older than the retention period (90 days)', async () => {
      const now = Date.now();
      const oldDate = new Date(now - 95 * 24 * 3600 * 1000).toISOString();
      const recentDate = new Date(now - 10 * 24 * 3600 * 1000).toISOString();

      const db = createMockDb([
        { id: 'old-1', created_at: oldDate },
        { id: 'recent-1', created_at: recentDate },
      ]);

      await cleanupSignInActivity(db, 90);
      expect(db.rows).toHaveLength(1);
      expect(db.rows[0].id).toBe('recent-1');
    });
  });

  describe('UI Presentation & Elements', () => {
    it('renders Recent Sign-in Activity section inside Account & Security tab', () => {
      const html = renderAdminHtml();
      expect(html).toContain('Recent Sign-in Activity');
      expect(html).toContain('Recent successful and failed sign-in attempts.');
      expect(html).toContain('id="sign-in-activity-container"');
      expect(html).toContain('id="sign-in-activity-loading"');
      expect(html).toContain('id="sign-in-activity-empty"');
      expect(html).toContain('id="sign-in-activity-error"');
      expect(html).toContain('id="sign-in-activity-list"');
      expect(html).toContain('onclick="loadSignInActivity(true)"');
      expect(html).toContain('No recent sign-in activity available.');
    });
  });
});
