import { describe, expect, it, vi } from 'vitest';
import { ImageLibraryService, CuratedImageRow } from '../../src/services/content/image-library-service';

function createMockDb(initialRows: CuratedImageRow[] = []) {
  const store: Map<string, CuratedImageRow> = new Map(initialRows.map((r) => [r.id, { ...r }]));
  const publishedImages: Set<string> = new Set();

  const prepare = vi.fn((sql: string) => {
    return {
      bind: (...args: any[]) => {
        return {
          first: vi.fn(async () => {
            if (sql.includes("p.status = 'published'")) {
              const imgId = args[0];
              const target = store.get(imgId);
              const isPub = publishedImages.has(imgId) || (target?.usage_count || 0) > 0;
              return { current_count: isPub ? 1 : 0, latest_post_id: target?.used_in_post_id || null };
            }
            if (sql.includes('FROM publications')) {
              const imgId = args[0];
              const target = store.get(imgId);
              const isPub = publishedImages.has(imgId) || (target?.usage_count || 0) > 0;
              return { pub_count: isPub ? 1 : 0, max_published_at: target?.last_used_at || (isPub ? new Date().toISOString() : null) };
            }
            if (sql.includes('FROM audit_log')) {
              const imgId = args[0];
              const isPub = publishedImages.has(imgId);
              return { audit_pub_count: isPub ? 1 : 0, max_audit_time: isPub ? new Date().toISOString() : null };
            }
            if (sql.includes("p.status IN ('draft', 'approved', 'scheduled')")) {
              const imgId = args[0];
              const target = store.get(imgId);
              return target && target.reserved_post_id && !publishedImages.has(imgId) ? { id: target.reserved_post_id } : null;
            }
            if (sql.includes('FROM curated_images WHERE id =')) {
              const id = args[0];
              return store.get(id) || null;
            }
            if (sql.includes('SELECT reserved_post_id FROM curated_images WHERE id =')) {
              const id = args[0];
              const target = store.get(id);
              return target ? { reserved_post_id: target.reserved_post_id } : null;
            }
            if (sql.includes('SELECT id FROM curated_images WHERE source_url =')) {
              const url = args[0];
              for (const img of store.values()) {
                if (img.source_url === url) return { id: img.id };
              }
              return null;
            }
            return null;
          }),
          all: vi.fn(async () => {
            if (sql.includes('FROM curated_images')) {
              let list = Array.from(store.values());
              if (sql.includes("status = 'APPROVED'")) {
                list = list.filter((img) => img.status === 'APPROVED');
              } else if (sql.includes("status = 'REJECTED'")) {
                const cutoff = args[0];
                list = list.filter((img) => img.status === 'REJECTED' && img.updated_at < cutoff);
              }
              return { results: list };
            }
            return { results: [] };
          }),
          run: vi.fn(async () => {
            if (sql.includes('INSERT INTO audit_log')) {
              if (args.includes('IMAGE_PUBLISHED')) {
                const imgId = args[3];
                if (imgId) publishedImages.add(imgId);
              }
              return { meta: { changes: 1 } };
            }
            if (sql.includes('INSERT INTO curated_images')) {
              if (sql.includes("'DISCOVERED'")) {
                const [
                  id, title, sourceUrl, originalPageUrl, author, authorUrl,
                  license, licenseUrl, category, keywords, description, discoveryQuery,
                  discoveryScore, createdAt, updatedAt
                ] = args;
                const row: CuratedImageRow = {
                  id,
                  title: title || 'Discovered Image',
                  source_type: 'DISCOVERED',
                  source_url: sourceUrl || null,
                  original_page_url: originalPageUrl || null,
                  author: author || null,
                  author_url: authorUrl || null,
                  license: license || null,
                  license_url: licenseUrl || null,
                  category: category || 'Technology',
                  secondary_categories: null,
                  keywords: keywords || null,
                  tags: null,
                  description: description || null,
                  notes: null,
                  r2_key: null,
                  status: 'PENDING',
                  discovery_query: discoveryQuery || null,
                  discovery_score: discoveryScore || 0,
                  usage_count: 0,
                  last_used_at: null,
                  used_in_post_id: null,
                  reserved_post_id: null,
                  created_at: createdAt,
                  updated_at: updatedAt,
                };
                store.set(id, row);
              } else {
                const [
                  id, title, sourceType, sourceUrl, r2Key, category, keywords, description,
                  author, authorUrl, license, licenseUrl, notes, status, createdAt, updatedAt
                ] = args;
                const row: CuratedImageRow = {
                  id,
                  title: title || 'Manual Image',
                  source_type: sourceType,
                  source_url: sourceUrl || null,
                  original_page_url: null,
                  author: author || null,
                  author_url: authorUrl || null,
                  license: license || null,
                  license_url: licenseUrl || null,
                  category: category || 'General',
                  secondary_categories: null,
                  keywords: keywords || null,
                  tags: null,
                  description: description || null,
                  notes: notes || null,
                  r2_key: r2Key || null,
                  status: status || 'APPROVED',
                  discovery_query: null,
                  discovery_score: 0,
                  usage_count: 0,
                  last_used_at: null,
                  used_in_post_id: null,
                  reserved_post_id: null,
                  created_at: createdAt,
                  updated_at: updatedAt,
                };
                store.set(id, row);
              }
              return { meta: { changes: 1 } };
            }

            if (sql.includes('DELETE FROM curated_images')) {
              const id = args[0];
              const deleted = store.delete(id);
              return { meta: { changes: deleted ? 1 : 0 } };
            }

            if (sql.includes('UPDATE curated_images')) {
              const id = args[args.length - 1] as string;
              const existing = store.get(id);

              if (sql.includes('usage_count =')) {
                const imgId = args[args.length - 1] as string;
                const target = store.get(imgId);
                if (target) {
                  const pubCount = typeof args[1] === 'number' && args[1] > 0 ? args[1] : (typeof args[0] === 'number' ? args[0] : ((target.usage_count || 0) + 1));
                  target.usage_count = pubCount;
                  target.last_used_at = args[2] ?? (target.last_used_at || null);
                  target.reserved_post_id = args[4] ?? null;
                }
              } else if (sql.includes('reserved_post_id = NULL')) {
                const postId = args[0];
                for (const img of store.values()) {
                  if (img.reserved_post_id === postId) {
                    img.reserved_post_id = null;
                  }
                }
              } else if (sql.includes('reserved_post_id = ?')) {
                const [postId, updatedAt, imgId] = args;
                const target = store.get(imgId);
                if (target) {
                  target.reserved_post_id = postId;
                  target.updated_at = updatedAt;
                }
              } else if (existing) {
                // Dynamic metadata update: parse clause names
                const setMatch = sql.split('SET ')[1];
                const setClause = setMatch ? setMatch.split(' WHERE')[0] : '';
                const parts = setClause ? setClause.split(',').map((p) => p.trim()) : [];
                parts.forEach((part, index) => {
                  const paramVal = args[index];
                  if (part.startsWith('status =')) existing.status = paramVal as any;
                  if (part.startsWith('category =')) existing.category = paramVal as any;
                  if (part.startsWith('keywords =')) existing.keywords = paramVal as any;
                  if (part.startsWith('description =')) existing.description = paramVal as any;
                });
              }
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 1 } };
          }),
        };
      },
    };
  });

  const batch = vi.fn(async (statements: any[]) => {
    for (const stmt of statements) {
      await stmt.run();
    }
    return [];
  });

  return { DB: { prepare, batch } as unknown as D1Database, store };
}

describe('ImageLibraryService & Curated Image Operations', () => {
  it('adds candidate images in PENDING state', async () => {
    const { DB, store } = createMockDb();
    const service = new ImageLibraryService(DB);

    const candidateId = await service.addCandidate({
      title: 'AI Neural Network Graphic',
      sourceUrl: 'https://images.example/tech-1.jpg',
      author: 'TechArtist',
      license: 'CC-BY',
      category: 'AI',
      keywords: 'ai, neural network, technology',
      description: 'Abstract neural network rendering',
    });

    expect(candidateId).toBeDefined();
    const saved = store.get(candidateId);
    expect(saved?.status).toBe('PENDING');
    expect(saved?.source_type).toBe('DISCOVERED');
  });

  it('allows administrator to add manual image directly in APPROVED state', async () => {
    const { DB, store } = createMockDb();
    const service = new ImageLibraryService(DB);

    const manualId = await service.addManualImage({
      title: 'Modern Web Design',
      sourceType: 'UPLOADED',
      sourceUrl: 'https://r2.northsoft.is/uploads/web-design.jpg',
      r2Key: 'uploads/web-design.jpg',
      category: 'Web Design',
      keywords: 'website, ux, modern UI',
      description: 'Clean responsive website layout mockup',
      author: 'Robert Jaskowiec',
      license: 'Internal / Proprietary',
      status: 'APPROVED',
    });

    expect(manualId).toBeDefined();
    const saved = store.get(manualId);
    expect(saved?.status).toBe('APPROVED');
    expect(saved?.category).toBe('Web Design');
  });

  it('allows administrator to approve, reject, or edit metadata of a candidate image', async () => {
    const { DB, store } = createMockDb();
    const service = new ImageLibraryService(DB);

    const candidateId = await service.addCandidate({
      title: 'Cybersecurity Lock',
      sourceUrl: 'https://images.example/cyber.jpg',
      category: 'Security',
      keywords: 'security, lock',
    });

    const success = await service.updateMetadata(candidateId, {
      status: 'APPROVED',
      category: 'Cybersecurity',
      keywords: 'security, encryption, firewall, cloud',
    });

    expect(success).toBe(true);
    const updated = store.get(candidateId);
    expect(updated?.status).toBe('APPROVED');
    expect(updated?.category).toBe('Cybersecurity');
    expect(updated?.keywords).toBe('security, encryption, firewall, cloud');
  });

  describe('Image Matching Algorithm & 90-Day Reuse Policy', () => {
    it('only selects APPROVED images, rejecting PENDING, REJECTED, or DELETED', async () => {
      const pending: CuratedImageRow = {
        id: 'img-pending',
        title: 'Pending AI Image',
        source_type: 'DISCOVERED',
        source_url: 'https://example.com/pending.jpg',
        original_page_url: null,
        author: null,
        author_url: null,
        license: null,
        license_url: null,
        category: 'AI',
        secondary_categories: null,
        keywords: 'ai, machine learning',
        tags: null,
        description: 'AI Image',
        notes: null,
        r2_key: null,
        status: 'PENDING',
        discovery_query: null,
        discovery_score: 0,
        usage_count: 0,
        last_used_at: null,
        used_in_post_id: null,
        reserved_post_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const rejected: CuratedImageRow = { ...pending, id: 'img-rejected', status: 'REJECTED' };
      const approved: CuratedImageRow = { ...pending, id: 'img-approved', status: 'APPROVED' };

      const { DB } = createMockDb([pending, rejected, approved]);
      const service = new ImageLibraryService(DB);

      const result = await service.findBestApprovedImage(
        'AI Trends in 2026',
        'AI',
        'Machine learning algorithms and deep neural networks in modern business context.',
      );

      expect(result).not.toBeNull();
      expect(result?.image.id).toBe('img-approved');
    });

    it('excludes images used within the last 90 days', async () => {
      const recentDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days ago
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(); // 100 days ago

      const recentlyUsed: CuratedImageRow = {
        id: 'img-recent',
        title: 'Marketing Chart',
        source_type: 'DISCOVERED',
        source_url: 'https://example.com/recent.jpg',
        original_page_url: null,
        author: null,
        author_url: null,
        license: null,
        license_url: null,
        category: 'Marketing',
        secondary_categories: null,
        keywords: 'marketing, growth',
        tags: null,
        description: 'Marketing chart',
        notes: null,
        r2_key: null,
        status: 'APPROVED',
        discovery_query: null,
        discovery_score: 0,
        usage_count: 1,
        last_used_at: recentDate,
        used_in_post_id: 'old-post-1',
        reserved_post_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const eligibleOld: CuratedImageRow = {
        ...recentlyUsed,
        id: 'img-old',
        source_url: 'https://example.com/old.jpg',
        last_used_at: oldDate,
      };

      const { DB } = createMockDb([recentlyUsed, eligibleOld]);
      const service = new ImageLibraryService(DB);

      const result = await service.findBestApprovedImage(
        'Digital Marketing Strategies',
        'Marketing',
        'Growth strategies and analytics for scaling online businesses.',
      );

      expect(result).not.toBeNull();
      expect(result?.image.id).toBe('img-old');
    });

    it('returns null if no approved image satisfies category/keyword criteria', async () => {
      const approvedOther: CuratedImageRow = {
        id: 'img-cyber',
        title: 'Cyber Security Rack',
        source_type: 'DISCOVERED',
        source_url: 'https://example.com/cyber.jpg',
        original_page_url: null,
        author: null,
        author_url: null,
        license: null,
        license_url: null,
        category: 'Cybersecurity',
        secondary_categories: null,
        keywords: 'security, virus, firewall',
        tags: null,
        description: 'Server rack',
        notes: null,
        r2_key: null,
        status: 'APPROVED',
        discovery_query: null,
        discovery_score: 0,
        usage_count: 0,
        last_used_at: null,
        used_in_post_id: null,
        reserved_post_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { DB } = createMockDb([approvedOther]);
      const service = new ImageLibraryService(DB);

      const result = await service.findBestApprovedImage(
        'Local SEO Best Practices for Small Business',
        'SEO & Marketing',
        'Google local search optimizations and citations.',
      );

      expect(result).toBeNull();
    });
  });

  describe('Draft Illustration Reservation & Publication Safety', () => {
    it('reserving an image for a draft does NOT increment usage_count prematurely', async () => {
      const approved: CuratedImageRow = {
        id: 'img-10',
        title: 'Design Sample',
        source_type: 'UPLOADED',
        source_url: 'https://example.com/art.jpg',
        original_page_url: null,
        author: null,
        author_url: null,
        license: null,
        license_url: null,
        category: 'Design',
        secondary_categories: null,
        keywords: 'design, art',
        tags: null,
        description: 'Design sample',
        notes: null,
        r2_key: null,
        status: 'APPROVED',
        discovery_query: null,
        discovery_score: 0,
        usage_count: 0,
        last_used_at: null,
        used_in_post_id: null,
        reserved_post_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { DB, store } = createMockDb([approved]);
      const service = new ImageLibraryService(DB);

      await service.reserveImageForDraft('img-10', 'draft-101', true);

      const reserved = store.get('img-10');
      expect(reserved?.reserved_post_id).toBe('draft-101');
      expect(reserved?.usage_count).toBe(0);
      expect(reserved?.last_used_at).toBeNull();
    });

    it('marks image as permanently published only on successful publication', async () => {
      const approved: CuratedImageRow = {
        id: 'img-10',
        title: 'Design Sample',
        source_type: 'UPLOADED',
        source_url: 'https://example.com/art.jpg',
        original_page_url: null,
        author: null,
        author_url: null,
        license: null,
        license_url: null,
        category: 'Design',
        secondary_categories: null,
        keywords: 'design, art',
        tags: null,
        description: 'Design sample',
        notes: null,
        r2_key: null,
        status: 'APPROVED',
        discovery_query: null,
        discovery_score: 0,
        usage_count: 0,
        last_used_at: null,
        used_in_post_id: null,
        reserved_post_id: 'draft-101',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { DB, store } = createMockDb([approved]);
      const service = new ImageLibraryService(DB);

      await service.markImageAsPublished('img-10', 'draft-101');

      const published = store.get('img-10');
      expect(published?.usage_count).toBe(1);
      expect(published?.last_used_at).not.toBeNull();
      expect(published?.reserved_post_id).toBeNull();
    });

    it('releasing reservation allows image to be picked by another draft', async () => {
      const approved: CuratedImageRow = {
        id: 'img-10',
        title: 'Design Sample',
        source_type: 'UPLOADED',
        source_url: 'https://example.com/art.jpg',
        original_page_url: null,
        author: null,
        author_url: null,
        license: null,
        license_url: null,
        category: 'Design',
        secondary_categories: null,
        keywords: 'design, art',
        tags: null,
        description: 'Design sample',
        notes: null,
        r2_key: null,
        status: 'APPROVED',
        discovery_query: null,
        discovery_score: 0,
        usage_count: 0,
        last_used_at: null,
        used_in_post_id: null,
        reserved_post_id: 'draft-101',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { DB, store } = createMockDb([approved]);
      const service = new ImageLibraryService(DB);

      await service.releaseDraftReservation('draft-101');

      const released = store.get('img-10');
      expect(released?.reserved_post_id).toBeNull();
    });

    it('purges REJECTED images older than 7 days and preserves active/recent images', async () => {
      const eightDaysAgoIso = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const twoDaysAgoIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

      const expiredRejected: CuratedImageRow = {
        id: 'img-expired',
        title: 'Old Rejected Image',
        source_type: 'UPLOADED',
        source_url: 'https://example.com/old-rejected.jpg',
        original_page_url: null, author: null, author_url: null, license: null, license_url: null,
        category: 'AI', secondary_categories: null, keywords: 'old', tags: null, description: 'old', notes: null,
        r2_key: 'uploads/old-rejected.jpg',
        status: 'REJECTED',
        discovery_query: null, discovery_score: 0, usage_count: 0, last_used_at: null, used_in_post_id: null, reserved_post_id: null,
        created_at: eightDaysAgoIso,
        updated_at: eightDaysAgoIso,
      };

      const recentRejected: CuratedImageRow = {
        id: 'img-recent',
        title: 'Recent Rejected Image',
        source_type: 'UPLOADED',
        source_url: 'https://example.com/recent-rejected.jpg',
        original_page_url: null, author: null, author_url: null, license: null, license_url: null,
        category: 'AI', secondary_categories: null, keywords: 'recent', tags: null, description: 'recent', notes: null,
        r2_key: null,
        status: 'REJECTED',
        discovery_query: null, discovery_score: 0, usage_count: 0, last_used_at: null, used_in_post_id: null, reserved_post_id: null,
        created_at: twoDaysAgoIso,
        updated_at: twoDaysAgoIso,
      };

      const { DB, store } = createMockDb([expiredRejected, recentRejected]);
      const service = new ImageLibraryService(DB);

      const deletedKeys: string[] = [];
      const mockR2Bucket = {
        delete: async (key: string) => { deletedKeys.push(key); }
      } as any;

      const result = await service.purgeExpiredRejectedImages(7, mockR2Bucket);

      expect(result.purgedCount).toBe(1);
      expect(result.purgedIds).toContain('img-expired');
      expect(store.has('img-expired')).toBe(false);
      expect(store.has('img-recent')).toBe(true);
      expect(deletedKeys).toContain('uploads/old-rejected.jpg');
    });
  });
});
