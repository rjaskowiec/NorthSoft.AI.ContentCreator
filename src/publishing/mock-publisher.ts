/**
 * Mock Meta Publisher for Testing & Staging Environment Dry Runs
 *
 * Implements IMetaPublisher without making external HTTP requests.
 * Allows setting deterministic responses (success, retryable error, non-retryable error).
 */

import type {
  FacebookPublishRequest,
  FacebookPublishResult,
  IMetaPublisher,
  MetaPublisherConfigStatus,
  TokenValidationResult,
} from './meta-publisher.js';

export class MockMetaPublisher implements IMetaPublisher {
  public publishCalls: FacebookPublishRequest[] = [];
  public shouldSucceed = true;
  public mockExternalPostId = 'mock_fb_post_123456789';
  public mockErrorCode?: string;
  public mockErrorMessage?: string;
  public mockRetryable = false;
  public mockHttpStatus = 200;

  public isConfigured = true;

  public getConfigStatus(): MetaPublisherConfigStatus {
    return {
      configured: this.isConfigured,
      pageIdConfigured: this.isConfigured,
      tokenConfigured: this.isConfigured,
      apiVersion: 'v19.0-mock',
      publishEnabled: this.isConfigured,
    };
  }

  public async healthCheck(): Promise<boolean> {
    return this.isConfigured;
  }

  public async validateToken(): Promise<TokenValidationResult> {
    if (!this.isConfigured) {
      return { valid: false, error: 'MOCK_TOKEN_INVALID' };
    }
    return {
      valid: true,
      pageId: '100000000000000',
      scopes: ['pages_manage_posts', 'pages_read_engagement'],
    };
  }

  public async publish(request: FacebookPublishRequest): Promise<FacebookPublishResult> {
    this.publishCalls.push(request);

    if (!this.isConfigured) {
      return {
        success: false,
        errorCode: 'META_NOT_CONFIGURED',
        errorMessage: 'Mock publisher is not configured.',
        retryable: false,
      };
    }

    if (!this.shouldSucceed) {
      return {
        success: false,
        httpStatus: this.mockHttpStatus || 400,
        errorCode: this.mockErrorCode || 'MOCK_PUBLISH_FAILED',
        errorMessage: this.mockErrorMessage || 'Mock Facebook publication failed',
        retryable: this.mockRetryable,
      };
    }

    return {
      success: true,
      externalPostId: `${this.mockExternalPostId}_${Date.now()}`,
      publishedAt: new Date().toISOString(),
      httpStatus: 200,
    };
  }
}
