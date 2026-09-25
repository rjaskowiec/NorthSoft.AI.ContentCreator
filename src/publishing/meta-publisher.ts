/**
 * Meta/Facebook Publisher Abstraction (IMetaPublisher)
 *
 * Defines the contract for Facebook publishing via official Meta APIs.
 *
 * Rules:
 * - ONLY official Meta/Facebook APIs may be used.
 * - NO browser automation, Selenium, scraping, or simulated clicks.
 * - The publisher must verify environment safety before any publish operation.
 * - Staging/development must NEVER publish to the real NorthSoft Facebook Page.
 */

/**
 * A publication request for Facebook.
 */
export interface FacebookPublishRequest {
  /** The post content/message */
  message: string;
  /** Optional link to attach */
  link?: string;
  /** Scheduled publish time (ISO 8601). If omitted, publishes immediately. */
  scheduledPublishTime?: string;
  /** Whether this is a published post or unpublished (preview) */
  published?: boolean;
}

/**
 * Result of a Facebook publish operation.
 */
export interface FacebookPublishResult {
  success: boolean;
  postId?: string;
  error?: string;
  publishedAt?: string;
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
 * Meta Publisher interface.
 * Isolates all Meta/Facebook API interactions behind a clean boundary.
 */
export interface IMetaPublisher {
  /**
   * Publish a post to the configured Facebook Page.
   * Must verify environment safety before publishing.
   */
  publish(request: FacebookPublishRequest): Promise<FacebookPublishResult>;

  /**
   * Validate the current access token and permissions.
   */
  validateToken(): Promise<TokenValidationResult>;

  /**
   * Check if the publisher is properly configured and the API is reachable.
   */
  healthCheck(): Promise<boolean>;
}
