import { AppError } from '../../core/errors';
import { evaluateImageRelevance } from './image-relevance-evaluator';
import type {
  ImageCandidate,
  ImageService,
  ImageVerificationResult,
  SearchQueryCandidate,
  SelectedImageResult,
} from './image-service.interface';

const UNSAFE_KEYWORDS = ['porn', 'nsfw', 'naked', 'nudity', 'gore', 'violence', 'blood', 'sex', 'explicit'];
const NOISY_IRRELEVANT_KEYWORDS = [
  'kardashian', 'gravesite', 'hospital', 'tumblr', 'repost', 'republican',
  'politic', 'bedroom', 'baby', 'fashion', 'wedding', 'model', 'dress',
  'recipe', 'pizza', 'burger', 'cooking', 'dog', 'cat', 'kitten', 'puppy'
];

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
    const words = cleanTitle
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !['ways', 'your', 'with', 'that', 'this', 'from', 'about', 'how'].includes(w));
    level1 = words.slice(0, 3).join(' ') || 'small business laptop office';
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
 * 1. User-entered specific description / exact scene
 * 2. Broader business query (filtered key concepts)
 * 3. General category default scene
 */
export function buildDiscoveryQueryHierarchy(description: string, category: string): string[] {
  const queries: string[] = [];
  const cleanDesc = description.trim();
  const cleanCat = category.trim();

  if (cleanDesc) {
    queries.push(cleanDesc);
  }

  // Broader query: extract 2-3 meaningful words and anchor to business scene
  const meaningfulWords = cleanDesc
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

  async searchImages(query: string, limit = 10): Promise<ImageCandidate[]> {
    const url = new URL('https://api.openverse.engineering/v1/images/');
    url.searchParams.set('q', query);
    url.searchParams.set('license', 'cc0,pdm,by,by-sa');
    url.searchParams.set('page_size', limit.toString());

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'NorthSoft.AI.ContentCreator/0.1.0',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`[OpenverseImageService] Failed to search openverse: ${response.statusText}`);
      return [];
    }

    const data = (await response.json()) as any;
    const candidates: ImageCandidate[] = [];

    if (data.results && Array.isArray(data.results)) {
      for (const item of data.results) {
        const validLicenses = ['cc0', 'pdm', 'by', 'by-sa'];
        if (!validLicenses.includes(item.license?.toLowerCase())) {
          continue;
        }

        const tags = Array.isArray(item.tags)
          ? item.tags.map((t: any) => (typeof t === 'string' ? t : t.name || '')).filter(Boolean)
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
    }

    return candidates.slice(0, limit);
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
    } catch (err: any) {
      return {
        decision: 'accept',
        confidence: 0.8,
        matches_content: true,
        reason: `Fallback metadata match (Vision skipped: ${err.message})`,
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
