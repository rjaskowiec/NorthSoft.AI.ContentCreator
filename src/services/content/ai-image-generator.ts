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
  sceneConcept?: GeneratedSceneConcept;
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
    /\b(?:spadek|problem|błąd|awaria|porażka|frustracja|trudności|strata|tracisz|wolna|wolną|porzuceń|porzucenia)\b/i,
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
 * Throws AppError if D1 read fails to prevent generating concepts without historical context.
 */
export async function getCategoryConceptHistory(
  db: D1Database,
  category: string,
  limit = 25,
): Promise<CategoryHistoryItem[]> {
  let res: D1Result<{
    id: string;
    title: string | null;
    description: string | null;
    status: string | null;
    usage_count: number | null;
    notes: string | null;
    published_count: number | null;
  }>;

  try {
    res = await db
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
         WHERE (ci.category = ? OR ci.category = 'General')
           AND ci.status IN ('APPROVED', 'PENDING', 'REJECTED')
         ORDER BY (CASE WHEN ci.usage_count > 0 THEN 3 WHEN ci.status = 'APPROVED' THEN 2 WHEN ci.status = 'PENDING' THEN 1 ELSE 0 END) DESC,
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
  } catch (err) {
    console.error('[getCategoryConceptHistory] D1 query failed:', err);
    throw new AppError(
      `Database error retrieving category image history: ${err instanceof Error ? err.message : String(err)}`,
      500,
      'HISTORY_QUERY_FAILED',
    );
  }

  return (res.results || []).map((row) => {
    let situation = '';
    let action = '';
    let visualMotif = '';

    if (row.notes) {
      try {
        const parsed = JSON.parse(row.notes);
        if (parsed.semanticProfile) {
          situation = parsed.semanticProfile.sceneSummary || '';
          action = parsed.semanticProfile.action || '';
          visualMotif = parsed.semanticProfile.visualMotif || '';
        } else if (parsed.sceneConcept) {
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
}

/**
 * Visual scope and creative exploration directions per category.
 * Used as inspirational vectors for the LLM art director, NOT as rigid templates or rotating arrays.
 */
export const CATEGORY_CREATIVE_VECTORS: Record<string, string[]> = {
  'Websites & Landing Pages': [
    'Cross-device responsive layout setup (desktop, tablet, and mobile positioned together displaying unified adaptive interface)',
    'UI/UX design exploration (designer with physical design system typography cards or paper wireframes)',
    'Focused developer at workstation building custom component architecture',
    'Tangible client consultation examining business goals and brand architecture',
    'Real user conducting usability walkthrough on an authentic device in their daily workflow',
    'Architectural before-and-after visual contrast in a modern creative studio',
  ],
  'AI & Business Automation': [
    'Automated order processing or logistics monitoring with status indicator panels',
    'Data scientist verifying neural network predictions on minimalist dashboard',
    'Specialist reviewing robotic automation or automated workflow trigger in clean environment',
    'System architect discussing workflow blueprint with team over architectural drafts',
  ],
  'Marketing & Customer Acquisition': [
    'Multi-channel campaign planning with physical sticky notes and digital funnel metrics',
    'Content creator adjusting directional studio lighting for product presentation',
    'Marketing manager presenting lead conversion trends to colleague',
    'Customer acquisition workshop in an airy Scandinavian co-working lounge',
  ],
  'Sales & Conversion Process': [
    'Tangible contract or commercial agreement signing with client in sunny boardroom',
    'Sales executive reviewing qualified pipeline metrics with subtle satisfied smile',
    'Boutique owner demonstrating product benefits to engaged customer',
    'Customer onboarding walkthrough in contemporary Nordic retail or consulting space',
  ],
  'Small Business Productivity & Ops': [
    'Workshop craftsman or warehouse manager performing digital inventory audit',
    'Entrepreneur preparing packages for daily shipment in neat packaging bay',
    'Team standup meeting around physical Kanban schedule board',
    'Operations specialist streamlining order fulfillment process',
  ],
  'Customer Experience & Trust': [
    'Friendly, unhurried customer consultation at a clean reception desk',
    'Support specialist with headset attentively assisting customer via chat interface',
    'Satisfied client shaking hands with account manager in bright lobby',
    'Delighted customer experiencing responsive customer service on mobile',
  ],
  'Local Business & Regional Context': [
    'Local shopkeeper welcoming patron into cozy neighborhood storefront',
    'Artisanal coffee roaster or local service provider greeting regular customer',
    'Community business owner adjusting shop window display on quiet Nordic street',
    'Regional contractor discussing architectural blueprint with homeowner on site',
  ],
  'General': [
    'Contemporary Scandinavian workplace with natural timber, plants, and calm lighting',
    'Collaborative pair discussing architectural project sketches in modern office',
    'Strategic planning session with clean minimalist visual aids',
  ],
};

/**
 * Summarizes the dominant motifs and situations in the existing history
 * to instruct the LLM specifically what NOT to repeat.
 */
export function summarizeDominantThemes(history: CategoryHistoryItem[]): string[] {
  const themes: string[] = [];
  const corpus = history.map((h) => `${h.title} ${h.description} ${h.situation} ${h.action} ${h.visualMotif}`.toLowerCase()).join(' ');

  // 1. Team at screen / meeting discussion motif
  if (
    (corpus.includes('team') || corpus.includes('colleague') || corpus.includes('people') || corpus.includes('group')) &&
    (corpus.includes('screen') || corpus.includes('monitor') || corpus.includes('whiteboard') || corpus.includes('table'))
  ) {
    themes.push('Team or colleagues gathered around a large screen, monitor, or whiteboard discussing UX, charts, or notes');
  }

  // 2. Solo laptop desk motif
  if (corpus.includes('laptop') && (corpus.includes('desk') || corpus.includes('screen') || corpus.includes('staring'))) {
    themes.push('Person working alone at a desk staring directly at a laptop screen');
  }

  // 3. Tablet counter handover motif
  if (corpus.includes('tablet') && (corpus.includes('counter') || corpus.includes('sales') || corpus.includes('pos'))) {
    themes.push('Service staff holding a tablet across a sales counter');
  }

  // 4. Analytics review motif
  if (corpus.includes('analytics') || corpus.includes('chart') || corpus.includes('graph') || corpus.includes('funnel')) {
    themes.push('Reviewing bar charts, analytics graphs, or conversion funnels on a screen');
  }

  // 5. Storefront sign motif
  if (corpus.includes('storefront') || corpus.includes('sign') || corpus.includes('shop owner')) {
    themes.push('Store owner hanging an open sign outside their shop');
  }

  // 6. Mobile tap checkout motif
  if (corpus.includes('phone') && (corpus.includes('checkout') || corpus.includes('rating') || corpus.includes('tap'))) {
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
  const candDesc = candidate.promptDescription.toLowerCase();
  const candFull = `${candSituation} ${candAction} ${candMotif} ${candDesc}`;

  for (const item of history) {
    const histCorpus = `${item.title} ${item.description} ${item.situation} ${item.action} ${item.visualMotif}`.toLowerCase();

    // Check 1: Team/colleagues at large screen or monitor discussing metrics/UX/charts
    const candIsTeamScreen =
      (candFull.includes('team') || candFull.includes('colleagues') || candFull.includes('group')) &&
      (candFull.includes('screen') || candFull.includes('monitor') || candFull.includes('display') || candFull.includes('whiteboard')) &&
      (candFull.includes('discuss') || candFull.includes('analyz') || candFull.includes('ux') || candFull.includes('chart') || candFull.includes('note'));

    const histIsTeamScreen =
      (histCorpus.includes('team') || histCorpus.includes('colleagues') || histCorpus.includes('group') || histCorpus.includes('meeting')) &&
      (histCorpus.includes('screen') || histCorpus.includes('monitor') || histCorpus.includes('display') || histCorpus.includes('whiteboard'));

    if (candIsTeamScreen && histIsTeamScreen && (item.status === 'PUBLISHED' || item.status === 'APPROVED' || item.status === 'PENDING')) {
      return {
        distinct: false,
        conflictReason: `Candidate repeats the overused motif: team gathered at a screen discussing metrics/design (${item.title || item.id}).`,
      };
    }

    // Check 2: Solo laptop setup
    const bothSoloLaptop =
      (candSituation.includes('laptop') || candAction.includes('laptop') || candMotif.includes('laptop')) &&
      (histCorpus.includes('laptop screen modern desk') || histCorpus.includes('reviewing laptop') || histCorpus.includes('working on laptop') || histCorpus.includes('alone at desk'));

    if (bothSoloLaptop && (item.status === 'PUBLISHED' || item.status === 'APPROVED')) {
      return {
        distinct: false,
        conflictReason: `Candidate repeats solo laptop setup already present in library (${item.title || item.id}).`,
      };
    }

    // Check 3: Direct situation phrase overlap (>70% token overlap of action/situation)
    if (item.situation && item.situation.length > 10) {
      const histSit = item.situation.toLowerCase();
      if (candSituation === histSit || (candSituation.includes(histSit) && histSit.includes(candSituation))) {
        return {
          distinct: false,
          conflictReason: `Candidate situation identical to prior concept "${item.situation}" (${item.status}).`,
        };
      }
    }

    // Check 4: Cosmetic swap on same action (e.g. tablet vs laptop vs smartphone for same purpose)
    const isCandAnalytics = candAction.includes('analytics') || candAction.includes('funnel') || candAction.includes('metrics') || candSituation.includes('chart');
    const isHistAnalytics = histCorpus.includes('analytics') || histCorpus.includes('funnel') || histCorpus.includes('chart');
    if (isCandAnalytics && isHistAnalytics && (item.status === 'PUBLISHED' || item.status === 'APPROVED')) {
      return {
        distinct: false,
        conflictReason: `Candidate action is a cosmetic variant of published chart/analytics review "${item.title}".`,
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

  const categoryVectors = CATEGORY_CREATIVE_VECTORS[category] || CATEGORY_CREATIVE_VECTORS['General'] || [];
  const creativeDirectionsText = categoryVectors.map((v) => `* ${v}`).join('\n');

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
Dominant themes to strictly AVOID (do NOT produce another variant of these):
${dominantThemes.map((t) => `* ${t}`).join('\n')}

3. TARGET NARRATIVE & SENSE:
${postContext ? `The image will accompany this specific article/post: "${postContext.slice(0, 200)}"` : 'The image should bring fresh editorial value to this business category.'}
${userHint ? `User preference/query: "${userHint}"` : ''}

4. CATEGORY CREATIVE INSPIRATION (Explore one of these directions or conceive an equally novel situation):
${creativeDirectionsText}

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

      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(completion.content) as Record<string, unknown>;
      } catch {
        const jsonMatch = completion.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        }
      }

      if (parsed && parsed.promptDescription && parsed.situation) {
        const concept: GeneratedSceneConcept = {
          id: `concept-${crypto.randomUUID().slice(0, 8)}`,
          situation: String(parsed.situation).trim(),
          action: String(parsed.action || '').trim(),
          relationship: String(parsed.relationship || '').trim(),
          businessNeed: String(parsed.businessNeed || '').trim(),
          emotionalTone: (['positive', 'neutral', 'problem-aware', 'collaborative'].includes(String(parsed.emotionalTone))
            ? (parsed.emotionalTone as EmotionalIntent)
            : detectedEmotion) as EmotionalIntent,
          visualMotif: String(parsed.visualMotif || '').trim(),
          promptDescription: String(parsed.promptDescription).trim(),
          compositionGuidance: String(parsed.compositionGuidance || 'natural daylight, uncluttered workspace, clean photographic composition').trim(),
          rationale: String(parsed.rationale || 'Fresh situational perspective for category').trim(),
        };

        const distinction = isSemanticallyDistinct(concept, history);
        if (distinction.distinct) {
          return concept;
        }
        console.warn(`[generateNovelImageConcept] Attempt ${attempt} collision: ${distinction.conflictReason}.`);
      }
    } catch (err) {
      if (err instanceof AppError && err.code === 'CONCEPT_DIVERSITY_LIMIT') {
        throw err;
      }
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
   * Fails CLOSED on database errors to prevent unauthorized generation.
   */
  async checkDailyImageQuota(db: D1Database): Promise<{ allowed: boolean; countToday: number; limit: number; reason?: string }> {
    const todayStr = new Date().toISOString().split('T')[0] ?? '';

    // Check count of successfully generated or currently running image generations today in ai_runs
    // Clean up abandoned reservations (> 15 minutes) before counting
    const fifteenMinsAgoIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    try {
      await db
        .prepare(
          `UPDATE ai_runs
           SET status = 'failed', error_message = 'Reservation timed out'
           WHERE role = 'image_generator' AND status = 'running' AND created_at < ?`,
        )
        .bind(fifteenMinsAgoIso)
        .run();
    } catch (cleanErr) {
      console.warn('[checkDailyImageQuota] Stale reservation cleanup warning:', cleanErr);
    }

    let res: { count: number | null } | null;
    try {
      res = await db
        .prepare(
          `SELECT COUNT(*) as count FROM ai_runs
           WHERE role = 'image_generator' AND status IN ('completed', 'running') AND created_at LIKE ?`,
        )
        .bind(`${todayStr}%`)
        .first<{ count: number | null }>();
    } catch (dbErr) {
      console.error('[checkDailyImageQuota] Database error querying quota:', dbErr);
      return {
        allowed: false,
        countToday: 0,
        limit: AI_IMAGE_DAILY_LIMIT,
        reason: 'Database error verifying image generation quota. Access blocked for safety.',
      };
    }

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
   * Atomically claims an image generation slot in D1 to prevent concurrent race conditions.
   * If quota is already exhausted, returns null without claiming.
   */
  async reserveDailyImageSlot(db: D1Database): Promise<{ reservationId: string } | null> {
    const quota = await this.checkDailyImageQuota(db);
    if (!quota.allowed) {
      return null;
    }

    const reservationId = `img-res-${crypto.randomUUID()}`;
    const nowIso = new Date().toISOString();

    try {
      await db
        .prepare(
          `INSERT INTO ai_runs (id, role, model, provider, status, created_at)
           VALUES (?, 'image_generator', ?, 'cloudflare-workers-ai', 'running', ?)`,
        )
        .bind(reservationId, AI_IMAGE_GENERATION_MODEL, nowIso)
        .run();

      // Double-check race condition: verify if total 'running' + 'completed' exceeds limit
      const todayStr = nowIso.split('T')[0] ?? '';
      const checkRes = await db
        .prepare(
          `SELECT COUNT(*) as count FROM ai_runs
           WHERE role = 'image_generator' AND status IN ('completed', 'running') AND created_at LIKE ?`,
        )
        .bind(`${todayStr}%`)
        .first<{ count: number | null }>();

      if ((checkRes?.count ?? 0) > AI_IMAGE_DAILY_LIMIT) {
        // Lost race condition: release this reservation
        await db
          .prepare("UPDATE ai_runs SET status = 'failed', error_message = 'Concurrency race limit exceeded' WHERE id = ?")
          .bind(reservationId)
          .run();
        return null;
      }

      return { reservationId };
    } catch (err) {
      console.error('[reserveDailyImageSlot] Failed to create atomic reservation:', err);
      return null;
    }
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

    // 1. Server-side quota verification with atomic reservation
    // If user explicitly confirmed manual override (options.force), allow reservation; otherwise require open slot
    let reservationId: string | null;
    if (!options.force) {
      const slot = await this.reserveDailyImageSlot(db);
      if (!slot) {
        const quota = await this.checkDailyImageQuota(db);
        throw new AppError(quota.reason || 'Daily image generation quota reached.', 429, 'QUOTA_EXCEEDED');
      }
      reservationId = slot.reservationId;
    } else {
      // Manual force override still claims a tracking record in running state
      reservationId = `img-force-${crypto.randomUUID()}`;
      await db
        .prepare(
          `INSERT INTO ai_runs (id, role, model, provider, status, created_at)
           VALUES (?, 'image_generator', ?, 'cloudflare-workers-ai', 'running', ?)`,
        )
        .bind(reservationId, AI_IMAGE_GENERATION_MODEL, new Date().toISOString())
        .run()
        .catch(() => null);
    }

    // 2. Concept & Scene Generation:
    // Query representative category history (published, approved, pending, rejected)
    const history = await getCategoryConceptHistory(db, options.category || 'General', 25);

    // If sceneConcept is passed in options or description was provided, respect it.
    // Otherwise, generate a novel scene concept via AI provider using category history.
    let sceneConcept: GeneratedSceneConcept | undefined = options.sceneConcept;
    let effectiveDescription = options.description.trim();

    if (!effectiveDescription && !sceneConcept) {
      const { getAIProvider } = await import('../../ai/factory');
      const aiProvider = getAIProvider(this.env, 'writer');
      sceneConcept = await generateNovelImageConcept(
        aiProvider,
        options.category || 'General',
        history,
        options.postContext,
      );
      effectiveDescription = sceneConcept.promptDescription;
    } else if (sceneConcept && !effectiveDescription) {
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
      // Call Cloudflare Workers AI text-to-image model (FLUX.1 Schnell is distilled for 4 steps)
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

      // Update reservation to completed
      if (reservationId) {
        await db
          .prepare(
            `UPDATE ai_runs
             SET status = 'completed', duration_ms = ?, prompt_tokens = 0, completion_tokens = 0, total_tokens = 0
             WHERE id = ?`,
          )
          .bind(durationMs, reservationId)
          .run()
          .catch(() => null);
      }
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);

      // Mark reservation as failed so quota is not locked by failed run
      if (reservationId) {
        await db
          .prepare(
            `UPDATE ai_runs
             SET status = 'failed', error_message = ?, duration_ms = ?
             WHERE id = ?`,
          )
          .bind(errorMsg, durationMs, reservationId)
          .run()
          .catch(() => null);
      }

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
    const emotion = sceneConcept?.emotionalTone || detectEmotionalIntent(options.postContext || effectiveDescription);

    const semanticProfile = {
      sceneSummary: effectiveDescription,
      subjects: sceneConcept?.relationship || 'Professional individual or team',
      action: sceneConcept?.action || 'Engaged in focused commercial task',
      objects: sceneConcept?.visualMotif || 'Workplace interfaces and equipment',
      businessContext: sceneConcept?.businessNeed || options.category || 'General',
      emotionalTone: emotion,
      visualMotif: sceneConcept?.visualMotif || 'Clean workspace',
      targetCategory: options.category || 'General',
      keywords: [
        options.category || 'General',
        'AI Generated',
        'NorthSoft',
        ...(sceneConcept?.visualMotif ? [sceneConcept.visualMotif] : []),
      ],
      provenance: {
        source: 'ai_generated' as const,
        author: 'NorthSoft',
        license: 'NorthSoft internal use',
        model: AI_IMAGE_GENERATION_MODEL,
      },
    };

    const notes = JSON.stringify({
      generatedBy: 'Cloudflare Workers AI',
      model: AI_IMAGE_GENERATION_MODEL,
      generationDate: nowIso,
      originalPrompt: prompt,
      sceneConcept: sceneConcept || null,
      semanticProfile,
      neuronsEstimated: AI_IMAGE_ESTIMATED_NEURONS,
      internalBrand: 'NorthSoft',
      usagePolicy: 'NorthSoft internal use',
    });

    const keywords = `${options.category || 'General'}, AI Generated, NorthSoft${sceneConcept?.visualMotif ? `, ${sceneConcept.visualMotif}` : ''}`;

    // 4. Save directly into Curated Image Library as PENDING
    const imgService = new ImageLibraryService(db);
    const imageId = await imgService.addManualImage({
      title,
      sourceType: 'UPLOADED',
      sourceUrl,
      r2Key: key,
      category: options.category || 'General',
      keywords,
      description: effectiveDescription,
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
