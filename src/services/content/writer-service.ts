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
import structureCatalog from './structure-catalog.json';

const basePrompt = `You are a skilled human copywriter writing social media posts (Facebook/Instagram) for NorthSoft AI — a company that helps small local businesses with websites, e-commerce, local SEO, online marketing, workflow automation, AI assistants, and email systems.

Your reader is a small-business owner — a shop owner, restaurant, tradesperson, or similar. They are practical, time-pressed, and scroll past anything that sounds corporate or generic.

OBJECTIVE:
Write a post that makes the reader feel it was written specifically for someone like them.

HOW TO THINK ABOUT IT — think in steps, but keep these steps invisible in the finished post:
1. ATTENTION: Start with something that makes them stop. A concrete observation, a recognizable situation, or a mildly surprising fact.
2. RECOGNITION: Let them see themselves — their customers, their daily reality, a frustration they know.
3. CONCRETE VALUE: Give them something genuinely useful — a specific insight, practical framing, or actionable observation. Not vague advice like "have a good website". Real substance.
4. CREDIBILITY: Stay honest. If you use a number, it must come from the source material. If there are no numbers, make a confident but honest observation. Never invent statistics.
5. NATURAL SOLUTION: If NorthSoft fits naturally, introduce it. If it doesn't fit, leave it out. Never force a mention.
6. OPTIONAL CTA: If a question, invitation, or next step feels natural, include one. If the post ends better without it, end without it.

LANGUAGE AND STYLE:
- Write in natural, conversational English. Use contractions (it's, you're, they've, can't).
- Vary sentence length deliberately — mix short punchy sentences with occasional longer ones.
- Write in paragraphs. Use a bullet list only when it genuinely improves clarity.
- Active voice. Avoid passive constructions.
- Body: 350–900 characters. Shorter is fine if the point is complete. Longer only if the content requires it.
- 0–3 hashtags, only where they feel natural. No hashtag stuffing.

WHAT TO AVOID:
- Corporate jargon: "unlock potential", "digital transformation", "game changer", "holistic approach", "scaling your business", "revolutionizing the way", "leverage synergy", "maximize conversion".
- Promotional filler: "In today's digital world...", "As a business owner, you know..."
- Abstract claims without specifics.
- Fabricated statistics or exaggerated claims.
- Forcing a NorthSoft mention when it doesn't fit naturally.
- Forcing a CTA when the post works better without one.
- Mandatory emojis — use only when they add genuine personality.

STRUCTURE GUIDANCE:
A suggested structure will be provided below. Treat it as a starting point, not a rigid template.
Override it entirely if a more natural structure emerges from the content.
The goal is a post that feels human — not one that follows a template.

Return ONLY a valid JSON object with this schema:
{
  "title": "Short post headline",
  "body": "Full post text in natural English",
  "language": "en",
  "tone": "conversational",
  "claims": [{ "text": "Key factual observation", "sourceIds": ["src-1"] }],
  "hashtags": ["#optional"],
  "imageSearchQuery": "2-8 word visual scene or metaphor (e.g. 'plumber checking phone for bookings')",
  "callToAction": "Optional closing line or question — omit if the post ends better without one"
}`;

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
  /**
   * Selects a structural pattern from the catalog.
   * Uses recent performance metrics to weight successful patterns higher.
   */
  private async selectStructurePattern(perfEngine: PerformanceEngineService): Promise<string> {
    const patterns = structureCatalog as Array<{ id: string; name: string; description: string; pattern: string }>;
    const profile = await perfEngine.getActiveProfile(this.db).catch(() => null);
    const weightMap: Record<string, number> = {};
    patterns.forEach((p) => (weightMap[p.id] = 1));
    if (profile && profile.successfulPatterns) {
      for (const sp of profile.successfulPatterns) {
        for (const p of patterns) {
          if (sp.toLowerCase().includes(p.name.toLowerCase())) {
            weightMap[p.id] = (weightMap[p.id] ?? 1) + 1;
          }
        }
      }
    }
    const weightedList: string[] = [];
    for (const p of patterns) {
      const w = weightMap[p.id] ?? 1;
      for (let i = 0; i < w; i++) weightedList.push(p.id);
    }
    if (weightedList.length === 0) return '';
    const chosenId = weightedList[Math.floor(Math.random() * weightedList.length)];
    const chosen = patterns.find((p) => p.id === chosenId);
    return chosen ? `Suggested structure: ${chosen.name}\nPattern: ${chosen.pattern}\nDescription: ${chosen.description}` : '';
  }

  private quotaManager: QuotaManager;

  constructor(
    private db: D1Database,
    private aiProvider: IAIProvider,
  ) {
    this.quotaManager = new QuotaManager();
  }

  /**
   * Generates a structured social post draft from a queued content idea.
   * @param correctionHint Optional corrective feedback from a previous failed attempt (drives targeted regeneration).
   */
  async generateDraft(
    topic: ResearchTopicItem,
    sources: ResearchSourceItem[],
    extraContext?: string,
    correctionHint?: string,
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

    // 2. Select a narrative structure hint
    const perfEngine = new PerformanceEngineService();
    const structureHint = await this.selectStructurePattern(perfEngine).catch(() => '');

    // 3. Retrieve style hints from performance engine
    const styleHintsJson = await perfEngine.extractStyleHints(this.db).catch(() => null);

    // 4. Build performance context (guidelines + reference examples)
    const contextPreview = await perfEngine.buildGeneratorContextPreview(this.db).catch(() => null);
    let performanceContext = '';
    if (contextPreview) {
      const parts: string[] = [];
      if (contextPreview.manualGuidelines.length > 0) {
        parts.push(
          'ADMIN EDITABLE GUIDELINES (HIGH PRIORITY):\n' +
            contextPreview.manualGuidelines.map((g) => `- ${g.guidelineText}`).join('\n'),
        );
      }
      if (contextPreview.learnedGuidelines.length > 0) {
        parts.push(
          'LEARNED PERFORMANCE GUIDELINES:\n' +
            contextPreview.learnedGuidelines.map((g) => `- [${g.category}] ${g.guidelineText}`).join('\n'),
        );
      }
      if (contextPreview.activeStrongExamples.length > 0) {
        parts.push(
          'ACTIVE STRONG EXAMPLES (FOR STRUCTURAL PATTERNS ONLY — DO NOT COPY SENTENCES 1:1):\n' +
            contextPreview.activeStrongExamples
              .map((e) => `- ${e.title}: ${e.reasonForInclusion}`)
              .join('\n'),
        );
      }
      if (contextPreview.activeWeakExamples.length > 0) {
        parts.push(
          'ACTIVE WEAK EXAMPLES (PATTERNS TO AVOID):\n' +
            contextPreview.activeWeakExamples
              .map((e) => `- ${e.title}: ${e.reasonForInclusion}`)
              .join('\n'),
        );
      }
      if (parts.length > 0) {
        performanceContext =
          '\n<<< CURRENT_PERFORMANCE_INSIGHTS >>>\n' +
          'Derived from real social media publication metrics & admin guidelines. Generalize structural insights without copying or paraphrasing sentences.\n' +
          parts.join('\n\n') +
          '\n<<< END_PERFORMANCE_INSIGHTS >>>\n';
      }
    }

    if (!performanceContext) {
      const perfProfile = await perfEngine.getActiveProfile(this.db).catch(() => null);
      if (
        perfProfile &&
        ((perfProfile.successfulPatterns?.length ?? 0) > 0 ||
          (perfProfile.failurePatterns?.length ?? 0) > 0)
      ) {
        performanceContext =
          '\n<<< CURRENT_PERFORMANCE_INSIGHTS >>>\n' +
          'Derived from real social media publication engagement metrics. Use these patterns for guidance on hook, tone, and structure. Do NOT copy verbatim.\n' +
          (perfProfile.successfulPatterns?.length > 0
            ? 'PATTERNS THAT CURRENTLY OUTPERFORM:\n' +
              perfProfile.successfulPatterns.map((p) => `- ${p}`).join('\n') +
              '\n'
            : '') +
          (perfProfile.failurePatterns?.length > 0
            ? 'PATTERNS THAT CURRENTLY UNDERPERFORM (AVOID):\n' +
              perfProfile.failurePatterns.map((p) => `- ${p}`).join('\n') +
              '\n'
            : '') +
          (perfProfile.successfulExamples?.length > 0
            ? 'HIGH-PERFORMING REPRESENTATIVE EXAMPLES (FOR INSPIRATION ONLY):\n' +
              perfProfile.successfulExamples
                .map((e) => `[Snippet]: ${e.snippet}`)
                .join('\n') +
              '\n'
            : '') +
          '<<< END_PERFORMANCE_INSIGHTS >>>\n';
      }
    }

    // 5. Assemble full system context (style hints + structure hint + extra context)
    let fullExtraContext = extraContext ?? '';
    if (structureHint) {
      fullExtraContext += `\n\n${structureHint}`;
    }
    if (styleHintsJson) {
      fullExtraContext +=
        `\n\n<<< STYLE_HINTS >>>\n` +
        `These hints describe tendencies of high-performing posts — treat as guidance, not prescriptions:\n` +
        styleHintsJson +
        `\n<<< END STYLE_HINTS >>>`;
    }
    if (correctionHint) {
      fullExtraContext +=
        `\n\nREGENERATION GUIDANCE — the previous draft was rejected for the following reason:\n${correctionHint}\n` +
        `Address these specific issues in the new draft. Do not reproduce the same structure.`;
    }

    const systemPrompt = fullExtraContext ? `${basePrompt}\n\n${fullExtraContext}` : basePrompt;

    // 6. Build research context (user message)
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
        imageSearchQuery:
          typeof parsed.imageSearchQuery === 'string'
            ? parsed.imageSearchQuery.trim().slice(0, 120)
            : undefined,
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
