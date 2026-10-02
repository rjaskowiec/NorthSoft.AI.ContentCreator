/**
 * Unit Tests — Publication Image Change Workflow & Consistency
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PublicationService } from '../../src/services/publishing/publication-service';
import type { IMetaPublisher } from '../../src/publishing/meta-publisher';

class MockD1Database {
  public prepareCalls: { sql: string; bindings: any[] }[] = [];
  public batchCalls: any[] = [];
  public store: Map<string, any> = new Map();

  prepare(sql: string) {
    const self = this;
    return {
      bind(...args: any[]) {
        self.prepareCalls.push({ sql, bindings: args });
        return {
          first: async <T>() => {
            if (sql.includes('FROM posts WHERE id =')) {
              const postId = args[0];
              if (postId === 'nonexistent') return null;
              return { id: postId, title: 'Test Post', status: 'approved', current_version: 1 } as unknown as T;
            }
            if (sql.includes('FROM curated_images WHERE id =')) {
              const imgId = args[0];
              if (imgId === 'nonexistent-img') return null;
              if (imgId === 'rejected-img') {
                return { id: 'rejected-img', title: 'Rejected', status: 'REJECTED', source_url: 'https://example.com/rejected.jpg' } as unknown as T;
              }
              if (imgId === 'img-A') {
                return { id: 'img-A', title: 'Image A', status: 'APPROVED', source_url: 'https://example.com/a.jpg' } as unknown as T;
              }
              if (imgId === 'img-B') {
                return { id: 'img-B', title: 'Image B', status: 'APPROVED', source_url: 'https://example.com/b.jpg' } as unknown as T;
              }
              return { id: imgId, title: 'Image ' + imgId, status: 'APPROVED', source_url: `https://example.com/${imgId}.jpg` } as unknown as T;
            }
            if (sql.includes('FROM post_images WHERE post_id =')) {
              const postId = args[0];
              const curImgId = self.store.get(`post_image_${postId}`) || 'img-A';
              return { curated_image_id: curImgId, url: `https://example.com/${curImgId}.jpg` } as unknown as T;
            }
            if (sql.includes('FROM publications') || sql.includes('publications pub')) {
              const id = args[0];
              if (id === 'pub-published' || id === 'post-published' || id === '107455558114139_1444523667778333') {
                return {
                  id: 'pub-published',
                  post_id: 'post-published',
                  post_version_id: 'ver-1',
                  schedule_id: null,
                  facebook_post_id: 'fb-12345',
                  provider: 'facebook',
                  status: 'published',
                  attempt_count: 1,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  post_title: 'Test Post',
                } as unknown as T;
              }
              if (id === 'pub-draft' || id === 'post-draft') {
                return {
                  id: 'pub-draft',
                  post_id: 'post-draft',
                  post_version_id: 'ver-1',
                  schedule_id: null,
                  facebook_post_id: null,
                  provider: 'facebook',
                  status: 'pending',
                  attempt_count: 0,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  post_title: 'Test Post',
                } as unknown as T;
              }
              return null;
            }
            if (sql.includes('SELECT COUNT(*) as cnt FROM publications')) {
              return { cnt: 0 } as unknown as T;
            }
            return null;
          },
          all: async <T>() => ({ results: [] as T[] }),
          run: async () => ({ meta: { changes: 1 } }),
        };
      },
    };
  }

  async batch(statements: any[]) {
    this.batchCalls.push(statements);
    return [];
  }
}

describe('PublicationService — changePublicationImage', () => {
  let db: MockD1Database;
  let mockPublisher: IMetaPublisher;

  beforeEach(() => {
    db = new MockD1Database();
    mockPublisher = {
      publish: vi.fn(),
      getConfigStatus: () => ({
        state: 'READY',
        statusMessage: 'Ready',
        configured: true,
        pageIdConfigured: true,
        tokenConfigured: true,
        apiVersion: 'v19.0',
        publishEnabled: true,
      }),
      updatePostImage: vi.fn().mockResolvedValue({ success: true, httpStatus: 200 }),
      validateToken: vi.fn(),
      healthCheck: vi.fn(),
      getPost: vi.fn(),
      updatePostMessage: vi.fn(),
      fetchPagePosts: vi.fn(),
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'image/jpeg']]),
    }));
  });

  it('should change image successfully for an UNPUBLISHED post', async () => {
    const pubService = new PublicationService(db as any, mockPublisher);
    const res = await pubService.changePublicationImage('pub-draft', 'img-B');

    expect(res.success).toBe(true);
    expect(res.isPublished).toBe(false);
    expect(res.message).toContain('will be used when this post is published');
    expect(mockPublisher.updatePostImage).not.toHaveBeenCalled();
    expect(db.batchCalls.length).toBeGreaterThan(0);
  });

  it('should return idempotent success when changing to the already assigned image', async () => {
    db.store.set('post_image_post-draft', 'img-A');
    const pubService = new PublicationService(db as any, mockPublisher);
    const res = await pubService.changePublicationImage('pub-draft', 'img-A');

    expect(res.success).toBe(true);
    expect(res.message).toContain('already assigned');
    expect(mockPublisher.updatePostImage).not.toHaveBeenCalled();
  });

  it('should reject change if selected image is REJECTED', async () => {
    const pubService = new PublicationService(db as any, mockPublisher);
    const res = await pubService.changePublicationImage('pub-draft', 'rejected-img');

    expect(res.success).toBe(false);
    expect(res.code).toBe('IMAGE_NOT_APPROVED');
  });

  it('should reject change if selected image does not exist', async () => {
    const pubService = new PublicationService(db as any, mockPublisher);
    const res = await pubService.changePublicationImage('pub-draft', 'nonexistent-img');

    expect(res.success).toBe(false);
    expect(res.code).toBe('IMAGE_NOT_FOUND');
  });

  it('should invoke Facebook API and update local D1 when post IS PUBLISHED', async () => {
    db.store.set('post_image_post-published', 'img-A');
    const pubService = new PublicationService(db as any, mockPublisher);
    const res = await pubService.changePublicationImage('pub-published', 'img-B');

    expect(res.success).toBe(true);
    expect(res.isPublished).toBe(true);
    expect(res.message).toContain('updated successfully on Facebook');
    expect(mockPublisher.updatePostImage).toHaveBeenCalledWith('fb-12345', 'https://example.com/b.jpg');
  });

  it('should NOT update local D1 if Facebook API update fails for a published post', async () => {
    db.store.set('post_image_post-published', 'img-A');
    mockPublisher.updatePostImage = vi.fn().mockResolvedValue({
      success: false,
      error: 'Meta Graph API photo error (400)',
      httpStatus: 400,
    });

    const pubService = new PublicationService(db as any, mockPublisher);
    const res = await pubService.changePublicationImage('pub-published', 'img-B');

    expect(res.success).toBe(false);
    expect(res.code).toBe('META_UPDATE_FAILED');
    expect(res.error).toContain('could not be changed on Facebook');
  });

  it('should resolve publication record when facebook_post_id is passed as ID', async () => {
    db.store.set('post_image_post-published', 'img-A');
    const pubService = new PublicationService(db as any, mockPublisher);
    const res = await pubService.changePublicationImage('107455558114139_1444523667778333', 'img-B');

    expect(res.success).toBe(true);
    expect(res.isPublished).toBe(true);
    expect(mockPublisher.updatePostImage).toHaveBeenCalled();
  });
});
