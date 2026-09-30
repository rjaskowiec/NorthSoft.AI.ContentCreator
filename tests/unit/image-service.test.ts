import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OpenverseImageService,
  buildSearchHierarchy,
  scoreImageCandidate,
} from '../../src/services/content/image-service';

describe('OpenverseImageService & Hierarchical Image Discovery', () => {
  afterEach(() => vi.unstubAllGlobals());

  describe('Search Query Hierarchy Builder', () => {
    it('generates 4 levels of fallback queries for AI search topic', () => {
      const hierarchy = buildSearchHierarchy('3 Ways AI Search Is Changing Small Business Websites', 'AI & Technology');

      expect(hierarchy).toHaveLength(4);
      expect(hierarchy[0]!.level).toBe('LEVEL_1_SPECIFIC');
      expect(hierarchy[0]!.query).toContain('artificial intelligence');
      expect(hierarchy[1]!.level).toBe('LEVEL_2_CATEGORY');
      expect(hierarchy[2]!.level).toBe('LEVEL_3_CONTEXTUAL');
      expect(hierarchy[3]!.level).toBe('LEVEL_4_GENERIC');
    });

    it('generates 4 levels of fallback queries for web design topic', () => {
      const hierarchy = buildSearchHierarchy('Building Trust with Modern Website Design', 'Web Design & UI');

      expect(hierarchy).toHaveLength(4);
      expect(hierarchy[0]!.level).toBe('LEVEL_1_SPECIFIC');
      expect(hierarchy[1]!.query).toContain('web design');
    });
  });

  describe('Image Candidate Scoring & Safety Filter', () => {
    it('accepts technology / laptop images for AI website posts', () => {
      const candidate = {
        id: 'img-tech',
        url: 'https://images.example/laptop.jpg',
        title: 'Modern Laptop Workspace Code',
        author: 'Dev',
        license: 'CC0',
        licenseUrl: 'https://creativecommons.org/',
        sourceUrl: 'https://images.example/laptop',
        tags: ['technology', 'laptop', 'office'],
      };

      const result = scoreImageCandidate(candidate, '3 Ways AI Search Is Changing Websites', 'AI & Technology');
      expect(result.safe).toBe(true);
      expect(result.score).toBeGreaterThan(40);
    });

    it('penalizes irrelevant noisy images like cats or celebrity news', () => {
      const candidate = {
        id: 'img-cat',
        url: 'https://images.example/cat.jpg',
        title: 'Kim Kardashian Cat in Basket',
        author: 'PetOwner',
        license: 'CC0',
        licenseUrl: 'https://creativecommons.org/',
        sourceUrl: 'https://images.example/cat',
        tags: ['cat', 'kitten', 'pet'],
      };

      const result = scoreImageCandidate(candidate, '3 Ways AI Search Is Changing Websites', 'AI & Technology');
      expect(result.score).toBeLessThan(0);
      expect(result.safe).toBe(false);
    });

    it('rejects unsafe adult / explicit content (-100 score)', () => {
      const candidate = {
        id: 'img-bad',
        url: 'https://images.example/bad.jpg',
        title: 'Explicit NSFW Content',
        author: 'Anon',
        license: 'CC0',
        licenseUrl: 'https://creativecommons.org/',
        sourceUrl: 'https://images.example/bad',
        tags: ['nsfw', 'porn'],
      };

      const result = scoreImageCandidate(candidate, 'Web Security', 'Security');
      expect(result.safe).toBe(false);
      expect(result.score).toBe(-100);
    });

    it('penalizes recently used image URLs to enforce visual diversity', () => {
      const candidate = {
        id: 'img-repeat',
        url: 'https://images.example/repeat.jpg',
        title: 'Digital Tech Workspace',
        author: 'Author',
        license: 'CC0',
        licenseUrl: 'https://creativecommons.org/',
        sourceUrl: 'https://images.example/repeat',
        tags: ['technology'],
      };

      const recentlyUsed = new Set(['https://images.example/repeat.jpg']);
      const freshResult = scoreImageCandidate(candidate, 'Web Development', 'Web');
      const usedResult = scoreImageCandidate(candidate, 'Web Development', 'Web', recentlyUsed);

      expect(usedResult.score).toBe(freshResult.score - 30);
    });
  });

  describe('findBestImage Execution', () => {
    it('returns candidate from openverse search results with match level details', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            results: [
              {
                id: 'img-1',
                url: 'https://images.example/tech.jpg',
                title: 'Artificial Intelligence Interface',
                creator: 'TechAuthor',
                license: 'cc0',
                foreign_landing_url: 'https://images.example/landing',
                tags: [{ name: 'technology' }, { name: 'ai' }],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      vi.stubGlobal('fetch', fetchMock);

      const service = new OpenverseImageService({} as Env);
      const found = await service.findBestImage(
        '3 Ways AI Search Is Changing Small Business Websites',
        'AI & Technology',
        'Post body content explaining search engines and artificial intelligence.',
      );

      expect(found).not.toBeNull();
      expect(found?.candidate.id).toBe('img-1');
      expect(found?.level).toBe('LEVEL_1_SPECIFIC');
      expect(found?.score).toBeGreaterThan(30);
    });
  });
});
