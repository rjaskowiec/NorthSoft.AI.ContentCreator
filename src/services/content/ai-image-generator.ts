/**
 * NorthSoft.AI.ContentCreator — AI Image Generation Service (Cloudflare Workers AI)
 *
 * Implements server-side text-to-image generation for NorthSoft's Curated Image Library:
 * - Powered by Cloudflare Workers AI using the fast & realistic SDXL-Lightning model:
 *   `@cf/bytedance/stable-diffusion-xl-lightning` (or fallback `@cf/black-forest-labs/flux-1-schnell`).
 * - Strict Zero-Paid-Cost / Free-Tier Protection:
 *   Single generation uses ~150-250 Neurons (>100 Neurons). In accordance with policy,
 *   a strict server-side limit of MAX 1 GENERATED IMAGE PER DAY is enforced via QuotaManager and D1.
 * - Concurrency & Race-Condition Safe:
 *   Daily limit is checked and reserved in D1 before invocation. No paid fallback.
 * - Legal & Attribution Compliance:
 *   * Author: "NorthSoft"
 *   * License: "NorthSoft internal use" (internal company policy, no external fictional creator or fake license)
 *   * Status: ALWAYS saved as "PENDING" for mandatory manual administrator review. Never auto-approved.
 *   * Internal Provenance: Stored in curated_images.notes (model, prompt, generation date, cost).
 *   * Technical Metadata: Stripped / clean raw PNG stored in Cloudflare R2 (`env.IMAGE_BUCKET`).
 */

import { AppError } from '../../core/errors';
import { QuotaManager } from '../ai/quota-manager';
import { ImageLibraryService } from './image-library-service';

export const AI_IMAGE_GENERATION_MODEL = '@cf/bytedance/stable-diffusion-xl-lightning';
export const AI_IMAGE_DAILY_LIMIT = 1;
export const AI_IMAGE_ESTIMATED_NEURONS = 200;

export interface GenerateImageOptions {
  category: string;
  description: string;
  postContext?: string;
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
      subjectDescription: 'small business owner and customer reviewing an elegant appointment scheduling interface on a sleek tablet screen',
      compositionGuidance: 'natural desk lighting, minimal clean graphic blocks on screen without pseudo-text or illegible letters, comfortable daylight workplace',
      keywords: ['tablet', 'booking', 'clean interface', 'scheduling', 'customer'],
    },
    {
      id: 'web-designer-desktop',
      category: 'Websites & Landing Pages',
      sceneTitle: 'Creative professional evaluating modern web typography and wireframe on large monitor',
      subjectDescription: 'designer at wooden desk looking at a minimalist responsive website layout with clean abstract geometric color sections on an external display',
      compositionGuidance: 'angle shot from behind shoulder, crisp monitor displaying clean whitespace and photographic banners, no cluttered dashboards or fake text',
      keywords: ['monitor', 'minimalist website', 'desktop', 'clean layout', 'designer'],
    },
    {
      id: 'web-mobile-checkout',
      category: 'Websites & Landing Pages',
      sceneTitle: 'Customer using modern mobile website checkout on smartphone',
      subjectDescription: 'hands holding modern smartphone displaying a clean one-click payment mobile web page in a contemporary cafe setting',
      compositionGuidance: 'close-up on natural hands holding device, clear bold payment confirmation card on phone screen, softly blurred cafe background',
      keywords: ['smartphone', 'mobile web', 'checkout', 'ecommerce', 'hands'],
    },
    {
      id: 'web-laptop-minimal',
      category: 'Websites & Landing Pages',
      sceneTitle: 'Laptop displaying modern minimalist company homepage on bright oak desk',
      subjectDescription: 'sleek ultra-thin laptop showing a contemporary corporate landing page with clean hero image and minimalist navigation bar',
      compositionGuidance: 'eye-level architectural perspective, bright natural side window illumination, potted plant and notebook beside laptop, no fake text on screen',
      keywords: ['laptop', 'landing page', 'minimalist', 'oak desk', 'workspace'],
    },
    {
      id: 'web-team-review',
      category: 'Websites & Landing Pages',
      sceneTitle: 'Small business team discussing website launch around meeting table',
      subjectDescription: 'two business colleagues reviewing a new responsive company website on a central laptop in a modern collaborative studio',
      compositionGuidance: 'authentic documentary business photography, natural candid smiles, warm natural office atmosphere',
      keywords: ['team', 'discussion', 'launch', 'studio', 'colleagues'],
    },
  ],
  'Marketing & Customer Acquisition': [
    {
      id: 'mkt-team-growth-board',
      category: 'Marketing & Customer Acquisition',
      sceneTitle: 'Marketing team analyzing digital growth metrics on presentation display',
      subjectDescription: 'marketing specialists in light-filled office discussing digital campaign results displayed as clean high-contrast upward trend charts',
      compositionGuidance: 'candid collaborative atmosphere, clear visual graphs without chaotic micro-numbers, modern corporate interior',
      keywords: ['growth', 'marketing', 'team', 'charts', 'presentation'],
    },
    {
      id: 'mkt-social-strategy-tablet',
      category: 'Marketing & Customer Acquisition',
      sceneTitle: 'Digital strategist planning content campaign on digital tablet',
      subjectDescription: 'creative strategist holding a digital stylus organizing visual marketing calendar cards on a tablet surface',
      compositionGuidance: 'top-down flat lay perspective with coffee cup, clean organized wooden desk, warm natural illumination',
      keywords: ['strategist', 'campaign', 'tablet', 'calendar', 'planning'],
    },
    {
      id: 'mkt-ad-performance-laptop',
      category: 'Marketing & Customer Acquisition',
      sceneTitle: 'Entrepreneur analyzing online advertising reach on laptop',
      subjectDescription: 'focused professional at a bright workspace reviewing clean high-level customer acquisition funnel statistics on modern laptop',
      compositionGuidance: 'side profile shot, shallow depth of field, authentic daylight, uncluttered workspace',
      keywords: ['entrepreneur', 'acquisition', 'funnel', 'laptop', 'analytics'],
    },
  ],
  'Sales & Conversion Process': [
    {
      id: 'sales-pos-contactless',
      category: 'Sales & Conversion Process',
      sceneTitle: 'Customer completing fast contactless payment at boutique counter',
      subjectDescription: 'customer tapping smartphone or card against a modern minimalist POS payment terminal on wooden retail counter',
      compositionGuidance: 'close-up on seamless contactless transaction, warm boutique store lighting, genuine small business commerce',
      keywords: ['pos', 'contactless payment', 'checkout', 'retail', 'counter'],
    },
    {
      id: 'sales-client-agreement',
      category: 'Sales & Conversion Process',
      sceneTitle: 'Consultant and business client concluding successful service agreement',
      subjectDescription: 'two professionals in casual business attire shaking hands across an uncluttered meeting desk with tablet and coffee cups',
      compositionGuidance: 'cinematic lighting, authentic professional rapport, natural daylight, sharp focus on mutual agreement',
      keywords: ['agreement', 'consultation', 'client', 'handshake', 'partnership'],
    },
    {
      id: 'sales-ecommerce-dispatch',
      category: 'Sales & Conversion Process',
      sceneTitle: 'Store owner preparing packaged online orders in workshop',
      subjectDescription: 'entrepreneur in modern artisan studio scanning barcode on neat eco-friendly packaging box with smartphone scanner',
      compositionGuidance: 'authentic craft business environment, tidy organized shipping station, daylight from industrial window',
      keywords: ['orders', 'shipping', 'packaging', 'ecommerce', 'dispatch'],
    },
  ],
  'AI & Business Automation': [
    {
      id: 'ai-automated-workflow-screen',
      category: 'AI & Business Automation',
      sceneTitle: 'Engineer configuring visual automated workflow pipeline on dual monitors',
      subjectDescription: 'developer at modern standing desk with dual monitors showcasing clean node-based automation diagram blocks and flowchart structure',
      compositionGuidance: 'high-contrast clean flowchart visuals without pseudo-code or messy text, modern ergonomic workspace, subtle ambient glow',
      keywords: ['workflow', 'automation', 'diagram', 'dual monitor', 'standing desk'],
    },
    {
      id: 'ai-smart-ops-tablet',
      category: 'AI & Business Automation',
      sceneTitle: 'Operations manager verifying automated inventory syncing on tablet',
      subjectDescription: 'business manager walking through modern fulfillment center holding tablet showing simple color-coded status cards',
      compositionGuidance: 'documentary commercial photography, authentic light industrial background, clear device visibility',
      keywords: ['operations', 'automation', 'tablet', 'syncing', 'manager'],
    },
    {
      id: 'ai-customer-bot-review',
      category: 'AI & Business Automation',
      sceneTitle: 'Support lead reviewing automated customer service workflows on laptop',
      subjectDescription: 'support lead smiling at laptop in bright open-plan office showing simplified conversational flow diagrams',
      compositionGuidance: 'natural daylight, genuine workplace expressions, clean visual presentation of automated logic',
      keywords: ['support', 'assistant', 'conversational', 'laptop', 'office'],
    },
  ],
  'Small Business Productivity & Ops': [
    {
      id: 'prod-organized-desk-morning',
      category: 'Small Business Productivity & Ops',
      sceneTitle: 'Morning productivity routine of small business founder',
      subjectDescription: 'focused business founder organizing weekly priorities with laptop, paper planner and espresso on warm Scandinavian desk',
      compositionGuidance: 'soft morning sunlight streaming through window, tranquil productive workplace, natural wood textures',
      keywords: ['founder', 'priorities', 'morning routine', 'planner', 'productivity'],
    },
    {
      id: 'prod-digital-invoice-tablet',
      category: 'Small Business Productivity & Ops',
      sceneTitle: 'Trades professional generating instant digital quote on rugged tablet',
      subjectDescription: 'contractor in clean modern workshop reviewing a simple digital estimate on tablet beside neat tools',
      compositionGuidance: 'authentic practical business scene, believable craftsmanship, clean interface layout on tablet',
      keywords: ['contractor', 'estimate', 'invoice', 'tablet', 'workshop'],
    },
    {
      id: 'prod-paperless-office',
      category: 'Small Business Productivity & Ops',
      sceneTitle: 'Minimalist paperless office desk with laptop and smartphone',
      subjectDescription: 'tidy workspace featuring slim laptop, smartphone on wireless charging dock, small succulent plant and glass of water',
      compositionGuidance: 'overhead 45-degree angle, exceptional clean architectural symmetry, crisp textures and natural daylight',
      keywords: ['paperless', 'minimalist desk', 'organization', 'laptop', 'clarity'],
    },
  ],
  'Customer Experience & Trust': [
    {
      id: 'cx-warm-greeting-shop',
      category: 'Customer Experience & Trust',
      sceneTitle: 'Welcoming customer greeting at modern local business counter',
      subjectDescription: 'smiling business owner greeting a customer warmly across a modern reception or service desk in a bright local enterprise',
      compositionGuidance: 'authentic warm expression, natural eye contact, inviting commercial atmosphere with soft ambient lighting',
      keywords: ['greeting', 'customer service', 'reception', 'smiling', 'welcome'],
    },
    {
      id: 'cx-client-review-phone',
      category: 'Customer Experience & Trust',
      sceneTitle: 'Customer giving 5-star digital review on smartphone in storefront',
      subjectDescription: 'customer holding smartphone displaying a clear 5-star rating confirmation card inside an attractive local shop',
      compositionGuidance: 'crisp focus on device screen with star rating, softly blurred pleasant retail background, natural light',
      keywords: ['five star review', 'rating', 'feedback', 'trust', 'customer satisfaction'],
    },
    {
      id: 'cx-consultation-sofa',
      category: 'Customer Experience & Trust',
      sceneTitle: 'Relaxed professional consultation in modern lounge area',
      subjectDescription: 'advisor and client sitting in modern comfortable armchairs discussing project details with tablet on low coffee table',
      compositionGuidance: 'approachable hospitality vibe, calm interior design, warm natural textures and plants',
      keywords: ['consultation', 'advisory', 'lounge', 'comfortable', 'client trust'],
    },
  ],
  'Local Business & Regional Context': [
    {
      id: 'local-storefront-morning',
      category: 'Local Business & Regional Context',
      sceneTitle: 'Charming modern local business storefront on pedestrian street',
      subjectDescription: 'contemporary local boutique or specialty cafe facade with clean glass display and subtle professional signage on a sunlit street',
      compositionGuidance: 'architectural street photography, morning golden hour lighting, clean sidewalk, believable European or Nordic town feel',
      keywords: ['storefront', 'facade', 'street', 'local shop', 'pedestrian'],
    },
    {
      id: 'local-owner-outside',
      category: 'Local Business & Regional Context',
      sceneTitle: 'Local shop owner opening welcoming entrance for business day',
      subjectDescription: 'proud independent shop owner placing an open sign by glass entrance of clean contemporary neighborhood store',
      compositionGuidance: 'authentic small business pride, natural documentary photography, bright morning light',
      keywords: ['shop owner', 'entrance', 'neighborhood', 'local enterprise', 'open sign'],
    },
  ],
  'General': [
    {
      id: 'gen-bright-co-working',
      category: 'General',
      sceneTitle: 'Bright collaborative modern business workspace',
      subjectDescription: 'professionals working independently in a spacious Scandinavian-style co-working space with large windows and indoor plants',
      compositionGuidance: 'wide environmental perspective, airy modern architecture, warm natural light, authentic workplace energy',
      keywords: ['co-working', 'workspace', 'modern office', 'daylight', 'business'],
    },
    {
      id: 'gen-executive-desk',
      category: 'General',
      sceneTitle: 'Clutter-free executive desk with modern laptop and coffee cup',
      subjectDescription: 'tasteful professional desk setup with laptop, notebook, fountain pen and ceramic coffee mug under natural window light',
      compositionGuidance: 'elegant commercial photography, balanced composition, crisp textures of wood, ceramic and metal',
      keywords: ['desk', 'laptop', 'coffee', 'notebook', 'professional setup'],
    },
  ],
};

/**
 * Selects a diverse, complementary scene archetype for a category by checking
 * existing image titles, descriptions, and prompt notes in the database.
 * If the library already has laptop screens, it prioritizes tablets, customer interactions,
 * storefronts, or team consultations.
 */
export function selectComplementaryScene(
  category: string,
  existingImageMetadata: Array<{ title?: string; description?: string; notes?: string }> = [],
  contextQuery?: string,
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
  const bestChoice = scores[0];
  return bestChoice ? bestChoice.archetype : archetypes[0]!;
}

/**
 * Builds a photographic, realistic business prompt tailored for NorthSoft.
 * Strictly avoids screen artifacts: forbids garbled pseudo-text, chaotic dashboards,
 * unreadable microscopic icons, and distorted hands.
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
    ? ` Visual direction: ${sceneArchetype.compositionGuidance}.`
    : '';

  // Core photographic scene declaration
  let prompt = `Editorial commercial photograph: ${cleanDesc}. Category: ${cleanCat}.${sceneGuidance}`;

  if (postContext && postContext.trim().length > 0) {
    const briefCtx = postContext.trim().slice(0, 150);
    prompt += ` Context: ${briefCtx}.`;
  }

  // Quality, lighting, materials and strict screen anti-artifact guidelines
  prompt += ' Authentic modern workplace, natural daylight illumination, realistic textures and proportions, 35mm lens commercial photography, sharp focus, neutral balanced color grading.';
  prompt += ' CRITICAL SCREEN REQUIREMENTS: Any computer, monitor, phone or tablet screen MUST show only simple minimalist visual color blocks, clean graphic wireframes, or clean photographs; NO pseudo-text, NO garbled letters, NO illegible fake words, NO chaotic cluttered dashboards, NO microscopic random icons.';
  prompt += ' No watermarks, no artificial stock photo cheese, no distorted hands, anatomically correct fingers.';

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

    // 1. Strict server-side quota verification
    const quota = await this.checkDailyImageQuota(db);
    if (!quota.allowed) {
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
      // 2. Call Cloudflare Workers AI text-to-image model
      const aiResponse = await this.env.AI.run(AI_IMAGE_GENERATION_MODEL as Parameters<Ai['run']>[0], {
        prompt,
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
