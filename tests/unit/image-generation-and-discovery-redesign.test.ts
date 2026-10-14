import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { imagesRouter } from '../../src/api/admin/images';
import {
  AiImageGeneratorService,
  AI_IMAGE_DAILY_LIMIT,
  buildBusinessImagePrompt,
} from '../../src/services/content/ai-image-generator';
import { buildDiscoveryQueryHierarchy } from '../../src/services/content/image-service';
import type { AppEnv } from '../../src/index';

function createMockD1Database(existingRuns: any[] = [], existingCurated: any[] = []) {
  const runs = [...existingRuns];
  const curated = [...existingCurated];

  const prepare = (sql: string) => ({
    bind: (...args: any[]) => ({
      first: async () => {
        if (sql.includes("role = 'image_generator' AND status = 'completed'")) {
          const count = runs.filter((r) => r.role === 'image_generator' && r.status === 'completed').length;
          return { count };
        }
        if (sql.includes('SELECT SUM(request_count)')) {
          return { req_total: 5, neuron_total: 100, total: 5 };
        }
        return null;
      },
      all: async () => ({ results: [] }),
      run: async () => {
        if (sql.includes('INSERT INTO ai_runs')) {
          runs.push({
            role: args[1],
            model: args[2],
            provider: args[3],
            status: args[8],
          });
          return { meta: { changes: 1 } };
        }
        if (sql.includes('INSERT INTO curated_images')) {
          curated.push({
            id: args[0],
            title: args[1],
            source_type: args[2],
            source_url: args[3],
            r2_key: args[4],
            category: args[5],
            author: args[8],
            license: args[10],
            notes: args[12],
            status: args[13],
          });
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 0 } };
      },
    }),
    first: async () => null,
    all: async () => ({ results: [] }),
    run: async () => ({ meta: { changes: 0 } }),
  });

  return {
    db: {
      prepare,
      batch: async () => [],
    } as any,
    runs,
    curated,
  };
}

describe('Image Discovery Simplification & AI Image Generation Suite', () => {
  describe('1. Bounded Search Query Hierarchy & Retry Strategy', () => {
    it('generates exact description, broader business query, and category default scene', () => {
      const hierarchy = buildDiscoveryQueryHierarchy(
        'customer booking appointment calendar',
        'Customer Experience & Trust',
      );

      expect(hierarchy.length).toBeLessThanOrEqual(3);
      expect(hierarchy[0]).toBe('customer booking appointment calendar');
      // Should include broader business query
      expect(hierarchy.some((q) => q.includes('business'))).toBe(true);
      // Should include category scene
      expect(hierarchy.some((q) => q.toLowerCase().includes('customer') || q.toLowerCase().includes('shop') || q.toLowerCase().includes('store'))).toBe(true);
    });

    it('falls back to category scene when custom query is very short or specific', () => {
      const hierarchy = buildDiscoveryQueryHierarchy(
        'website speed',
        'Websites & Landing Pages',
      );
      expect(hierarchy.length).toBeGreaterThanOrEqual(2);
      expect(hierarchy[0]).toBe('website speed');
      expect(hierarchy[hierarchy.length - 1]).toContain('website design workspace');
    });
  });

  describe('2. Business Prompt Builder for Cloudflare Workers AI', () => {
    it('constructs a photorealistic commercial scene without artificial watermarks', () => {
      const prompt = buildBusinessImagePrompt(
        'small business owner reviewing laptop analytics',
        'Small Business Productivity & Ops',
        'Tips for streamlining weekly business tracking',
      );

      expect(prompt).toContain('Photorealistic modern commercial scene');
      expect(prompt).toContain('small business owner reviewing laptop analytics');
      expect(prompt).toContain('Small Business Productivity & Ops');
      expect(prompt).toContain('no watermarks');
      expect(prompt).toContain('Contemporary small business setting');
    });
  });

  describe('3. AI Image Generator — Provenance & Daily Quota Guard (1 image/day)', () => {
    it('enforces strict 1 image per day limit', async () => {
      // Setup D1 with 1 completed run already today
      const { db } = createMockD1Database([
        {
          role: 'image_generator',
          status: 'completed',
          created_at: new Date().toISOString(),
        },
      ]);

      const service = new AiImageGeneratorService({} as any);
      const quota = await service.checkDailyImageQuota(db);

      expect(quota.allowed).toBe(false);
      expect(quota.countToday).toBe(1);
      expect(quota.limit).toBe(AI_IMAGE_DAILY_LIMIT);
      expect(quota.reason).toContain('Daily AI image generation quota reached');
    });

    it('allows generation when 0 images generated today', async () => {
      const { db } = createMockD1Database([]);
      const service = new AiImageGeneratorService({} as any);
      const quota = await service.checkDailyImageQuota(db);

      expect(quota.allowed).toBe(true);
      expect(quota.countToday).toBe(0);
      expect(quota.limit).toBe(AI_IMAGE_DAILY_LIMIT);
    });

    it('persists generated image to Image Library with NorthSoft brand, internal license and PENDING status', async () => {
      const { db, curated, runs } = createMockD1Database([]);

      // Mock Cloudflare AI & R2 Bucket
      const mockBuffer = new Uint8Array(256).fill(42).buffer;
      const mockEnv: any = {
        AI: {
          run: async () => mockBuffer,
        },
        IMAGE_BUCKET: {
          put: async () => {},
        },
      };

      const service = new AiImageGeneratorService(mockEnv);
      const result = await service.generateAndPersistImage(db, 'https://ai.northsoft.is', {
        category: 'Websites & Landing Pages',
        description: 'laptop on clean modern wooden desk with sleek website layout',
      });

      expect(result.author).toBe('NorthSoft');
      expect(result.license).toBe('NorthSoft internal use');
      expect(result.status).toBe('PENDING');
      expect(result.r2Key).toMatch(/^gen-.*\.png$/);
      expect(result.sourceUrl).toContain('/media/');

      // Check curated_images record
      expect(curated.length).toBe(1);
      const saved = curated[0];
      expect(saved.author).toBe('NorthSoft');
      expect(saved.license).toBe('NorthSoft internal use');
      expect(saved.status).toBe('PENDING');

      // Check notes contain internal provenance
      const parsedNotes = JSON.parse(saved.notes);
      expect(parsedNotes.generatedBy).toBe('Cloudflare Workers AI');
      expect(parsedNotes.internalBrand).toBe('NorthSoft');
      expect(parsedNotes.usagePolicy).toBe('NorthSoft internal use');
      expect(parsedNotes.originalPrompt).toContain('laptop on clean modern wooden desk');

      // Check QuotaManager recorded execution in ai_runs
      expect(runs.length).toBe(1);
      expect(runs[0].role).toBe('image_generator');
      expect(runs[0].status).toBe('completed');
    });
  });

  describe('4. POST /api/admin/images/generate Route Endpoint', () => {
    it('returns HTTP 400 when description is missing', async () => {
      const app = new Hono<AppEnv>();
      app.use('*', async (c, next) => {
        c.set('session', { csrf_secret: 'test-csrf' } as any);
        await next();
      });
      app.route('/', imagesRouter);

      const req = new Request('http://localhost/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'test-csrf' },
        body: JSON.stringify({ category: 'General' }),
      });

      const res = await app.fetch(req, { DB: {} as any });
      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.success).toBe(false);
      expect(json.error).toContain('description or prompt is required');
    });

    it('returns HTTP 429 when daily generation quota is exceeded', async () => {
      const { db } = createMockD1Database([
        {
          role: 'image_generator',
          status: 'completed',
          created_at: new Date().toISOString(),
        },
      ]);

      const mockEnv: any = {
        DB: db,
        AI: { run: async () => new ArrayBuffer(10) },
        IMAGE_BUCKET: { put: async () => {} },
      };

      const app = new Hono<AppEnv>();
      app.use('*', async (c, next) => {
        c.set('session', { csrf_secret: 'test-csrf' } as any);
        await next();
      });
      app.route('/', imagesRouter);

      const req = new Request('http://localhost/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'test-csrf' },
        body: JSON.stringify({
          description: 'contemporary business meeting room',
          category: 'General',
        }),
      });

      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(429);
      const json = (await res.json()) as any;
      expect(json.success).toBe(false);
      expect(json.error).toContain('Daily AI image generation quota reached');
    });
  });
});
