/**
 * NorthSoft.AI.ContentCreator — Autonomous Writer Service
 *
 * Transforms content idea angles into structured, highly engaging social media posts
 * for small and local business owners.
 */

import type { IAIProvider } from '../../ai/provider';
import { formatResearchPromptPayload } from '../../core/security/prompt-injection';
import { QuotaManager } from '../ai/quota-manager';

export interface FactualClaim {
  text: string;
  sourceIds: string[];
}

export interface PostDraft {
  title: string;
  body: string;
  language: string;
  tone: string;
  topicId: string;
  sourceIds: string[];
  claims: FactualClaim[];
  hashtags: string[];
  callToAction?: string;
  generatedAt: string;
}

export interface ResearchSourceItem {
  id: string;
  title: string;
  url: string;
  summary: string;
}

export interface ResearchTopicItem {
  id: string;
  title: string;
  description: string;
  category: string;
  content_angle?: string;
  hook?: string;
}

export class WriterService {
  private quotaManager: QuotaManager;

  constructor(
    private db: D1Database,
    private aiProvider: IAIProvider,
  ) {
    this.quotaManager = new QuotaManager();
  }

  /**
   * Generates a structured social post draft from a queued content idea.
   */
  async generateDraft(
    topic: ResearchTopicItem,
    sources: ResearchSourceItem[],
  ): Promise<{ draft?: PostDraft; deferred?: boolean; error?: string }> {
    // 1. Pre-invocation Neuron Budget Check (estimated 1500 tokens/neurons for Writer)
    const capacity = await this.quotaManager.checkCapacity(
      this.db,
      this.aiProvider.name,
      'default',
      { estimatedNeuronCost: 1500 },
    );

    if (!capacity.allowed) {
      return {
        deferred: true,
        error: capacity.reason || 'Deferred due to AI neuron quota limit.',
      };
    }

    const systemPrompt = `You are a Social Media Copywriter for NorthSoft AI.
Your objective is to craft a short, engaging, highly practical social media post (Facebook/Instagram) for small business owners in Polish.

NorthSoft Brand Voice Guidelines:
- Tone: Natural, friendly, human conversational Polish speaking to a small business owner.
- Language: MUST be written in Polish ("pl").
- Structure:
  1. Scroll-stopping hook (first 1-2 lines).
  2. Quick bite of useful value / practical tip (3-5 bullet points).
  3. Engaging question to encourage comments & shares.
  4. Subtle, natural bridge showing how NorthSoft can help.
- Target post body length: 300 to 900 characters.
- Hashtags: 2-3 relevant hashtags (#MalyBiznes #StronyWWW #Automatyzacja).

CRITICAL RULES:
1. ABSOLUTELY NO CORPORATE / MARKETING JARGON. The following buzzwords are FORBIDDEN:
   "odblokuj potencjał", "transformacja cyfrowa", "game changer", "holistyczne podejście", "skalowanie biznesu",
   "nowa era przedsiębiorczości", "rewolucjonizuje sposób", "wykorzystaj synergię", "maksymalizuj konwersję".
2. FACT PRESERVATION RULE: If the post uses specific numbers, percentages, or statistics from the source material, KEEP THEM 100% ACCURATE. NEVER fabricate or invent stats, percentages, quotes, or fake research not in the source material. If there are no numbers in the source, write a broad, honest observation without inventing fake numbers.

Return ONLY a valid JSON object matching this schema:
{
  "title": "Chwytliwy nagłówek posta po polsku",
  "body": "Pełna treść posta social media po polsku",
  "language": "pl",
  "tone": "conversational",
  "claims": [
    { "text": "Kluczowa praktyczna obserwacja", "sourceIds": ["src-1"] }
  ],
  "hashtags": ["#MalyBiznes", "#StronyWWW"],
  "callToAction": "Subtelne wezwanie do działania / pytanie na końcu"
}`;

    const researchContext =
      `Topic Title: ${topic.title}\n` +
      `Content Angle: ${topic.content_angle || topic.description}\n` +
      `Hook: ${topic.hook || topic.title}\n` +
      `Category/Pillar: ${topic.category}\n` +
      `Sources:\n` +
      sources
        .map((s) => `[ID: ${s.id}] Title: ${s.title}\nURL: ${s.url}\nSummary: ${s.summary}`)
        .join('\n---\n');

    const { systemPrompt: boundedSystem, userPrompt } = formatResearchPromptPayload(
      systemPrompt,
      researchContext,
    );

    try {
      const completion = await this.aiProvider.complete({
        role: 'writer',
        messages: [
          { role: 'system', content: boundedSystem },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        responseFormat: 'json',
      });

      // Record AI usage via QuotaManager
      await this.quotaManager.recordUsage(this.db, {
        provider: completion.provider,
        model: completion.model,
        role: 'writer',
        inputTokens: completion.usage.promptTokens,
        outputTokens: completion.usage.completionTokens,
        success: true,
        durationMs: completion.durationMs,
      });

      const rawText = completion.content;
      let parsed: Record<string, unknown>;

      try {
        parsed = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        return { error: 'Writer produced malformed JSON completion response.' };
      }

      const bodyText = typeof parsed.body === 'string' ? parsed.body.trim() : '';
      if (!bodyText) {
        return { error: 'Writer produced empty post body text.' };
      }

      const claimsList: FactualClaim[] = Array.isArray(parsed.claims)
        ? (parsed.claims as Array<{ text?: string; sourceIds?: string[] }>).map((c) => ({
            text: typeof c.text === 'string' ? c.text : '',
            sourceIds: Array.isArray(c.sourceIds)
              ? c.sourceIds.filter((s): s is string => typeof s === 'string')
              : [],
          }))
        : [];

      const hashtagsList: string[] = Array.isArray(parsed.hashtags)
        ? (parsed.hashtags as string[]).filter((h) => typeof h === 'string')
        : [];

      const draft: PostDraft = {
        title: typeof parsed.title === 'string' ? parsed.title : topic.title,
        body: bodyText,
        language: typeof parsed.language === 'string' ? parsed.language : 'en',
        tone: typeof parsed.tone === 'string' ? parsed.tone : 'conversational',
        topicId: topic.id,
        sourceIds: sources.map((s) => s.id),
        claims: claimsList,
        hashtags: hashtagsList,
        callToAction: typeof parsed.callToAction === 'string' ? parsed.callToAction : undefined,
        generatedAt: new Date().toISOString(),
      };

      return { draft };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { error: msg };
    }
  }
}
