/**
 * Meta/Facebook Publisher Abstraction (IMetaPublisher)
 *
 * Defines the contract for Facebook publishing via official Meta Graph APIs.
 *
 * Rules:
 * - ONLY official Meta/Facebook Graph APIs may be used.
 * - NO browser automation, Selenium, scraping, or simulated clicks.
 * - The publisher must verify environment safety before any publish operation.
 * - Staging/development must NEVER publish to the real NorthSoft Facebook Page unless explicitly configured.
 * - Zero Workers AI neuron usage during publishing.
 */

export type PublisherReadinessState = 'NOT_CONFIGURED' | 'DISABLED' | 'READY' | 'DEGRADED';

export type MetaErrorCategory =
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'RATE_LIMITED'
  | 'INVALID_REQUEST'
  | 'REMOTE_SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_EXTERNAL_ERROR';

/**
 * A publication request for Facebook Graph API.
 */
export interface FacebookPublishRequest {
  /** Internal post ID */
  postId: string;
  /** Immutable post version ID being published */
  postVersionId: string;
  /** The post content/message */
  message: string;
  /** Optional link to attach */
  link?: string;
  /** Scheduled publish time (ISO 8601 or Unix timestamp). If omitted, publishes immediately. */
  scheduledPublishTime?: string;
  /** Internal idempotency key to prevent duplicate calls */
  idempotencyKey?: string;
}

/**
 * Result of a Facebook publish operation.
 */
export interface FacebookPublishResult {
  /** Whether the post was accepted by Meta Graph API */
  success: boolean;
  /** External Facebook Post ID returned by Meta (e.g. 123456_789012) */
  externalPostId?: string;
  /** ISO timestamp of publication */
  publishedAt?: string;
  /** HTTP status code from Meta Graph API response */
  httpStatus?: number;
  /** Normalized internal error code (e.g. META_NOT_CONFIGURED, META_PUBLISH_DISABLED) */
  errorCode?: string;
  /** High-level normalized Meta error category */
  errorCategory?: MetaErrorCategory;
  /** Sanitized error message (must NEVER expose access tokens) */
  errorMessage?: string;
  /** Whether the failure is transient/retryable (e.g. 429, timeout, 5xx) */
  retryable?: boolean;
}

/**
 * Result of a Facebook token validation.
 */
export interface TokenValidationResult {
  valid: boolean;
  expiresAt?: string;
  scopes?: string[];
  pageId?: string;
  error?: string;
}

/**
 * Meta Publisher Configuration Status.
 */
export interface MetaPublisherConfigStatus {
  /** 4-tier operational readiness state: NOT_CONFIGURED | DISABLED | READY | DEGRADED */
  state: PublisherReadinessState;
  /** Human-readable status description */
  statusMessage: string;
  /** Whether both Page ID and Page Access Token are present AND publishing is enabled */
  configured: boolean;
  pageIdConfigured: boolean;
  tokenConfigured: boolean;
  apiVersion: string;
  publishEnabled: boolean;
  /** Last recorded error category if in DEGRADED state */
  lastErrorCategory?: MetaErrorCategory;
}

/**
 * Meta Publisher interface.
 * Isolates all Meta/Facebook API interactions behind a clean boundary.
 */
export interface IMetaPublisher {
  /**
   * Publish a post version to the configured Facebook Page via official Meta Graph API.
   */
  publish(request: FacebookPublishRequest): Promise<FacebookPublishResult>;

  /**
   * Validate the current access token and permissions against Meta debug_token API.
   */
  validateToken(): Promise<TokenValidationResult>;

  /**
   * Get safe configuration status (without exposing secrets).
   */
  getConfigStatus(): MetaPublisherConfigStatus;

  /**
   * Check if the publisher is properly configured and the API is reachable.
   */
  healthCheck(): Promise<boolean>;
}
