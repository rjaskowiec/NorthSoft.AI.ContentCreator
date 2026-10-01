import { describe, expect, it, vi } from 'vitest';
import { app } from '../../src/index';
import { PerformanceEngineService } from '../../src/services/analytics/performance-engine';

function createMockDb() {
  const postsMap = new Map<string, Record<string, unknown>>();
  const versionsMap = new Map<string, Record<string, unknown>>();
  const publicationsMap = new Map<string, Record<string, unknown>>();
  const topicsMap = new Map<string, Record<string, unknown>>();

  const mockSessionRow = {
    session_id: 'sess-admin-1',
    admin_user_id: 'user-001',
    token_hash: 'token-hash',
    csrf_secret: 'csrf-secret-123',
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    session_created_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    revoked_at: null,
    user_id: 'user-001',
    username: 'rjaskowiec',
    user_status: 'active',
  };

  const prepare = vi.fn((sql: string) => {
    const normSql = sql.replace(/\s+/g, ' ').trim();

    if (normSql.includes('FROM admin_sessions')) {
      return {
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(mockSessionRow),
        }),
      };
    }

    if (normSql.startsWith('INSERT INTO posts')) {
      return {
        bind: vi.fn((...args: unknown[]) => ({
          run: vi.fn().mockImplementation(async () => {
            const id = args[0] as string;
            // INSERT INTO posts (id, idea_id, title, status, current_version, ...) or (id, title, status, current_version, quality_decision, ...)
            const ideaId = normSql.includes('idea_id') ? (args[1] as string | null) : null;
            const title = normSql.includes('idea_id') ? (args[2] as string) : (args[1] as string);
            const status = normSql.includes('idea_id') ? (args[3] as string) : (args[2] as string);
            const qualityDecision = normSql.includes('quality_decision')
              ? (normSql.includes('idea_id') ? (args[6] as string | null) : (args[4] as string | null))
              : null;
            postsMap.set(id, {
              id,
              idea_id: ideaId,
              title,
              status,
              current_version: 1,
              quality_decision: qualityDecision,
              created_at: new Date().toISOString(),
            });
            return { success: true };
          }),
        })),
      };
    }

    if (normSql.startsWith('INSERT INTO post_versions')) {
      return {
        bind: vi.fn((...args: unknown[]) => ({
          run: vi.fn().mockImplementation(async () => {
            const id = args[0] as string;
            const postId = args[1] as string;
            const content = args[3] as string;
            const aiProvider = normSql.includes('ai_provider') ? (args[args.length - 2] as string) : 'admin';
            versionsMap.set(id, {
              id,
              post_id: postId,
              version_number: 1,
              content,
              ai_provider: aiProvider,
            });
            return { success: true };
          }),
        })),
      };
    }

    if (normSql.startsWith('INSERT INTO publications')) {
      return {
        bind: vi.fn((...args: unknown[]) => ({
          run: vi.fn().mockImplementation(async () => {
            const id = args[0] as string;
            const postId = args[1] as string;
            const postVersionId = args[2] as string;
            const facebookPostId = args[3] as string;
            publicationsMap.set(id, {
              id,
              post_id: postId,
              post_version_id: postVersionId,
              facebook_post_id: facebookPostId,
              provider: 'facebook',
              status: 'published',
              published_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
            });
            return { success: true };
          }),
        })),
      };
    }

    // GET /api/admin/content/posts handler
    if (normSql.includes('FROM posts p') && normSql.includes('WHERE (? = \'\' OR p.id = ?)')) {
      return {
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockImplementation(async () => {
            const results = Array.from(postsMap.values()).filter((p) => {
              // Apply the exact SQL WHERE filters:
              // AND (p.quality_decision IS NULL OR p.quality_decision != 'IMPORTED')
              // AND (v.ai_provider IS NULL OR v.ai_provider != 'facebook')
              if (p.quality_decision === 'IMPORTED') return false;
              const version = Array.from(versionsMap.values()).find((v) => v.post_id === p.id);
              if (version && version.ai_provider === 'facebook') return false;
              return true;
            }).map((p) => {
              const version = Array.from(versionsMap.values()).find((v) => v.post_id === p.id);
              const topic = p.idea_id ? topicsMap.get(p.idea_id as string) : null;
              return {
                ...p,
                latest_body: version?.content || '',
                ai_provider: version?.ai_provider || null,
                topic_title: topic?.title || null,
              };
            });
            return { results };
          }),
        }),
      };
    }

    // GET /api/admin/publications handler
    if (normSql.includes('FROM publications pub')) {
      const allFn = vi.fn().mockImplementation(async () => {
        const results = Array.from(publicationsMap.values()).map((pub) => {
          const post = postsMap.get(pub.post_id as string);
          const version = versionsMap.get(pub.post_version_id as string);
          return {
            ...pub,
            post_title: post?.title || '',
            post_body: version?.content || '',
            topic_id: post?.idea_id || null,
          };
        });
        return { results };
      });
      const stmtObj = {
        bind: vi.fn(),
        all: allFn,
        first: vi.fn().mockResolvedValue({ scheduled: 0, publishing: 0, published: 1, failed: 0, retryable: 0, blocked: 0 }),
      };
      stmtObj.bind.mockReturnValue(stmtObj);
      return stmtObj;
    }

    // PerformanceEngine query handler
    if (normSql.includes('post_performance_metrics')) {
      return {
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockImplementation(async () => {
            const results = Array.from(publicationsMap.values()).map((pub) => {
              const post = postsMap.get(pub.post_id as string);
              const version = versionsMap.get(pub.post_version_id as string);
              return {
                post_id: pub.post_id,
                post_title: post?.title || '',
                post_content: version?.content || '',
                publication_id: pub.id,
                facebook_post_id: pub.facebook_post_id,
                published_at: pub.published_at,
                views: 500,
                reactions: 25,
                comments: 5,
                shares: 2,
              };
            });
            return { results };
          }),
        }),
        all: vi.fn().mockImplementation(async () => {
          const results = Array.from(publicationsMap.values()).map((pub) => {
            const post = postsMap.get(pub.post_id as string);
            const version = versionsMap.get(pub.post_version_id as string);
            return {
              post_id: pub.post_id,
              post_title: post?.title || '',
              post_content: version?.content || '',
              publication_id: pub.id,
              facebook_post_id: pub.facebook_post_id,
              published_at: pub.published_at,
              views: 500,
              reactions: 25,
              comments: 5,
              shares: 2,
            };
          });
          return { results };
        }),
      };
    }

    const defaultRes = {
      bind: vi.fn(),
      all: vi.fn().mockResolvedValue({ results: [] }),
      first: vi.fn().mockResolvedValue({ scheduled: 0, publishing: 0, published: 1, failed: 0, retryable: 0, blocked: 0 }),
      run: vi.fn().mockResolvedValue({ success: true }),
    };
    defaultRes.bind.mockReturnValue(defaultRes);
    return defaultRes;
  });

  const batch = vi.fn(async (statements: Array<{ run?: () => Promise<unknown> }>) => {
    for (const stmt of statements) {
      if (stmt && typeof stmt.run === 'function') {
        await stmt.run();
      }
    }
    return [];
  });

  return {
    prepare,
    batch,
    postsMap,
    versionsMap,
    publicationsMap,
    topicsMap,
  } as unknown as D1Database & {
    postsMap: Map<string, Record<string, unknown>>;
    versionsMap: Map<string, Record<string, unknown>>;
    publicationsMap: Map<string, Record<string, unknown>>;
    topicsMap: Map<string, Record<string, unknown>>;
  };
}

const authHeaders = {
  Cookie: 'admin_session=valid-admin-token-xyz',
  'x-csrf-token': 'csrf-secret-123',
  'Content-Type': 'application/json',
};

describe('Content Drafts vs Publications Classification Regression Tests', () => {
  it('excludes imported Facebook posts from Content Drafts while keeping them in Publications', async () => {
    const mockDb = createMockDb();
    const mockEnv = {
      DB: mockDb,
      ENVIRONMENT: 'staging',
      FACEBOOK_PUBLISH_ENABLED: 'false',
    };

    // 1. Seed System-Generated Draft (linked to topic)
    mockDb.topicsMap.set('topic-01', { id: 'topic-01', title: 'AI Automation Best Practices' });
    mockDb.postsMap.set('post-sys-draft', {
      id: 'post-sys-draft',
      idea_id: 'topic-01',
      title: 'AI Automation Best Practices Draft',
      status: 'draft',
      current_version: 1,
      quality_decision: 'PASS',
    });
    mockDb.versionsMap.set('ver-sys-draft', {
      id: 'ver-sys-draft',
      post_id: 'post-sys-draft',
      version_number: 1,
      content: 'Here are 5 tips for automating your website content.',
      ai_provider: 'workers-ai',
    });

    // 2. Seed System-Generated Published Post (linked to topic & published)
    mockDb.postsMap.set('post-sys-pub', {
      id: 'post-sys-pub',
      idea_id: 'topic-01',
      title: 'AI Automation Published Post',
      status: 'published',
      current_version: 1,
      quality_decision: 'PASS',
    });
    mockDb.versionsMap.set('ver-sys-pub', {
      id: 'ver-sys-pub',
      post_id: 'post-sys-pub',
      version_number: 1,
      content: 'Published guide on AI automation for small business.',
      ai_provider: 'workers-ai',
    });
    mockDb.publicationsMap.set('pub-sys', {
      id: 'pub-sys',
      post_id: 'post-sys-pub',
      post_version_id: 'ver-sys-pub',
      facebook_post_id: 'fb_111222333',
      provider: 'facebook',
      status: 'published',
      published_at: new Date().toISOString(),
    });

    // 3. Seed Manually Created Draft (no linked topic)
    mockDb.postsMap.set('post-manual-draft', {
      id: 'post-manual-draft',
      idea_id: null,
      title: 'Manual Admin Announcement Draft',
      status: 'draft',
      current_version: 1,
      quality_decision: 'PASS',
    });
    mockDb.versionsMap.set('ver-manual-draft', {
      id: 'ver-manual-draft',
      post_id: 'post-manual-draft',
      version_number: 1,
      content: 'We are launching new features next week!',
      ai_provider: 'admin',
    });

    // 4. Seed Facebook Sync Imported Post (No linked topic, quality_decision = IMPORTED, ai_provider = facebook)
    mockDb.postsMap.set('post-fb-imported', {
      id: 'post-fb-imported',
      idea_id: null,
      title: 'Imported Facebook post',
      status: 'published',
      current_version: 1,
      quality_decision: 'IMPORTED',
    });
    mockDb.versionsMap.set('ver-fb-imported', {
      id: 'ver-fb-imported',
      post_id: 'post-fb-imported',
      version_number: 1,
      content: 'Hello Facebook followers! Check out our legacy update.',
      ai_provider: 'facebook',
    });
    mockDb.publicationsMap.set('pub-fb-imported', {
      id: 'pub-fb-imported',
      post_id: 'post-fb-imported',
      post_version_id: 'ver-fb-imported',
      facebook_post_id: 'fb_999888777',
      provider: 'facebook',
      status: 'published',
      published_at: new Date().toISOString(),
    });

    // TEST A: Query GET /api/admin/content/posts (Content Drafts tab)
    const contentRes = await app.request('/api/admin/content/posts', {
      method: 'GET',
      headers: authHeaders,
    }, mockEnv);
    expect(contentRes.status).toBe(200);
    const contentData = (await contentRes.json()) as { posts: Array<{ id: string; quality_decision?: string }> };

    const returnedDraftIds = contentData.posts.map((p) => p.id);

    // Verify system draft, system published post, and manual draft ARE returned in Content Drafts
    expect(returnedDraftIds).toContain('post-sys-draft');
    expect(returnedDraftIds).toContain('post-sys-pub');
    expect(returnedDraftIds).toContain('post-manual-draft');

    // CRITICAL: Imported Facebook post with 'No linked topic' / quality_decision='IMPORTED' MUST NOT be in Content Drafts!
    expect(returnedDraftIds).not.toContain('post-fb-imported');

    // TEST B: Query GET /api/admin/publications (Publications tab)
    const pubRes = await app.request('/api/admin/publications', {
      method: 'GET',
      headers: authHeaders,
    }, mockEnv);
    if (pubRes.status !== 200) {
      console.error('PUB RES ERROR BODY:', await pubRes.text());
    }
    expect(pubRes.status).toBe(200);
    const pubData = (await pubRes.json()) as { publications: Array<{ id: string; postId: string }> };

    const returnedPubPostIds = pubData.publications.map((pub) => pub.postId);

    // Verify system published post AND imported Facebook post ARE both present in Publications
    expect(returnedPubPostIds).toContain('post-sys-pub');
    expect(returnedPubPostIds).toContain('post-fb-imported');

    // TEST C: Performance Engine still evaluates imported Facebook posts
    const engine = new PerformanceEngineService();
    const profile = await engine.evaluateAndGenerateProfile(mockDb);
    expect(profile).toBeDefined();
    expect(profile.diagnostics!.totalPublishedPosts).toBeGreaterThanOrEqual(2);
  });
});
