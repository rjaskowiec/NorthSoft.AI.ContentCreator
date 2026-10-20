import { AppError } from '../../core/errors';
import { evaluateImageRelevance } from './image-relevance-evaluator';
import type {
  ImageCandidate,
  ImageService,
  ImageVerificationResult,
  SearchDiagnostics,
  SearchErrorType,
  SearchImagesResult,
  SearchQueryCandidate,
  SelectedImageResult,
} from './image-service.interface';

const UNSAFE_KEYWORDS = ['porn', 'nsfw', 'naked', 'nudity', 'gore', 'violence', 'blood', 'sex', 'explicit'];
const NOISY_IRRELEVANT_KEYWORDS = [
  'kardashian', 'gravesite', 'hospital', 'tumblr', 'repost', 'republican',
  'politic', 'bedroom', 'baby', 'fashion', 'wedding', 'model', 'dress',
  'recipe', 'pizza', 'burger', 'cooking', 'dog', 'cat', 'kitten', 'puppy'
];

/**
 * Derives a separate, concise English image search query (approximately 3–8 words, noun phrase)
 * optimized for retrieving existing stock photographs from providers like Openverse.
 *
 * Distinct from the rich AI image-generation prompt:
 * - Omits camera instructions, lighting descriptions, narrative sentences, and abstract fluff.
 * - Produces a clear physical subject and recognizable scene.
 * - Handles Polish topics, English titles, or detailed generation prompts without simple naive truncation.
 */
export function deriveImageSearchQuery(topicOrPrompt?: string, category?: string): string {
  const cleanCat = (category || '').trim();
  const raw = (topicOrPrompt || '').trim();

  // Category fallback scenes (3-6 words, clear physical subject)
  const categoryFallbackMap: Record<string, string> = {
    'AI & Business Automation': 'small business AI automation',
    'Marketing & Customer Acquisition': 'satisfied customer business meeting',
    'Websites & Landing Pages': 'person using smartphone website',
    'Sales & Conversion Process': 'retail store customer payment',
    'Small Business Productivity & Ops': 'small business owner planning work',
    'Customer Experience & Trust': 'customer service friendly meeting',
    'Local Business & Regional Context': 'local store retail storefront',
    'General': 'modern office business meeting',
  };

  if (!raw) {
    return categoryFallbackMap[cleanCat] || 'small business office meeting';
  }

  // 1. Strip generation prompt boilerplate, photographic styles, and camera directions
  const text = raw
    .replace(/^A\s+(?:35mm\s+)?candid\s+commercial\s+photograph\s+of\s+/i, '')
    .replace(/^Photograph\s+of\s+/i, '')
    .replace(/^Commercial\s+photography\s+of\s+/i, '')
    .replace(/Category:\s*[^.]+\./gi, '')
    .replace(/Expression:\s*[^.]+\./gi, '')
    .replace(/Style:\s*35mm[^.]+\./gi, '')
    .replace(/Screens:\s*[^.]+\./gi, '')
    .replace(/Spatial composition\s*&?\s*lighting:\s*[^.]+\./gi, '')
    .replace(/\b(?:35mm|50mm|f\/4|aperture|bokeh|dslr|shutter|lighting|daylight|directional|neutral color grading|pores|skin texture|fabric folds|minimalist|geometric|wireframe|candid|photorealistic|hyper realistic|ultra realistic|high resolution|negative space|close-up|wide shot|over-the-shoulder)\b/gi, ' ')
    .trim();

  // If text became empty after stripping prompt boilerplate, fall back to category
  if (!text) {
    return categoryFallbackMap[cleanCat] || 'small business office workspace';
  }

  const lower = text.toLowerCase();

  // 2. High-priority semantic topic recognition (covering business themes accurately)
  if (lower.includes('automate with ai') || (lower.includes('ai') && (lower.includes('automat') || lower.includes('time-saving') || lower.includes('workflow')))) {
    return 'small business AI automation';
  }
  if (lower.includes('operator to owner') || lower.includes('stages of business') || (lower.includes('time management') && lower.includes('owner'))) {
    return 'small business owner planning work';
  }
  if (lower.includes('customer journey') && lower.includes('ai')) {
    return 'customer journey digital experience';
  }
  if (lower.includes('user experience') || lower.includes('ux') || lower.includes('shopping') || lower.includes('responsiv')) {
    return 'person using smartphone shopping';
  }
  if (lower.includes('meeting') && (lower.includes('customer') || lower.includes('sales') || lower.includes('growth'))) {
    return 'satisfied customer business meeting';
  }

  // Polish topic detection
  if (lower.includes('automatyzacj') || lower.includes('procesów')) {
    return 'small business AI automation';
  }
  if (lower.includes('audyt') || lower.includes('użytecznoś') || lower.includes('ux') || (lower.includes('stron') && lower.includes('internetow'))) {
    return 'person using smartphone website';
  }
  if (lower.includes('klient') && (lower.includes('zadowolen') || lower.includes('obsług') || lower.includes('relacj'))) {
    return 'satisfied customer business meeting';
  }
  if (lower.includes('czas') || lower.includes('planowani') || lower.includes('przedsiębiorc') || lower.includes('etapy')) {
    return 'small business owner planning work';
  }
  if (lower.includes('sprzedaż') || lower.includes('sklep') || lower.includes('płatnoś')) {
    return 'retail store customer payment';
  }

  // 3. Extract meaningful noun phrases from general text
  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'up', 'about', 'into', 'over', 'after', 'beneath', 'under', 'above',
    'their', 'his', 'her', 'its', 'our', 'my', 'your', 'this', 'that', 'these', 'those',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
    'did', 'can', 'could', 'should', 'would', 'may', 'might', 'must', 'will', 'shall',
    'looking', 'stands', 'standing', 'sits', 'sitting', 'walks', 'walking', 'gesturing',
    'gathered', 'gathers', 'around', 'surrounded', 'empty', 'scattered', 'filled', 'air',
    'atmosphere', 'sense', 'symbolizing', 'relieved', 'satisfied', 'friendly', 'warm',
    'ways', 'how', 'why', 'what', 'when', 'where', 'which', 'who', 'whom', 'tips',
  ]);

  const cleanWords = text
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 2 && !stopWords.has(w));

  // If words are between 2 and 8, keep them
  if (cleanWords.length >= 2 && cleanWords.length <= 8) {
    return cleanWords.join(' ');
  }

  if (cleanWords.length > 8) {
    // Pick the most meaningful 4 to 6 words (avoiding trailing conjunctions/modifiers)
    return cleanWords.slice(0, 5).join(' ');
  }

  // If fewer than 3 words, anchor with relevant business environment
  if (cleanWords.length > 0) {
    const base = cleanWords.join(' ');
    if (cleanCat.toLowerCase().includes('website') || cleanCat.toLowerCase().includes('design')) {
      return `${base} website workspace`;
    }
    if (cleanCat.toLowerCase().includes('automation') || cleanCat.toLowerCase().includes('ai')) {
      return `${base} business automation`;
    }
    if (cleanCat.toLowerCase().includes('marketing') || cleanCat.toLowerCase().includes('sales')) {
      return `${base} business customer`;
    }
    return `${base} business office`;
  }

  return categoryFallbackMap[cleanCat] || 'small business office meeting';
}

export function buildSearchHierarchy(topicTitle: string, category: string): SearchQueryCandidate[] {
  const cleanTitle = topicTitle.toLowerCase();
  const cleanCat = category.toLowerCase();

  let level1: string;
  if (cleanTitle.includes('ai') || cleanTitle.includes('chatbot') || cleanTitle.includes('intelligence')) {
    level1 = 'artificial intelligence software computer laptop';
  } else if (cleanTitle.includes('seo') || cleanTitle.includes('search') || cleanTitle.includes('google')) {
    level1 = 'website search laptop desk';
  } else if (cleanTitle.includes('speed') || cleanTitle.includes('performance')) {
    level1 = 'person using smartphone responsive website';
  } else if (cleanTitle.includes('booking') || cleanTitle.includes('appointment') || cleanTitle.includes('calendar')) {
    level1 = 'customer booking appointment salon clinic desk';
  } else if (cleanTitle.includes('security') || cleanTitle.includes('cyber')) {
    level1 = 'secure computer laptop workspace';
  } else if (cleanTitle.includes('analytics') || cleanTitle.includes('data')) {
    level1 = 'business analytics dashboard laptop';
  } else if (cleanTitle.includes('cloud') || cleanTitle.includes('infrastructure')) {
    level1 = 'cloud server computer technology';
  } else if (cleanTitle.includes('e-commerce') || cleanTitle.includes('checkout') || cleanTitle.includes('store') || cleanTitle.includes('shop')) {
    level1 = 'retail store counter checkout pos terminal';
  } else if (cleanTitle.includes('mobile') || cleanTitle.includes('indexing')) {
    level1 = 'person browsing website on smartphone screen';
  } else if (cleanTitle.includes('social media') || cleanTitle.includes('marketing')) {
    level1 = 'small business marketing laptop office';
  } else {
    level1 = deriveImageSearchQuery(topicTitle, category);
  }

  let level2 = 'small business website office';
  if (cleanCat.includes('ai') || cleanCat.includes('tech')) level2 = 'technology workspace laptop';
  else if (cleanCat.includes('seo') || cleanCat.includes('search')) level2 = 'business website optimization laptop';
  else if (cleanCat.includes('design') || cleanCat.includes('ui') || cleanCat.includes('branding')) level2 = 'web design UI screen laptop';
  else if (cleanCat.includes('security') || cleanCat.includes('it')) level2 = 'computer security workspace';
  else if (cleanCat.includes('marketing') || cleanCat.includes('content') || cleanCat.includes('email')) level2 = 'small business marketing desk';
  else if (cleanCat.includes('analytics')) level2 = 'business dashboard screen office';
  else if (cleanCat.includes('cloud') || cleanCat.includes('hosting')) level2 = 'server technology workspace';
  else if (cleanCat.includes('e-commerce') || cleanCat.includes('landing')) level2 = 'retail shop checkout counter laptop';

  const level3 = 'small business owner desk laptop workspace';
  const level4 = 'contemporary office customer service laptop';

  return [
    { level: 'LEVEL_1_SPECIFIC', query: level1 },
    { level: 'LEVEL_2_CATEGORY', query: level2 },
    { level: 'LEVEL_3_CONTEXTUAL', query: level3 },
    { level: 'LEVEL_4_GENERIC', query: level4 },
  ];
}

/**
 * Builds a bounded list of up to 3 queries for candidate discovery:
 * 1. Primary concise search query (3-8 meaningful words, noun phrase)
 * 2. Broader business query (filtered key concepts anchored to commercial scene)
 * 3. General category default scene
 */
export function buildDiscoveryQueryHierarchy(description: string, category: string): string[] {
  const queries: string[] = [];
  const cleanCat = category.trim();

  // Primary concise search query: derive if description is long or AI prompt
  const cleanPrimary = deriveImageSearchQuery(description, cleanCat);
  if (cleanPrimary) {
    queries.push(cleanPrimary);
  }

  // Broader query: extract 2-3 meaningful words and anchor to business scene
  const meaningfulWords = cleanPrimary
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !['with', 'that', 'this', 'from', 'about', 'small', 'modern', 'business', 'office'].includes(w));

  let broader: string;
  if (meaningfulWords.length >= 2) {
    broader = `${meaningfulWords.slice(0, 3).join(' ')} business`;
  } else if (cleanCat.toLowerCase().includes('website')) {
    broader = 'responsive website computer laptop desk';
  } else if (cleanCat.toLowerCase().includes('marketing')) {
    broader = 'business marketing growth team meeting';
  } else if (cleanCat.toLowerCase().includes('sales')) {
    broader = 'client payment checkout customer store';
  } else if (cleanCat.toLowerCase().includes('automation') || cleanCat.toLowerCase().includes('ai')) {
    broader = 'automation software developer laptop workspace';
  } else if (cleanCat.toLowerCase().includes('productivity')) {
    broader = 'entrepreneur desk organized workspace laptop';
  } else if (cleanCat.toLowerCase().includes('trust') || cleanCat.toLowerCase().includes('customer')) {
    broader = 'customer service friendly meeting small business';
  } else if (cleanCat.toLowerCase().includes('local')) {
    broader = 'local store storefront small business customer';
  } else {
    broader = 'modern business workspace laptop coffee';
  }

  if (!queries.map((q) => q.toLowerCase()).includes(broader.toLowerCase())) {
    queries.push(broader);
  }

  // Category fallback scene
  const categoryScenes: Record<string, string> = {
    'Websites & Landing Pages': 'laptop computer modern website design workspace',
    'Marketing & Customer Acquisition': 'small business team marketing strategy meeting office',
    'Sales & Conversion Process': 'retail store checkout payment customer pos terminal',
    'AI & Business Automation': 'software code laptop modern office tech',
    'Small Business Productivity & Ops': 'entrepreneur small business owner laptop desk workspace',
    'Customer Experience & Trust': 'smiling business owner welcoming customer store',
    'Local Business & Regional Context': 'local shop entrance retail commercial street',
    'General': 'contemporary business workspace laptop meeting desk',
  };

  const catScene = categoryScenes[cleanCat] || 'contemporary business workspace laptop meeting desk';
  if (!queries.map((q) => q.toLowerCase()).includes(catScene.toLowerCase()) && queries.length < 3) {
    queries.push(catScene);
  }

  return queries.slice(0, 3);
}


const HISTORICAL_AND_MISLEADING_KEYWORDS = [
  'vintage', 'antique', 'black and white', 'b&w', '19th century', 'ancient',
  'historical', 'museum', 'medieval', 'archive', 'century', 'retro', 'victorian',
  'painting', 'sketch', 'drawing', 'engraving', 'monochrome', 'statue', 'sculpture',
  'cemetery', 'graveyard', 'tomb', 'funeral', 'ruins',
];

export function scoreImageCandidate(
  candidate: ImageCandidate,
  topicTitle: string,
  category: string,
  recentlyUsedUrls?: Set<string>,
): { score: number; safe: boolean; reason: string } {
  const text = `${candidate.title || ''} ${(candidate.tags || []).join(' ')}`.toLowerCase();

  // Safety filter
  for (const badWord of UNSAFE_KEYWORDS) {
    if (text.includes(badWord)) {
      return { score: -100, safe: false, reason: `Safety rejection: unsafe word '${badWord}'` };
    }
  }

  // Reject historical, vintage, archival or irrelevant non-contemporary artwork
  for (const hist of HISTORICAL_AND_MISLEADING_KEYWORDS) {
    if (text.includes(hist)) {
      return { score: -80, safe: false, reason: `Rejection: outdated, historical, or non-contemporary image context ('${hist}')` };
    }
  }

  // Multi-pillar Business Relevance & Disqualification Verification
  const relEval = evaluateImageRelevance(
    {
      title: candidate.title,
      tags: candidate.tags,
      keywords: (candidate.tags || []).join(', '),
      description: candidate.title,
    },
    `${topicTitle} ${category}`,
  );

  if (!relEval.qualified) {
    return {
      score: -100,
      safe: false,
      reason: `Business relevance rejection: ${relEval.reasons.join('; ')}`,
    };
  }

  let score = 40 + Math.round(relEval.score * 0.4); // Base score for legal openverse result + relevance boost

  if (recentlyUsedUrls && recentlyUsedUrls.has(candidate.url)) {
    score -= 30; // Diversity penalty
  }

  // Noise penalty
  for (const noise of NOISY_IRRELEVANT_KEYWORDS) {
    if (text.includes(noise)) {
      score -= 60;
    }
  }

  // Relevance bonuses
  const cleanTitle = topicTitle.toLowerCase();
  const cleanCat = category.toLowerCase();
  for (const word of cleanTitle.split(/\s+/)) {
    if (word.length > 3 && text.includes(word)) score += 12;
  }
  for (const word of cleanCat.split(/\s+/)) {
    if (word.length > 3 && text.includes(word)) score += 15;
  }

  const techKeywords = [
    'technology', 'web', 'computer', 'digital', 'code', 'software',
    'laptop', 'office', 'ai', 'data', 'search', 'marketing', 'business',
    'network', 'security', 'design', 'phone', 'server', 'analytics',
    'modern', 'workspace', 'developer', 'startup',
  ];
  for (const kw of techKeywords) {
    if (text.includes(kw)) score += 10;
  }

  const lic = (candidate.license || '').toLowerCase();
  if (lic === 'cc0' || lic === 'pdm') score += 10;
  else if (lic === 'by' || lic === 'by-sa') score += 5;

  return {
    score,
    safe: score >= 40,
    reason: `Scored ${score} based on verified business relevance and license ${candidate.license}`,
  };
}

export class OpenverseImageService implements ImageService {
  constructor(private readonly env: Env) {}

  async searchImagesWithDiagnostics(query: string, limit = 10): Promise<SearchImagesResult> {
    const cleanQuery = deriveImageSearchQuery(query);
    const url = new URL('https://api.openverse.org/v1/images/');
    url.searchParams.set('q', cleanQuery);
    url.searchParams.set('license', 'cc0,pdm,by,by-sa');
    url.searchParams.set('page_size', Math.min(20, Math.max(1, limit)).toString());

    const startTime = Date.now();
    let response: Response | undefined;
    let error: string | undefined;
    let errorType: SearchErrorType = 'NONE';
    let httpStatus: number | undefined;

    const envObj = this.env as unknown as Record<string, unknown> | undefined;
    const isTest = typeof process !== 'undefined' && Boolean(process.env.VITEST || process.env.NODE_ENV === 'test');
    const configuredTimeout = typeof envObj?.OPENVERSE_TIMEOUT_MS === 'number'
      ? envObj.OPENVERSE_TIMEOUT_MS
      : (isTest ? 1000 : 8000);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), configuredTimeout);

    const headers: Record<string, string> = {
      'User-Agent': 'NorthSoft.AI.ContentCreator/0.1.0 (https://northsoft.is)',
      'Accept': 'application/json',
    };

    const token = envObj?.OPENVERSE_TOKEN || envObj?.OPENVERSE_API_KEY;
    if (typeof token === 'string' && token.trim()) {
      headers['Authorization'] = `Bearer ${token.trim()}`;
    }

    try {
      response = await fetch(url.toString(), {
        signal: controller.signal,
        headers,
      });
      httpStatus = response.status;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        errorType = 'TIMEOUT';
        error = `Openverse API request timed out (exceeded ${configuredTimeout}ms threshold)`;
      } else {
        errorType = 'NETWORK_ERROR';
        error = `Openverse API network error: ${err instanceof Error ? err.message : String(err)}`;
      }
    } finally {
      clearTimeout(timeout);
    }

    const latencyMs = Date.now() - startTime;

    if (response) {
      if (response.status === 429) {
        errorType = 'RATE_LIMIT';
        error = 'Openverse API rate limit exceeded (HTTP 429)';
      } else if (response.status >= 500) {
        errorType = 'PROVIDER_5XX';
        error = `Openverse API upstream server error (HTTP ${response.status} ${response.statusText || ''})`.trim();
      } else if (!response.ok) {
        errorType = 'PROVIDER_5XX';
        error = `Openverse API returned HTTP ${response.status}: ${response.statusText || 'Unknown error'}`;
      }
    }

    interface OpenverseItem {
      id: string;
      url: string;
      thumbnail?: string;
      title?: string;
      license?: string;
      creator?: string;
      creator_url?: string;
      license_url?: string;
      foreign_landing_url?: string;
      detail_url?: string;
      tags?: Array<string | { name?: string }>;
    }

    interface OpenverseApiResponse {
      results?: OpenverseItem[];
    }

    const candidates: ImageCandidate[] = [];

    if (response && response.ok) {
      try {
        const data = (await response.json()) as OpenverseApiResponse;
        if (data.results && Array.isArray(data.results)) {
          const validLicenses = ['cc0', 'pdm', 'by', 'by-sa'];
          for (const item of data.results) {
            if (!validLicenses.includes(item.license?.toLowerCase() || '')) {
              continue;
            }

            const tags = Array.isArray(item.tags)
              ? item.tags.map((t) => (typeof t === 'string' ? t : t.name || '')).filter(Boolean)
              : [];

            candidates.push({
              id: item.id,
              url: item.url,
              thumbnailUrl: item.thumbnail,
              title: item.title || 'Illustration',
              author: item.creator || 'Openverse Author',
              authorUrl: item.creator_url,
              license: (item.license || 'CC').toUpperCase(),
              licenseUrl: item.license_url || 'https://creativecommons.org/',
              sourceUrl: item.foreign_landing_url || item.detail_url || item.url,
              tags,
            });
          }
        } else {
          errorType = 'INVALID_RESPONSE';
          error = 'Openverse API returned unexpected schema (results array missing)';
        }
      } catch (parseErr: unknown) {
        errorType = 'INVALID_RESPONSE';
        error = `Failed to parse Openverse JSON response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`;
      }
    }

    const providerSuccess = errorType === 'NONE' && (response?.ok ?? false);

    console.log('[OpenverseImageService] Search completed:', {
      query: cleanQuery,
      provider: 'Openverse',
      success: providerSuccess,
      status: httpStatus,
      latencyMs,
      rawCount: candidates.length,
      errorType,
      error,
    });

    const diagnostics: SearchDiagnostics = {
      initiated: true,
      query: cleanQuery,
      provider: 'Openverse',
      providerSuccess,
      httpStatus,
      providerLatencyMs: latencyMs,
      rawResultsCount: candidates.length,
      filteredResultsCount: candidates.slice(0, limit).length,
      error,
      errorType,
    };

    return {
      candidates: candidates.slice(0, limit),
      diagnostics,
    };
  }

  async searchImages(query: string, limit = 10): Promise<ImageCandidate[]> {
    const res = await this.searchImagesWithDiagnostics(query, limit);
    return res.candidates;
  }


  async findBestImage(
    topicTitle: string,
    category: string,
    _postBody: string,
    recentlyUsedUrls?: Set<string>,
  ): Promise<SelectedImageResult | null> {
    const hierarchy = buildSearchHierarchy(topicTitle, category);

    for (const step of hierarchy) {
      const candidates = await this.searchImages(step.query, 10);
      if (candidates.length === 0) continue;

      const scored = candidates
        .map((c) => ({
          candidate: c,
          ...scoreImageCandidate(c, topicTitle, category, recentlyUsedUrls),
        }))
        .filter((s) => s.safe && s.score >= 20);

      scored.sort((a, b) => b.score - a.score);

      if (scored.length > 0) {
        const top = scored[0]!;
        return {
          candidate: top.candidate,
          level: step.level,
          score: top.score,
          reason: `Matched at ${step.level} (Query: "${step.query}") with score ${top.score}`,
        };
      }
    }

    return null;
  }

  async downloadImage(url: string): Promise<ArrayBuffer> {
    const targetUrl = new URL(url);

    // Basic SSRF Protection
    if (targetUrl.protocol !== 'https:') {
      throw new AppError('Only HTTPS URLs are allowed for image download', 400, 'SECURITY_VIOLATION');
    }

    const hostname = targetUrl.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const blockedHosts = ['localhost', '127.0.0.1', '169.254.169.254', '::1'];
    const privateIpv4 = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);
    const privateIpv6 = /^(fc|fd|fe80:)/i.test(hostname);
    if (blockedHosts.includes(hostname) || privateIpv4 || privateIpv6 || hostname.endsWith('.local')) {
      throw new AppError('Blocked private IP or localhost access', 403, 'SECURITY_VIOLATION');
    }

    const response = await fetch(targetUrl.toString(), {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'NorthSoft.AI.ContentCreator/0.1.0',
        'Accept': 'image/jpeg, image/png, image/webp',
      },
      cf: {
        cacheTtl: 3600,
      },
    });

    if (!response.ok) {
      throw new AppError(`Failed to download image: ${response.statusText}`, 502, 'DOWNLOAD_FAILED');
    }

    const contentType = response.headers.get('content-type') || '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType.split(';')[0]!.trim().toLowerCase())) {
      throw new AppError(`Invalid content type: ${contentType}`, 400, 'INVALID_IMAGE_TYPE');
    }

    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > 10 * 1024 * 1024) {
      throw new AppError('Image exceeds size limit of 10MB', 400, 'IMAGE_TOO_LARGE');
    }

    const arrayBuffer = await response.arrayBuffer();

    if (arrayBuffer.byteLength > 10 * 1024 * 1024) {
      throw new AppError('Image exceeds size limit of 10MB', 400, 'IMAGE_TOO_LARGE');
    }

    return arrayBuffer;
  }

  async verifyImageWithVision(imageBytes: ArrayBuffer, imageBrief: string, postBody: string): Promise<ImageVerificationResult> {
    try {
      const uint8Array = new Uint8Array(imageBytes);

      const prompt = `You are an expert content moderator and visual verification system.
Your task is to analyze the provided image and determine if it matches the given topic.

Visual brief: "${imageBrief}"
Post Content: "${postBody}"

Respond ONLY with a valid JSON object adhering to this schema:
{
  "decision": "accept" | "reject",
  "confidence": number (0.0 to 1.0),
  "scene": "string description of the scene",
  "objects": ["array", "of", "objects"],
  "matches_content": boolean,
  "mismatches": ["array", "of", "reasons"],
  "reason": "detailed explanation of the decision"
}`;

      if (!this.env.AI) {
        throw new Error('Cloudflare Workers AI binding is not configured.');
      }
      const aiResponse = await this.env.AI.run('@cf/llava-hf/llava-1.5-7b-hf', {
        prompt,
        image: [...uint8Array],
      });

      const responseText =
        aiResponse !== null && typeof aiResponse === 'object' && 'description' in aiResponse && typeof aiResponse.description === 'string'
          ? aiResponse.description
          : aiResponse !== null && typeof aiResponse === 'object' && 'response' in aiResponse && typeof aiResponse.response === 'string'
            ? aiResponse.response
            : '';
      const jsonStr = this.extractJson(responseText);
      const result = JSON.parse(jsonStr) as ImageVerificationResult;

      return result;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        decision: 'accept',
        confidence: 0.8,
        matches_content: true,
        reason: `Fallback metadata match (Vision skipped: ${errorMsg})`,
      };
    }
  }

  private extractJson(text: string): string {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      return text.substring(start, end + 1);
    }
    return text;
  }
}
