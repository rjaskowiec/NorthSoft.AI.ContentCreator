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

/**
 * Curated archetypes per category with unambiguous physical interactions,
 * clear gaze direction, explicit screen orientation, and emotional intents.
 */
export const CATEGORY_SCENE_ARCHETYPES: Record<string, SceneCompositionArchetype[]> = {
  'Websites & Landing Pages': [
    {
      id: 'web-client-booking-tablet',
      category: 'Websites & Landing Pages',
      sceneTitle: 'Client viewing clean booking calendar on tablet placed on desk',
      subjectDescription: 'a client seated at a tidy oak consultation desk, looking down attentively at a slim tablet resting flat on the tabletop, with right index finger touching a calendar appointment slot while the left hand rests loosely beside a glass of water',
      compositionGuidance: 'the tablet screen faces directly upward toward the seated person who is looking down at it, natural side daylight from window, authentic posture with elbows on desk, clean minimalist calendar blocks on screen without pseudo-text',
      primarySubject: 'person',
      intendedEmotions: ['positive', 'neutral'],
      keywords: ['tablet', 'booking', 'calendar', 'scheduling', 'client'],
    },
    {
      id: 'web-designer-desktop',
      category: 'Websites & Landing Pages',
      sceneTitle: 'Web designer evaluating responsive layout on large desktop monitor',
      subjectDescription: 'a web professional seated in an ergonomic office chair seen from a three-quarter back angle, right hand resting on a computer mouse on the desk while looking directly at a 27-inch matte desktop display showing a minimalist website mockup',
      compositionGuidance: 'the monitor screen is positioned on the desk facing the designer, natural over-shoulder viewpoint, comfortable working posture, clean geometric wireframe sections without messy dashboard charts',
      primarySubject: 'person',
      intendedEmotions: ['neutral', 'problem-aware'],
      keywords: ['monitor', 'minimalist website', 'desktop', 'clean layout', 'designer'],
    },
    {
      id: 'web-mobile-checkout',
      category: 'Websites & Landing Pages',
      sceneTitle: 'Customer using one-click mobile checkout on smartphone',
      subjectDescription: 'customer hands holding a modern smartphone at chest height in a warm cafe, looking down at the screen where a clean green confirmation card is displayed after completing an online purchase',
      compositionGuidance: 'the phone screen is angled toward the user eyes, natural two-handed grip with realistic knuckles and skin texture, warm ambient cafe background softly out of focus',
      primarySubject: 'person',
      intendedEmotions: ['positive', 'neutral'],
      keywords: ['smartphone', 'mobile web', 'checkout', 'ecommerce', 'hands'],
    },
    {
      id: 'web-laptop-minimal',
      category: 'Websites & Landing Pages',
      sceneTitle: 'Modern laptop showing business homepage on quiet wooden desk',
      subjectDescription: 'an ultra-thin laptop open at a 105-degree angle on an oak desk beside a ceramic coffee cup and closed notebook, displaying a clean corporate homepage with simple photo banner and clean navigation',
      compositionGuidance: 'architectural commercial still life without people, natural morning side lighting, tactile material textures of wood grain, glazed ceramic, and anodized aluminum',
      primarySubject: 'device_only',
      intendedEmotions: ['neutral', 'positive'],
      keywords: ['laptop', 'landing page', 'minimalist', 'oak desk', 'workspace'],
    },
    {
      id: 'web-team-review',
      category: 'Websites & Landing Pages',
      sceneTitle: 'Two colleagues reviewing website launch around a studio table',
      subjectDescription: 'two business colleagues seated together at a timber studio table, looking at a shared laptop positioned centrally between them facing both persons, discussing the webpage structure with relaxed expressions',
      compositionGuidance: 'unforced candid documentary capture, both people focused on the centrally placed laptop screen, natural posture leaning slightly forward with hands resting on the table',
      primarySubject: 'people',
      intendedEmotions: ['collaborative', 'positive'],
      keywords: ['team', 'discussion', 'launch', 'studio', 'colleagues'],
    },
  ],
  'Marketing & Customer Acquisition': [
    {
      id: 'mkt-team-growth-board',
      category: 'Marketing & Customer Acquisition',
      sceneTitle: 'Marketing specialists discussing acquisition metrics at glass board',
      subjectDescription: 'two colleagues standing in a bright modern studio beside a glass marker board with simple upward trend diagrams, one holding a paper notepad while looking at the board in active conversation',
      compositionGuidance: 'natural standing posture with believable weight shift, candid collaborative expressions, soft diffuse daylight, clear simple trend charts without micro-numbers',
      primarySubject: 'people',
      intendedEmotions: ['collaborative', 'positive'],
      keywords: ['growth', 'marketing', 'team', 'charts', 'presentation'],
    },
    {
      id: 'mkt-social-strategy-tablet',
      category: 'Marketing & Customer Acquisition',
      sceneTitle: 'Strategist mapping marketing campaign on tablet with stylus',
      subjectDescription: 'a digital marketer seated at a sunlit desk with a tablet lying flat on the surface, holding a digital stylus in the right hand to reposition a card on screen, looking down with focused concentration',
      compositionGuidance: 'the tablet lies flat on desk with screen facing up toward the user, authentic stylus grip with realistic skin folds at wrist, warm morning light, uncluttered workspace',
      primarySubject: 'person',
      intendedEmotions: ['neutral', 'positive'],
      keywords: ['strategist', 'campaign', 'tablet', 'calendar', 'planning'],
    },
    {
      id: 'mkt-ad-performance-laptop',
      category: 'Marketing & Customer Acquisition',
      sceneTitle: 'Entrepreneur analyzing online funnel performance on laptop',
      subjectDescription: 'a business founder seated at a clean co-working table with laptop open in front, chin resting thoughtfully in one hand while reading conversion statistics displayed as clean bar graphs',
      compositionGuidance: 'the laptop screen faces the founder who is looking directly at it, natural analytical posture, side window daylight, shallow depth of field',
      primarySubject: 'person',
      intendedEmotions: ['problem-aware', 'neutral'],
      keywords: ['entrepreneur', 'acquisition', 'funnel', 'laptop', 'analytics'],
    },
  ],
  'Sales & Conversion Process': [
    {
      id: 'sales-pos-contactless',
      category: 'Sales & Conversion Process',
      sceneTitle: 'Customer tapping contactless payment card on boutique terminal',
      subjectDescription: 'a customer hand holding a payment card tapping it against a minimalist payment terminal fixed on a solid timber retail counter, completing a swift checkout',
      compositionGuidance: 'close-up on the physical interaction between card and terminal, believable hand posture and realistic skin texture, soft ambient boutique lighting',
      primarySubject: 'person',
      intendedEmotions: ['positive', 'neutral'],
      keywords: ['pos', 'contactless payment', 'checkout', 'retail', 'counter'],
    },
    {
      id: 'sales-client-agreement',
      category: 'Sales & Conversion Process',
      sceneTitle: 'Advisor and client seated at meeting table concluding agreement',
      subjectDescription: 'an advisor and client seated in comfortable armchairs across a low timber table with a tablet and two glasses of water, looking at each other during a cordial conversation',
      compositionGuidance: 'natural eye contact between two seated people, relaxed posture, the tablet rests flat on the table between them, soft daylight through sheer curtains',
      primarySubject: 'people',
      intendedEmotions: ['collaborative', 'positive'],
      keywords: ['agreement', 'consultation', 'client', 'meeting', 'partnership'],
    },
    {
      id: 'sales-ecommerce-dispatch',
      category: 'Sales & Conversion Process',
      sceneTitle: 'Store owner preparing packaged customer order in studio',
      subjectDescription: 'an independent business owner standing at a wooden packing workbench, holding a neat cardboard delivery box with both hands while smoothing down an address label',
      compositionGuidance: 'authentic practical craftsmanship, hands actively engaged with the box, focused downcast gaze on the package, bright natural window light',
      primarySubject: 'person',
      intendedEmotions: ['neutral', 'positive'],
      keywords: ['orders', 'shipping', 'packaging', 'ecommerce', 'dispatch'],
    },
  ],
  'AI & Business Automation': [
    {
      id: 'ai-automated-workflow-screen',
      category: 'AI & Business Automation',
      sceneTitle: 'Developer at standing desk configuring automated workflow',
      subjectDescription: 'a software engineer seen from side profile at a standing desk, hands resting on a keyboard while looking attentively at a monitor displaying a clean node-based automation pipeline',
      compositionGuidance: 'the screen faces the engineer, authentic standing posture, natural relaxed hand placement, clean flowchart blocks on display with balanced lighting',
      primarySubject: 'person',
      intendedEmotions: ['neutral', 'problem-aware'],
      keywords: ['workflow', 'automation', 'diagram', 'dual monitor', 'standing desk'],
    },
    {
      id: 'ai-smart-ops-tablet',
      category: 'AI & Business Automation',
      sceneTitle: 'Operations specialist walking through fulfillment center with tablet',
      subjectDescription: 'an operations manager walking through an airy logistics facility, holding a rugged tablet with both hands angled toward their own eyes to review simple inventory status cards',
      compositionGuidance: 'the tablet screen faces directly toward the walking person, natural mid-stride posture, realistic warehouse skylight illumination, documentary photography feel',
      primarySubject: 'person',
      intendedEmotions: ['neutral', 'positive'],
      keywords: ['operations', 'automation', 'tablet', 'syncing', 'manager'],
    },
    {
      id: 'ai-customer-bot-review',
      category: 'AI & Business Automation',
      sceneTitle: 'Support lead reviewing conversational assistant flow on laptop',
      subjectDescription: 'a customer support lead seated comfortably at an office desk with laptop open directly in front, looking at the screen with calm relief while reviewing an automated customer greeting diagram',
      compositionGuidance: 'screen faces the seated person, relaxed shoulders and subtle natural smile, authentic indoor lighting, clean conversational flowchart on screen',
      primarySubject: 'person',
      intendedEmotions: ['positive', 'neutral'],
      keywords: ['support', 'assistant', 'conversational', 'laptop', 'office'],
    },
  ],
  'Small Business Productivity & Ops': [
    {
      id: 'prod-organized-desk-morning',
      category: 'Small Business Productivity & Ops',
      sceneTitle: 'Business founder organizing weekly tasks with paper planner and coffee',
      subjectDescription: 'a business founder seated at a Scandinavian oak desk, left hand holding a warm ceramic mug while right hand holds a pen writing in a linen-bound notebook, beside a closed slim laptop',
      compositionGuidance: 'downward gaze toward the notebook, natural two-handed coordination, soft diagonal morning sunlight, tranquil productive atmosphere',
      primarySubject: 'person',
      intendedEmotions: ['neutral', 'positive'],
      keywords: ['founder', 'priorities', 'morning routine', 'planner', 'productivity'],
    },
    {
      id: 'prod-digital-invoice-tablet',
      category: 'Small Business Productivity & Ops',
      sceneTitle: 'Tradesperson in workshop reviewing digital estimate on rugged tablet',
      subjectDescription: 'a tradesperson in clean workshop clothing standing at a wooden bench, leaning on left elbow while holding a rugged tablet in right hand angled toward their face to check project dimensions',
      compositionGuidance: 'tablet screen is angled toward the tradesperson face, authentic grounded stance, natural skin texture and dust-free tools neatly arranged on the background bench',
      primarySubject: 'person',
      intendedEmotions: ['neutral', 'problem-aware'],
      keywords: ['contractor', 'estimate', 'invoice', 'tablet', 'workshop'],
    },
    {
      id: 'prod-paperless-office',
      category: 'Small Business Productivity & Ops',
      sceneTitle: 'Clutter-free paperless desk setup with laptop and smartphone',
      subjectDescription: 'a minimalist workspace featuring an open silver laptop, a smartphone on a wooden charging stand, a small succulent, and a glass of water on a matte grey tabletop',
      compositionGuidance: 'high-angle commercial still life without people, serene architectural balance, natural daylight with soft shadows, crisp clean materials',
      primarySubject: 'device_only',
      intendedEmotions: ['neutral', 'positive'],
      keywords: ['paperless', 'minimalist desk', 'organization', 'laptop', 'clarity'],
    },
  ],
  'Customer Experience & Trust': [
    {
      id: 'cx-warm-greeting-shop',
      category: 'Customer Experience & Trust',
      sceneTitle: 'Small business owner welcoming client across service counter',
      subjectDescription: 'a business owner standing behind a modern reception counter, looking toward an arriving visitor with a warm approachable expression and relaxed posture, hands resting on counter',
      compositionGuidance: 'natural eye-level perspective, friendly welcoming gaze without exaggerated grin, genuine fine lines at eyes, soft ambient interior lighting',
      primarySubject: 'person',
      intendedEmotions: ['positive', 'collaborative'],
      keywords: ['greeting', 'customer service', 'reception', 'smiling', 'welcome'],
    },
    {
      id: 'cx-client-review-phone',
      category: 'Customer Experience & Trust',
      sceneTitle: 'Customer holding smartphone showing five-star rating confirmation',
      subjectDescription: 'a customer seated at a table holding a smartphone with both hands angled toward themselves, viewing a clean 5-star feedback rating confirmation card on screen',
      compositionGuidance: 'screen is clearly tilted toward the user, authentic finger placement, shallow depth of field with softly blurred boutique background, natural daylight',
      primarySubject: 'person',
      intendedEmotions: ['positive', 'neutral'],
      keywords: ['five star review', 'rating', 'feedback', 'trust', 'customer satisfaction'],
    },
    {
      id: 'cx-consultation-sofa',
      category: 'Customer Experience & Trust',
      sceneTitle: 'Two professionals seated in lounge area in friendly consultation',
      subjectDescription: 'a consultant and client seated in comfortable armchairs in an office lounge, with a coffee table between them holding two mugs, conversing with relaxed authentic body language',
      compositionGuidance: 'candid conversational angle, natural seating postures with relaxed shoulders, warm ambient daylight, plants in background',
      primarySubject: 'people',
      intendedEmotions: ['collaborative', 'positive'],
      keywords: ['consultation', 'advisory', 'lounge', 'comfortable', 'client trust'],
    },
  ],
  'Local Business & Regional Context': [
    {
      id: 'local-storefront-morning',
      category: 'Local Business & Regional Context',
      sceneTitle: 'Contemporary local shop facade in morning golden hour',
      subjectDescription: 'an attractive modern boutique storefront on a clean pedestrian street, with large clear glass windows and tasteful wooden signage under warm morning sunlight',
      compositionGuidance: 'architectural street photography without people, morning golden-hour lighting, crisp building materials, authentic Nordic/European commercial street',
      primarySubject: 'environment_only',
      intendedEmotions: ['neutral', 'positive'],
      keywords: ['storefront', 'facade', 'street', 'local shop', 'pedestrian'],
    },
    {
      id: 'local-owner-outside',
      category: 'Local Business & Regional Context',
      sceneTitle: 'Shop owner standing by entrance door holding open sign',
      subjectDescription: 'an independent business owner standing on the pavement outside their shop entrance, holding a wooden open sign with both hands before hanging it on the glass door',
      compositionGuidance: 'candid documentary portrait, proud natural posture, eyes focused on placing the sign, realistic morning daylight reflecting on glass',
      primarySubject: 'person',
      intendedEmotions: ['positive', 'neutral'],
      keywords: ['shop owner', 'entrance', 'neighborhood', 'local enterprise', 'open sign'],
    },
  ],
  'General': [
    {
      id: 'gen-bright-co-working',
      category: 'General',
      sceneTitle: 'Two professionals working at individual desks in open co-working space',
      subjectDescription: 'two professionals working focused at spaced wooden desks in a bright open-plan workspace with large industrial windows, each engaged with their own laptop',
      compositionGuidance: 'wide environmental perspective, unposed workplace atmosphere, natural morning light, realistic uncoordinated activities without staged posing',
      primarySubject: 'people',
      intendedEmotions: ['neutral', 'collaborative'],
      keywords: ['co-working', 'workspace', 'modern office', 'daylight', 'business'],
    },
    {
      id: 'gen-executive-desk',
      category: 'General',
      sceneTitle: 'Tidy executive desk setup with laptop, notebook and coffee',
      subjectDescription: 'an uncluttered professional desk featuring an open silver laptop, a closed fountain pen, a paper notebook and a ceramic coffee mug in natural window light',
      compositionGuidance: 'balanced commercial composition without people, crisp natural material textures of oak wood, ceramic and metal',
      primarySubject: 'device_only',
      intendedEmotions: ['neutral', 'positive'],
      keywords: ['desk', 'laptop', 'coffee', 'notebook', 'professional setup'],
    },
  ],
};

/**
 * Selects a diverse, complementary scene archetype for a category by checking
 * existing image titles, descriptions, and prompt notes in the database.
 * Matches post emotional intent (positive, neutral, problem-aware, collaborative)
 * to avoid mismatched moods while rotating through underrepresented archetypes.
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
      primarySubject: 'person',
      intendedEmotions: ['neutral'],
      keywords: ['business', 'professional'],
    };
  }

  const detectedEmotion = detectEmotionalIntent(contextQuery);

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

    // Emotional alignment boost: reward archetypes matching detected post emotion
    if (archetype.intendedEmotions.includes(detectedEmotion)) {
      relevanceBoost += 3;
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
 * Emotional posture guidance mapped to marketing intents.
 * Translates intent into concrete physical actions and authentic expressions
 * without exaggerated cartoon smiles or grimaces.
 */
const EMOTIONAL_EXPRESSION_DIRECTIONS: Record<EmotionalIntent, string> = {
  positive: 'Expression: calm satisfaction, relaxed facial features, subtle natural crinkles around eyes, unhurried posture.',
  neutral: 'Expression: focused concentration, neutral composed brow, quiet professionalism, eyes directed at the work.',
  'problem-aware': 'Expression: analytical contemplation, attentive focus, hand touching chin or holding pen, inspecting data with serious diligence.',
  collaborative: 'Expression: approachable engagement, receptive listening posture, natural head angle during conversational exchange.',
};

/**
 * Builds an editorial, photographic business prompt tailored for NorthSoft and FLUX.1 Schnell.
 * Separates scene action, emotional intent, and photographic composition into modular,
 * non-overlapping sentences. Avoids contradictory device interactions and repetitive buzzwords.
 */
export function buildBusinessImagePrompt(
  description: string,
  category: string,
  postContext?: string,
  sceneArchetype?: SceneCompositionArchetype,
): string {
  const cleanDesc = description.trim();
  const cleanCat = category.trim();

  // 1. Scene Action & Subject (Unambiguous Physical Interaction)
  const sceneGuidance = sceneArchetype?.compositionGuidance
    ? ` Spatial arrangement: ${sceneArchetype.compositionGuidance}.`
    : '';
  const actionSegment = `A 35mm candid commercial photograph of ${cleanDesc}. Category: ${cleanCat}.${sceneGuidance}`;

  // 2. Emotional Tone & Posture (Aligned with Post Marketing Intent)
  const emotion = detectEmotionalIntent(postContext || cleanDesc);
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
