/**
 * NorthSoft.AI.ContentCreator — Autonomous Writer Service
 *
 * Transforms content idea angles into structured, highly engaging social media posts
 * for small and local business owners.
 */

import type { IAIProvider } from '../../ai/provider';
import { parseAiJsonResponse } from '../../core/json-parser';
import { formatResearchPromptPayload } from '../../core/security/prompt-injection';
import { QuotaManager } from '../ai/quota-manager';
import { PerformanceEngineService } from '../analytics/performance-engine';

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
  imageSearchQuery?: string;
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
Your objective is to turn a research-inspired topic into a clear, useful social media post (Facebook/Instagram) that helps an Icelandic small-business owner recognize a practical opportunity and consider contacting NorthSoft.

NorthSoft Brand Voice Guidelines:
- Tone: Natural, friendly, human conversational English speaking directly to a small business owner.
- Language: MUST be written strictly in English ("en").
- Write in natural, fluent English only.
- Start with a concise, specific hook. Explain one useful business implication in plain English and give practical next steps or a clear example. Use paragraphs; use a list only when a real list improves the post.
- Keep the body around 350-900 characters. A shorter post is acceptable if it delivers a complete useful point.
- Connect the idea to a relevant NorthSoft service only when the connection is genuine: websites, e-commerce, local SEO, online marketing, workflow automation, AI assistants, or email systems. Do not force the same service into every post.
- End with a contextual, low-pressure invitation to ask NorthSoft for help or learn more. Avoid a generic engagement question unless it fits naturally.
- Use 0-3 relevant hashtags only when they add value.

TOPIC-TO-POST APPROACH:
- The topic and article are an inspiration and factual anchor, not a brief to summarize or a rigid subject the entire post must explain.
- Find the practical consequence for a business owner: how customers discover them, how the website supports enquiries or sales, or which repetitive task consumes their time.
- Build a natural bridge from that consequence to a useful improvement NorthSoft could deliver. Example: changing search habits → a website needs clear, current, structured information → invite the owner to review whether their site is ready.
- Keep the bridge honest and conditional. Do not claim that a particular owner's site is outdated, that all customers have changed behavior, or that NorthSoft guarantees results unless the source or verified business facts support it.
- The post should read as complete social copy, not an article summary, an internal outline, or a set of instructions.
- Also provide a concise, concrete English imageSearchQuery (2-8 words) describing a visually searchable scene or metaphor for the main post idea. Prefer recognizable objects/scenes (for example, "robot assistant with search window"), not abstract words or the full topic sentence.

CRITICAL RULES:
1. ABSOLUTELY NO CORPORATE / MARKETING JARGON. The following buzzwords are FORBIDDEN:
   "unlock potential", "digital transformation", "game changer", "holistic approach", "scaling your business",
   "new era of entrepreneurship", "revolutionizing the way", "leverage synergy", "maximize conversion".
2. FACT PRESERVATION RULE: If the post uses specific numbers, percentages, or statistics from the source material, KEEP THEM 100% ACCURATE. NEVER fabricate or invent stats, percentages, quotes, or fake research not in the source material. If there are no numbers in the source, write a broad, honest observation without inventing fake numbers.
3. SUBSTANTIVE VALUE RULE: Do not return the topic title, angle, or source summary as the post. Add a useful business implication and practical context. A teaser that promises to explain something without doing so is not finished content.
4. FACT BOUNDARY: Keep factual statements about the article accurate. Clearly frame broader business advice as practical guidance or a possibility, not as a statistic or a finding from the article.

Return ONLY a valid JSON object matching this schema:
{
  "title": "Catchy post headline in English",
  "body": "Full social media post content in natural English",
  "language": "en",
  "tone": "conversational",
  "claims": [
    { "text": "Key practical observation", "sourceIds": ["src-1"] }
  ],
  "hashtags": ["#SmallBusiness"],
  "imageSearchQuery": "robot assistant with search window",
  "callToAction": "Subtle call to action or engaging question at the end"
}`;

    const perfEngine = new PerformanceEngineService();
    const perfProfile = await perfEngine.getActiveProfile(this.db).catch(() => null);

    let performanceContext = '';
    if (perfProfile && (perfProfile.successfulPatterns.length > 0 || perfProfile.failurePatterns.length > 0)) {
      performanceContext =
        '\n<<< CURRENT_PERFORMANCE_INSIGHTS >>>\n' +
        'Derived from real social media publication engagement metrics. Use these patterns for guidance on hook, tone, and structure. Do NOT copy verbatim.\n' +
        (perfProfile.successfulPatterns.length > 0 ? 'PATTERNS THAT CURRENTLY OUTPERFORM:\n' + perfProfile.successfulPatterns.map((p) => `- ${p}`).join('\n') + '\n' : '') +
        (perfProfile.failurePatterns.length > 0 ? 'PATTERNS THAT CURRENTLY UNDERPERFORM (AVOID):\n' + perfProfile.failurePatterns.map((p) => `- ${p}`).join('\n') + '\n' : '') +
        (perfProfile.successfulExamples.length > 0 ? 'HIGH-PERFORMING REPRESENTATIVE EXAMPLES (FOR INSPIRATION ONLY):\n' + perfProfile.successfulExamples.map((e) => `[Snippet]: ${e.snippet}`).join('\n') + '\n' : '') +
        '<<< END_PERFORMANCE_INSIGHTS >>>\n';
    }

    const researchContext =
      `Topic Title: ${topic.title}\n` +
      `Content Angle: ${topic.content_angle || topic.description}\n` +
      `Hook: ${topic.hook || topic.title}\n` +
      `Category/Pillar: ${topic.category}\n` +
      performanceContext +
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
        maxTokens: 1500,
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
        parsed = parseAiJsonResponse(rawText, { allowPlainTextFallback: true });
      } catch {
        return { error: 'Writer produced malformed JSON completion response.' };
      }

      const bodyText = typeof parsed.body === 'string' ? parsed.body.trim() : '';
      if (!bodyText || bodyText.length < 20) {
        return { error: 'Writer produced empty post body text.' };
      }

      if (isInstructionJsonOrInvalidPost(bodyText)) {
        return { error: 'Writer produced AI instruction JSON instead of social media post content.' };
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
        imageSearchQuery: typeof parsed.imageSearchQuery === 'string' ? parsed.imageSearchQuery.trim().slice(0, 120) : undefined,
        generatedAt: new Date().toISOString(),
      };

      return { draft };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { error: msg };
    }
  }
}

export function isInstructionJsonOrInvalidPost(bodyText: string): boolean {
  if (!bodyText || typeof bodyText !== 'string') return true;
  const trimmed = bodyText.trim();
  if (trimmed.length < 20) return true;

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object') {
        if (
          obj.instructions ||
          obj.requirements ||
          obj.steps ||
          obj.write_about ||
          obj.topic ||
          obj.role ||
          obj.system_prompt
        ) {
          return true;
        }
      }
    } catch {
      // Ignore parse failure
    }
  }

  if (
    trimmed.includes('"instructions":') ||
    trimmed.includes('"requirements":') ||
    trimmed.includes('"system_prompt":') ||
    trimmed.includes('"write_about":')
  ) {
    return true;
  }

  return false;
}
