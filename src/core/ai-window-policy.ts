/**
 * NorthSoft.AI.ContentCreator — AI Background Execution Window Policy
 *
 * Enforces execution window restrictions for automated AI background jobs
 * (topic discovery, AI writer completion, post draft generation, AI reviews).
 *
 * POLICY RULES:
 * 1. AUTOMATED BACKGROUND AI JOBS (triggerType === 'cron' | 'system'):
 *    - Allowed ONLY during the evening window before 00:00 UTC (18:00–23:30 UTC).
 *    - Outside this window (00:00–17:59 UTC, 23:31–23:59 UTC), automated AI jobs are deferred safely.
 *
 * 2. MANUAL ADMIN ACTIONS (triggerType === 'manual' | actor === 'admin'):
 *    - Always allowed 24/7 at any time of day (04:00, 12:00, 17:00, 23:59 UTC, etc.).
 *    - NEVER blocked by time window restrictions.
 *
 * 3. NON-AI BACKGROUND JOBS (publishing due posts, FB Graph API sync, cleanup):
 *    - Always allowed 24/7 regardless of time window.
 */

export const AI_BACKGROUND_WINDOW = {
  START_HOUR_UTC: 18,
  START_MINUTE_UTC: 0,
  END_HOUR_UTC: 23,
  END_MINUTE_UTC: 30,
};

/**
 * Checks whether the specified Date (or current time) is within the allowed AI background execution window (18:00–23:30 UTC).
 */
export function isWithinAiBackgroundWindow(nowDate: Date = new Date()): boolean {
  const hours = nowDate.getUTCHours();
  const mins = nowDate.getUTCMinutes();
  const currentMinuteOfDay = hours * 60 + mins;

  const startMinuteOfDay = AI_BACKGROUND_WINDOW.START_HOUR_UTC * 60 + AI_BACKGROUND_WINDOW.START_MINUTE_UTC; // 18:00 -> 1080
  const endMinuteOfDay = AI_BACKGROUND_WINDOW.END_HOUR_UTC * 60 + AI_BACKGROUND_WINDOW.END_MINUTE_UTC;       // 23:30 -> 1410

  return currentMinuteOfDay >= startMinuteOfDay && currentMinuteOfDay <= endMinuteOfDay;
}

/**
 * Determines if an AI operation is permitted to execute based on triggerType and timestamp.
 * Returns true if the call is manual (admin triggered) OR within the AI background window (18:00–23:30 UTC).
 */
export function isAiExecutionPermitted(triggerType: string, nowDate: Date = new Date()): boolean {
  const trig = (triggerType || '').toLowerCase().trim();
  if (trig === 'manual' || trig === 'admin' || trig === 'user') {
    return true;
  }
  return isWithinAiBackgroundWindow(nowDate);
}
