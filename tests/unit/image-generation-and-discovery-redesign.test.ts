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
        if (sql.includes("role = 'image_generator' AND status IN ('completed', 'running')") || sql.includes("role = 'image_generator' AND status = 'completed'")) {
          const count = runs.filter((r) => r.role === 'image_generator' && (r.status === 'completed' || r.status === 'running')).length;
          return { count };
        }
        if (sql.includes('SELECT SUM(request_count)')) {
          return { req_total: 5, neuron_total: 100, total: 5 };
        }
        if (sql.includes('SELECT author, source_url, license FROM curated_images')) {
          const target = curated.find((c) => c.id === args[0]);
          return target ? { author: target.author, source_url: target.source_url, license: target.license } : null;
        }
        return null;
      },
      all: async () => ({ results: [] }),
      run: async () => {
        if (sql.includes('INSERT INTO ai_runs')) {
          const role = sql.includes("'image_generator'") ? 'image_generator' : (args[1] || 'image_generator');
          const model = sql.includes("'image_generator'") ? args[1] : (args[2] || '');
          const status = sql.includes("'running'") ? 'running' : (args[4] || args[8] || 'completed');
          runs.push({
            id: args[0],
            role,
            model,
            status,
          });
          return { meta: { changes: 1 } };
        }
        if (sql.includes('UPDATE ai_runs')) {
          const targetId = args[args.length - 1];
          const target = runs.find((r) => r.id === targetId);
          if (target && sql.includes("status = 'completed'")) {
            target.status = 'completed';
          } else if (target && sql.includes("status = 'failed'")) {
            target.status = 'failed';
          }
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
        if (sql.includes('UPDATE curated_images')) {
          const targetId = args[args.length - 1];
          const target = curated.find((c) => c.id === targetId);
          if (target) {
            if (sql.includes('status = ?')) {
              target.status = args.find((a: any) => ['PENDING', 'APPROVED', 'REJECTED', 'DELETED'].includes(a));
            }
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
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

  describe('2. Business Prompt Builder & Scene Diversification', () => {
    it('constructs a modular commercial photograph prompt with separated scene, emotion, style, and clean screen guidelines', () => {
      const prompt = buildBusinessImagePrompt(
        'small business owner reviewing laptop analytics',
        'Small Business Productivity & Ops',
        'Tips for streamlining weekly business tracking',
      );

      // Modular non-overlapping structure
      expect(prompt).toContain('A 35mm candid commercial photograph of small business owner reviewing laptop analytics.');
      expect(prompt).toContain('Category: Small Business Productivity & Ops.');
      expect(prompt).toContain('Expression:');
      expect(prompt).toContain('Style: 35mm lens, natural directional window daylight');
      expect(prompt).toContain('realistic skin texture with fine pores');
      expect(prompt).toContain('Screens: any visible monitor, tablet or phone displays clean minimalist geometric blocks');

      // Verify no redundant AI buzzword spamming or conflicting tablet descriptions
      expect(prompt).not.toContain('ultra realistic');
      expect(prompt).not.toContain('hyper realistic');
      expect(prompt).not.toContain('holding a slim tablet resting on the tabletop');
    });

    it('detects semantic similarity and rejects concepts that only cosmetically swap devices', async () => {
      const { isSemanticallyDistinct } = await import('../../src/services/content/ai-image-generator');

      const history = [
        {
          id: 'img-1',
          title: 'Laptop on modern desk',
          description: 'business owner analyzing online funnel performance on laptop screen modern desk',
          status: 'PUBLISHED',
          usageCount: 2,
          publishedCount: 1,
          situation: 'Person working alone at a desk staring directly at a laptop screen',
          action: 'analyzing online funnel',
        },
      ];

      // Cosmetic swap: same situation, just tablet instead of laptop
      const cosmeticSwapConcept = {
        id: 'concept-test-1',
        situation: 'Person working alone at a desk staring directly at a laptop screen',
        action: 'reading analytics',
        relationship: 'solo user',
        businessNeed: 'funnel optimization',
        emotionalTone: 'problem-aware' as const,
        visualMotif: 'modern desk',
        promptDescription: 'founder reviewing funnel metrics on tablet',
        compositionGuidance: 'natural daylight',
        rationale: 'swapped laptop for tablet',
      };

      const resultCosmetic = isSemanticallyDistinct(cosmeticSwapConcept, history);
      expect(resultCosmetic.distinct).toBe(false);
      expect(resultCosmetic.conflictReason).toBeTruthy();

      // Truly distinct situation: client consultation with tangible samples
      const distinctConcept = {
        id: 'concept-test-2',
        situation: 'Interactive in-person consultation reviewing tangible timber samples',
        action: 'pointing at timber finish sample while client takes notes',
        relationship: 'advisor and client across consultation table',
        businessNeed: 'material selection and trust building',
        emotionalTone: 'collaborative' as const,
        visualMotif: 'oak material sample board',
        promptDescription: 'specialist and client examining oak material samples across a low timber table',
        compositionGuidance: 'natural soft daylight, candid conversational angle',
        rationale: 'Introduces tangible material interaction and collaboration',
      };

      const resultDistinct = isSemanticallyDistinct(distinctConcept, history);
      expect(resultDistinct.distinct).toBe(true);
      expect(resultDistinct.conflictReason).toBeUndefined();
    });

    it('generates a novel concept using AI provider with category history and post context', async () => {
      const { generateNovelImageConcept } = await import('../../src/services/content/ai-image-generator');

      const mockHistory = [
        {
          id: 'hist-1',
          title: 'Existing laptop setup',
          description: 'laptop on desk with website homepage',
          status: 'PUBLISHED',
          usageCount: 1,
          publishedCount: 1,
        },
      ];

      const mockAIProvider = {
        name: 'mock',
        complete: async () => ({
          content: JSON.stringify({
            situation: 'Diagnostic client consultation reviewing architectural floor plans',
            action: 'client gesturing toward paper blueprint layout while advisor listens attentively',
            relationship: 'client and architect across timber meeting table',
            businessNeed: 'collaborative spatial planning',
            emotionalTone: 'collaborative',
            visualMotif: 'architectural paper blueprint',
            promptDescription: 'architect and client discussing blueprint draft on sunlit oak table',
            compositionGuidance: 'wide candid shot with soft daylight',
            rationale: 'Moves away from solo computer screens to physical blueprint consultation',
          }),
          model: 'llama-3.1-8b-instruct',
          provider: 'mock',
          usage: { promptTokens: 50, completionTokens: 40, totalTokens: 90 },
          finishReason: 'stop',
          durationMs: 50,
        }),
      };

      const concept = await generateNovelImageConcept(
        mockAIProvider as any,
        'Websites & Landing Pages',
        mockHistory,
        'Dlaczego warto przeprowadzić audyt UX przed startem projektu?',
      );

      expect(concept).toBeDefined();
      expect(concept.situation).toBe('Diagnostic client consultation reviewing architectural floor plans');
      expect(concept.promptDescription).toContain('blueprint draft');
      expect(concept.emotionalTone).toBe('collaborative');
      expect(concept.visualMotif).toBe('architectural paper blueprint');
    });

    it('handles empty history gracefully without errors', async () => {
      const { isSemanticallyDistinct, summarizeDominantThemes } = await import('../../src/services/content/ai-image-generator');

      const distinctResult = isSemanticallyDistinct(
        {
          id: 'test-empty',
          situation: 'New business meeting',
          action: 'reviewing documents',
          relationship: 'partners',
          businessNeed: 'growth',
          emotionalTone: 'neutral',
          visualMotif: 'meeting table',
          promptDescription: 'business partners reviewing documents',
          compositionGuidance: 'natural daylight',
          rationale: 'first image in library',
        },
        [],
      );

      expect(distinctResult.distinct).toBe(true);

      const dominant = summarizeDominantThemes([]);
      expect(dominant.length).toBeGreaterThan(0);
      expect(dominant[0]).toContain('General modern office');
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

      expect(curated.length).toBe(1);
      const saved = curated[0];
      expect(saved.author).toBe('NorthSoft');
      expect(saved.license).toBe('NorthSoft internal use');
      expect(saved.status).toBe('PENDING');

      const parsedNotes = JSON.parse(saved.notes);
      expect(parsedNotes.generatedBy).toBe('Cloudflare Workers AI');
      expect(parsedNotes.internalBrand).toBe('NorthSoft');
      expect(parsedNotes.usagePolicy).toBe('NorthSoft internal use');
      expect(parsedNotes.originalPrompt).toContain('laptop on clean modern wooden desk');

      expect(runs.length).toBe(1);
      expect(runs[0].role).toBe('image_generator');
      expect(runs[0].status).toBe('completed');

      const updateResult = await service.generateAndPersistImage ? await new (await import('../../src/services/content/image-library-service')).ImageLibraryService(db).updateMetadata(result.id, { status: 'APPROVED' }) : false;
      expect(updateResult).toBe(true);
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

    it('returns HTTP 429 when daily generation quota is exceeded without force flag', async () => {
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

    it('allows generation when force flag is set to true even if quota was reached', async () => {
      const { db } = createMockD1Database([
        {
          role: 'image_generator',
          status: 'completed',
          created_at: new Date().toISOString(),
        },
      ]);

      const mockEnv: any = {
        DB: db,
        AI: { run: async () => new Uint8Array(256).fill(42).buffer },
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
          force: true,
        }),
      });

      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.image).toBeDefined();
    });

    it('GET /api/admin/images/quota returns current usage and quota status', async () => {
      const { db } = createMockD1Database([
        {
          role: 'image_generator',
          status: 'completed',
          created_at: new Date().toISOString(),
        },
      ]);

      const app = new Hono<AppEnv>();
      app.route('/', imagesRouter);

      const req = new Request('http://localhost/images/quota', {
        method: 'GET',
      });

      const res = await app.fetch(req, { DB: db });
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.countToday).toBe(1);
      expect(json.limit).toBe(1);
      expect(json.allowed).toBe(false);
    });

    it('GET /api/admin/images/suggest-prompt conceives novel scene concepts via AI text model based on category history', async () => {
      const { db } = createMockD1Database([], [
        {
          title: 'Laptop on desk',
          description: 'contemporary business website layout on laptop screen modern desk',
          category: 'Websites & Landing Pages',
          notes: JSON.stringify({
            sceneConcept: {
              situation: 'Person working alone at a desk staring directly at a laptop screen',
              action: 'working on laptop',
            },
          }),
        },
      ]);

      const mockAIResponse = JSON.stringify({
        situation: 'Customer and shopkeeper reviewing eco-friendly packaging options in boutique store',
        action: 'shopkeeper holding up sustainable craft paper box while customer touches the recycled texture',
        relationship: 'collaborative exchange across solid wood counter',
        businessNeed: 'brand transparency and environmental packaging',
        emotionalTone: 'positive',
        visualMotif: 'sustainable textured paper box',
        promptDescription: 'shopkeeper and customer reviewing craft paper box over timber counter with natural window light',
        compositionGuidance: 'candid eye-level documentary framing with soft daylight',
        rationale: 'Moves away from screens to tactile customer product interaction',
      });

      const mockEnv: any = {
        DB: db,
        AI: {
          run: async () => ({ response: mockAIResponse }),
        },
        ENVIRONMENT: 'test',
      };

      const app = new Hono<AppEnv>();
      app.route('/', imagesRouter);

      const req = new Request('http://localhost/images/suggest-prompt?category=Websites%20%26%20Landing%20Pages', {
        method: 'GET',
      });
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.success).toBe(true);
      expect(data.prompt).toBe('shopkeeper and customer reviewing craft paper box over timber counter with natural window light');
      expect(data.situation).toBe('Customer and shopkeeper reviewing eco-friendly packaging options in boutique store');
      expect(data.conceptId).toMatch(/^concept-/);
      expect(data.visualMotif).toBe('sustainable textured paper box');
      expect(data.emotionalTone).toBe('positive');
    });

    it('uses FLUX.1 Schnell model for high-fidelity generation without text corruption', async () => {
      const { AI_IMAGE_GENERATION_MODEL } = await import('../../src/services/content/ai-image-generator');
      expect(AI_IMAGE_GENERATION_MODEL).toBe('@cf/black-forest-labs/flux-1-schnell');
    });
  });
});
