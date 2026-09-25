/**
 * Facebook Graph API Publisher Implementation
 *
 * Implements IMetaPublisher using the official Meta Graph API v19.0+.
 *
 * Rules:
 * - NO AI calls, NO quality checks (handled upstream by Quality Gate).
 * - NO hardcoded access tokens or Page IDs (loaded strictly from Cloudflare env bindings).
 * - Safe fallback state META_NOT_CONFIGURED when credentials are missing or disabled.
 * - Sanitizes all error messages to ensure access tokens are never logged or exposed.
 * - Differentiates retryable (429, 5xx, network timeout) vs non-retryable (400, 401, 403) errors.
 */

import { META_API } from '../core/constants.js';
import { getEnvironment, isMetaPublishEnabled, type Environment } from '../core/environment.js';
import type {
  FacebookPublishRequest,
  FacebookPublishResult,
  IMetaPublisher,
  MetaErrorCategory,
  MetaPublisherConfigStatus,
  PublisherReadinessState,
  TokenValidationResult,
} from './meta-publisher.js';

export interface FacebookPublisherEnv {
  META_PAGE_ID?: string;
  META_PAGE_ACCESS_TOKEN?: string;
  META_GRAPH_API_VERSION?: string;
  META_PUBLISH_ENABLED?: string | boolean;
  FACEBOOK_PUBLISH_ENABLED?: string | boolean;
  ENVIRONMENT?: string;
}

/**
 * Strips any access tokens, bearer tokens, or secret parameters from error strings.
 */
export function sanitizeSecretTokens(text: string): string {
  if (!text) return '';
  return text
    .replace(/(access_token=)[^&"\s]+/gi, '$1[REDACTED]')
    .replace(/(Bearer\s+)[a-zA-Z0-9._~+/-]+=*/gi, '$1[REDACTED]')
    .replace(/("access_token"\s*:\s*")[^"]+"/gi, '$1[REDACTED]"');
}

/**
 * Maps Meta Graph API HTTP statuses and error codes to normalized system categories.
 */
export function normalizeMetaErrorCategory(
  httpStatus?: number,
  code?: number,
  message?: string,
): { category: MetaErrorCategory; isRetryable: boolean } {
  // 1. Authentication errors (Invalid / expired OAuth token, invalid signature)
  if (code === 190 || code === 102 || code === 10 || httpStatus === 401) {
    return { category: 'AUTHENTICATION_ERROR', isRetryable: false };
  }

  // 2. Authorization errors (Permission error, restricted page, insufficient scopes)
  if ((code !== undefined && code >= 200 && code <= 299) || code === 100 || httpStatus === 403) {
    return { category: 'AUTHORIZATION_ERROR', isRetryable: false };
  }

  // 3. Rate limiting (User request limit reached, page rate limit)
  if (code === 4 || code === 17 || code === 32 || code === 613 || httpStatus === 429) {
    return { category: 'RATE_LIMITED', isRetryable: true };
  }

  // 4. Invalid request (Malformed parameters, unsupported format)
  if (httpStatus === 400) {
    return { category: 'INVALID_REQUEST', isRetryable: false };
  }

  // 5. Remote server error (Meta API internal error / temporary outage)
  if (code === 1 || code === 2 || (httpStatus !== undefined && httpStatus >= 500)) {
    return { category: 'REMOTE_SERVER_ERROR', isRetryable: true };
  }

  // 6. Network error
  if (
    message &&
    (message.includes('Network') ||
      message.includes('fetch') ||
      message.includes('timeout') ||
      message.includes('ECONNRESET'))
  ) {
    return { category: 'NETWORK_ERROR', isRetryable: true };
  }

  return { category: 'UNKNOWN_EXTERNAL_ERROR', isRetryable: false };
}

export class FacebookPublisher implements IMetaPublisher {
  private pageId: string;
  private accessToken: string;
  private apiVersion: string;
  private publishEnabled: boolean;
  private environmentName: Environment;
  private lastErrorCategory?: MetaErrorCategory;

  constructor(env: FacebookPublisherEnv) {
    this.pageId = (env.META_PAGE_ID || '').trim();
    this.accessToken = (env.META_PAGE_ACCESS_TOKEN || '').trim();
    this.apiVersion = (env.META_GRAPH_API_VERSION || META_API.DEFAULT_GRAPH_API_VERSION).trim();
    this.environmentName = getEnvironment(env.ENVIRONMENT);

    const rawEnabled = env.META_PUBLISH_ENABLED ?? env.FACEBOOK_PUBLISH_ENABLED;
    const rawBool = rawEnabled === true || rawEnabled === 'true' || rawEnabled === '1';

    // If ENVIRONMENT binding is explicitly passed, enforce non-production disable safety.
    if (env.ENVIRONMENT !== undefined) {
      this.publishEnabled = isMetaPublishEnabled(rawBool ? 'true' : 'false', this.environmentName);
    } else {
      this.publishEnabled = rawBool;
    }
  }

  public getConfigStatus(): MetaPublisherConfigStatus {
    const pageIdConfigured = this.pageId.length > 0;
    const tokenConfigured = this.accessToken.length > 0;

    let state: PublisherReadinessState;
    let statusMessage: string;

    if (!pageIdConfigured && !tokenConfigured) {
      state = 'NOT_CONFIGURED';
      statusMessage = 'NOT CONFIGURED: Missing META_PAGE_ID and META_PAGE_ACCESS_TOKEN.';
    } else if (!pageIdConfigured) {
      state = 'NOT_CONFIGURED';
      statusMessage = 'NOT CONFIGURED: Missing META_PAGE_ID.';
    } else if (!tokenConfigured) {
      state = 'NOT_CONFIGURED';
      statusMessage = 'NOT CONFIGURED: Missing META_PAGE_ACCESS_TOKEN.';
    } else if (!this.publishEnabled) {
      state = 'DISABLED';
      if (this.environmentName !== 'production') {
        statusMessage = `DISABLED: Facebook publishing is disabled in ${this.environmentName} environment (ENVIRONMENT !== production).`;
      } else {
        statusMessage =
          'DISABLED: Meta credentials exist but META_PUBLISH_ENABLED is set to false.';
      }
    } else if (
      this.lastErrorCategory === 'RATE_LIMITED' ||
      this.lastErrorCategory === 'REMOTE_SERVER_ERROR'
    ) {
      state = 'DEGRADED';
      statusMessage = `DEGRADED: Facebook publishing is enabled but temporary operational degradation was reported (${this.lastErrorCategory}).`;
    } else {
      state = 'READY';
      statusMessage = 'READY: Facebook publishing is fully configured, enabled, and operational.';
    }

    const configured = state === 'READY' || state === 'DEGRADED';

    return {
      state,
      statusMessage,
      configured,
      pageIdConfigured,
      tokenConfigured,
      apiVersion: this.apiVersion,
      publishEnabled: this.publishEnabled,
      lastErrorCategory: this.lastErrorCategory,
    };
  }

  public async healthCheck(): Promise<boolean> {
    const status = this.getConfigStatus();
    return status.configured;
  }

  public async validateToken(): Promise<TokenValidationResult> {
    const status = this.getConfigStatus();
    if (!status.tokenConfigured) {
      return {
        valid: false,
        error: 'META_TOKEN_MISSING: Access token is not configured.',
      };
    }

    try {
      const url = `${META_API.GRAPH_API_BASE_URL}/${this.apiVersion}/debug_token?input_token=${encodeURIComponent(this.accessToken)}&access_token=${encodeURIComponent(this.accessToken)}`;
      const res = await fetch(url, { method: 'GET' });
      const data = (await res.json()) as {
        data?: {
          is_valid?: boolean;
          expires_at?: number;
          scopes?: string[];
          profile_id?: string;
        };
        error?: { message?: string };
      };

      if (!res.ok || data.error) {
        return {
          valid: false,
          error: sanitizeSecretTokens(data.error?.message || `HTTP ${res.status}`),
        };
      }

      const info = data.data;
      return {
        valid: info?.is_valid === true,
        expiresAt: info?.expires_at ? new Date(info.expires_at * 1000).toISOString() : undefined,
        scopes: info?.scopes || [],
        pageId: info?.profile_id,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        valid: false,
        error: sanitizeSecretTokens(`Token validation request failed: ${errorMsg}`),
      };
    }
  }

  public async publish(request: FacebookPublishRequest): Promise<FacebookPublishResult> {
    const config = this.getConfigStatus();

    if (config.state === 'NOT_CONFIGURED') {
      return {
        success: false,
        errorCode: 'META_NOT_CONFIGURED',
        errorCategory: 'UNKNOWN_EXTERNAL_ERROR',
        errorMessage:
          'Facebook publishing is not configured (missing Page ID or Page Access Token).',
        retryable: false,
      };
    }

    if (config.state === 'DISABLED') {
      return {
        success: false,
        errorCode: 'META_PUBLISH_DISABLED',
        errorCategory: 'UNKNOWN_EXTERNAL_ERROR',
        errorMessage:
          'Facebook publishing is disabled in environment settings (META_PUBLISH_ENABLED is false).',
        retryable: false,
      };
    }

    const graphUrl = `${META_API.GRAPH_API_BASE_URL}/${this.apiVersion}/${this.pageId}/feed`;

    try {
      const bodyParams: Record<string, string> = {
        message: request.message,
        access_token: this.accessToken,
      };

      if (request.link) {
        bodyParams.link = request.link;
      }

      if (request.scheduledPublishTime) {
        const unixTime = Math.floor(new Date(request.scheduledPublishTime).getTime() / 1000);
        if (!isNaN(unixTime) && unixTime > Math.floor(Date.now() / 1000)) {
          bodyParams.published = 'false';
          bodyParams.scheduled_publish_time = unixTime.toString();
        }
      }

      const response = await fetch(graphUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bodyParams),
      });

      const httpStatus = response.status;
      const data = (await response.json()) as {
        id?: string;
        error?: {
          message?: string;
          type?: string;
          code?: number;
          error_subcode?: number;
          is_transient?: boolean;
        };
      };

      if (response.ok && data.id) {
        this.lastErrorCategory = undefined;
        return {
          success: true,
          externalPostId: data.id,
          publishedAt: new Date().toISOString(),
          httpStatus,
        };
      }

      const metaError = data.error;
      const rawMsg = metaError?.message || `Meta API request failed with status ${httpStatus}`;
      const sanitizedMsg = sanitizeSecretTokens(rawMsg);
      const { category, isRetryable } = normalizeMetaErrorCategory(
        httpStatus,
        metaError?.code,
        rawMsg,
      );
      this.lastErrorCategory = category;

      const errCode = metaError?.code ? `META_ERROR_${metaError.code}` : category;

      return {
        success: false,
        httpStatus,
        errorCode: errCode,
        errorCategory: category,
        errorMessage: sanitizedMsg,
        retryable: isRetryable,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const sanitizedMsg = sanitizeSecretTokens(`Network error calling Meta API: ${errorMsg}`);
      const { category, isRetryable } = normalizeMetaErrorCategory(undefined, undefined, errorMsg);
      this.lastErrorCategory = category;

      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorCategory: category,
        errorMessage: sanitizedMsg,
        retryable: isRetryable,
      };
    }
  }
}
