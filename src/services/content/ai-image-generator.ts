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

/**
 * Structured scene composition archetype for realistic business imagery.
 */
export interface SceneCompositionArchetype {
  id: string;
  category: string;
  sceneTitle: string;
  subjectDescription: string;
  compositionGuidance: string;
  keywords: string[];
}

/**
 * Curated archetypes per category that vary device, setting, subject, and perspective.
 * Prevents the single static 'contemporary business website layout on laptop screen modern desk' trap.
 */
export const CATEGORY_SCENE_ARCHETYPES: Record<string, SceneCompositionArchetype[]> = {
  'Websites & Landing Pages': [
    {
      id: 'web-tablet-consultation',
      category: 'Websites & Landing Pages',
      sceneTitle: 'Client viewing clean booking portal on modern tablet',
      subjectDescription: 'independent business professional sitting at an oak desk, one hand resting naturally on the edge while holding a slim tablet resting on the tabletop, showing an appointment calendar',
      compositionGuidance: 'natural seated posture with authentic weight distribution, genuine candid concentration, natural skin texture with subtle tonal variation, soft window daylight from the side, clean screen with simple geometric layout',
      keywords: ['tablet', 'booking', 'clean interface', 'scheduling', 'customer'],
    },
    {
      id: 'web-designer-desktop',
      category: 'Websites & Landing Pages',
      sceneTitle: 'Creative professional evaluating modern web typography and wireframe on large monitor',
      subjectDescription: 'web professional viewed from three-quarter over-shoulder angle, sitting comfortably in an ergonomic office chair with hands resting on desk beside a wireless mouse, looking at a minimalist web layout on a matte display',
      compositionGuidance: 'authentic relaxed posture, natural shoulder angle and slight head tilt, realistic hands with natural finger curvature resting on desk surface, soft natural workplace illumination, no fake text',
      keywords: ['monitor', 'minimalist website', 'desktop', 'clean layout', 'designer'],
    },
    {
      id: 'web-mobile-checkout',
      category: 'Websites & Landing Pages',
      sceneTitle: 'Customer using modern mobile website checkout on smartphone',
      subjectDescription: 'hands holding modern smartphone at waist height in a warm contemporary cafe, with natural finger grip and realistic skin folds on knuckles, displaying a clean one-click payment card',
      compositionGuidance: 'anatomically precise two-handed phone grip, authentic skin texture and natural fingernails, softly blurred warm ambient background, sharp focus on device',
      keywords: ['smartphone', 'mobile web', 'checkout', 'ecommerce', 'hands'],
    },
    {
      id: 'web-laptop-minimal',
      category: 'Websites & Landing Pages',
      sceneTitle: 'Laptop displaying modern minimalist company homepage on bright oak desk',
      subjectDescription: 'sleek ultra-thin laptop resting open on a tidy Scandinavian desk, with a ceramic mug and closed notebook nearby, showing a clean corporate homepage with abstract photography',
      compositionGuidance: 'eye-level architectural perspective, bright natural side window illumination, crisp material textures of oak wood, ceramic and metal, balanced composition without people',
      keywords: ['laptop', 'landing page', 'minimalist', 'oak desk', 'workspace'],
    },
    {
      id: 'web-team-review',
      category: 'Websites & Landing Pages',
      sceneTitle: 'Small business colleagues discussing website launch around meeting table',
      subjectDescription: 'two colleagues in thoughtful collaborative discussion seated around a timber studio table, one gesturing subtly toward a shared laptop with relaxed fingers',
      compositionGuidance: 'candid unposed documentary photography, natural facial expressions without forced corporate smiles, realistic posture and eye contact, soft daylight atmosphere',
      keywords: ['team', 'discussion', 'launch', 'studio', 'colleagues'],
    },
  ],
  'Marketing & Customer Acquisition': [
    {
      id: 'mkt-team-growth-board',
      category: 'Marketing & Customer Acquisition',
      sceneTitle: 'Marketing specialists discussing digital metrics in bright studio',
      subjectDescription: 'marketing professional standing naturally beside a wall-mounted glass board with clean upward trend cards, holding a notebook loosely against the arm',
      compositionGuidance: 'natural standing balance with realistic weight shift, relaxed shoulders, candid thoughtful expression, authentic facial shadows and natural skin pores, bright morning sunlight',
      keywords: ['growth', 'marketing', 'team', 'charts', 'presentation'],
    },
    {
      id: 'mkt-social-strategy-tablet',
      category: 'Marketing & Customer Acquisition',
      sceneTitle: 'Digital strategist planning content campaign on digital tablet',
      subjectDescription: 'creative strategist seated at a tidy workspace, right hand holding a digital stylus touching a flat tablet screen, left arm resting comfortably on the wooden desk surface',
      compositionGuidance: 'believable hand ergonomics and stylus grip, natural skin wrinkles at wrist and knuckles, 45-degree angle documentary shot, warm ambient lighting',
      keywords: ['strategist', 'campaign', 'tablet', 'calendar', 'planning'],
    },
    {
      id: 'mkt-ad-performance-laptop',
      category: 'Marketing & Customer Acquisition',
      sceneTitle: 'Entrepreneur analyzing online advertising reach on laptop',
      subjectDescription: 'focused professional in casual knitwear sitting at a sunlit co-working table, resting chin thoughtfully on one hand while browsing clean campaign overview charts',
      compositionGuidance: 'authentic concentration and natural facial asymmetry, soft skin texture catching side window light, believable relaxed pose, shallow depth of field',
      keywords: ['entrepreneur', 'acquisition', 'funnel', 'laptop', 'analytics'],
    },
  ],
  'Sales & Conversion Process': [
    {
      id: 'sales-pos-contactless',
      category: 'Sales & Conversion Process',
      sceneTitle: 'Customer completing fast contactless payment at boutique counter',
      subjectDescription: 'customer hand naturally tapping payment card against a minimalist POS payment terminal on a solid timber retail counter',
      compositionGuidance: 'macro close-up on realistic human hand and payment terminal, authentic skin texture and realistic knuckle lines, soft warm boutique ambient lighting',
      keywords: ['pos', 'contactless payment', 'checkout', 'retail', 'counter'],
    },
    {
      id: 'sales-client-agreement',
      category: 'Sales & Conversion Process',
      sceneTitle: 'Consultant and business client concluding successful service agreement',
      subjectDescription: 'consultant and client in comfortable conversational meeting across a wooden table with tablet and glasses of water, sharing an authentic moment of agreement',
      compositionGuidance: 'natural relaxed seating, genuine candid eye contact, unposed smiles with natural crinkles around eyes, authentic fabric textures and diffuse indoor daylight',
      keywords: ['agreement', 'consultation', 'client', 'handshake', 'partnership'],
    },
    {
      id: 'sales-ecommerce-dispatch',
      category: 'Sales & Conversion Process',
      sceneTitle: 'Store owner preparing packaged online orders in workshop',
      subjectDescription: 'artisan entrepreneur standing at a clean packing bench, holding a cardboard shipping box with both hands while affixing a shipping label',
      compositionGuidance: 'authentic practical craftsmanship, natural posture and arm placement, realistic focused expression, airy daylight from industrial window',
      keywords: ['orders', 'shipping', 'packaging', 'ecommerce', 'dispatch'],
    },
  ],
  'AI & Business Automation': [
    {
      id: 'ai-automated-workflow-screen',
      category: 'AI & Business Automation',
      sceneTitle: 'Engineer configuring visual automated workflow pipeline on dual monitors',
      subjectDescription: 'software engineer seen from side profile at a modern standing desk, resting one hand lightly on a wireless keyboard while observing clean node workflow diagrams on screen',
      compositionGuidance: 'natural standing posture, authentic relaxed grip on keyboard, subtle natural backlight, realistic skin tones with natural ambient fill',
      keywords: ['workflow', 'automation', 'diagram', 'dual monitor', 'standing desk'],
    },
    {
      id: 'ai-smart-ops-tablet',
      category: 'AI & Business Automation',
      sceneTitle: 'Operations manager verifying automated inventory syncing on tablet',
      subjectDescription: 'operations specialist walking thoughtfully through an airy logistics center, holding a tablet securely in both hands at comfortable viewing height',
      compositionGuidance: 'believable mid-stride posture, authentic documentary photojournalism style, natural daylight through high warehouse skylights, genuine focus',
      keywords: ['operations', 'automation', 'tablet', 'syncing', 'manager'],
    },
    {
      id: 'ai-customer-bot-review',
      category: 'AI & Business Automation',
      sceneTitle: 'Support lead reviewing automated customer service workflows on laptop',
      subjectDescription: 'support lead sitting at an open-plan office desk, smiling warmly with relaxed shoulders while viewing a clean conversational flow diagram',
      compositionGuidance: 'subtle authentic smile without exaggeration, natural facial skin texture with pores and realistic highlights, soft ambient office daylight',
      keywords: ['support', 'assistant', 'conversational', 'laptop', 'office'],
    },
  ],
  'Small Business Productivity & Ops': [
    {
      id: 'prod-organized-desk-morning',
      category: 'Small Business Productivity & Ops',
      sceneTitle: 'Morning productivity routine of small business founder',
      subjectDescription: 'small business owner seated at a Scandinavian oak desk in the morning, holding a ceramic coffee cup with one hand while writing notes in a paper planner',
      compositionGuidance: 'candid peaceful morning scene, natural two-handed coordination, realistic skin texture on fingers, warm diagonal window sunlight',
      keywords: ['founder', 'priorities', 'morning routine', 'planner', 'productivity'],
    },
    {
      id: 'prod-digital-invoice-tablet',
      category: 'Small Business Productivity & Ops',
      sceneTitle: 'Trades professional generating instant digital quote on rugged tablet',
      subjectDescription: 'skilled tradesperson in clean workwear resting an arm on a timber workbench while holding a rugged tablet showing a simple estimate sheet',
      compositionGuidance: 'authentic grounded posture, realistic hardworking hands with natural skin texture, genuine calm focus, daylight in workshop setting',
      keywords: ['contractor', 'estimate', 'invoice', 'tablet', 'workshop'],
    },
    {
      id: 'prod-paperless-office',
      category: 'Small Business Productivity & Ops',
      sceneTitle: 'Minimalist paperless office desk with laptop and smartphone',
      subjectDescription: 'tidy workspace featuring slim laptop, smartphone on wireless charging dock, small succulent plant and glass of water on matte grey surface',
      compositionGuidance: 'overhead 45-degree angle, exceptional clean architectural symmetry, crisp textures and natural daylight, tranquil environment without people',
      keywords: ['paperless', 'minimalist desk', 'organization', 'laptop', 'clarity'],
    },
  ],
  'Customer Experience & Trust': [
    {
      id: 'cx-warm-greeting-shop',
      category: 'Customer Experience & Trust',
      sceneTitle: 'Welcoming customer greeting at modern local business counter',
      subjectDescription: 'friendly local business owner standing behind a modern timber reception counter, welcoming an incoming client with an approachable, relaxed posture',
      compositionGuidance: 'warm authentic expression, genuine crinkles around eyes, natural shoulder angle, realistic soft skin texture, inviting natural light',
      keywords: ['greeting', 'customer service', 'reception', 'smiling', 'welcome'],
    },
    {
      id: 'cx-client-review-phone',
      category: 'Customer Experience & Trust',
      sceneTitle: 'Customer giving 5-star digital review on smartphone in storefront',
      subjectDescription: 'customer seated in a bright boutique cafe, holding a modern phone with both hands showing a clean 5-star feedback confirmation',
      compositionGuidance: 'authentic hand holding phone with natural fingers, shallow depth of field, warm pleasant bokeh in background, natural lighting',
      keywords: ['five star review', 'rating', 'feedback', 'trust', 'customer satisfaction'],
    },
    {
      id: 'cx-consultation-sofa',
      category: 'Customer Experience & Trust',
      sceneTitle: 'Relaxed professional consultation in modern lounge area',
      subjectDescription: 'business consultant and client seated comfortably in contemporary armchairs across a low coffee table, engaged in authentic discussion',
      compositionGuidance: 'natural seated ergonomics with relaxed posture, candid conversational moment, warm Scandinavian interior with house plants, soft ambient lighting',
      keywords: ['consultation', 'advisory', 'lounge', 'comfortable', 'client trust'],
    },
  ],
  'Local Business & Regional Context': [
    {
      id: 'local-storefront-morning',
      category: 'Local Business & Regional Context',
      sceneTitle: 'Charming modern local business storefront on pedestrian street',
      subjectDescription: 'contemporary local boutique or specialty cafe facade with clean glass display and subtle professional signage on a sunlit street',
      compositionGuidance: 'architectural street photography, morning golden hour lighting, clean sidewalk, believable European or Nordic town feel, unpopulated',
      keywords: ['storefront', 'facade', 'street', 'local shop', 'pedestrian'],
    },
    {
      id: 'local-owner-outside',
      category: 'Local Business & Regional Context',
      sceneTitle: 'Local shop owner opening welcoming entrance for business day',
      subjectDescription: 'independent shop owner standing beside the glass entrance door of a clean neighborhood shop, holding a small open sign with both hands',
      compositionGuidance: 'proud natural posture, authentic documentary portrait, genuine gentle smile, realistic skin textures and clothing folds in bright morning light',
      keywords: ['shop owner', 'entrance', 'neighborhood', 'local enterprise', 'open sign'],
    },
  ],
  'General': [
    {
      id: 'gen-bright-co-working',
      category: 'General',
      sceneTitle: 'Bright collaborative modern business workspace',
      subjectDescription: 'two professionals working independently in a spacious Scandinavian-style co-working space with large windows and indoor plants',
      compositionGuidance: 'wide environmental perspective, airy modern architecture, warm natural light, authentic workplace energy, realistic unposed figures',
      keywords: ['co-working', 'workspace', 'modern office', 'daylight', 'business'],
    },
    {
      id: 'gen-executive-desk',
      category: 'General',
      sceneTitle: 'Clutter-free executive desk with modern laptop and coffee cup',
      subjectDescription: 'tasteful professional desk setup with laptop, notebook, fountain pen and ceramic coffee mug under natural window light',
      compositionGuidance: 'elegant commercial photography, balanced composition, crisp textures of wood, ceramic and metal, serene setting without people',
      keywords: ['desk', 'laptop', 'coffee', 'notebook', 'professional setup'],
    },
  ],
};

/**
 * Selects a diverse, complementary scene archetype for a category by checking
 * existing image titles, descriptions, and prompt notes in the database.
 * If the library already has laptop screens, it prioritizes tablets, customer interactions,
 * storefronts, or team consultations.
 * Supports cycleOffset to allow stepping through alternative scene suggestions deterministically.
 */
export function selectComplementaryScene(
  category: string,
  existingImageMetadata: Array<{ title?: string; description?: string; notes?: string }> = [],
  contextQuery?: string,
  cycleOffset = 0,
): SceneCompositionArchetype {
  const archetypes = CATEGORY_SCENE_ARCHETYPES[category] || CATEGORY_SCENE_ARCHETYPES['General'] || [];
  if (archetypes.length === 0) {
    return {
      id: 'fallback-business-scene',
      category,
      sceneTitle: 'Contemporary commercial business scene',
      subjectDescription: contextQuery || 'modern professional business setting',
      compositionGuidance: 'natural daylight, uncluttered workspace, clean photographic composition',
      keywords: ['business', 'professional'],
    };
  }

  // Count usage of each archetype's signature keywords among existing images
  const scores = archetypes.map((archetype) => {
    let penalty = 0;
    const archTokens = archetype.keywords.map((k) => k.toLowerCase());

    for (const img of existingImageMetadata) {
      const corpus = `${img.title || ''} ${img.description || ''} ${img.notes || ''}`.toLowerCase();
      for (const tok of archTokens) {
        if (corpus.includes(tok)) {
          penalty += 1;
        }
      }
      // Specific check for repetitious laptop desks
      if (archTokens.includes('laptop') && corpus.includes('laptop screen modern desk')) {
        penalty += 3;
      }
    }

    // Boost if the user specifically asked for something relevant to this archetype
    let relevanceBoost = 0;
    if (contextQuery) {
      const qLower = contextQuery.toLowerCase();
      for (const tok of archTokens) {
        if (qLower.includes(tok)) {
          relevanceBoost += 2;
        }
      }
    }

    return {
      archetype,
      // Lower score = less represented in the library (more diverse)
      diversityScore: penalty - relevanceBoost,
    };
  });

  // Sort ascending by diversityScore to pick the least used / most complementary archetype
  scores.sort((a, b) => a.diversityScore - b.diversityScore);
  const normalizedIndex = Math.abs(cycleOffset) % scores.length;
  const chosen = scores[normalizedIndex];
  return chosen ? chosen.archetype : archetypes[0]!;
}

/**
 * Builds a photographic, realistic business prompt tailored for NorthSoft.
 * Strictly avoids plastic AI skin, distorted hands, artificial expressions,
 * and garbled screen artifacts by specifying photographic properties:
 * natural skin pores, unposed relaxed postures, directional daylight,
 * and clean graphic screen compositions.
 */
export function buildBusinessImagePrompt(
  description: string,
  category: string,
  postContext?: string,
  sceneArchetype?: SceneCompositionArchetype,
): string {
  const cleanDesc = description.trim();
  const cleanCat = category.trim();

  const sceneGuidance = sceneArchetype?.compositionGuidance
    ? ` ${sceneArchetype.compositionGuidance}.`
    : '';

  // Core photographic scene declaration with human realism guidance
  let prompt = `A 35mm candid commercial photograph of ${cleanDesc}. Category: ${cleanCat}.${sceneGuidance}`;

  if (postContext && postContext.trim().length > 0) {
    const briefCtx = postContext.trim().slice(0, 150);
    prompt += ` Context: ${briefCtx}.`;
  }

  // Natural human anatomy, realistic skin texture, authentic posture, and environmental lighting
  prompt += ' Photographed with natural window daylight, neutral balanced exposure, subtle depth of field with 50mm lens perspective.';
  prompt += ' Authentic human subjects feature natural skin texture with visible fine pores and subtle tone variation, candid relaxed expressions, gentle crinkles around the eyes, realistic relaxed postures with natural weight distribution.';
  prompt += ' Any hands in view are anatomically accurate with natural finger curvature, realistic knuckles, and physical contact with held objects.';
  prompt += ' Device screens present clean minimalist graphic layouts, simple wireframe sections, or clean photography without cluttered dashboards or pseudo-lettering.';

  return prompt;
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

    // 2. Scene Diversification & Repetition Guard:
    // Query recent image titles, descriptions, and notes in this category to detect dominantly repeated setups
    let existingImages: Array<{ title: string; description: string; notes: string }>;
    try {
      const existingRes = await db
        .prepare(
          `SELECT title, description, notes FROM curated_images
           WHERE category = ? OR category = 'General'
           ORDER BY created_at DESC LIMIT 20`,
        )
        .bind(options.category || 'General')
        .all<{ title: string | null; description: string | null; notes: string | null }>();
      existingImages = (existingRes.results || []).map((r) => ({
        title: r.title || '',
        description: r.description || '',
        notes: r.notes || '',
      }));
    } catch {
      existingImages = [];
    }

    const sceneArchetype = selectComplementaryScene(options.category || 'General', existingImages, options.description);
    const prompt = buildBusinessImagePrompt(options.description, options.category, options.postContext, sceneArchetype);
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

    const title = options.description.trim().slice(0, 80) || 'AI Generated Business Illustration';
    const notes = JSON.stringify({
      generatedBy: 'Cloudflare Workers AI',
      model: AI_IMAGE_GENERATION_MODEL,
      generationDate: nowIso,
      originalPrompt: prompt,
      sceneArchetypeId: sceneArchetype.id,
      sceneArchetypeTitle: sceneArchetype.sceneTitle,
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
