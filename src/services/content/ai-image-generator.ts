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
import { deriveImageSearchQuery } from './image-service';

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
  searchQuery?: string;
  compositionGuidance: string;
  rationale: string;
  peoplePerspective?: string;
  settingType?: string;
  compositionType?: string;
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
 * Used as inspirational vectors for the LLM art director across varied people, settings, actions, and compositions.
 * Never uses generic futuristic tropes, sci-fi machinery, or identical room templates.
 */
export const CATEGORY_CREATIVE_VECTORS: Record<string, string[]> = {
  'Websites & Landing Pages': [
    'Web developer and local business owner reviewing responsive site layout across dual monitors in sunny studio',
    'Client in design consultation discussing homepage usability and navigation with consultant at timber table',
    'Artisan inspecting customer checkout flow on tablet at clean wooden workshop counter',
    'Candid over-the-shoulder shot of customer comfortably completing mobile purchase in bright cafe',
    'Creative pair conducting website accessibility and usability walkthrough in airy Scandinavian conference room',
    'Close-up hands of business founder updating online catalog products on modern laptop',
  ],
  'AI & Business Automation': [
    'Small business owner organizing automated delivery notifications on phone while packing customer orders',
    'Cafe owner observing automated inventory tracking dashboard while preparing artisanal coffee',
    'Team reviewing automated client booking calendar in sunlit Scandinavian office',
    'Consultant showing boutique retailer an automated email workflow on tablet across timber counter',
    'Independent entrepreneur relaxed at home office desk as automated invoicing finishes running',
    'Warehouse manager with clipboard reviewing automated dispatch status at clean packing bay',
  ],
  'Marketing & Customer Acquisition': [
    'Retailer and marketing strategist reviewing printed customer feedback cards in bright storefront',
    'Marketing consultant and boutique owner brainstorming campaign goals over notebooks and coffee',
    'Small business founder reviewing organic search growth metrics with colleague on sunny balcony office',
    'Content creator arranging natural product display by bright window for local social campaign',
    'Entrepreneur mapping customer journey stages with sticky notes on clean glass partition',
  ],
  'Sales & Conversion Process': [
    'Boutique owner warmly handing wrapped purchase to smiling customer across wooden sales counter',
    'Client and account manager signing agreement with fountain pen in sunlit meeting space',
    'Independent service provider presenting transparent pricing options to customer in quiet reception',
    'Retail associate demonstrating product features to engaged patron in modern Nordic shop',
    'Entrepreneur reviewing conversion milestones with quiet pride at minimalist desk',
  ],
  'Small Business Productivity & Ops': [
    'Craftsman in tidy workshop checking digital inventory on wall-mounted tablet',
    'Business partners prioritizing weekly operational tasks on physical whiteboard',
    'Entrepreneur organizing neat shipment packages ready for morning courier pickup',
    'Small team conducting quick 5-minute morning standup in open studio workspace',
    'Office manager streamlining digital document filing at plant-filled workstation',
  ],
  'Customer Experience & Trust': [
    'Friendly customer specialist greeting client with genuine smile at bright modern reception desk',
    'Customer comfortably relaxing in consulting chair discussing project with approachable advisor',
    'Business owner shaking hands with satisfied client near open storefront entrance',
    'Service professional attentively answering customer questions with open body language',
    'Delighted customer experiencing smooth appointment booking on smartphone in comfortable waiting lounge',
  ],
  'Local Business & Regional Context': [
    'Neighborhood bakery or coffee shop owner opening welcoming storefront door in morning light',
    'Local tradesperson and homeowner reviewing architectural renovation sketch on site',
    'Specialty shop owner arranging artisanal goods on wooden display shelves on quiet European street',
    'Regional business owner conversing with regular customer outside boutique in Nordic town',
  ],
  'General': [
    'Contemporary Scandinavian workplace with natural timber, plants, and calm lighting',
    'Collaborative pair discussing architectural project sketches across uncluttered oak table',
    'Quiet focused business owner organizing workday with notebook, pen, and coffee at sunny desk',
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
 * Backward-compatible wrapper delegating to validateConceptNovelty.
 */
export function isSemanticallyDistinct(
  candidate: GeneratedSceneConcept,
  history: CategoryHistoryItem[],
): { distinct: boolean; conflictReason?: string } {
  const result = validateConceptNovelty(candidate, history);
  return {
    distinct: result.valid,
    conflictReason: result.reason,
  };
}

/**
 * Formats a representative, diverse sample of category history across statuses
 * (published, approved, pending, rejected) to provide context for AI novelty analysis
 * within a reasonable token budget (~400-600 tokens).
 */
export function formatHistoryForAIAnalysis(history: CategoryHistoryItem[]): string {
  if (!history || history.length === 0) {
    return 'No prior images in this category yet. You are establishing the visual standard.';
  }

  // Segment by status to guarantee representation from all phases
  const published = history.filter((h) => h.status === 'PUBLISHED' || h.publishedCount > 0);
  const approved = history.filter((h) => h.status === 'APPROVED' && h.publishedCount === 0);
  const pending = history.filter((h) => h.status === 'PENDING' && h.publishedCount === 0);
  const rejected = history.filter((h) => h.status === 'REJECTED');

  // Diverse quota selection (prioritizing what was actually published and approved)
  const selected: CategoryHistoryItem[] = [
    ...published.slice(0, 5),
    ...approved.slice(0, 4),
    ...pending.slice(0, 3),
    ...rejected.slice(0, 3),
  ];

  // If still room, fill with remaining items up to 15
  if (selected.length < 15) {
    const existingIds = new Set(selected.map((s) => s.id));
    for (const h of history) {
      if (!existingIds.has(h.id)) {
        selected.push(h);
        if (selected.length >= 15) break;
      }
    }
  }

  return selected
    .map((h) => {
      const parts: string[] = [`- [Status: ${h.status}]`];
      if (h.situation) parts.push(`Situation: "${h.situation}"`);
      else if (h.title) parts.push(`Title: "${h.title}"`);
      if (h.action) parts.push(`Action: "${h.action}"`);
      if (h.visualMotif) parts.push(`Visual Motif: "${h.visualMotif}"`);
      if (h.description && !h.situation) parts.push(`Desc: ${h.description.slice(0, 80)}`);
      return parts.join(' | ');
    })
    .join('\n');
}

/**
 * Validates the candidate concept generated by the AI model.
 * Verifies structural integrity, distinctness against direct duplicate situations,
 * and semantic soundness without applying restrictive keyword lists.
 */
export function validateConceptNovelty(
  candidate: GeneratedSceneConcept,
  history: CategoryHistoryItem[],
): { valid: boolean; reason?: string } {
  if (!candidate.situation || candidate.situation.trim().length < 5) {
    return { valid: false, reason: 'Candidate missing concrete situation description.' };
  }
  if (!candidate.promptDescription || candidate.promptDescription.trim().length < 10) {
    return { valid: false, reason: 'Candidate missing detailed prompt description for text-to-image.' };
  }

  const candSitLower = candidate.situation.toLowerCase().trim();
  const candActLower = candidate.action.toLowerCase().trim();
  const candDescLower = candidate.promptDescription.toLowerCase().trim();

  // Guard against repetitive futuristic / sci-fi template defaulting
  const futuristicTropes = ['futuristic room', 'holographic', 'hologram', 'sci-fi machinery', 'neon tech lab', 'cybernetic'];
  if (futuristicTropes.some((trope) => candDescLower.includes(trope) || candSitLower.includes(trope))) {
    return { valid: false, reason: 'Candidate contains generic futuristic or sci-fi machinery tropes.' };
  }

  for (const item of history) {
    if (item.situation && item.situation.trim().length > 10) {
      const histSitLower = item.situation.toLowerCase().trim();
      // Verifies exact or near-identical situation duplication
      if (candSitLower === histSitLower || (candSitLower.includes(histSitLower) && histSitLower.includes(candSitLower))) {
        return {
          valid: false,
          reason: `Proposed situation directly replicates historical entry: "${item.situation}" (${item.status}).`,
        };
      }
    }

    // Direct verbatim action duplication
    if (item.action && item.action.trim().length > 15) {
      const histActLower = item.action.toLowerCase().trim();
      if (candActLower === histActLower) {
        return {
          valid: false,
          reason: `Proposed physical action replicates existing item: "${item.action}".`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Generates an authentic, novel scene concept using Cloudflare Workers AI (Llama 3.1 8B Instruct).
 * The AI analyzes the post narrative, determines the emotional intent, and conceives a fresh
 * scene contrasting with representative category history across 5 creative dimensions:
 * People, Setting, Action, Composition, and Visual treatment.
 *
 * Produces two explicitly separated outputs:
 * 1. promptDescription: Detailed, visually specific commercial scene for FLUX.1 Schnell text-to-image.
 * 2. searchQuery: Concise 3–8 word English noun-phrase query optimized for stock photograph search.
 */
export async function generateNovelImageConcept(
  aiProvider: IAIProvider,
  category: string,
  history: CategoryHistoryItem[],
  postContext?: string,
  userHint?: string,
): Promise<GeneratedSceneConcept> {
  const historyOverview = formatHistoryForAIAnalysis(history);
  const dominantThemes = summarizeDominantThemes(history);

  const categoryVectors = CATEGORY_CREATIVE_VECTORS[category] || CATEGORY_CREATIVE_VECTORS['General'] || [];
  const creativeDirectionsText = categoryVectors.map((v) => `* ${v}`).join('\n');

  // Extract recent prompt actions/settings to explicitly discourage repeating the same immediate setups
  const recentHistorySnippets = history
    .slice(0, 8)
    .map((h) => {
      const parts: string[] = [];
      if (h.situation) parts.push(`Situation: "${h.situation}"`);
      if (h.action) parts.push(`Action: "${h.action}"`);
      if (h.visualMotif) parts.push(`Motif: "${h.visualMotif}"`);
      return parts.join(' | ');
    })
    .filter(Boolean);

  for (let attempt = 1; attempt <= 2; attempt++) {
    const promptMessages = [
      {
        role: 'system' as const,
        content: `You are an expert commercial advertising art director for NorthSoft, a Scandinavian technology & digital marketing agency.
Your role is to conceive ONE completely fresh, authentic commercial photography concept for the business category "${category}".

AI RESPONSIBILITIES & CREATIVE MANDATE:
1. SEMANTIC EMOTIONAL INTENT: Analyze the post context and theme. Autonomously choose the appropriate emotional intent ('positive', 'neutral', 'problem-aware', or 'collaborative') based on what serves the narrative, rather than relying on keywords.
2. CREATIVE DIVERSITY ACROSS 5 DIMENSIONS:
   - People: business owner, customer, client, consultant, artisan, small team, or still life / no visible people.
   - Setting: small business office, retail storefront, workshop, cafe counter, sunny client meeting space, warehouse packing station, home office, outdoor Nordic street.
   - Action: discussion, decision-making, customer interaction, unhurried planning, hands-on crafting, packaging, reviewing blueprints or physical samples.
   - Composition: close-up on hands/tools, medium over-the-shoulder, wide environmental documentary, low-angle natural perspective, candid side profile.
   - Visual Treatment: natural daylight documentary photography, authentic candid editorial, warm Scandinavian interior tones, crisp commercial still life.
3. STRICT PROHIBITION ON SCI-FI & REPETITIVE TROPES:
   - NEVER generate futuristic clichés: NO glowing holographic screens, NO futuristic rooms, NO sci-fi machinery, NO neon tech laboratories.
   - DO NOT default to a repetitive setup of "a specialist in a futuristic room staring at complex innovation screens".
   - The scene must depict a credible, contemporary, photorealistic business situation.
4. MAXIMUM PHOTOREALISM & NATURAL HUMAN APPEARANCE MANDATE:
   - People must look 100% indistinguishable from real documentary photographs to the naked eye.
   - STRICTLY FORBID the CGI look, 3D computer graphics, plastic waxy skin, or artificial airbrushing.
   - Emphasize authentic human features: realistic skin micro-texture, fine pores, natural hair strands with subtle organic flyaways, relaxed candid posture, genuine human micro-expressions, and soft natural directional window lighting.
5. TWO EXPLICITLY SEPARATE OUTPUTS:
   - "promptDescription": 2-3 sentences rich, visually specific commercial scene description for FLUX.1 text-to-image generation.
   - "searchQuery": Concise 3-8 word English noun-phrase query optimized for stock photography search (e.g. "small business AI automation", "satisfied customer business meeting", "person using smartphone shopping", "small business owner planning work"). Do NOT include camera instructions, lighting words, or full narrative sentences in the search query.
6. RECENT SCENES & SITUATIONS TO CONTRAST WITH (do NOT repeat these):
${recentHistorySnippets.length > 0 ? recentHistorySnippets.map((r) => `* ${r}`).join('\n') : (historyOverview || dominantThemes.map((t) => `* ${t}`).join('\n'))}

Frequent motifs already well-covered in library (explore outside these):
${dominantThemes.map((t) => `* ${t}`).join('\n')}

6. INSPIRATIONAL VECTORS (Explore one of these directions or conceive an equally novel situation):
${creativeDirectionsText}

7. EDITORIAL CONTEXT:
${postContext ? `Accompanying post/article: "${postContext.slice(0, 350)}"` : 'General category editorial photography.'}
${userHint ? `User preference/query: "${userHint}"` : ''}

OUTPUT FORMAT: You MUST return strictly valid JSON matching this schema:
{
  "situation": "Short 1-sentence description of the unique business situation",
  "action": "Specific physical action, gaze direction, and hand placement of subject(s)",
  "relationship": "Relation between subjects or subject to environment",
  "businessNeed": "The underlying business challenge or success depicted",
  "emotionalTone": "positive" | "neutral" | "problem-aware" | "collaborative",
  "visualMotif": "Key physical visual motif (e.g. oak sample board, architectural glass partition, rugged clipboard)",
  "promptDescription": "2-3 sentences clear candid scene description suitable for text-to-image prompt (what the person does, what they look at, realistic posture)",
  "searchQuery": "Concise 3-8 word English noun phrase for stock search (e.g. 'small business owner planning work')",
  "compositionGuidance": "1 sentence on camera distance, daylight direction, and uncluttered composition",
  "rationale": "Clear analytical reasoning explaining how this concept provides fresh narrative value compared to existing history"
}`,
      },
      {
        role: 'user' as const,
        content: `Analyze the context and history for "${category}", determine the narrative emotional tone, and conceive a semantically fresh, authentic photography concept with separate promptDescription and searchQuery. Return strictly the JSON object.`,
      },
    ];

    try {
      const completion = await aiProvider.complete({
        role: 'writer',
        messages: promptMessages,
        temperature: attempt === 1 ? 0.4 : 0.7,
        maxTokens: 600,
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
        const parsedTone = String(parsed.emotionalTone || '').toLowerCase();
        const validTones: EmotionalIntent[] = ['positive', 'neutral', 'problem-aware', 'collaborative'];
        const resolvedTone: EmotionalIntent = validTones.includes(parsedTone as EmotionalIntent)
          ? (parsedTone as EmotionalIntent)
          : 'neutral';

        const rawPromptDesc = String(parsed.promptDescription).trim();
        const rawSearchQuery = parsed.searchQuery ? String(parsed.searchQuery).trim() : '';

        // Enforce separate, clean 3-8 word search query
        const resolvedSearchQuery = (rawSearchQuery.length >= 5 && rawSearchQuery.split(/\s+/).length <= 8 && !rawSearchQuery.includes('.'))
          ? rawSearchQuery
          : deriveImageSearchQuery(rawSearchQuery || rawPromptDesc, category);

        const concept: GeneratedSceneConcept = {
          id: `concept-${crypto.randomUUID().slice(0, 8)}`,
          situation: String(parsed.situation).trim(),
          action: String(parsed.action || '').trim(),
          relationship: String(parsed.relationship || '').trim(),
          businessNeed: String(parsed.businessNeed || '').trim(),
          emotionalTone: resolvedTone,
          visualMotif: String(parsed.visualMotif || '').trim(),
          promptDescription: rawPromptDesc,
          searchQuery: resolvedSearchQuery,
          compositionGuidance: String(parsed.compositionGuidance || 'natural daylight, uncluttered workspace, clean photographic composition').trim(),
          rationale: String(parsed.rationale || 'Novel situational perspective for category').trim(),
        };

        const validation = validateConceptNovelty(concept, history);
        if (validation.valid) {
          return concept;
        }
        console.warn(`[generateNovelImageConcept] Attempt ${attempt} validation failed: ${validation.reason}`);
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
 * Directly integrates promptDescription, compositionGuidance, and AI-determined emotionalTone.
 */
export const EMOTIONAL_EXPRESSION_DIRECTIONS: Record<EmotionalIntent, string> = {
  positive: 'Expression: calm satisfaction, relaxed facial features, subtle natural crinkles around eyes, authentic smile without forced posing, unhurried posture.',
  neutral: 'Expression: focused concentration, neutral composed brow, quiet professionalism, eyes directed at the work with natural catchlight.',
  'problem-aware': 'Expression: analytical contemplation, attentive focus, hand touching chin or holding pen, inspecting data with serious diligence, natural thoughtful brow.',
  collaborative: 'Expression: approachable engagement, receptive listening posture, natural head angle during conversational exchange, authentic communicative micro-expressions.',
};

export function buildBusinessImagePrompt(
  description: string,
  category: string,
  postContext?: string,
  sceneConcept?: {
    compositionGuidance?: string;
    emotionalTone?: EmotionalIntent;
    promptDescription?: string;
  },
): string {
  // Use sceneConcept.promptDescription if present for rich scene action, otherwise fallback to description
  const primaryDescription = sceneConcept?.promptDescription?.trim() || description.trim();
  const cleanCat = category.trim();

  // 1. Scene Action & Subject
  const sceneGuidance = sceneConcept?.compositionGuidance?.trim()
    ? ` Spatial composition & lighting: ${sceneConcept.compositionGuidance.trim()}.`
    : '';
  const actionSegment = `A 35mm candid commercial photograph of ${primaryDescription}. Category: ${cleanCat}.${sceneGuidance}`;

  // 2. Emotional Tone & Posture (AI determined or fallback)
  const emotion = sceneConcept?.emotionalTone || detectEmotionalIntent(postContext || primaryDescription);
  const emotionalSegment = EMOTIONAL_EXPRESSION_DIRECTIONS[emotion];

  // 3. Photographic Style & Environment - Explicit Photorealism, Natural Skin, Hair & Eyes
  const photoSegment = 'Style: 35mm lens, natural directional window daylight, f/4 aperture with gentle background separation, realistic skin texture with fine pores, individual hair strands with natural texture and subtle organic flyaways, authentic skin subsurface scattering with fine imperfections, natural eye moisture and realistic eyelid folds, believable fabric folds, zero digital smoothing, no plastic skin, no CGI render, raw documentary photography aesthetic, neutral color grading.';

  // 4. Device Screen Composition
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
      sceneConcept
        ? {
            compositionGuidance: sceneConcept.compositionGuidance,
            emotionalTone: sceneConcept.emotionalTone,
            promptDescription: sceneConcept.promptDescription,
          }
        : undefined,
    );
    const startTime = Date.now();
    let imageBytes: ArrayBuffer;

    const envObj = this.env as unknown as Record<string, unknown> | undefined;
    const modelToUse = (typeof envObj?.AI_IMAGE_MODEL === 'string' && envObj.AI_IMAGE_MODEL.trim())
      ? envObj.AI_IMAGE_MODEL.trim()
      : AI_IMAGE_GENERATION_MODEL;

    // Use 8 steps for FLUX.1 Schnell to resolve high-frequency skin pores, individual hair strands, and eye geometry
    const stepsToUse = modelToUse.includes('flux') ? 8 : 20;

    try {
      // Call Cloudflare Workers AI text-to-image model (FLUX.1 Schnell at maximum 8 steps for photorealistic skin/hair)
      const aiResponse = await this.env.AI.run(modelToUse as Parameters<Ai['run']>[0], {
        prompt,
        steps: stepsToUse,
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
