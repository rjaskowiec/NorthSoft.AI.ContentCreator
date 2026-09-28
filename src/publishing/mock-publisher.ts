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
    const state = this.isConfigured ? 'READY' : 'NOT_CONFIGURED';
    return {
      state,
      statusMessage: this.isConfigured
        ? 'Mock publisher operational'
        : 'Mock publisher not configured',
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

  public mockPostsMap: Map<string, { message: string; updatedTime: string }> = new Map();

  public async getPost(facebookPostId: string) {
    if (!this.isConfigured) return { success: false, error: 'Not configured', httpStatus: 400 };
    const existing = this.mockPostsMap.get(facebookPostId);
    if (!existing) {
      return {
        success: true,
        post: {
          id: facebookPostId,
          message: 'Default mock post content from Facebook',
          createdTime: new Date().toISOString(),
          updatedTime: new Date().toISOString(),
        },
      };
    }
    return {
      success: true,
      post: {
        id: facebookPostId,
        message: existing.message,
        createdTime: new Date().toISOString(),
        updatedTime: existing.updatedTime,
      },
    };
  }

  public async updatePostMessage(facebookPostId: string, message: string) {
    if (!this.isConfigured) return { success: false, error: 'Not configured', httpStatus: 400 };
    if (!this.shouldSucceed) return { success: false, error: this.mockErrorMessage || 'Mock update failed', httpStatus: this.mockHttpStatus || 400 };
    this.mockPostsMap.set(facebookPostId, { message, updatedTime: new Date().toISOString() });
    return { success: true };
  }

  public async fetchPagePosts(limit = 10) {
    if (!this.isConfigured) return { success: false, posts: [], error: 'Not configured' };
    const posts = Array.from(this.mockPostsMap.entries()).slice(0, limit).map(([id, data]) => ({
      id,
      message: data.message,
      updatedTime: data.updatedTime,
    }));
    return { success: true, posts };
  }
}
