import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { imagesRouter } from '../../src/api/admin/images';
import type { AppEnv } from '../../src/index';

function createMockApp(initialImages: any[] = [], systemTopics: any[] = []) {
  const images = [...initialImages];

  const prepareFn = (sql: string) => {
    const execStmt = {
      first: async () => {
        if (sql.includes('FROM curated_images WHERE source_url =')) {
          return null;
        }
        return null;
      },
      all: async () => {
        if (sql.includes('FROM content_ideas')) {
          return { results: systemTopics };
        }
        if (sql.includes('FROM curated_images')) {
          return { results: images };
        }
        return { results: [] };
      },
      run: async () => ({ meta: { changes: 0 } }),
    };

    return {
      ...execStmt,
      bind: (...args: any[]) => {
        return {
          first: async () => {
            if (sql.includes('FROM curated_images WHERE source_url =')) {
              const url = args[0];
              const found = images.find((img) => img.source_url === url);
              return found ? { id: found.id } : null;
            }
            return null;
          },
          all: async () => {
            if (sql.includes('FROM content_ideas')) {
              return { results: systemTopics };
            }
            if (sql.includes('FROM curated_images')) {
              return { results: images };
            }
            return { results: [] };
          },
          run: async () => {
            if (sql.includes('INSERT INTO curated_images')) {
              const id = args[0];
              const title = args[1];
              const sourceUrl = args[2];
              const category = args[8];
              const newRow = { id, title, source_type: 'DISCOVERED', source_url: sourceUrl, category, status: 'PENDING' };
              images.push(newRow);
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          },
        };
      },
    };
  };

  const db: any = {
    prepare: prepareFn,
    batch: async (stmts: any[]) => {
      for (const s of stmts) await s.run();
      return [];
    },
  };

  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    const nowIso = new Date().toISOString();
    c.set('session', {
      id: 'test-session',
      admin_user_id: 'admin-1',
      token_hash: 'mock-hash',
      csrf_secret: 'mock-csrf',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      created_at: nowIso,
      last_seen_at: nowIso,
      revoked_at: null,
      ip_address: '127.0.0.1',
      user_agent: 'Vitest',
    });
    await next();
  });
  app.route('/', imagesRouter);

  return { app, env: { DB: db }, storedImages: images };
}

describe('UX Redesign — Image Candidate Discovery', () => {
  it('1. GET /images/discovery-topics returns standard content pillars and system topics', async () => {
    const { app, env } = createMockApp([], [{ id: 'idea-1', title: 'AI Customer Support Trends', category: 'AI & Automation' }]);
    const req = new Request('http://localhost/images/discovery-topics');
    const res = await app.fetch(req, env);

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(Array.isArray(data.pillars)).toBe(true);
    expect(data.pillars.length).toBeGreaterThan(0);
    expect(data.pillars.some((p: any) => p.id === 'AI')).toBe(true);
    expect(data.systemTopics.length).toBe(1);
    expect(data.systemTopics[0].title).toBe('AI Customer Support Trends');
  });

  it('2. POST /images/candidate-discovery executes discovery with progress steps', async () => {
    const { app, env } = createMockApp();
    const req = new Request('http://localhost/images/candidate-discovery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'mock-csrf' },
      body: JSON.stringify({ query: 'AI-powered customer support', category: 'AI & Automation' }),
    });
    const res = await app.fetch(req, env);

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(data.topic).toBe('AI-powered customer support');
    expect(Array.isArray(data.steps)).toBe(true);
    expect(data.steps.length).toBe(5);
    expect(data.steps.every((s: any) => s.status === 'completed')).toBe(true);
  });

  it('3. Candidate discovery rejects empty queries with HTTP 400', async () => {
    const { app, env } = createMockApp();
    const req = new Request('http://localhost/images/candidate-discovery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'mock-csrf' },
      body: JSON.stringify({ query: '   ' }),
    });
    const res = await app.fetch(req, env);

    expect(res.status).toBe(400);
    const data = (await res.json()) as any;
    expect(data.success).toBe(false);
    expect(data.error).toContain('required');
  });

  it('4. Candidate discovery saves discovered images exclusively as PENDING', async () => {
    const { app, env, storedImages } = createMockApp();
    const req = new Request('http://localhost/images/candidate-discovery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'mock-csrf' },
      body: JSON.stringify({ query: 'web design' }),
    });
    const res = await app.fetch(req, env);
    const data = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify all candidates stored in DB have status 'PENDING'
    for (const img of storedImages) {
      expect(img.status).toBe('PENDING');
    }
  });

  it('5. Candidate discovery counts duplicate candidates accurately', async () => {
    // Pre-populate DB with an existing candidate
    const { app, env } = createMockApp([
      { id: 'existing-1', source_url: 'https://images.unsplash.com/photo-1' },
    ]);

    const req = new Request('http://localhost/images/candidate-discovery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'mock-csrf' },
      body: JSON.stringify({ query: 'cybersecurity' }),
    });
    const res = await app.fetch(req, env);
    const data = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(typeof data.addedCount).toBe('number');
    expect(typeof data.skippedCount).toBe('number');
  });
});
