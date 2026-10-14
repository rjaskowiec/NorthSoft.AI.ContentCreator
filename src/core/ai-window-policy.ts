/**
 * NorthSoft.AI.ContentCreator — AI Background Execution Window Policy
 *
 * Enforces execution window restrictions for automated AI background jobs
 * (topic discovery, AI writer completion, post draft generation, AI reviews).
 *
 * The Cloudflare Workers AI daily neuron allowance resets at 00:00 UTC, so automated
 * AI work is concentrated right before the reset to use the remaining daily budget.
 *
 * POLICY RULES:
 * 1. AUTOMATED BACKGROUND AI JOBS (triggerType === 'cron' | 'system'):
 *    - Allowed ONLY during the nightly window before 00:00 UTC (22:00–23:45 UTC).
 *    - Outside this window automated AI jobs are deferred safely.
 *
 * 2. MANUAL ADMIN ACTIONS (triggerType === 'manual' | actor === 'admin'):
 *    - Always allowed 24/7 at any time of day.
 *    - NEVER blocked by time window restrictions.
 *
 * 3. NON-AI BACKGROUND JOBS (publishing due posts, scheduling, FB Graph API sync, cleanup):
 *    - Always allowed 24/7 regardless of time window.
 */

export const AI_BACKGROUND_WINDOW = {
  START_HOUR_UTC: 20,
  START_MINUTE_UTC: 0,
  END_HOUR_UTC: 23,
  END_MINUTE_UTC: 45,
};

export const AI_BACKGROUND_WINDOW_LABEL = '20:00–23:45 UTC';

/**
 * Checks whether the specified Date (or current time) is within the allowed AI background execution window.
 */
export function isWithinAiBackgroundWindow(nowDate: Date = new Date()): boolean {
  const currentMinuteOfDay = nowDate.getUTCHours() * 60 + nowDate.getUTCMinutes();
  const startMinuteOfDay = AI_BACKGROUND_WINDOW.START_HOUR_UTC * 60 + AI_BACKGROUND_WINDOW.START_MINUTE_UTC;
  const endMinuteOfDay = AI_BACKGROUND_WINDOW.END_HOUR_UTC * 60 + AI_BACKGROUND_WINDOW.END_MINUTE_UTC;
  return currentMinuteOfDay >= startMinuteOfDay && currentMinuteOfDay <= endMinuteOfDay;
}

/**
 * Returns the start of the current window if inside it, otherwise the start of the next window.
 */
export function getNextAiWindowStart(nowDate: Date = new Date()): Date {
  const start = new Date(Date.UTC(
    nowDate.getUTCFullYear(),
    nowDate.getUTCMonth(),
    nowDate.getUTCDate(),
    AI_BACKGROUND_WINDOW.START_HOUR_UTC,
    AI_BACKGROUND_WINDOW.START_MINUTE_UTC,
  ));
  if (isWithinAiBackgroundWindow(nowDate)) return start;
  if (nowDate.getTime() >= start.getTime()) {
    start.setUTCDate(start.getUTCDate() + 1);
  }
  return start;
}

/**
 * Determines if an AI operation is permitted to execute based on triggerType and timestamp.
 * Returns true if the call is manual (admin triggered) OR within the AI background window.
 */
export function isAiExecutionPermitted(triggerType: string, nowDate: Date = new Date()): boolean {
  const trig = (triggerType || '').toLowerCase().trim();
  if (trig === 'manual' || trig === 'admin' || trig === 'user') {
    return true;
  }
  return isWithinAiBackgroundWindow(nowDate);
}
