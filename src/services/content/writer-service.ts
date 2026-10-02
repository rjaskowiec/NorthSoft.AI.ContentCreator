/**
 * NorthSoft.AI.ContentCreator — Autonomous Writer Service
 *
 * Transforms content idea seeds into structured, highly engaging organic social media posts
 * (Facebook/Instagram) for small and local business owners.
 *
 * Grounded in current research (Sprout Social 2025/2026, Ogilvy, Heath & Heath):
 * - Audience is the hero; NorthSoft is a potential humble facilitator.
 * - Conceptual 5-stage thinking: Audience -> Problem -> Angle -> Structure -> Social Post.
 * - Concrete real-world scenarios and high information gain over sentence-by-sentence paraphrasing.
 * - Visual rhythm: short paragraphs, whitespace, scannable cadence.
 * - Contextual, earned CTAs with no empty engagement bait.
 */

import type { IAIProvider } from '../../ai/provider';
import { parseAiJsonResponse } from '../../core/json-parser';
import { formatResearchPromptPayload } from '../../core/security/prompt-injection';
import { QuotaManager } from '../ai/quota-manager';
import { PerformanceEngineService } from '../analytics/performance-engine';
import { selectStructurePattern, type StructurePattern } from './structure-catalog';

const basePrompt = `You are an expert human copywriter writing organic social media posts (Facebook & Instagram) for NorthSoft AI — a company that helps small and local businesses with websites, e-commerce, local SEO, online marketing, workflow automation, and email systems.

YOUR AUDIENCE:
A busy small-business owner — a shop owner, clinic director, tradesperson, restaurateur, or local service provider.
They scroll Facebook/Instagram with their thumb between jobs or after a long day.
They instantly swipe past anything that sounds corporate, preachy, or like generic AI marketing filler.
They stop only for content that feels recognizable, specific, and genuinely useful to their daily business reality.

PHILOSOPHY & OBJECTIVE:
Write a post that makes the reader think: "That is actually useful / interesting / relevant to me."
The reader and their business must be the HERO of the post.
NorthSoft is only a potential humble facilitator — never the protagonist.
The post must deliver real value on its own, even if the reader never contacts NorthSoft.

5-STEP CONCEPTUAL THINKING PROCESS (You must articulate this in the JSON output):
1. AUDIENCE CONTEXT: Identify who this is specifically for and what concrete friction or situation they face in daily operations.
2. CONTENT ANGLE: Choose an interesting angle (e.g., A common mistake, A surprising observation, A real-world customer scenario, A before/after contrast, A hidden cost of delay, A misconception debunked, A practical 15-minute tip).
3. REASONING STRUCTURE: Follow a clear communication flow (e.g., Scenario → Problem → Insight, Observation → Implication → Action, Mistake → Consequence → Better Approach).
4. READER VALUE / INFORMATION GAIN: What concrete insight, mechanism, or actionable takeaway does this post add beyond the raw background notes?
5. VISUAL & RHYTHMIC SOCIAL POST: Write the draft with short paragraphs (1-3 sentences), intentional line breaks, whitespace, and varied sentence rhythm.

CRITICAL ANTI-PARAPHRASE DIRECTIVE:
- DO NOT rewrite, summarize, or paraphrase the background material sentence-by-sentence.
- The supplied notes are raw inspiration, NOT text to rephrase or polish.
- Extract the underlying business dilemma and build an entirely fresh social post with concrete scenarios and new information gain.

VISUAL RHYTHM & FORMATTING:
- Write in short paragraphs (1 to 3 sentences maximum per block).
- Separate paragraphs with blank lines for mobile scannability.
- Vary sentence length deliberately — mix punchy short lines with explanatory sentences.
- NEVER write a single solid block / wall of text.
- Use natural contractions (it's, you're, they've, can't, don't, isn't, here's, won't).
- Body length: typically 250–850 characters. Punchy and complete.

CTA & ENGAGEMENT RULES:
- DO NOT append generic engagement questions like "What's the one thing you wish you could improve about your website?".
- DO NOT use lazy engagement bait ("What do you think? Drop a comment below!").
- Posts do NOT require a question to be successful. A strong conclusion often works best without a question.
- If NorthSoft fits naturally, introduce it as a low-pressure helper at the very end. If it does not fit, leave it out.
- Never force an aggressive CTA ("Contact NorthSoft today to unlock your potential").

WHAT TO AVOID:
- Corporate buzzwords: "unlock potential", "digital transformation", "game changer", "holistic approach", "scaling your business", "revolutionizing the way", "leverage synergy", "maximize conversion".
- Generic AI marketing clichés: "In today's digital world...", "As a business owner, you know...", "reach more customers and build a stronger online presence", "seen, remembered and trusted", "take your business to the next level", "ready to take the next step", "we're here to help".
- Abstract claims without specifics or mechanisms.
- Fabricating statistics or research. If a number is used, it must come from the source material.

Return ONLY a valid JSON object matching this schema:
{
  "audienceContext": "Who this is specifically for and what real-world friction/situation they are experiencing right now",
  "contentAngle": "The specific angle chosen (e.g. Common mistake, Surprising observation, Real-world customer scenario, Before/after contrast, Hidden cost, Practical tip)",
  "reasoningStructure": "The selected communication structure (e.g. SCENARIO -> PROBLEM -> INSIGHT, OBSERVATION -> IMPLICATION -> ACTION)",
  "readerValue": "The concrete insight, mechanism, or takeaway added beyond the raw material",
  "title": "Short post headline",
  "body": "Full post text formatted with short paragraphs, whitespace, and varied sentence rhythm",
  "ctaType": "none | soft_invitation | discussion | explore_setup | contact",
  "callToAction": "Optional natural closing line — omit if the post ends better without one",
  "claims": [{ "text": "Key factual observation", "sourceIds": ["src-1"] }],
  "hashtags": ["#optional"],
  "imageSearchQuery": "2-8 word visual scene or metaphor (e.g. 'plumber checking phone on job site')"
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
  // Conceptual thinking stages
  audienceContext?: string;
  contentAngle?: string;
  reasoningStructure?: string;
  readerValue?: string;
  ctaType?: string;
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
   * @param correctionHint Optional corrective feedback from a previous failed attempt (drives targeted regeneration).
   */
  async generateDraft(
    topic: ResearchTopicItem,
    sources: ResearchSourceItem[],
    extraContext?: string,
    correctionHint?: string,
    attemptNumber = 1,
    previousPatternId?: string,
  ): Promise<{ draft?: PostDraft; deferred?: boolean; error?: string; chosenPattern?: StructurePattern }> {
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

    // 2. Select a reasoning structure pattern from catalog
    const perfEngine = new PerformanceEngineService();
    const { pattern: chosenPattern, guidancePrompt: structureHint } = await selectStructurePattern(
      perfEngine,
      this.db,
      attemptNumber,
      previousPatternId,
    ).catch(() => ({
      pattern: {
        id: 'scenario_problem_insight',
        name: 'Scenario → Problem → Insight',
        description: 'Immersive customer scenario leading to a practical insight',
        pattern: 'scenario → problem → insight',
        bestFor: 'General business topics',
        openingCadence: 'A concrete scenario',
        transitionGuidance: 'Connect scenario to friction',
      },
      guidancePrompt: 'Suggested structure: Scenario → Hidden Problem → Practical Insight',
    }));

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

    // 5. Assemble full system context (structure hint + style hints + regeneration directive)
    let fullExtraContext = extraContext ?? '';
    if (structureHint) {
      fullExtraContext += `\n\n${structureHint}`;
    }

    if (styleHintsJson) {
      try {
        const hints = JSON.parse(styleHintsJson);
        const lines: string[] = [];
        if (hints.hookPatterns && Array.isArray(hints.hookPatterns) && hints.hookPatterns.length > 0) {
          lines.push(`- High-performing opening hooks: ${hints.hookPatterns.join(', ')}`);
        }
        if (hints.audienceRecognition) {
          lines.push(`- Audience recognition focus: ${hints.audienceRecognition} (addressing concrete daily friction)`);
        }
        if (hints.preferredRhythm) {
          lines.push(`- Rhythm guidance: ${hints.preferredRhythm}`);
        }
        if (lines.length > 0) {
          fullExtraContext +=
            `\n\n<<< HISTORICAL_PERFORMANCE_TENDENCIES >>>\n` +
            `Qualitative tendencies from past high-performing posts — treat as guidance, not prescriptions:\n` +
            lines.join('\n') +
            `\n<<< END_HISTORICAL_PERFORMANCE_TENDENCIES >>>`;
        }
      } catch {
        fullExtraContext +=
          `\n\n<<< STYLE_HINTS >>>\n` +
          `These hints describe tendencies of high-performing posts — treat as guidance, not prescriptions:\n` +
          styleHintsJson +
          `\n<<< END STYLE_HINTS >>>`;
      }
    }

    if (correctionHint) {
      fullExtraContext +=
        `\n\n<<< STRATEGIC_REGENERATION_DIRECTIVE — ATTEMPT #${attemptNumber} >>>\n` +
        `The previous draft failed quality evaluation for the following specific reasons:\n` +
        `${correctionHint}\n\n` +
        `MANDATORY REGENERATION RULES:\n` +
        `- PIVOT TO A COMPLETELY DIFFERENT ANGLE AND STRUCTURE.\n` +
        `- DO NOT repeat previous phrasing, hook, or sentence flow.\n` +
        `- DO NOT write a single block of text — use short paragraphs and whitespace.\n` +
        `- Ground the post in an immediate real-world business situation (what a customer experiences, what the owner faces).\n` +
        `- Add genuine information gain rather than paraphrasing the source.\n` +
        `<<< END_STRATEGIC_REGENERATION_DIRECTIVE >>>`;
    }

    const systemPrompt = fullExtraContext ? `${basePrompt}\n\n${fullExtraContext}` : basePrompt;

    // 6. Build research context (user message) with raw background framing
    const researchContext =
      `<<< RAW_BACKGROUND_MATERIAL >>>\n` +
      `CRITICAL NOTICE: The text below represents RAW BACKGROUND NOTES only. Do NOT summarize or rewrite it sentence-by-sentence.\n` +
      `Extract the underlying business dilemma and construct a fresh, original social media post with a concrete scenario and high information gain.\n\n` +
      `Topic Title: ${topic.title}\n` +
      `Category/Pillar: ${topic.category}\n` +
      `Background Notes / Idea Seed: ${topic.description || topic.title}\n` +
      (topic.content_angle ? `Suggested Seed Angle: ${topic.content_angle}\n` : '') +
      (topic.hook ? `Suggested Hook Seed: ${topic.hook}\n` : '') +
      performanceContext +
      `Sources:\n` +
      sources
        .map((s) => `[ID: ${s.id}] Title: ${s.title}\nURL: ${s.url}\nSummary: ${s.summary}`)
        .join('\n---\n') +
      `\n<<< END_RAW_BACKGROUND_MATERIAL >>>`;

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
        temperature: 0.7, // Elevated temperature for creative angle discovery, variation, and natural voice
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
        audienceContext: typeof parsed.audienceContext === 'string' ? parsed.audienceContext : undefined,
        contentAngle: typeof parsed.contentAngle === 'string' ? parsed.contentAngle : undefined,
        reasoningStructure:
          typeof parsed.reasoningStructure === 'string' ? parsed.reasoningStructure : chosenPattern?.name,
        readerValue: typeof parsed.readerValue === 'string' ? parsed.readerValue : undefined,
        ctaType: typeof parsed.ctaType === 'string' ? parsed.ctaType : undefined,
      };

      return { draft, chosenPattern };
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
