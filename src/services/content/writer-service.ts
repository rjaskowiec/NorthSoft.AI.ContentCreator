/**
 * NorthSoft.AI.ContentCreator — Autonomous Writer Service
 *
 * Transforms research topics and evidence into structured, factually grounded
 * post drafts following NorthSoft's professional tone and zero-cost AI constraints.
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
   * Generates a structured post draft from an approved research topic.
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

    const systemPrompt = `You are a Senior Technical Content Writer for NorthSoft AI.
Your objective is to craft an engaging, clear, technically grounded Facebook post based STRICTLY on verified research evidence.

NorthSoft Brand Voice Guidelines:
- Tone: Professional, clear, technically grounded, accessible, human, confident.
- Strictly AVOID clickbait and exaggerated hype (NEVER use "Exciting news! 🚀", "Game changer!", "You won't believe...", "Revolutionary!").
- Target post body length: 400 to 1,200 characters.
- Hashtags: Maximum 2-3 relevant technical hashtags (e.g. #Cloudflare #WebDev).
- Include a subtle, value-driven call to action if appropriate.

Return ONLY a valid JSON object matching this schema:
{
  "title": "Clear headline for the post",
  "body": "Full post body text",
  "language": "en",
  "tone": "professional",
  "claims": [
    { "text": "Specific factual claim assertion", "sourceIds": ["src-1"] }
  ],
  "hashtags": ["#Category1", "#Category2"],
  "callToAction": "Subtle CTA text or null"
}`;

    const researchContext =
      `Topic: ${topic.title}\nDescription: ${topic.description}\n` +
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

      // Parse and validate structured output
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
        tone: typeof parsed.tone === 'string' ? parsed.tone : 'professional',
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
