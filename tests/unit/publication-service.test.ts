import { describe, expect, it, vi } from 'vitest';
import { MockMetaPublisher } from '../../src/publishing/mock-publisher';
import { PublicationService } from '../../src/services/publishing/publication-service';

describe('PublicationService Unit Tests', () => {
  it('should REJECT publication with 403 / POST_NOT_APPROVED when post version is not approved', async () => {
    const mockDb = {
      prepare: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('FROM posts p')) {
          return {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue({
              id: 'post-1',
              title: 'Draft Post Title',
              post_status: 'draft',
              version_id: 'ver-draft',
              body: 'Unapproved draft text',
              version_status: 'draft', // NOT 'approved'
              version_number: 1,
            }),
          };
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        };
      }),
    } as unknown as D1Database;

    const mockPublisher = new MockMetaPublisher();
    const service = new PublicationService(mockDb, mockPublisher);

    const result = await service.publishPost('post-1');

    expect(result.success).toBe(false);
    expect(result.code).toBe('POST_NOT_APPROVED');
    expect(mockPublisher.publishCalls.length).toBe(0); // Zero Meta calls!
  });

  it('should publish approved post and return external Facebook post ID', async () => {
    const mockDb = {
      prepare: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('FROM posts p')) {
          return {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue({
              id: 'post-approved-1',
              title: 'Approved Post Title',
              post_status: 'approved',
              version_id: 'ver-approved-1',
              body: 'Fully verified high quality text',
              version_status: 'approved',
              version_number: 1,
            }),
          };
        }
        if (sql.includes('FROM publications')) {
          return {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue(null),
          };
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        };
      }),
    } as unknown as D1Database;

    const mockPublisher = new MockMetaPublisher();
    mockPublisher.mockExternalPostId = 'fb_post_999888777';

    const service = new PublicationService(mockDb, mockPublisher);
    const result = await service.publishPost('post-approved-1');

    expect(result.success).toBe(true);
    expect(result.externalPostId).toContain('fb_post_999888777');
    expect(mockPublisher.publishCalls.length).toBe(1);
    expect(mockPublisher.publishCalls[0]!.message).toBe('Fully verified high quality text');
  });

  it('should enforce IDEMPOTENCY if post version is already published', async () => {
    const mockDb = {
      prepare: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('FROM posts p')) {
          return {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue({
              id: 'post-published-1',
              title: 'Published Post',
              post_status: 'published',
              version_id: 'ver-pub-1',
              body: 'Content',
              version_status: 'approved',
              version_number: 1,
            }),
          };
        }
        if (sql.includes("status = 'published'")) {
          return {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue({
              id: 'pub-existing-123',
              status: 'published',
              facebook_post_id: 'fb_existing_112233',
              published_at: '2026-09-25T12:00:00Z',
            }),
          };
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        };
      }),
    } as unknown as D1Database;

    const mockPublisher = new MockMetaPublisher();
    const service = new PublicationService(mockDb, mockPublisher);

    const result = await service.publishPost('post-published-1');

    expect(result.success).toBe(true);
    expect(result.alreadyPublished).toBe(true);
    expect(result.externalPostId).toBe('fb_existing_112233');
    expect(mockPublisher.publishCalls.length).toBe(0); // Zero additional Meta calls!
  });
});
