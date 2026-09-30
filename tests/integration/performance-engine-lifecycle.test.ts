import { describe, expect, it } from 'vitest';
import { PerformanceEngineService } from '../../src/services/analytics/performance-engine';
import { WriterService } from '../../src/services/content/writer-service';

describe('Integration Test - Content Performance Engine & Topic Lifecycle Flow', () => {
  it('executes full topic -> post -> metrics -> engine evaluation -> writer feedback cycle', async () => {
    const mockPostsData = [
      {
        post_id: 'post-A',
        post_title: 'Tytuł A',
        post_content: 'Słaby post bez konkretów. Kup teraz nasz pakiet!',
        publication_id: 'pub-A',
        published_at: new Date().toISOString(),
        views: 1200,
        unique_views: 1000,
        reactions: 2,
        comments: 0,
        shares: 0,
        clicks: 0,
      },
      {
        post_id: 'post-B',
        post_title: 'Tytuł B',
        post_content: 'Średni post z przeglądem wiadomości technicznych.',
        publication_id: 'pub-B',
        published_at: new Date().toISOString(),
        views: 1100,
        unique_views: 1000,
        reactions: 10,
        comments: 2,
        shares: 1,
        clicks: 2,
      },
      {
        post_id: 'post-C',
        post_title: 'Tytuł C',
        post_content: 'Praktyczny poradnik: Jak krok po kroku zautomatyzować obsługę klienta w firmie?\n- Krok 1: Analiza zgłoszeń\n- Krok 2: Wdrożenie AI\n- Krok 3: Testy zespołowe.\nCzy korzystasz już z AI w pracy? Daj znać w komentarzu!',
        publication_id: 'pub-C',
        published_at: new Date().toISOString(),
        views: 1500,
        unique_views: 1000,
        reactions: 50,
        comments: 15,
        shares: 10,
        clicks: 20,
      },
    ];

    let savedProfileJson: string | null = null;

    const mockDb = {
      prepare: (sql: string) => {
        let boundArgs: any[] = [];
        const stmt = {
          bind: (...args: any[]) => {
            boundArgs = args;
            if (sql.includes('INSERT INTO performance_profiles')) {
              savedProfileJson = args[1];
            }
            return stmt;
          },
          first: async () => {
            if (sql.includes('FROM performance_profiles')) {
              return savedProfileJson ? { profile_json: savedProfileJson } : null;
            }
            if (sql.includes('FROM neuron_daily_usage')) {
              return { total_neurons: 0 };
            }
            return null;
          },
          all: async () => {
            if (sql.includes('FROM posts p')) {
              return { results: mockPostsData };
            }
            return { results: [] };
          },
          run: async () => {
            if (sql.includes('INSERT INTO performance_profiles') && boundArgs.length > 1) {
              savedProfileJson = boundArgs[1];
            }
            return { success: true };
          },
        };
        return stmt;
      },
      batch: async (statements: any[]) => {
        for (const st of statements) {
          if (st && typeof st.run === 'function') {
            await st.run();
          }
        }
        return [];
      },
    } as unknown as D1Database;

    // 1. Run Performance Engine Evaluation
    const engine = new PerformanceEngineService();
    const evalResult = await engine.evaluateAndGenerateProfile(mockDb);

    console.log('SAVED PROFILE JSON:', savedProfileJson);

    expect(evalResult.metricsSummary.totalEvaluated).toBe(3);
    expect(evalResult.metricsSummary.outperformingCount).toBeGreaterThanOrEqual(1); // Top relative candidate(s)
    expect(evalResult.metricsSummary.underperformingCount).toBe(1); // Post A

    // 2. Verify Writer AI receives dynamic performance profile during post generation
    let capturedUserPrompt = '';
    const mockAiProvider = {
      name: 'cloudflare-workers-ai',
      complete: async (req: any) => {
        const usr = req.messages.find((m: any) => m.role === 'user');
        capturedUserPrompt = usr?.content || '';
        return {
          content: JSON.stringify({
            title: 'Automatyzacja AI w obsłudze klienta',
            body: 'Praktyczny poradnik automatyzacji AI o odpowiedniej długości z konkretami.',
            language: 'en',
            tone: 'conversational',
            claims: [],
            hashtags: ['#AI'],
            imageSearchQuery: 'robot assistant',
            callToAction: 'Zapytaj NorthSoft',
          }),
          model: '@cf/meta/llama-3.1-8b-instruct',
          provider: 'cloudflare-workers-ai',
          usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
          finishReason: 'stop',
          durationMs: 50,
        };
      },
      healthCheck: async () => true,
    };

    const writer = new WriterService(mockDb, mockAiProvider as any);

    // Bypass quota limit check for unit/integration test run
    (writer as any).quotaManager = {
      checkCapacity: async () => ({ allowed: true }),
      recordUsage: async () => {},
    };

    const result = await writer.generateDraft(
      {
        id: 'topic-001',
        title: 'Automatyzacja obsługi klienta',
        description: 'Badania pokazują, że AI skraca czas odpowiedzi o 70%.',
        category: 'AI',
      },
      []
    );

    expect(result.draft).toBeDefined();
    expect(result.draft?.title).toBe('Automatyzacja AI w obsłudze klienta');
    expect(capturedUserPrompt).toContain('<<< CURRENT_PERFORMANCE_INSIGHTS >>>');
  });
});
