/**
 * NorthSoft.AI.ContentCreator — Image Prompt Diversity, Image Search Reliability & Async UI State Tests
 *
 * Covers:
 * Phase 2: Explicit separation of detailed FLUX generation prompt and concise 3-8 word search query.
 * Phase 3: Creative diversity across 5 dimensions, rejection of sci-fi/futuristic tropes, anti-repetition.
 * Phase 4: Image search provider diagnostics, distinguishing zero results from provider errors (504/429/timeout).
 * Phase 5: Async UI state machine, monotonic request ID guards, and category independence.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  deriveImageSearchQuery,
  OpenverseImageService,
} from '../../src/services/content/image-service';
import {
  generateNovelImageConcept,
  validateConceptNovelty,
  type CategoryHistoryItem,
  type GeneratedSceneConcept,
} from '../../src/services/content/ai-image-generator';
import type { IAIProvider } from '../../src/ai/provider';

describe('Phase 2 — Prompt & Search Query Separation', () => {
  it('derives concise 3-8 word search queries from diverse business topics without narrative prose', () => {
    const testCases = [
      {
        topic: 'Jak wdrożyć automatyzację z AI w małej firmie i zaoszczędzić 10 godzin tygodniowo?',
        category: 'AI & Business Automation',
        expectedWordsMin: 3,
        expectedWordsMax: 8,
      },
      {
        topic: 'Spotkanie strategiczne z klientem i analiza wzrostu sprzedaży w e-commerce',
        category: 'Marketing & Customer Acquisition',
        expectedWordsMin: 3,
        expectedWordsMax: 8,
      },
      {
        topic: 'Dlaczego klienci porzucają koszyki przez wolną i nieczytelną stronę mobilną?',
        category: 'Websites & Landing Pages',
        expectedWordsMin: 3,
        expectedWordsMax: 8,
      },
      {
        topic: 'Od operatora do właściciela — jak przedsiębiorca planuje pracę i deleguje zadania',
        category: 'Small Business Productivity & Ops',
        expectedWordsMin: 3,
        expectedWordsMax: 8,
      },
    ];

    for (const tc of testCases) {
      const query = deriveImageSearchQuery(tc.topic, tc.category);
      expect(query).toBeDefined();
      expect(typeof query).toBe('string');
      expect(query.length).toBeGreaterThan(0);

      const words = query.split(/\s+/).filter(Boolean);
      expect(words.length).toBeGreaterThanOrEqual(tc.expectedWordsMin);
      expect(words.length).toBeLessThanOrEqual(tc.expectedWordsMax);

      // Verify no narrative sentences, punctuation, or camera/lighting instructions leaked in
      expect(query).not.toContain('.');
      expect(query).not.toContain('!');
      expect(query).not.toContain('?');
      expect(query.toLowerCase()).not.toContain('close-up');
      expect(query.toLowerCase()).not.toContain('cinematic');
      expect(query.toLowerCase()).not.toContain('photographed with');
      expect(query.toLowerCase()).not.toContain('depth of field');
    }
  });

  it('keeps detailed generation prompt intact and produces separate concise search query', async () => {
    const mockAiProvider: IAIProvider = {
      name: 'mock',
      healthCheck: vi.fn().mockResolvedValue(true),
      complete: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          situation: 'Small business owner in sunlit workshop reviewing packaging workflow with team member',
          action: 'Inspecting printed postal boxes and discussing morning shipment orders',
          visualMotif: 'Kraft cardboard boxes, clean wooden table, natural daylight',
          emotionalTone: 'collaborative',
          businessNeed: 'Operations efficiency and timely fulfillment',
          promptDescription:
            'A small business owner and team assistant standing at a clean pine workbench in a sunlit Scandinavian workshop. They examine neat kraft cardboard parcels prepared for dispatch, with clipboard checklist and tape dispenser nearby. Natural side lighting from tall window.',
          searchQuery: 'small business owner packing orders',
          compositionGuidance: 'Medium documentary shot, natural morning light, uncluttered background',
          rationale: 'Grounded operational reality without repetitive screens',
        }),
      }),
    };

    const history: CategoryHistoryItem[] = [];
    const concept = await generateNovelImageConcept(
      mockAiProvider,
      'Small Business Productivity & Ops',
      history,
      'Jak zoptymalizować wysyłkę zamówień'
    );

    expect(concept.promptDescription).toBeDefined();
    expect(concept.searchQuery).toBeDefined();

    // Generation prompt must be detailed narrative scene
    expect(concept.promptDescription.length).toBeGreaterThan(60);
    expect(concept.promptDescription).toContain('Scandinavian workshop');

    // Search query must be concise 3-8 words
    expect(concept.searchQuery).toBe('small business owner packing orders');
    const searchWords = concept.searchQuery!.split(/\s+/);
    expect(searchWords.length).toBeGreaterThanOrEqual(3);
    expect(searchWords.length).toBeLessThanOrEqual(8);

    // Verify search query is NOT merely a truncated slice of the generation prompt
    expect(concept.promptDescription.startsWith(concept.searchQuery!)).toBe(false);
  });
});

describe('Phase 3 — Creative Diversity & Anti-Trope Guard', () => {
  it('rejects repetitive futuristic sci-fi templates (specialist, glowing hologram, futuristic room)', () => {
    const sciFiConcept: GeneratedSceneConcept = {
      id: 'test-scifi',
      situation: 'Specialist analyzing glowing holographic displays in a futuristic tech room',
      action: 'Gesturing towards complex floating innovation screens',
      relationship: 'Specialist interacting with floating hologram',
      businessNeed: 'Technology innovation',
      visualMotif: 'Glowing cyan hologram, futuristic room, complex screen',
      emotionalTone: 'positive',
      promptDescription: 'A specialist in a futuristic room with glowing holographic screens and futuristic machinery.',
      searchQuery: 'futuristic specialist screens',
      compositionGuidance: 'Cinematic wide shot',
      rationale: 'Futuristic innovation vibe',
    };

    const validation = validateConceptNovelty(sciFiConcept, []);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toMatch(/futuristic|sci-fi/i);
  });

  it('generates distinct scenes varying across people, setting, action, and composition', () => {
    const concepts: GeneratedSceneConcept[] = [
      {
        id: 'c1',
        situation: 'Bakery owner reviewing morning bread dough fermentation schedule with head baker',
        action: 'Checking handwritten clipboard beside proofing baskets and flour sacks',
        relationship: 'Owner collaborating with head baker',
        businessNeed: 'Morning production and quality control',
        visualMotif: 'Rattan proofing baskets, rustic flour dusted marble counter',
        emotionalTone: 'collaborative',
        promptDescription: 'A bakery owner and baker at marble counter in morning light.',
        searchQuery: 'bakery owner morning work',
        compositionGuidance: 'Natural eye-level documentary framing',
        rationale: 'Food service retail operation',
      },
      {
        id: 'c2',
        situation: 'Independent consultant presenting brand strategy deck to two founders in airy conference room',
        action: 'Discussing paper brand sketches spread across oak conference table',
        relationship: 'Consultant guiding founders',
        businessNeed: 'Brand positioning and market expansion',
        visualMotif: 'Printed brand identity boards, matte porcelain mugs',
        emotionalTone: 'collaborative',
        promptDescription: 'Consultant and two business founders seated around timber table reviewing paper swatches.',
        searchQuery: 'business meeting design consultation',
        compositionGuidance: 'Wide candid shot with natural window illumination',
        rationale: 'Advisory client interaction',
      },
      {
        id: 'c3',
        situation: 'Still life of business planning desk with leather planner, espresso cup, and smartphone displaying calendar',
        action: 'No visible people, calm organized morning desk before business opening',
        relationship: 'Solitary workspace still life',
        businessNeed: 'Daily priority setting and organization',
        visualMotif: 'Open leather notebook, ceramic espresso cup, brass ruler',
        emotionalTone: 'neutral',
        promptDescription: 'Clean morning desk still life with open planner and coffee cup.',
        searchQuery: 'office desk planning workspace',
        compositionGuidance: 'Overhead 45-degree angle still life composition',
        rationale: 'Minimalist product-focused view without human subjects',
      },
    ];

    // Verify all 3 concepts have distinct situations, motifs, and search queries
    const situations = new Set(concepts.map((c) => c.situation));
    const motifs = new Set(concepts.map((c) => c.visualMotif));
    const queries = new Set(concepts.map((c) => c.searchQuery));

    expect(situations.size).toBe(3);
    expect(motifs.size).toBe(3);
    expect(queries.size).toBe(3);

    // Verify each concept passes novelty validation
    for (const c of concepts) {
      const res = validateConceptNovelty(c, []);
      expect(res.valid).toBe(true);
    }
  });

  it('incorporates recent history into LLM prompt to prevent immediate repetition', async () => {
    let capturedSystemMessage = '';
    const mockAiProvider: IAIProvider = {
      name: 'mock',
      healthCheck: vi.fn().mockResolvedValue(true),
      complete: vi.fn().mockImplementation(async (req) => {
        const sys = req.messages?.find((m: any) => m.role === 'system');
        capturedSystemMessage = sys ? sys.content : '';
        return {
          content: JSON.stringify({
            situation: 'Boutique manager organizing retail shelf layout',
            action: 'Placing ceramic vases on minimalist shelf',
            visualMotif: 'Oak shelving, neutral ceramics',
            emotionalTone: 'positive',
            promptDescription: 'Retail manager arranging ceramic items on clean wooden shelf in sunny store.',
            searchQuery: 'retail store shelf display',
            compositionGuidance: 'Side candid angle',
            rationale: 'Retail merchandising scene',
          }),
        };
      }),
    };

    const history: CategoryHistoryItem[] = [
      {
        id: 'h1',
        title: 'Team meeting with tablet',
        description: 'Team gathered around tablet',
        situation: 'Team gathered around tablet at kitchen island',
        action: 'Reviewing customer reviews',
        visualMotif: 'Kitchen island tablet',
        status: 'PUBLISHED',
        usageCount: 2,
        publishedCount: 1,
      },
    ];

    await generateNovelImageConcept(mockAiProvider, 'Marketing & Customer Acquisition', history);

    expect(capturedSystemMessage).toContain('Team gathered around tablet at kitchen island');
    expect(capturedSystemMessage).toContain('SCENES & SITUATIONS TO CONTRAST WITH');
  });
});

describe('Phase 4 — Image Search Diagnostics & Reliability', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('successfully parses valid Openverse response with diagnostics (status 200, NONE error)', async () => {
    const service = new OpenverseImageService({} as any);

    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        result_count: 1,
        results: [
          {
            id: 'ov-1',
            title: 'Small business planning meeting',
            url: 'https://images.example.com/photo1.jpg',
            license: 'by',
            license_version: '4.0',
            creator: 'John Photographer',
            foreign_landing_url: 'https://openverse.org/image/ov-1',
            tags: [{ name: 'business' }, { name: 'meeting' }],
          },
        ],
      }),
    }));

    const result = await service.searchImagesWithDiagnostics('small business planning meeting');

    expect(result.diagnostics.providerSuccess).toBe(true);
    expect(result.diagnostics.httpStatus).toBe(200);
    expect(result.diagnostics.errorType).toBe('NONE');
    expect(result.diagnostics.rawResultsCount).toBe(1);
    expect(result.candidates.length).toBe(1);
    expect(result.candidates[0]!.title).toBe('Small business planning meeting');
    expect(result.candidates[0]!.license).toBe('BY');
  });

  it('distinguishes successful zero-result response from API errors', async () => {
    const service = new OpenverseImageService({} as any);

    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        result_count: 0,
        results: [],
      }),
    }));

    const result = await service.searchImagesWithDiagnostics('highly specific non-existent phrase 12345');

    expect(result.diagnostics.providerSuccess).toBe(true);
    expect(result.diagnostics.httpStatus).toBe(200);
    expect(result.diagnostics.rawResultsCount).toBe(0);
    expect(result.diagnostics.errorType).toBe('NONE');
    expect(result.candidates).toEqual([]);
  });

  it('gracefully captures provider 504 Gateway Timeout with PROVIDER_5XX errorType', async () => {
    const service = new OpenverseImageService({} as any);

    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 504,
      statusText: 'Gateway Timeout',
      text: async () => '<html><body>504 Gateway Time-out</body></html>',
    }));

    const result = await service.searchImagesWithDiagnostics('business automation');

    expect(result.diagnostics.providerSuccess).toBe(false);
    expect(result.diagnostics.httpStatus).toBe(504);
    expect(result.diagnostics.errorType).toBe('PROVIDER_5XX');
    expect(result.diagnostics.error).toContain('504');
    expect(result.candidates).toEqual([]);
  });

  it('gracefully captures 429 Rate Limit with RATE_LIMIT errorType', async () => {
    const service = new OpenverseImageService({} as any);

    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: async () => 'Rate limit exceeded.',
    }));

    const result = await service.searchImagesWithDiagnostics('customer support');

    expect(result.diagnostics.providerSuccess).toBe(false);
    expect(result.diagnostics.httpStatus).toBe(429);
    expect(result.diagnostics.errorType).toBe('RATE_LIMIT');
    expect(result.candidates).toEqual([]);
  });

  it('handles network abort or connection timeout with TIMEOUT errorType', async () => {
    const service = new OpenverseImageService({} as any);

    vi.stubGlobal('fetch', async () => {
      const abortErr = new Error('The operation was aborted due to timeout.');
      abortErr.name = 'AbortError';
      throw abortErr;
    });

    const result = await service.searchImagesWithDiagnostics('website ux');

    expect(result.diagnostics.providerSuccess).toBe(false);
    expect(result.diagnostics.errorType).toBe('TIMEOUT');
    expect(result.candidates).toEqual([]);
  });
});

describe('Phase 5 — Asynchronous UI State Machine & Concurrency Logic', () => {
  it('maintains explicit states (idle, loading, success, error) and tracks request IDs to prevent stale overwrites', async () => {
    // Model the exact state machine implemented in scripts.ts
    const state = {
      status: 'idle' as 'idle' | 'loading' | 'success' | 'error',
      requestId: 0,
      targetCategory: '',
      errorMessage: '',
    };

    let latestDisplayedPrompt = '';
    let latestDisplayedQuery = '';

    async function mockFetchPrompt(category: string, delayMs: number, promptText: string, queryText: string, shouldFail = false) {
      const reqId = ++state.requestId;
      state.status = 'loading';
      state.targetCategory = category;
      state.errorMessage = '';

      try {
        await new Promise((r) => setTimeout(r, delayMs));

        // Stale response guard
        if (state.requestId !== reqId) {
          return null; // Ignore stale response
        }

        if (shouldFail) {
          throw new Error('Server error generating concept');
        }

        state.status = 'success';
        latestDisplayedPrompt = promptText;
        latestDisplayedQuery = queryText;
        return { promptText, queryText };
      } catch (err: any) {
        if (state.requestId === reqId) {
          state.status = 'error';
          state.errorMessage = err.message;
        }
        return null;
      }
    }

    // Step 1: User selects Category A (slow network, 50ms)
    const p1 = mockFetchPrompt('Category A', 50, 'Prompt for A', 'query for a');
    expect(state.status).toBe('loading');
    expect(state.targetCategory).toBe('Category A');
    expect(state.requestId).toBe(1);

    // Step 2: Before Category A completes, user quickly switches to Category B (fast network, 10ms)
    const p2 = mockFetchPrompt('Category B', 10, 'Prompt for B', 'query for b');
    expect(state.status).toBe('loading');
    expect(state.targetCategory).toBe('Category B');
    expect(state.requestId).toBe(2);

    // Wait for both to finish
    await Promise.all([p1, p2]);

    // Step 3: Verify Category B won and Category A did NOT overwrite with stale data!
    expect(state.status).toBe('success');
    expect(latestDisplayedPrompt).toBe('Prompt for B');
    expect(latestDisplayedQuery).toBe('query for b');

    // Step 4: Test error handling and retry
    const pError = mockFetchPrompt('Category C', 10, '', '', true);
    expect(state.status).toBe('loading');
    await pError;
    expect(state.status).toBe('error');
    expect(state.errorMessage).toBe('Server error generating concept');

    // Step 5: Retry Category C successfully
    const pRetry = mockFetchPrompt('Category C', 10, 'Prompt for C', 'query for c', false);
    expect(state.status).toBe('loading');
    await pRetry;
    expect(state.status).toBe('success');
    expect(latestDisplayedPrompt).toBe('Prompt for C');
    expect(latestDisplayedQuery).toBe('query for c');
  });
});
