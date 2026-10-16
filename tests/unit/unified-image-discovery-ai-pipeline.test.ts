import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { imagesRouter } from '../../src/api/admin/images';
import { PipelineOrchestratorService } from '../../src/services/content/pipeline-orchestrator-service';
import { ImageLibraryService } from '../../src/services/content/image-library-service';
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
          return { req_total: 1, neuron_total: 100, total: 1 };
        }
        if (sql.includes('SELECT COUNT(*) as total FROM curated_images')) {
          let filtered = curated.filter((c) => c.status !== 'DELETED');
          if (sql.includes("notes LIKE '%Cloudflare Workers AI%'")) {
            filtered = filtered.filter((c) => (c.notes && c.notes.includes('Cloudflare Workers AI')) || c.author === 'NorthSoft');
          } else if (sql.includes("source_type = 'DISCOVERED'")) {
            filtered = filtered.filter((c) => c.source_type === 'DISCOVERED' && c.author !== 'NorthSoft');
          }
          return { total: filtered.length };
        }
        if (sql.includes('SELECT id FROM curated_images WHERE source_url = ?')) {
          const found = curated.find((c) => c.source_url === args[0]);
          return found ? { id: found.id } : null;
        }
        return null;
      },
      all: async () => {
        if (sql.includes('SELECT * FROM curated_images')) {
          let filtered = curated.filter((c) => c.status !== 'DELETED');
          if (sql.includes("notes LIKE '%Cloudflare Workers AI%'")) {
            filtered = filtered.filter((c) => (c.notes && c.notes.includes('Cloudflare Workers AI')) || c.author === 'NorthSoft');
          }
          return { results: filtered };
        }
        return { results: [] };
      },
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
            status: args[13] || 'PENDING',
          });
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 0 } };
      },
    }),
    first: async () => {
      if (sql.includes('SELECT SUM(CASE WHEN status = \'PENDING\'')) {
        return { pending: curated.length, approved: 0, rejected: 0, used: 0, total: curated.length };
      }
      return null;
    },
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

describe('Unified Image Acquisition & AI Generation Pipeline Suite', () => {
  describe('1. Candidate Discovery Auto-Supplement with Workers AI', () => {
    it('automatically triggers AI generation when web search returns 0 candidates and quota allows', async () => {
      const { db, curated } = createMockD1Database([]);

      // Mock Openverse search returning empty array
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('openverse')) {
          return {
            ok: true,
            json: async () => ({ results: [] }),
          };
        }
        return { ok: false };
      }));

      const mockBuffer = new Uint8Array(256).fill(99).buffer;
      const mockEnv: any = {
        DB: db,
        AI: {
          run: vi.fn().mockResolvedValue(mockBuffer),
        },
        IMAGE_BUCKET: {
          put: vi.fn().mockResolvedValue({}),
        },
      };

      const app = new Hono<AppEnv>();
      app.use('*', async (c, next) => {
        c.set('session', { csrf_secret: 'test-csrf' } as any);
        await next();
      });
      app.route('/', imagesRouter);

      const req = new Request('http://localhost/images/candidate-discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'test-csrf' },
        body: JSON.stringify({
          query: 'rare custom icelandic tech infrastructure workflow',
          category: 'AI & Business Automation',
        }),
      });

      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;

      expect(json.success).toBe(true);
      expect(json.aiGeneratedCount).toBe(1);
      expect(json.addedCount).toBe(1);
      expect(curated.length).toBe(1);
      expect(curated[0].author).toBe('NorthSoft');
      expect(curated[0].license).toBe('NorthSoft internal use');
      expect(curated[0].status).toBe('PENDING');

      expect(json.steps.some((s: any) => s.step === 'ai_supplement')).toBe(true);
      vi.unstubAllGlobals();
    });

    it('gracefully skips AI generation without failing the task when quota limit is reached', async () => {
      // 1 run already today
      const { db, curated } = createMockD1Database([
        {
          role: 'image_generator',
          status: 'completed',
          created_at: new Date().toISOString(),
        },
      ]);

      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('openverse')) {
          return {
            ok: true,
            json: async () => ({ results: [] }),
          };
        }
        return { ok: false };
      }));

      const mockEnv: any = {
        DB: db,
        AI: { run: vi.fn() },
        IMAGE_BUCKET: { put: vi.fn() },
      };

      const app = new Hono<AppEnv>();
      app.use('*', async (c, next) => {
        c.set('session', { csrf_secret: 'test-csrf' } as any);
        await next();
      });
      app.route('/', imagesRouter);

      const req = new Request('http://localhost/images/candidate-discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'test-csrf' },
        body: JSON.stringify({
          query: 'obscure boutique topic',
          category: 'General',
        }),
      });

      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;

      expect(json.success).toBe(true);
      expect(json.aiGeneratedCount).toBe(0);
      expect(json.addedCount).toBe(0);
      expect(json.aiGenerationNotice).toContain('Daily AI image generation quota reached');
      expect(curated.length).toBe(0);
      vi.unstubAllGlobals();
    });
  });

  describe('2. Pipeline Orchestrator runImagesStage Automation Fallback', () => {
    it('attempts Workers AI generation when post has no library image and Openverse fails', async () => {
      const mockPost = {
        id: 'post-101',
        title: 'Automation for Local Retailers',
        content: 'How automated ordering streamlines customer experience.',
        category: 'Sales & Conversion Process',
      };

      const { db, curated } = createMockD1Database([]);

      // Mock D1 rows for runImagesStage
      const originalPrepare = db.prepare;
      db.prepare = vi.fn((sql: string) => {
        if (sql.includes('FROM posts p')) {
          return {
            bind: () => ({
              all: async () => ({ results: [mockPost] }),
            }),
            all: async () => ({ results: [mockPost] }),
          } as any;
        }
        if (sql.includes('SELECT id, status FROM curated_images WHERE status = \'APPROVED\'')) {
          return {
            bind: () => ({ all: async () => ({ results: [] }) }),
          } as any;
        }
        if (sql.includes('SELECT url FROM post_images ORDER BY created_at')) {
          return {
            all: async () => ({ results: [] }),
          } as any;
        }
        return originalPrepare(sql);
      });

      // Openverse returns nothing
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ({
        ok: true,
        json: async () => ({ results: [] }),
      })));

      const mockBuffer = new Uint8Array(256).fill(77).buffer;
      const mockEnv: any = {
        AI: {
          run: vi.fn().mockResolvedValue(mockBuffer),
        },
        IMAGE_BUCKET: {
          put: vi.fn().mockResolvedValue({}),
        },
      };

      const orchestrator = new PipelineOrchestratorService(db, mockEnv);
      const result = await orchestrator.runImagesStage('system', 5);

      expect(result.processed).toBe(1);
      expect(result.assignedFromLibrary).toBe(0);
      expect(result.assignedFromOpenverse).toBe(0);
      expect(result.generatedFromAi).toBe(1);
      expect(result.notFound).toBe(0);
      expect(result.details[0]?.source).toBe('ai');

      // Candidate saved into curated_images as PENDING
      expect(curated.length).toBe(1);
      expect(curated[0].author).toBe('NorthSoft');
      expect(curated[0].status).toBe('PENDING');

      vi.unstubAllGlobals();
    });
  });

  describe('3. Image Library Source Filtering', () => {
    it('filters images by AI source type vs web vs upload', async () => {
      const { db } = createMockD1Database([], [
        {
          id: 'img-1',
          title: 'AI Photo',
          source_type: 'UPLOADED',
          author: 'NorthSoft',
          notes: JSON.stringify({ generatedBy: 'Cloudflare Workers AI' }),
          status: 'PENDING',
        },
        {
          id: 'img-2',
          title: 'Openverse Photo',
          source_type: 'DISCOVERED',
          author: 'Wikimedia Author',
          notes: null,
          status: 'PENDING',
        },
      ]);

      const service = new ImageLibraryService(db);

      const aiOnly = await service.listImages({ source: 'AI' });
      expect(aiOnly.images.length).toBe(1);
      expect(aiOnly.images[0]?.title).toBe('AI Photo');

      const all = await service.listImages({ source: 'ALL' });
      expect(all.images.length).toBe(2);
    });
  });
});
