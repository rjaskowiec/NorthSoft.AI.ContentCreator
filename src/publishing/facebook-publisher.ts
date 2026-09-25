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
import type {
  FacebookPublishRequest,
  FacebookPublishResult,
  IMetaPublisher,
  MetaPublisherConfigStatus,
  TokenValidationResult,
} from './meta-publisher.js';

export interface FacebookPublisherEnv {
  META_PAGE_ID?: string;
  META_PAGE_ACCESS_TOKEN?: string;
  META_GRAPH_API_VERSION?: string;
  META_PUBLISH_ENABLED?: string | boolean;
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

export class FacebookPublisher implements IMetaPublisher {
  private pageId: string;
  private accessToken: string;
  private apiVersion: string;
  private publishEnabled: boolean;

  constructor(env: FacebookPublisherEnv) {
    this.pageId = (env.META_PAGE_ID || '').trim();
    this.accessToken = (env.META_PAGE_ACCESS_TOKEN || '').trim();
    this.apiVersion = (env.META_GRAPH_API_VERSION || META_API.DEFAULT_GRAPH_API_VERSION).trim();
    const rawEnabled = env.META_PUBLISH_ENABLED;
    this.publishEnabled = rawEnabled === true || rawEnabled === 'true' || rawEnabled === '1';
  }

  public getConfigStatus(): MetaPublisherConfigStatus {
    const pageIdConfigured = this.pageId.length > 0;
    const tokenConfigured = this.accessToken.length > 0;
    const configured = pageIdConfigured && tokenConfigured && this.publishEnabled;

    return {
      configured,
      pageIdConfigured,
      tokenConfigured,
      apiVersion: this.apiVersion,
      publishEnabled: this.publishEnabled,
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

    if (!config.configured) {
      return {
        success: false,
        errorCode: 'META_NOT_CONFIGURED',
        errorMessage:
          'Facebook publishing is not configured or is disabled in environment settings.',
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
        // Meta Graph API expects scheduled_publish_time as Unix timestamp in seconds
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
      const errCode = metaError?.code ? `META_ERROR_${metaError.code}` : `HTTP_${httpStatus}`;

      const isRetryable =
        httpStatus === 429 ||
        httpStatus >= 500 ||
        metaError?.is_transient === true ||
        metaError?.code === 1 || // Meta API Unknown Error (transient)
        metaError?.code === 2; // Meta Service Temporary Unavailable

      return {
        success: false,
        httpStatus,
        errorCode: errCode,
        errorMessage: sanitizedMsg,
        retryable: isRetryable,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: sanitizeSecretTokens(`Network error calling Meta API: ${errorMsg}`),
        retryable: true,
      };
    }
  }
}
