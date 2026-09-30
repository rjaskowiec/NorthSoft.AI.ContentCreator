import { describe, expect, it } from 'vitest';
import { ContentPlannerService } from '../../src/services/content/content-planner-service';
import { PublicationService } from '../../src/services/publishing/publication-service';

describe('Topic Lifecycle & Work Queue - Unit Tests', () => {
  it('transitions topic status to post_generated when post is created from topic', async () => {
    let topicStatusUpdated = false;

    const mockDb = {
      prepare: (sql: string) => {
        const stmt = {
          bind: (..._args: any[]) => {
            if (sql.includes('UPDATE content_ideas SET status = \'post_generated\'')) {
              topicStatusUpdated = true;
            }
            return stmt;
          },
          first: async () => {
            if (sql.includes('FROM content_ideas')) {
              return {
                id: 'topic-101',
                title: 'Jak wdrożyć sztuczną inteligencję w firmie',
                description: 'Praktyczny przewodnik po wdrożeniach AI',
                category: 'AI',
                content_angle: 'Krok po kroku wdrożenie AI',
                target_audience: 'B2B',
                status: 'ready',
              };
            }
            if (sql.includes('FROM posts')) {
              return { id: 'post-201', idea_id: 'topic-101', regeneration_count: 0 };
            }
            return null;
          },
          run: async () => ({ success: true, meta: { changes: 1 } }),
          all: async () => ({ results: [] }),
        };
        return stmt;
      },
    } as unknown as D1Database;

    const mockEnv = {
      AI_BACKGROUND_START_UTC: '18:00',
      AI_BACKGROUND_END_UTC: '23:30',
    } as unknown as Env;

    const planner = new ContentPlannerService(mockDb, mockEnv);

    (planner as any).quotaManager = { checkCapacity: async () => ({ allowed: true }) };
    (planner as any).staticValidator = { validate: () => ({ valid: true }) };
    (planner as any).contentQualityGate = { evaluate: () => ({ status: 'approved', score: 90 }) };
    (planner as any).policyService = { evaluate: () => ({ passed: true, violations: [], riskLevel: 'LOW' }) };
    (planner as any).auditLogger = { log: async () => {} };

    (planner as any).getWriterService = () => ({
      generateDraft: async () => ({
        draft: {
          title: 'Jak wdrożyć AI w firmie',
          body: 'Post o wdrażaniu AI w firmie o odpowiedniej długości.',
          language: 'en',
          tone: 'conversational',
          topicId: 'topic-101',
          sourceIds: [],
          claims: [],
          hashtags: [],
          generatedAt: new Date().toISOString(),
        },
      }),
    });

    (planner as any).getQaService = () => ({
      reviewDraft: async () => ({
        review: {
          score: 90,
          verdict: 'APPROVED',
          reasoning: 'Good post',
        },
      }),
    });

    const result = await planner.generatePostFromTopic('topic-101');

    expect(result.topicId).toBe('topic-101');
    expect(topicStatusUpdated).toBe(true);
  });

  it('transitions topic status to published when Facebook publication succeeds', async () => {
    let topicUpdatedToPublished = false;

    const mockDb = {
      prepare: (sql: string) => {
        const stmt = {
          bind: (..._args: any[]) => {
            if (sql.includes('UPDATE content_ideas SET status')) {
              topicUpdatedToPublished = true;
            }
            return stmt;
          },
          first: async () => {
            if (sql.includes('FROM posts')) {
              return {
                id: 'post-201',
                idea_id: 'topic-101',
                title: 'Jak wdrożyć AI',
                current_version: 1,
                version_id: 'v1',
                version_status: 'approved',
                post_status: 'approved',
                body: 'Treść wygenerowanego posta',
              };
            }
            if (sql.includes('FROM publications')) {
              return null;
            }
            return null;
          },
          run: async () => ({ success: true, meta: { changes: 1 } }),
          all: async () => ({ results: [] }),
        };
        return stmt;
      },
    } as unknown as D1Database;

    const mockMetaPublisher = {
      publish: async () => ({
        success: true,
        externalPostId: 'fb-999',
      }),
      getConfigStatus: async () => ({ configured: true, pageIdConfigured: true, tokenConfigured: true, publishEnabled: true }),
    };

    const pubService = new PublicationService(mockDb, mockMetaPublisher as any);
    const pub = await pubService.publishPost('post-201', { actor: 'admin' });

    expect(pub.success).toBe(true);
    expect(topicUpdatedToPublished).toBe(true);
  });
});
