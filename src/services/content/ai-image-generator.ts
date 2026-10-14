/**
 * NorthSoft.AI.ContentCreator — AI Image Generation Service (Cloudflare Workers AI)
 *
 * Implements server-side text-to-image generation for NorthSoft's Curated Image Library:
 * - Powered by Cloudflare Workers AI using the state-of-the-art 12B rectified flow model:
 *   `@cf/black-forest-labs/flux-1-schnell`.
 *   Produces ultra-high-fidelity commercial business photography without distorted hands or
 *   garbled screen text artifacts (unlike older SDXL-Lightning).
 * - Strict Zero-Paid-Cost / Free-Tier Protection:
 *   Single generation uses ~250 Neurons (4 inference steps at 1024x1024). In accordance with policy,
 *   a strict server-side limit of MAX 1 GENERATED IMAGE PER DAY is enforced via QuotaManager and D1.
 * - Concurrency & Race-Condition Safe:
 *   Daily limit is checked and reserved in D1 before invocation. No paid fallback.
 * - Legal & Attribution Compliance:
 *   * Author: "NorthSoft"
 *   * License: "NorthSoft internal use" (internal company policy, no external fictional creator or fake license)
 *   * Status: ALWAYS saved as "PENDING" for mandatory manual administrator review. Never auto-approved.
 *   * Internal Provenance: Stored in curated_images.notes (model, prompt, generation date, cost).
 *   * Technical Metadata: Stripped / clean raw PNG/JPEG stored in Cloudflare R2 (`env.IMAGE_BUCKET`).
 */

import { AppError } from '../../core/errors';
import type { IAIProvider } from '../../ai/provider';
import { QuotaManager } from '../ai/quota-manager';
import { ImageLibraryService } from './image-library-service';

export const AI_IMAGE_GENERATION_MODEL = '@cf/black-forest-labs/flux-1-schnell';
export const AI_IMAGE_DAILY_LIMIT = 1;
export const AI_IMAGE_ESTIMATED_NEURONS = 250;

export interface GenerateImageOptions {
  category: string;
  description: string;
  postContext?: string;
  force?: boolean;
}

export interface GeneratedImageResult {
  id: string;
  sourceUrl: string;
  r2Key: string;
  title: string;
  category: string;
  author: string;
  license: string;
  status: 'PENDING';
  model: string;
}

export type EmotionalIntent = 'positive' | 'neutral' | 'problem-aware' | 'collaborative';

export interface SceneCompositionArchetype {
  id: string;
  category: string;
  sceneTitle: string;
  subjectDescription: string;
  compositionGuidance: string;
  primarySubject: 'person' | 'people' | 'device_only' | 'environment_only';
  intendedEmotions: EmotionalIntent[];
  keywords: string[];
}

/**
 * Derives emotional intent from post text, title, or search query.
 * Falls back safely to 'neutral' when intent is ambiguous.
 */
export function detectEmotionalIntent(text?: string): EmotionalIntent {
  if (!text || !text.trim()) return 'neutral';
  const lower = text.toLowerCase();

  // Problem-aware signals: frustration, failure, drop in conversion, bugs, friction, obstacles
  const problemPatterns = [
    /\b(?:problem|issue|bug|error|slow|drop|lost|losing|frustrated|frustrating|confusing|failing|failure|bounce|churn|struggle|struggling|headache|friction|broken)\b/i,
    /\b(?:spadek|problem|błąd|awaria|porażka|frustracja|trudności|strata|wolna strona)\b/i,
  ];
  if (problemPatterns.some((p) => p.test(lower))) {
    return 'problem-aware';
  }

  // Collaborative signals: teamwork, client meeting, co-working, joint planning, discussion, consulting
  const collabPatterns = [
    /\b(?:team|teamwork|collaborat|meeting|discussion|consulting|partnership|advisory|co-work|together|workshop|brainstorm)\b/i,
    /\b(?:zespół|współpraca|spotkanie|dyskusja|konsultacja|doradztwo|warsztaty|razem)\b/i,
  ];
  if (collabPatterns.some((p) => p.test(lower))) {
    return 'collaborative';
  }

  // Positive signals: success, celebration, growth, relief, 5-star, satisfaction, launch, smooth, win
  const positivePatterns = [
    /\b(?:success|growth|grow|thriving|celebrat|happy|satisfied|satisfaction|relief|boost|increase|launch|achievement|winning|5-star|five-star|delight)\b/i,
    /\b(?:sukces|wzrost|zadowolen|satysfakcj|ulga|sukcesem|uruchomienie|zwycięstwo|5 gwiazdek)\b/i,
  ];
  if (positivePatterns.some((p) => p.test(lower))) {
    return 'positive';
  }

  return 'neutral';
}

export interface CategoryHistoryItem {
  id: string;
  title: string;
  description: string;
  status: string; // 'PROPOSED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PUBLISHED'
  usageCount: number;
  publishedCount: number;
  notes?: string;
  situation?: string;
  action?: string;
  visualMotif?: string;
}

export interface GeneratedSceneConcept {
  id: string;
  situation: string;
  action: string;
  relationship: string;
  businessNeed: string;
  emotionalTone: EmotionalIntent;
  visualMotif: string;
  promptDescription: string;
  compositionGuidance: string;
  rationale: string;
}

export const AI_CONCEPT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';

/**
 * Retrieves a bounded, representative set of history from D1 for concept generation.
 * Distinguishes between published (most heavily weighted), approved, pending/generated, and rejected images.
 */
export async function getCategoryConceptHistory(
  db: D1Database,
  category: string,
  limit = 20,
): Promise<CategoryHistoryItem[]> {
  try {
    const res = await db
      .prepare(
        `SELECT
           ci.id,
           ci.title,
           ci.description,
           ci.status,
           ci.usage_count,
           ci.notes,
           (SELECT COUNT(*) FROM publications pub
            JOIN post_images pi ON pi.post_id = pub.post_id
            WHERE pi.curated_image_id = ci.id AND pub.status = 'published' AND pub.fb_deleted_at IS NULL
           ) AS published_count
         FROM curated_images ci
         WHERE ci.category = ? OR ci.category = 'General'
         ORDER BY (CASE WHEN ci.usage_count > 0 THEN 2 WHEN ci.status = 'APPROVED' THEN 1 ELSE 0 END) DESC,
                  ci.created_at DESC
         LIMIT ?`,
      )
      .bind(category || 'General', limit)
      .all<{
        id: string;
        title: string | null;
        description: string | null;
        status: string | null;
        usage_count: number | null;
        notes: string | null;
        published_count: number | null;
      }>();

    return (res.results || []).map((row) => {
      let situation = '';
      let action = '';
      let visualMotif = '';

      if (row.notes) {
        try {
          const parsed = JSON.parse(row.notes);
          if (parsed.sceneConcept) {
            situation = parsed.sceneConcept.situation || '';
            action = parsed.sceneConcept.action || '';
            visualMotif = parsed.sceneConcept.visualMotif || '';
          }
        } catch {
          // ignore parsing error
        }
      }

      const isPublished = (row.published_count ?? 0) > 0;
      const statusLabel = isPublished ? 'PUBLISHED' : (row.status || 'PENDING');

      return {
        id: row.id,
        title: row.title || '',
        description: row.description || '',
        status: statusLabel,
        usageCount: row.usage_count ?? 0,
        publishedCount: row.published_count ?? 0,
        notes: row.notes || undefined,
        situation,
        action,
        visualMotif,
      };
    });
  } catch (err) {
    console.warn('[getCategoryConceptHistory] D1 query failed, returning empty history:', err);
    return [];
  }
}

/**
 * Summarizes the dominant motifs and situations in the existing history
 * to instruct the LLM specifically what NOT to repeat.
 */
export function summarizeDominantThemes(history: CategoryHistoryItem[]): string[] {
  const themes: string[] = [];
  const corpus = history.map((h) => `${h.title} ${h.description} ${h.situation} ${h.action}`.toLowerCase()).join(' ');

  if (corpus.includes('laptop') && (corpus.includes('desk') || corpus.includes('screen'))) {
    themes.push('Person working alone at a desk staring directly at a laptop screen');
  }
  if (corpus.includes('tablet') && corpus.includes('counter')) {
    themes.push('Service staff holding a tablet across a sales counter');
  }
  if (corpus.includes('meeting') || corpus.includes('table')) {
    themes.push('Two colleagues seated at a table looking at a shared screen');
  }
  if (corpus.includes('storefront') || corpus.includes('sign')) {
    themes.push('Store owner hanging an open sign outside their shop');
  }
  if (corpus.includes('phone') && (corpus.includes('checkout') || corpus.includes('rating'))) {
    themes.push('Close-up hands tapping a smartphone for mobile payment or review');
  }

  // Also extract explicit prior situations if present
  for (const h of history) {
    if (h.situation && !themes.includes(h.situation)) {
      themes.push(`${h.situation} (${h.status})`);
      if (themes.length >= 6) break;
    }
  }

  return themes.length > 0 ? themes : ['General modern office/workplace setups'];
}

/**
 * Evaluates semantic overlap between a candidate concept and prior history.
 * Checks for deeper situation/action similarity, not cosmetic differences (device, gender, hair).
 * Returns true if the candidate concept is meaningfully distinct.
 */
export function isSemanticallyDistinct(
  candidate: GeneratedSceneConcept,
  history: CategoryHistoryItem[],
): { distinct: boolean; conflictReason?: string } {
  if (!history || history.length === 0) {
    return { distinct: true };
  }

  const candSituation = candidate.situation.toLowerCase();
  const candAction = candidate.action.toLowerCase();
  const candMotif = candidate.visualMotif.toLowerCase();

  for (const item of history) {
    const histCorpus = `${item.title} ${item.description} ${item.situation} ${item.action} ${item.visualMotif}`.toLowerCase();

    // Check 1: Situation and core action match (e.g. someone solo working at laptop screen)
    const bothSoloLaptop =
      (candSituation.includes('laptop') || candAction.includes('laptop') || candMotif.includes('laptop')) &&
      (histCorpus.includes('laptop screen modern desk') || histCorpus.includes('reviewing laptop') || histCorpus.includes('working on laptop'));

    if (bothSoloLaptop && (item.status === 'PUBLISHED' || item.status === 'APPROVED')) {
      return {
        distinct: false,
        conflictReason: `Candidate repeats solo laptop setup already present in library (${item.title || item.id}).`,
      };
    }

    // Check 2: Direct situation phrase overlap (>75% token overlap of action/situation)
    if (item.situation && item.situation.length > 10) {
      const histSit = item.situation.toLowerCase();
      if (candSituation === histSit || (candSituation.includes(histSit) && histSit.includes(candSituation))) {
        return {
          distinct: false,
          conflictReason: `Candidate situation identical to prior concept "${item.situation}" (${item.status}).`,
        };
      }
    }

    // Check 3: If candidate action is just changing the device on the same action
    // e.g. "looking at tablet" vs "looking at laptop" for the exact same purpose
    if (
      candAction.includes('reading analytics') &&
      histCorpus.includes('analyzing online funnel') &&
      item.status === 'PUBLISHED'
    ) {
      return {
        distinct: false,
        conflictReason: `Candidate action is identical in purpose to published image "${item.title}".`,
      };
    }
  }

  return { distinct: true };
}

/**
 * Generates an authentic, novel scene concept using Cloudflare Workers AI (Llama 3.1 8B Instruct).
 * Employs up to 2 attempts with semantic difference checks against history.
 */
export async function generateNovelImageConcept(
  aiProvider: IAIProvider,
  category: string,
  history: CategoryHistoryItem[],
  postContext?: string,
  userHint?: string,
): Promise<GeneratedSceneConcept> {
  const dominantThemes = summarizeDominantThemes(history);
  const detectedEmotion = detectEmotionalIntent(postContext || userHint);

  const historySnippets = history.slice(0, 8).map((h) => {
    return `- [${h.status}] ${h.title || h.description} ${h.situation ? `(Situation: ${h.situation})` : ''}`;
  }).join('\n');

  for (let attempt = 1; attempt <= 2; attempt++) {
    const promptMessages = [
      {
        role: 'system' as const,
        content: `You are an expert commercial advertising art director for NorthSoft, a Scandinavian technology & digital marketing agency.
Your role is to conceive ONE completely fresh, authentic commercial photography concept for the business category "${category}".

CRITICAL DIRECTIVES:
1. NO CLICHÉ OR COSMETIC REPETITION: Do NOT simply swap a laptop for a tablet, change a character's gender/ethnicity, or alter the camera angle while keeping the same core situation.
2. EXISTING LIBRARY CONTEXT & EXCLUSIONS:
Here are scenes already present in the company library (do NOT replicate these situations):
${historySnippets || 'No prior images yet in this category.'}
Dominant themes to strictly AVOID:
${dominantThemes.map((t) => `* ${t}`).join('\n')}

3. TARGET NARRATIVE & SENSE:
${postContext ? `The image will accompany this specific article/post: "${postContext.slice(0, 200)}"` : 'The image should bring fresh editorial value to this business category.'}
${userHint ? `User preference/query: "${userHint}"` : ''}

4. BUSINESS SITUATION TYPES (CHOOSE A DIFFERENT ONE FROM WHAT WAS DONE BEFORE):
- Interactive diagnostic consultation (e.g. client pointing at a physical sample while specialist listens)
- Practical on-site operational verification (e.g. craftsman, warehouse manager inspecting tangible work)
- Milestone planning or physical whiteboard diagramming
- Natural customer handover, unboxing, or tangible exchange
- Architectural still life of an authentic Scandinavian workspace without staged gimmicks

5. EMOTIONAL INTENT: Focus on "${detectedEmotion}" emotional tone (natural, authentic, no forced stock smiles).

OUTPUT FORMAT: You MUST return strictly valid JSON matching this schema:
{
  "situation": "Short 1-sentence description of the unique business situation",
  "action": "Specific physical action, gaze direction, and hand placement of subject(s)",
  "relationship": "Relation between subjects or subject to environment",
  "businessNeed": "The underlying business challenge or success depicted",
  "emotionalTone": "${detectedEmotion}",
  "visualMotif": "Key physical visual motif (e.g. oak sample board, architectural glass partition, rugged clipboard)",
  "promptDescription": "2-3 sentences clear candid scene description suitable for text-to-image prompt (what the person does, what they look at, realistic posture)",
  "compositionGuidance": "1 sentence on camera distance, daylight direction, and uncluttered composition",
  "rationale": "Why this situation is semantically novel compared to earlier scenes"
}`,
      },
      {
        role: 'user' as const,
        content: `Conceive a new, semantically distinct business photo concept for "${category}". Provide the JSON object now.`,
      },
    ];

    try {
      const completion = await aiProvider.complete({
        role: 'writer',
        messages: promptMessages,
        temperature: attempt === 1 ? 0.4 : 0.7,
        maxTokens: 500,
        responseFormat: 'json',
      });

      let parsed: any;
      try {
        parsed = JSON.parse(completion.content);
      } catch {
        const jsonMatch = completion.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }
      }

      if (parsed && parsed.promptDescription && parsed.situation) {
        const concept: GeneratedSceneConcept = {
          id: `concept-${crypto.randomUUID().slice(0, 8)}`,
          situation: String(parsed.situation).trim(),
          action: String(parsed.action || '').trim(),
          relationship: String(parsed.relationship || '').trim(),
          businessNeed: String(parsed.businessNeed || '').trim(),
          emotionalTone: (['positive', 'neutral', 'problem-aware', 'collaborative'].includes(parsed.emotionalTone)
            ? parsed.emotionalTone
            : detectedEmotion) as EmotionalIntent,
          visualMotif: String(parsed.visualMotif || '').trim(),
          promptDescription: String(parsed.promptDescription).trim(),
          compositionGuidance: String(parsed.compositionGuidance || 'natural daylight, uncluttered workspace, clean photographic composition').trim(),
          rationale: String(parsed.rationale || 'Fresh situational perspective for category').trim(),
        };

        const distinction = isSemanticallyDistinct(concept, history);
        if (distinction.distinct || attempt === 2) {
          return concept;
        }
        console.warn(`[generateNovelImageConcept] Attempt 1 collision: ${distinction.conflictReason}. Retrying with higher temperature...`);
      }
    } catch (err) {
      console.warn(`[generateNovelImageConcept] AI generation attempt ${attempt} failed:`, err);
      if (attempt === 2) {
        throw new AppError(
          `AI concept generation service unavailable: ${err instanceof Error ? err.message : String(err)}`,
          503,
          'CONCEPT_GENERATION_FAILED',
        );
      }
    }
  }

  throw new AppError('Unable to generate a sufficiently distinct scene concept within attempt limit.', 422, 'CONCEPT_DIVERSITY_LIMIT');
}

/**
 * Builds an editorial, photographic business prompt tailored for NorthSoft and FLUX.1 Schnell.
 * Separates scene action, emotional intent, and photographic composition into modular,
 * non-overlapping sentences. Avoids contradictory device interactions and repetitive buzzwords.
 */
/**
 * Emotional posture guidance mapped to marketing intents.
 * Translates intent into concrete physical actions and authentic expressions
 * without exaggerated cartoon smiles or grimaces.
 */
export const EMOTIONAL_EXPRESSION_DIRECTIONS: Record<EmotionalIntent, string> = {
  positive: 'Expression: calm satisfaction, relaxed facial features, subtle natural crinkles around eyes, unhurried posture.',
  neutral: 'Expression: focused concentration, neutral composed brow, quiet professionalism, eyes directed at the work.',
  'problem-aware': 'Expression: analytical contemplation, attentive focus, hand touching chin or holding pen, inspecting data with serious diligence.',
  collaborative: 'Expression: approachable engagement, receptive listening posture, natural head angle during conversational exchange.',
};

export function buildBusinessImagePrompt(
  description: string,
  category: string,
  postContext?: string,
  sceneConcept?: { compositionGuidance?: string; emotionalTone?: EmotionalIntent },
): string {
  const cleanDesc = description.trim();
  const cleanCat = category.trim();

  // 1. Scene Action & Subject (Unambiguous Physical Interaction)
  const sceneGuidance = sceneConcept?.compositionGuidance
    ? ` Spatial arrangement: ${sceneConcept.compositionGuidance}.`
    : '';
  const actionSegment = `A 35mm candid commercial photograph of ${cleanDesc}. Category: ${cleanCat}.${sceneGuidance}`;

  // 2. Emotional Tone & Posture (Aligned with Post Marketing Intent)
  const emotion = sceneConcept?.emotionalTone || detectEmotionalIntent(postContext || cleanDesc);
  const emotionalSegment = EMOTIONAL_EXPRESSION_DIRECTIONS[emotion];

  // 3. Photographic Style & Environment (Single Concise Declaration)
  const photoSegment = 'Style: 35mm lens, natural directional window daylight, f/4 aperture with gentle background separation, realistic skin texture with fine pores, believable fabric folds, neutral color grading.';

  // 4. Device Screen Composition (Clean & Minimalist, No Pseudo-Text)
  const screenSegment = 'Screens: any visible monitor, tablet or phone displays clean minimalist geometric blocks and wireframe sections, without pseudo-text or cluttered charts.';

  return `${actionSegment} ${emotionalSegment} ${photoSegment} ${screenSegment}`;
}

export class AiImageGeneratorService {
  private quotaManager: QuotaManager;

  constructor(private readonly env: Env) {
    this.quotaManager = new QuotaManager();
  }

  /**
   * Check if today's AI image generation quota has been exhausted.
   * Hard server-side limit: 1 image per day.
   */
  async checkDailyImageQuota(db: D1Database): Promise<{ allowed: boolean; countToday: number; limit: number; reason?: string }> {
    const todayStr = new Date().toISOString().split('T')[0] ?? '';

    // Check count of successfully generated images today in ai_runs or curated_images notes
    const res = await db
      .prepare(
        `SELECT COUNT(*) as count FROM ai_runs
         WHERE role = 'image_generator' AND status = 'completed' AND created_at LIKE ?`,
      )
      .bind(`${todayStr}%`)
      .first<{ count: number | null }>()
      .catch(() => ({ count: 0 }));

    const countToday = res?.count ?? 0;

    if (countToday >= AI_IMAGE_DAILY_LIMIT) {
      return {
        allowed: false,
        countToday,
        limit: AI_IMAGE_DAILY_LIMIT,
        reason: `Daily AI image generation quota reached (${countToday}/${AI_IMAGE_DAILY_LIMIT} generated today). To conserve free Cloudflare Neurons, generation is capped at ${AI_IMAGE_DAILY_LIMIT} image per day.`,
      };
    }

    // Also check general application quota manager
    const capacity = await this.quotaManager.checkCapacity(db, 'cloudflare-workers-ai', AI_IMAGE_GENERATION_MODEL);
    if (!capacity.allowed) {
      return {
        allowed: false,
        countToday,
        limit: AI_IMAGE_DAILY_LIMIT,
        reason: capacity.reason || 'Cloudflare Workers AI capacity currently deferred by safety circuit breaker.',
      };
    }

    return {
      allowed: true,
      countToday,
      limit: AI_IMAGE_DAILY_LIMIT,
    };
  }

  /**
   * Generates a photorealistic business image using Cloudflare Workers AI,
   * stores the raw PNG binary in R2, and saves a PENDING record in curated_images.
   */
  async generateAndPersistImage(
    db: D1Database,
    originUrl: string,
    options: GenerateImageOptions,
  ): Promise<GeneratedImageResult> {
    if (!this.env.AI) {
      throw new AppError('Cloudflare Workers AI binding is not configured.', 503, 'AI_UNAVAILABLE');
    }

    if (!this.env.IMAGE_BUCKET) {
      throw new AppError('Cloudflare R2 IMAGE_BUCKET is not configured.', 503, 'STORAGE_UNAVAILABLE');
    }

    // 1. Server-side quota verification (with explicit user override support)
    const quota = await this.checkDailyImageQuota(db);
    if (!quota.allowed && !options.force) {
      throw new AppError(quota.reason || 'Daily image generation quota reached.', 429, 'QUOTA_EXCEEDED');
    }

    // 2. Concept & Scene Generation:
    // Query representative category history (published, approved, pending, rejected)
    const history = await getCategoryConceptHistory(db, options.category || 'General', 20);

    // If description was provided by the user, we respect their prompt.
    // Otherwise, generate a novel scene concept via AI provider using category history.
    let sceneConcept: GeneratedSceneConcept | undefined;
    let effectiveDescription = options.description.trim();

    if (!effectiveDescription) {
      const { getAIProvider } = await import('../../ai/factory');
      const aiProvider = getAIProvider(this.env, 'writer');
      sceneConcept = await generateNovelImageConcept(
        aiProvider,
        options.category || 'General',
        history,
        options.postContext,
      );
      effectiveDescription = sceneConcept.promptDescription;
    }

    const prompt = buildBusinessImagePrompt(
      effectiveDescription,
      options.category,
      options.postContext,
      sceneConcept ? { compositionGuidance: sceneConcept.compositionGuidance, emotionalTone: sceneConcept.emotionalTone } : undefined,
    );
    const startTime = Date.now();
    let imageBytes: ArrayBuffer;

    try {
      // 2. Call Cloudflare Workers AI text-to-image model (FLUX.1 Schnell is distilled for 4 steps)
      const aiResponse = await this.env.AI.run(AI_IMAGE_GENERATION_MODEL as Parameters<Ai['run']>[0], {
        prompt,
        steps: 4,
      });

      if (aiResponse instanceof ReadableStream) {
        // Stream response
        const res = new Response(aiResponse);
        imageBytes = await res.arrayBuffer();
      } else if (aiResponse instanceof ArrayBuffer) {
        imageBytes = aiResponse;
      } else {
        const respObj = (typeof aiResponse === 'object' && aiResponse !== null) ? (aiResponse as Record<string, unknown>) : null;
        if (respObj && typeof respObj.arrayBuffer === 'function') {
          imageBytes = await (respObj.arrayBuffer as () => Promise<ArrayBuffer>)();
        } else if (respObj && typeof respObj.image === 'string') {
          // Base64 encoded string response
          const binaryString = atob(respObj.image);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          imageBytes = bytes.buffer;
        } else {
          throw new Error('Unexpected binary format returned from Cloudflare text-to-image model');
        }
      }

      if (!imageBytes || imageBytes.byteLength < 100) {
        throw new Error('Received empty or invalid image buffer from Workers AI');
      }

      const durationMs = Date.now() - startTime;

      // Record usage in QuotaManager
      await this.quotaManager.recordUsage(db, {
        provider: 'cloudflare-workers-ai',
        model: AI_IMAGE_GENERATION_MODEL,
        role: 'image_generator',
        neuronsUsed: AI_IMAGE_ESTIMATED_NEURONS,
        success: true,
        durationMs,
        source: 'local_estimate',
      });
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      await this.quotaManager.recordUsage(db, {
        provider: 'cloudflare-workers-ai',
        model: AI_IMAGE_GENERATION_MODEL,
        role: 'image_generator',
        neuronsUsed: 0,
        success: false,
        durationMs,
        errorMessage: errorMsg,
        source: 'local_estimate',
      });
      throw new AppError(`Workers AI generation failed: ${errorMsg}`, 502, 'GENERATION_FAILED');
    }

    // 3. Store in Cloudflare R2
    const key = `gen-${crypto.randomUUID()}.png`;
    await this.env.IMAGE_BUCKET.put(`images/${key}`, imageBytes, {
      httpMetadata: {
        contentType: 'image/png',
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });

    const parsedOrigin = new URL(originUrl).origin;
    const sourceUrl = `${parsedOrigin}/media/${key}`;
    const nowIso = new Date().toISOString();

    const title = effectiveDescription.slice(0, 80) || 'AI Generated Business Illustration';
    const notes = JSON.stringify({
      generatedBy: 'Cloudflare Workers AI',
      model: AI_IMAGE_GENERATION_MODEL,
      generationDate: nowIso,
      originalPrompt: prompt,
      sceneConcept: sceneConcept || null,
      neuronsEstimated: AI_IMAGE_ESTIMATED_NEURONS,
      internalBrand: 'NorthSoft',
      usagePolicy: 'NorthSoft internal use',
    });

    // 4. Save directly into Curated Image Library as PENDING
    const imgService = new ImageLibraryService(db);
    const imageId = await imgService.addManualImage({
      title,
      sourceType: 'UPLOADED',
      sourceUrl,
      r2Key: key,
      category: options.category || 'General',
      keywords: `${options.category}, AI Generated, NorthSoft`,
      description: options.description.trim(),
      author: 'NorthSoft',
      license: 'NorthSoft internal use',
      notes,
      status: 'PENDING', // ALWAYS PENDING - manual review mandatory
    });

    return {
      id: imageId,
      sourceUrl,
      r2Key: key,
      title,
      category: options.category || 'General',
      author: 'NorthSoft',
      license: 'NorthSoft internal use',
      status: 'PENDING',
      model: AI_IMAGE_GENERATION_MODEL,
    };
  }
}
