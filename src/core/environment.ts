/**
 * Environment Utilities
 *
 * Safe environment detection and feature flags.
 * Prevents accidental production operations in non-production environments.
 */

export type Environment = 'development' | 'staging' | 'production';

/**
 * Parse and validate the ENVIRONMENT variable.
 */
export function getEnvironment(envValue: string | undefined): Environment {
  const valid: Environment[] = ['development', 'staging', 'production'];
  const env = (envValue ?? 'development') as Environment;
  if (!valid.includes(env)) {
    console.warn(`[ENV] Unknown environment "${envValue}", defaulting to "development"`);
    return 'development';
  }
  return env;
}

/**
 * Check whether Facebook publishing is enabled.
 * Canonical configuration variable: FACEBOOK_PUBLISH_ENABLED.
 *
 * This requires BOTH:
 * 1. FACEBOOK_PUBLISH_ENABLED === 'true'
 * 2. Environment is explicitly 'production'
 *
 * Staging and development can NEVER publish to the real Facebook Page.
 */
export function isFacebookPublishEnabled(
  publishFlag: string | undefined,
  environment: Environment,
): boolean {
  if (environment !== 'production') {
    return false;
  }
  return publishFlag === 'true';
}

/**
 * Check if running in production.
 */
export function isProduction(env: Environment): boolean {
  return env === 'production';
}

/**
 * Check if running in development.
 */
export function isDevelopment(env: Environment): boolean {
  return env === 'development';
}
