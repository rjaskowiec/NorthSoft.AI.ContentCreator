import { describe, expect, it, vi } from 'vitest';
import { FacebookPublisher, sanitizeSecretTokens } from '../../src/publishing/facebook-publisher';
import { MockMetaPublisher } from '../../src/publishing/mock-publisher';

describe('FacebookPublisher Unit Tests', () => {
  it('should report NOT CONFIGURED when env bindings are missing', async () => {
    const publisher = new FacebookPublisher({});
    const status = publisher.getConfigStatus();

    expect(status.configured).toBe(false);
    expect(status.pageIdConfigured).toBe(false);
    expect(status.tokenConfigured).toBe(false);
    expect(status.publishEnabled).toBe(false);

    const result = await publisher.publish({
      postId: 'p1',
      postVersionId: 'v1',
      message: 'Test post',
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('META_NOT_CONFIGURED');
    expect(result.retryable).toBe(false);
  });

  it('should redact secret access tokens from error strings', () => {
    const raw =
      'Error calling https://graph.facebook.com/v19.0/123/feed?access_token=EAAB123456789SecretToken value';
    const sanitized = sanitizeSecretTokens(raw);
    expect(sanitized).not.toContain('EAAB123456789SecretToken');
    expect(sanitized).toContain('access_token=[REDACTED]');
  });

  it('should make successful publish request to Meta Graph API when configured', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: '1234567890_9876543210' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const publisher = new FacebookPublisher({
      META_PAGE_ID: '123456789',
      META_PAGE_ACCESS_TOKEN: 'test_page_access_token',
      META_GRAPH_API_VERSION: 'v19.0',
      FACEBOOK_PUBLISH_ENABLED: 'true',
    });

    expect(publisher.getConfigStatus().configured).toBe(true);

    const res = await publisher.publish({
      postId: 'post-100',
      postVersionId: 'ver-1',
      message: 'Hello World from NorthSoft AI!',
    });

    expect(res.success).toBe(true);
    expect(res.externalPostId).toBe('1234567890_9876543210');
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0]![0]).toBe('https://graph.facebook.com/v19.0/123456789/feed');

    vi.unstubAllGlobals();
  });

  it('should classify rate limit (HTTP 429) as retryable error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        error: {
          message: '(#17) User request limit reached',
          code: 17,
          is_transient: true,
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const publisher = new FacebookPublisher({
      META_PAGE_ID: '123456789',
      META_PAGE_ACCESS_TOKEN: 'test_token',
      FACEBOOK_PUBLISH_ENABLED: 'true',
    });

    const res = await publisher.publish({
      postId: 'post-100',
      postVersionId: 'ver-1',
      message: 'Hello',
    });

    expect(res.success).toBe(false);
    expect(res.httpStatus).toBe(429);
    expect(res.retryable).toBe(true);
    expect(res.errorCode).toBe('META_ERROR_17');

    vi.unstubAllGlobals();
  });

  it('should classify authentication error (HTTP 401 / code 190) as non-retryable error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: {
          message: 'Error validating access token: Session has expired',
          code: 190,
          is_transient: false,
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const publisher = new FacebookPublisher({
      META_PAGE_ID: '123456789',
      META_PAGE_ACCESS_TOKEN: 'expired_token',
      FACEBOOK_PUBLISH_ENABLED: 'true',
    });

    const res = await publisher.publish({
      postId: 'post-100',
      postVersionId: 'ver-1',
      message: 'Hello',
    });

    expect(res.success).toBe(false);
    expect(res.httpStatus).toBe(401);
    expect(res.retryable).toBe(false);
    expect(res.errorCode).toBe('META_ERROR_190');

    vi.unstubAllGlobals();
  });

  it('should report DISABLED when credentials exist but FACEBOOK_PUBLISH_ENABLED is false', async () => {
    const publisher = new FacebookPublisher({
      META_PAGE_ID: '123456789',
      META_PAGE_ACCESS_TOKEN: 'valid_token',
      FACEBOOK_PUBLISH_ENABLED: 'false',
    });
    const status = publisher.getConfigStatus();

    expect(status.state).toBe('DISABLED');
    expect(status.pageIdConfigured).toBe(true);
    expect(status.tokenConfigured).toBe(true);
    expect(status.publishEnabled).toBe(false);
    expect(status.configured).toBe(false);

    const result = await publisher.publish({
      postId: 'p1',
      postVersionId: 'v1',
      message: 'Test post',
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('META_PUBLISH_DISABLED');
    expect(result.retryable).toBe(false);
  });

  it('should report READY state when credentials exist and FACEBOOK_PUBLISH_ENABLED is true', () => {
    const publisher = new FacebookPublisher({
      META_PAGE_ID: '123456789',
      META_PAGE_ACCESS_TOKEN: 'valid_token',
      FACEBOOK_PUBLISH_ENABLED: 'true',
    });
    const status = publisher.getConfigStatus();

    expect(status.state).toBe('READY');
    expect(status.configured).toBe(true);
  });

  it('should transition to DEGRADED state when temporary rate limiting or server error occurs', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        error: { message: '(#17) Rate limit', code: 17 },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const publisher = new FacebookPublisher({
      META_PAGE_ID: '123456789',
      META_PAGE_ACCESS_TOKEN: 'valid_token',
      FACEBOOK_PUBLISH_ENABLED: 'true',
    });

    const result = await publisher.publish({
      postId: 'p1',
      postVersionId: 'v1',
      message: 'Test post',
    });

    expect(result.errorCategory).toBe('RATE_LIMITED');
    expect(publisher.getConfigStatus().state).toBe('DEGRADED');

    vi.unstubAllGlobals();
  });

  it('should enforce DISABLED state when ENVIRONMENT is staging even if FACEBOOK_PUBLISH_ENABLED is true', async () => {
    const publisher = new FacebookPublisher({
      META_PAGE_ID: '123456789',
      META_PAGE_ACCESS_TOKEN: 'valid_token',
      FACEBOOK_PUBLISH_ENABLED: 'true',
      ENVIRONMENT: 'staging',
    });
    const status = publisher.getConfigStatus();

    expect(status.state).toBe('DISABLED');
    expect(status.publishEnabled).toBe(false);
    expect(status.statusMessage).toContain('ENVIRONMENT !== production');

    const result = await publisher.publish({
      postId: 'p1',
      postVersionId: 'v1',
      message: 'Test post',
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('META_PUBLISH_DISABLED');
  });

  it('should ignore legacy META_PUBLISH_ENABLED binding completely', () => {
    const publisher = new FacebookPublisher({
      META_PAGE_ID: '123456789',
      META_PAGE_ACCESS_TOKEN: 'valid_token',
      // @ts-expect-error legacy flag test
      META_PUBLISH_ENABLED: 'true',
    });
    const status = publisher.getConfigStatus();

    expect(status.state).toBe('DISABLED');
    expect(status.publishEnabled).toBe(false);
  });

  it('MockMetaPublisher should behave deterministically without HTTP requests', async () => {
    const mockPub = new MockMetaPublisher();
    const res = await mockPub.publish({
      postId: 'p1',
      postVersionId: 'v1',
      message: 'Mock test',
    });

    expect(res.success).toBe(true);
    expect(res.externalPostId).toContain('mock_fb_post_123456789');
    expect(mockPub.publishCalls.length).toBe(1);
  });
});
