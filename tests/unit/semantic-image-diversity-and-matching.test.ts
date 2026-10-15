/**
 * NorthSoft.AI.ContentCreator — Semantic Image Diversity & Intelligent Post Matching Tests
 *
 * Verifies:
 * 1. Semantic metadata profile extraction and notes preservation.
 * 2. Dominant motif clustering and exclusion (team at screen, solo laptop, analytics review, etc.).
 * 3. Detection and rejection of semantic duplicates (even when cosmetically phrased with different devices or synonyms).
 * 4. Multi-directional creative exploration vectors per category without rigid prompt templates.
 * 5. 6-Pillar selective post-to-image matching (category, topic, emotional tone congruence, anti-contradiction, quality, recency).
 * 6. Emotional anti-contradiction (problem-aware post rejecting celebratory image; success post selecting positive image).
 * 7. Refusal to assign when alignment is insufficient (< 65 score) without forcing false matches.
 */

import { describe, expect, it } from 'vitest';
import {
  isSemanticallyDistinct,
  summarizeDominantThemes,
  detectEmotionalIntent,
  CATEGORY_CREATIVE_VECTORS,
  type CategoryHistoryItem,
  type GeneratedSceneConcept,
} from '../../src/services/content/ai-image-generator';
import {
  evaluatePostImageMatch,
  extractOrDeriveSemanticProfile,
} from '../../src/services/content/image-relevance-evaluator';

describe('Semantic Diversity & Intelligent Post-Image Matching Suite', () => {
  describe('1. Semantic Profile Extraction & Provenance Integrity', () => {
    it('extracts structured semantic profile from image notes when available', () => {
      const notesJson = JSON.stringify({
        semanticProfile: {
          sceneSummary: 'Cross-device responsive test showcasing smartphone and desktop simultaneously',
          subjects: 'Solo QA engineer',
          action: 'Verifying responsive breakpoints',
          objects: 'MacBook Pro and iPhone on wooden desk',
          businessContext: 'Websites & Landing Pages',
          emotionalTone: 'neutral',
          visualMotif: 'Cross-device layout',
          targetCategory: 'Websites & Landing Pages',
          keywords: ['responsive', 'breakpoints', 'mobile test'],
          provenance: {
            source: 'ai_generated',
            author: 'NorthSoft',
            license: 'NorthSoft internal use',
            model: '@cf/black-forest-labs/flux-1-schnell',
          },
        },
      });

      const profile = extractOrDeriveSemanticProfile({
        title: 'Responsive Multi-Device Layout',
        category: 'Websites & Landing Pages',
        notes: notesJson,
      });

      expect(profile.sceneSummary).toContain('Cross-device responsive test');
      expect(profile.visualMotif).toBe('Cross-device layout');
      expect(profile.provenance.license).toBe('NorthSoft internal use');
      expect(profile.emotionalTone).toBe('neutral');
    });

    it('conservatively derives semantic profile from metadata when notes are missing without fabricating unseen details', () => {
      const profile = extractOrDeriveSemanticProfile({
        title: 'Customer Service Counter Desk',
        category: 'Customer Experience & Trust',
        keywords: 'customer, counter, tablet, support',
        description: 'Customer being helped by support specialist at reception counter',
        author: 'John Doe',
        license: 'cc-by',
        sourceType: 'DISCOVERED',
      });

      expect(profile.sceneSummary).toBe('Customer being helped by support specialist at reception counter');
      expect(profile.visualMotif).toBe('Tablet interaction');
      expect(profile.provenance.source).toBe('discovered');
      expect(profile.provenance.author).toBe('John Doe');
    });
  });

  describe('2. History Motif Clustering & Overused Scene Suppression', () => {
    it('clusters dominant motifs including team-at-screen and solo-laptop setups from history', () => {
      const history: CategoryHistoryItem[] = [
        {
          id: '1',
          title: 'Team UX meeting',
          description: 'group of colleagues gathered around large screen discussing website UI',
          status: 'PUBLISHED',
          usageCount: 2,
          publishedCount: 1,
        },
        {
          id: '2',
          title: 'Laptop desk session',
          description: 'developer alone at desk staring directly at laptop screen',
          status: 'APPROVED',
          usageCount: 1,
          publishedCount: 0,
        },
        {
          id: '3',
          title: 'Funnel analytics review',
          description: 'analyzing online conversion funnel and bar charts on monitor',
          status: 'PENDING',
          usageCount: 0,
          publishedCount: 0,
        },
      ];

      const dominant = summarizeDominantThemes(history);
      expect(dominant.some((t) => t.includes('Team or colleagues gathered around a large screen'))).toBe(true);
      expect(dominant.some((t) => t.includes('Person working alone at a desk'))).toBe(true);
      expect(dominant.some((t) => t.includes('Reviewing bar charts, analytics graphs'))).toBe(true);
    });

    it('rejects candidate concept that replicates an existing library situation directly', () => {
      const history: CategoryHistoryItem[] = [
        {
          id: 'hist-screen-1',
          title: 'Team website review',
          description: 'Three colleagues gathered around a wall-mounted monitor analyzing landing page design',
          status: 'PUBLISHED',
          usageCount: 2,
          publishedCount: 1,
          situation: 'Colleagues gathered around monitor reviewing landing page wireframes',
          action: 'pointing at the monitor screen while coworker takes notes',
        },
      ];

      const candidateReplicating: GeneratedSceneConcept = {
        id: 'cand-1',
        situation: 'Colleagues gathered around monitor reviewing landing page wireframes',
        action: 'pointing at the monitor screen while coworker takes notes',
        relationship: 'group collaboration',
        businessNeed: 'UI review',
        emotionalTone: 'collaborative',
        visualMotif: 'large monitor display',
        promptDescription: 'team of creative colleagues gathered around large screen discussing UX interface wireframes',
        compositionGuidance: 'medium shot with warm office light',
        rationale: 'Reviewing wireframes',
      };

      const result = isSemanticallyDistinct(candidateReplicating, history);
      expect(result.distinct).toBe(false);
      expect(result.conflictReason).toContain('directly replicates historical entry');
    });

    it('accepts genuinely novel concept that changes the core situation to tangible multi-device layout', () => {
      const history: CategoryHistoryItem[] = [
        {
          id: 'hist-screen-1',
          title: 'Team website review',
          description: 'Three colleagues gathered around a wall-mounted monitor analyzing landing page design',
          status: 'PUBLISHED',
          usageCount: 2,
          publishedCount: 1,
        },
      ];

      const novelMultiDeviceConcept: GeneratedSceneConcept = {
        id: 'cand-novel-1',
        situation: 'Cross-device responsive layout showcase on oak table',
        action: 'arranging laptop, tablet, and smartphone side-by-side displaying synchronized adaptive interfaces',
        relationship: 'tangible hardware setup in bright architectural studio',
        businessNeed: 'cross-platform responsiveness verification',
        emotionalTone: 'neutral',
        visualMotif: 'three devices aligned displaying identical responsive site sections',
        promptDescription: 'a modern laptop, tablet, and smartphone placed neatly side-by-side on an oak surface displaying matching responsive web layouts',
        compositionGuidance: 'clean top-down angle, natural soft window daylight',
        rationale: 'Replaces human meeting with a pristine tangible hardware multi-device arrangement',
      };

      const result = isSemanticallyDistinct(novelMultiDeviceConcept, history);
      expect(result.distinct).toBe(true);
      expect(result.conflictReason).toBeUndefined();
    });
  });

  describe('3. Category Creative Vectors Guidance', () => {
    it('provides multi-directional exploration vectors for Websites & Landing Pages', () => {
      const vectors = CATEGORY_CREATIVE_VECTORS['Websites & Landing Pages'] || [];
      expect(vectors).toBeDefined();
      expect(vectors.length).toBeGreaterThanOrEqual(5);
      expect(vectors.some((v) => v.includes('responsive'))).toBe(true);
      expect(vectors.some((v) => v.includes('developer'))).toBe(true);
      expect(vectors.some((v) => v.includes('consultation'))).toBe(true);
      expect(vectors.some((v) => v.includes('usability'))).toBe(true);
    });
  });

  describe('4. Emotional Tone Detection & Anti-Contradiction Filtering', () => {
    it('accurately distinguishes problem-aware, positive, collaborative, and neutral post intents', () => {
      expect(detectEmotionalIntent('Dlaczego tracisz klientów przez wolną stronę i błędy mobilne?')).toBe('problem-aware');
      expect(detectEmotionalIntent('Wzrost konwersji o 35% i rekordowe wyniki po wdrożeniu nowego sklepu!')).toBe('positive');
      expect(detectEmotionalIntent('Jak prowadzimy warsztaty doradcze i spotkania strategiczne z klientami?')).toBe('collaborative');
      expect(detectEmotionalIntent('Architektura komponentów frontendowych w nowoczesnych aplikacjach.')).toBe('neutral');
    });

    it('heavily penalizes and rejects contradictory visual tone matches', () => {
      // Problem-aware post regarding lost sales / high bounce rates
      const problemPost = {
        postTitle: 'Dlaczego tracisz klientów przez wolną stronę?',
        category: 'Websites & Landing Pages',
        postContent: 'Frustracja użytkowników, wysoki wskaźnik porzuceń i spadek konwersji to bezpośrednie skutki błędów optymalizacyjnych.',
        emotionalIntent: 'problem-aware' as const,
      };

      // Celebratory joyful image (smiling celebration / high five)
      const joyfulImage = {
        id: 'img-celebration',
        title: 'Team High Five Celebration',
        category: 'Websites & Landing Pages',
        keywords: 'success, celebration, happy, winning, delight',
        description: 'Team cheering and celebrating winning victory in sunlit boardroom',
        notes: JSON.stringify({
          semanticProfile: {
            sceneSummary: 'Celebratory high-five victory',
            emotionalTone: 'positive',
            visualMotif: 'celebration',
          },
        }),
      };

      const match = evaluatePostImageMatch(joyfulImage, problemPost);
      expect(match.qualified).toBe(false);
      expect(match.emotionalCongruence).toBe('CONTRADICTORY');
      expect(match.disqualificationReason).toContain('Contradictory visual tone');
    });

    it('approves a problem-aware post with a focused diagnostic image', () => {
      const problemPost = {
        postTitle: 'Dlaczego tracisz klientów przez wolną stronę?',
        category: 'Websites & Landing Pages',
        postContent: 'Frustracja użytkowników, wolne ładowanie i spadek sprzedaży na urządzeniach mobilnych.',
        emotionalIntent: 'problem-aware' as const,
      };

      const diagnosticImage = {
        id: 'img-audit',
        title: 'Website Performance Diagnostic Audit',
        category: 'Websites & Landing Pages',
        keywords: 'website, performance, audit, diagnostics, mobile',
        description: 'Specialist inspecting mobile website responsiveness with analytical focus',
        notes: JSON.stringify({
          semanticProfile: {
            sceneSummary: 'Inspecting website performance bottlenecks',
            emotionalTone: 'problem-aware',
            visualMotif: 'mobile diagnostic inspection',
          },
        }),
        usageCount: 0,
      };

      const match = evaluatePostImageMatch(diagnosticImage, problemPost);
      expect(match.qualified).toBe(true);
      expect(match.emotionalCongruence).toBe('EXCELLENT');
      expect(match.score).toBeGreaterThanOrEqual(65);
    });
  });

  describe('5. Refusal to Force Non-Qualifying Images', () => {
    it('returns qualified: false when candidate has no topic or category alignment', () => {
      const ecommercePost = {
        postTitle: 'Jak zoptymalizować checkout w sklepie internetowym?',
        category: 'Sales & Conversion Process',
        postContent: 'Uproszczenie formularzy koszyka, płatności mobilne BLIK i zmniejszenie liczby kroków transakcji.',
        emotionalIntent: 'positive' as const,
      };

      const unrelatedImage = {
        id: 'img-gardening',
        title: 'Gardening Tools on Bench',
        category: 'Local Business & Regional Context',
        keywords: 'garden, flowers, spade, plants',
        description: 'Close up of gardening shears on wooden bench',
        usageCount: 0,
      };

      const match = evaluatePostImageMatch(unrelatedImage, ecommercePost);
      expect(match.qualified).toBe(false);
      expect(match.score).toBeLessThan(65);
    });
  });

  describe('6. Hardening: Concurrency, D1 Error Handling & Strict Non-Bypass', () => {
    it('throws AppError when D1 read fails in getCategoryConceptHistory (fail-closed, not empty)', async () => {
      const { getCategoryConceptHistory } = await import('../../src/services/content/ai-image-generator');
      const failingDb: any = {
        prepare: () => {
          throw new Error('D1 connection reset by peer');
        },
      };

      await expect(getCategoryConceptHistory(failingDb, 'Websites & Landing Pages')).rejects.toThrow(
        /Database error retrieving category image history/,
      );
    });

    it('rejects duplicate proposal even on attempt 2 without bypassing validation (strict non-bypass)', async () => {
      const { generateNovelImageConcept } = await import('../../src/services/content/ai-image-generator');

      const existingHistory = [
        {
          id: 'hist-screen-1',
          title: 'Team UX meeting',
          description: 'Three colleagues gathered around a screen analyzing website UI',
          status: 'PUBLISHED',
          usageCount: 1,
          publishedCount: 1,
          situation: 'Team gathered around a large screen discussing UX notes',
          action: 'pointing at screen',
        },
      ];

      // AI provider that repeatedly returns duplicate concepts on both attempts
      const repeatAIProvider = {
        name: 'mock-repeat',
        complete: async () => ({
          content: JSON.stringify({
            situation: 'Team gathered around a large screen discussing UX notes',
            action: 'pointing at the monitor',
            relationship: 'colleagues at screen',
            businessNeed: 'UI analysis',
            emotionalTone: 'collaborative',
            visualMotif: 'large screen',
            promptDescription: 'colleagues gathered around monitor discussing website metrics',
            compositionGuidance: 'natural lighting',
            rationale: 'Repeated idea',
          }),
          model: 'mock',
          provider: 'mock',
          usage: { promptTokens: 20, completionTokens: 20, totalTokens: 40 },
          finishReason: 'stop',
          durationMs: 10,
        }),
      };

      await expect(
        generateNovelImageConcept(
          repeatAIProvider as any,
          'Websites & Landing Pages',
          existingHistory,
        ),
      ).rejects.toThrow(/Unable to generate a sufficiently distinct scene concept within attempt limit/);
    });

    it('fails closed when D1 fails during quota check in checkDailyImageQuota', async () => {
      const { AiImageGeneratorService } = await import('../../src/services/content/ai-image-generator');
      const generator = new AiImageGeneratorService({} as any);

      const brokenDb: any = {
        prepare: (sql: string) => ({
          bind: () => ({
            run: async () => {},
            first: async () => {
              if (sql.includes('SELECT COUNT(*)')) {
                throw new Error('D1 internal disk error');
              }
              return null;
            },
          }),
        }),
      };

      const result = await generator.checkDailyImageQuota(brokenDb);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Database error verifying image generation quota');
    });

    it('prevents concurrent race conditions via atomic reserveDailyImageSlot', async () => {
      const { AiImageGeneratorService } = await import('../../src/services/content/ai-image-generator');
      const generator = new AiImageGeneratorService({} as any);

      const runs: any[] = [];
      const concurrentDb: any = {
        prepare: (sql: string) => ({
          bind: (...args: any[]) => ({
            run: async () => {
              if (sql.includes('INSERT INTO ai_runs')) {
                runs.push({
                  id: args[0],
                  role: 'image_generator',
                  status: 'running',
                  created_at: args[2] || new Date().toISOString(),
                });
              }
              if (sql.includes("status = 'failed'")) {
                const targetId = args[args.length - 1];
                const r = runs.find((item) => item.id === targetId);
                if (r) r.status = 'failed';
              }
              return { meta: { changes: 1 } };
            },
            first: async () => {
              if (sql.includes("role = 'image_generator' AND status IN ('completed', 'running')")) {
                // If checking post-insert, runs already has entries.
                const active = runs.filter((r) => r.role === 'image_generator' && (r.status === 'completed' || r.status === 'running'));
                return { count: active.length };
              }
              if (sql.includes('SELECT SUM(request_count)')) {
                return { req_total: 1, neuron_total: 100, total: 1 };
              }
              return null;
            },
          }),
        }),
      };

      // Two sequential attempts or interleaved attempts
      const slot1 = await generator.reserveDailyImageSlot(concurrentDb);
      const slot2 = await generator.reserveDailyImageSlot(concurrentDb);

      expect(slot1).not.toBeNull();
      expect(slot2).toBeNull();
    });
  });
});
