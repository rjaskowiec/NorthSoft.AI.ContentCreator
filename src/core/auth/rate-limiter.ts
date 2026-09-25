/**
 * NorthSoft.AI.ContentCreator — Brute-Force Rate Limiter
 *
 * Prevents brute-force login attempts using D1 database tracking.
 * Compatible with Cloudflare Free limits and zero external dependencies.
 */

export interface RateLimitStatus {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSeconds: number;
}

export const DEFAULT_MAX_ATTEMPTS = 5;
export const DEFAULT_WINDOW_MINUTES = 15;

/**
 * Checks if login attempts from an IP address or for a username exceed allowed threshold.
 */
export async function checkRateLimit(
  db: D1Database,
  ipAddress: string,
  username: string,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  windowMinutes = DEFAULT_WINDOW_MINUTES,
): Promise<RateLimitStatus> {
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  // Count failed attempts by IP or username in recent window
  const result = await db
    .prepare(
      `SELECT COUNT(*) as failed_count 
       FROM login_attempts 
       WHERE success = 0 
         AND (ip_address = ? OR username = ?) 
         AND attempted_at >= ?`,
    )
    .bind(ipAddress, username.toLowerCase(), windowStart)
    .first<{ failed_count: number }>();

  const failedCount = result?.failed_count ?? 0;

  if (failedCount >= maxAttempts) {
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterSeconds: windowMinutes * 60,
    };
  }

  return {
    allowed: true,
    remainingAttempts: maxAttempts - failedCount,
    retryAfterSeconds: 0,
  };
}

/**
 * Records a login attempt (success or failure) in D1.
 */
export async function recordLoginAttempt(
  db: D1Database,
  ipAddress: string,
  username: string,
  success: boolean,
): Promise<void> {
  const attemptId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO login_attempts (id, ip_address, username, attempted_at, success)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(attemptId, ipAddress, username.toLowerCase(), nowIso, success ? 1 : 0)
    .run();
}

/**
 * Cleanup old login attempt entries to prevent table bloat.
 */
export async function cleanupLoginAttempts(db: D1Database, hours = 24): Promise<void> {
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  await db
    .prepare('DELETE FROM login_attempts WHERE attempted_at < ?')
    .bind(cutoff)
    .run()
    .catch(() => {
      // Ignore cleanup error
    });
}
