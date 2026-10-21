/**
 * NorthSoft.AI.ContentCreator — Account Security Sign-in Activity
 *
 * Records and retrieves recent sign-in attempts with trusted client IP and
 * edge-derived approximate geolocation (Cloudflare edge metadata).
 *
 * Privacy-conscious & bounded retention to prevent storage bloat.
 */

export interface SignInActivityItem {
  id: string;
  status: 'success' | 'failed';
  ipAddress: string;
  location: string;
  city: string | null;
  region: string | null;
  country: string | null;
  timestamp: string;
  failureReason: string | null;
}

export interface RecordSignInParams {
  userId?: string | null;
  username: string;
  status: 'success' | 'failed';
  ipAddress: string;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  userAgent?: string | null;
  failureReason?: string | null;
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

/**
 * Formats approximate location safely into human-readable string.
 * Example: "Reykjavík, Iceland", "Iceland", or "Unknown location".
 */
export function formatLocation(
  city?: string | null,
  countryCode?: string | null,
  region?: string | null,
): string {
  let countryName: string | null = null;
  if (countryCode && /^[a-zA-Z]{2}$/.test(countryCode.trim())) {
    try {
      countryName =
        regionNames.of(countryCode.trim().toUpperCase()) || countryCode.trim().toUpperCase();
    } catch {
      countryName = countryCode.trim().toUpperCase();
    }
  } else if (countryCode && countryCode.trim() !== '') {
    countryName = countryCode.trim();
  }

  const trimmedCity = city?.trim();
  if (trimmedCity && countryName) {
    return `${trimmedCity}, ${countryName}`;
  }
  if (trimmedCity) {
    return trimmedCity;
  }
  if (countryName) {
    return countryName;
  }
  if (region && region.trim() !== '') {
    return region.trim();
  }
  return 'Unknown location';
}

/**
 * Extracts trusted client IP.
 * Prioritizes CF-Connecting-IP (set by Cloudflare proxy, non-forgeable).
 * Only falls back to X-Forwarded-For if CF-Connecting-IP is absent (e.g. local dev).
 */
export function extractTrustedClientIp(headers: {
  get(name: string): string | null | undefined;
}): string {
  const cfConnectingIp = headers.get('cf-connecting-ip');
  if (cfConnectingIp && cfConnectingIp.trim() !== '') {
    return cfConnectingIp.trim();
  }

  const xForwardedFor = headers.get('x-forwarded-for');
  if (xForwardedFor && xForwardedFor.trim() !== '') {
    const firstIp = xForwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }

  return 'Unknown IP';
}

/**
 * Extracts approximate location metadata from Cloudflare Worker request context.
 */
export function extractEdgeLocation(
  rawRequest?: Request | { cf?: Record<string, unknown> },
  headers?: { get(name: string): string | null | undefined },
): {
  city: string | null;
  region: string | null;
  country: string | null;
} {
  const cf = (rawRequest as any)?.cf;
  const city = typeof cf?.city === 'string' && cf.city.trim() !== '' ? cf.city.trim() : null;
  const region =
    typeof cf?.region === 'string' && cf.region.trim() !== '' ? cf.region.trim() : null;

  let country =
    typeof cf?.country === 'string' && cf.country.trim() !== '' ? cf.country.trim() : null;
  if (!country && headers) {
    const headerCountry = headers.get('cf-ipcountry');
    if (headerCountry && headerCountry.trim() !== '' && headerCountry.trim() !== 'XX') {
      country = headerCountry.trim();
    }
  }

  return { city, region, country };
}

/**
 * Authoritatively records a sign-in attempt (success or failure) in D1.
 * Fault-tolerant: database insertion errors will not throw or break the login flow.
 */
export async function recordSignInActivity(
  db: D1Database,
  params: RecordSignInParams,
): Promise<void> {
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const normalizedUsername = params.username.trim().toLowerCase();

  try {
    await db
      .prepare(
        `INSERT INTO sign_in_activity (
           id, admin_user_id, username, status, ip_address, city, region, country, user_agent, failure_reason, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        params.userId || null,
        normalizedUsername,
        params.status,
        params.ipAddress || 'Unknown IP',
        params.city || null,
        params.region || null,
        params.country || null,
        params.userAgent || null,
        params.failureReason || null,
        nowIso,
      )
      .run();
  } catch (err) {
    // Non-blocking: log warning but never reject valid authentication due to activity logging failure
    console.warn('[SignInActivity] Failed to persist sign-in activity:', err);
  }
}

/**
 * Retrieves recent sign-in activity strictly isolated to the authenticated user.
 */
export async function getRecentSignInActivity(
  db: D1Database,
  userId: string,
  username: string,
  limit = 20,
): Promise<SignInActivityItem[]> {
  const boundedLimit = Math.max(1, Math.min(limit, 50));
  const normalizedUsername = username.trim().toLowerCase();

  try {
    const result = await db
      .prepare(
        `SELECT id, status, ip_address, city, region, country, created_at, failure_reason
         FROM sign_in_activity
         WHERE admin_user_id = ? OR (admin_user_id IS NULL AND username = ?)
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(userId, normalizedUsername, boundedLimit)
      .all<{
        id: string;
        status: string;
        ip_address: string;
        city: string | null;
        region: string | null;
        country: string | null;
        created_at: string;
        failure_reason: string | null;
      }>();

    if (!result.results || result.results.length === 0) {
      return [];
    }

    return result.results.map((row) => ({
      id: row.id,
      status: row.status === 'success' ? 'success' : 'failed',
      ipAddress: row.ip_address || 'Unknown IP',
      location: formatLocation(row.city, row.country, row.region),
      city: row.city,
      region: row.region,
      country: row.country,
      timestamp: row.created_at,
      failureReason: row.failure_reason,
    }));
  } catch (err) {
    console.warn('[SignInActivity] Failed to fetch sign-in activity:', err);
    return [];
  }
}

/**
 * Bounded retention cleanup: deletes entries older than retention period (default 90 days).
 */
export async function cleanupSignInActivity(db: D1Database, retentionDays = 90): Promise<void> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000).toISOString();
  try {
    await db.prepare('DELETE FROM sign_in_activity WHERE created_at < ?').bind(cutoff).run();
  } catch {
    // Ignore cleanup errors
  }
}
