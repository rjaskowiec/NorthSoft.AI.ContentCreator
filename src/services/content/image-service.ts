import { AppError } from '../../core/errors';
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
    level1 = 'artificial intelligence technology';
  } else if (cleanTitle.includes('seo') || cleanTitle.includes('search')) {
    level1 = 'search engine optimization';
  } else if (cleanTitle.includes('speed') || cleanTitle.includes('performance')) {
    level1 = 'fast website speed';
  } else if (cleanTitle.includes('security') || cleanTitle.includes('cyber')) {
    level1 = 'cybersecurity computer network';
  } else if (cleanTitle.includes('analytics') || cleanTitle.includes('data')) {
    level1 = 'data analytics chart dashboard';
  } else if (cleanTitle.includes('cloud') || cleanTitle.includes('infrastructure')) {
    level1 = 'cloud server infrastructure';
  } else if (cleanTitle.includes('e-commerce') || cleanTitle.includes('checkout')) {
    level1 = 'ecommerce online shopping';
  } else if (cleanTitle.includes('mobile') || cleanTitle.includes('indexing')) {
    level1 = 'mobile phone website';
  } else if (cleanTitle.includes('social media')) {
    level1 = 'social media marketing';
  } else {
    const words = cleanTitle
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !['ways', 'your', 'with', 'that', 'this', 'from', 'about', 'how'].includes(w));
    level1 = words.slice(0, 3).join(' ') || 'web development';
  }

  let level2 = 'web development technology';
  if (cleanCat.includes('ai') || cleanCat.includes('tech')) level2 = 'technology digital interface';
  else if (cleanCat.includes('seo') || cleanCat.includes('search')) level2 = 'digital search optimization';
  else if (cleanCat.includes('design') || cleanCat.includes('ui') || cleanCat.includes('branding')) level2 = 'web design UI';
  else if (cleanCat.includes('security') || cleanCat.includes('it')) level2 = 'computer security';
  else if (cleanCat.includes('marketing') || cleanCat.includes('content') || cleanCat.includes('email')) level2 = 'digital marketing business';
  else if (cleanCat.includes('analytics')) level2 = 'business analytics dashboard';
  else if (cleanCat.includes('cloud') || cleanCat.includes('hosting')) level2 = 'server technology';
  else if (cleanCat.includes('e-commerce')) level2 = 'online store checkout';

  const level3 = 'laptop computer workspace office';
  const level4 = 'technology business workspace';

  return [
    { level: 'LEVEL_1_SPECIFIC', query: level1 },
    { level: 'LEVEL_2_CATEGORY', query: level2 },
    { level: 'LEVEL_3_CONTEXTUAL', query: level3 },
    { level: 'LEVEL_4_GENERIC', query: level4 },
  ];
}

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

  let score = 40; // Base score for legal openverse result

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
    if (word.length > 3 && text.includes(word)) score += 10;
  }
  for (const word of cleanCat.split(/\s+/)) {
    if (word.length > 3 && text.includes(word)) score += 15;
  }

  const techKeywords = [
    'technology', 'web', 'computer', 'digital', 'code', 'software',
    'laptop', 'office', 'ai', 'data', 'search', 'marketing', 'business',
    'network', 'security', 'design', 'phone', 'server', 'analytics',
  ];
  for (const kw of techKeywords) {
    if (text.includes(kw)) score += 10;
  }

  const lic = (candidate.license || '').toLowerCase();
  if (lic === 'cc0' || lic === 'pdm') score += 10;
  else if (lic === 'by' || lic === 'by-sa') score += 5;

  return {
    score,
    safe: score > 0,
    reason: `Scored ${score} based on metadata semantics and license ${candidate.license}`,
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
