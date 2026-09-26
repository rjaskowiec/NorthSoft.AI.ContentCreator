/**
 * NorthSoft.AI.ContentCreator — Core Constants & Business Invariants
 *
 * Centralized, immutable constants for AI quotas, publication limits,
 * API contracts, and default settings.
 */

/** Daily AI Neuron Quota Limits */
export const AI_QUOTA = {
  DAILY_TARGET_NEURONS: 5000,
  DAILY_SOFT_LIMIT_NEURONS: 6000,
  DAILY_HARD_LIMIT_NEURONS: 7500,
  WORST_CASE_WORKFLOW_ESTIMATE_NEURONS: 3000,
} as const;

/** Autonomous Content Generation Invariants */
export const CONTENT_INVARIANTS = {
  DEFAULT_MAX_POSTS_PER_DAY: 1,
  DEFAULT_TOPIC_COOLDOWN_DAYS: 7,
  MAX_REGENERATION_ATTEMPTS: 2,
  MAX_PUBLISH_ATTEMPTS: 3,
} as const;

/** Meta Graph API Invariants */
export const META_API = {
  DEFAULT_GRAPH_API_VERSION: 'v19.0',
  READ_GRAPH_API_VERSION: 'v26.0',
  GRAPH_API_BASE_URL: 'https://graph.facebook.com',
} as const;

/** Brand & System Defaults */
export const SYSTEM_DEFAULTS = {
  APPLICATION_NAME: 'NorthSoft AI — Content Creator',
  DEFAULT_TIMEZONE: 'UTC',
  ADMIN_SESSION_TTL_MS: 86400000, // 24 hours
} as const;
