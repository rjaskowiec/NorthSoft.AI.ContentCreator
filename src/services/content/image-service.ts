import { AppError } from '../../core/errors';
import type { ImageCandidate, ImageService, ImageVerificationResult } from './image-service.interface';

export class OpenverseImageService implements ImageService {
  constructor(private readonly env: Env) {}

  async searchImages(query: string, limit = 5): Promise<ImageCandidate[]> {
    const url = new URL('https://api.openverse.engineering/v1/images/');
    url.searchParams.set('q', query);
    url.searchParams.set('license', 'cc0,pdm'); // Strictly CC0 and Public Domain Mark
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

    const data = await response.json() as any;
    const candidates: ImageCandidate[] = [];

    if (data.results && Array.isArray(data.results)) {
      for (const item of data.results) {
        // Enforce strict license check as per user requirements
        const validLicenses = ['cc0', 'pdm'];
        if (!validLicenses.includes(item.license?.toLowerCase())) {
          continue;
        }

        candidates.push({
          id: item.id,
          url: item.url,
          thumbnailUrl: item.thumbnail,
          title: item.title,
          author: item.creator || 'Unknown',
          authorUrl: item.creator_url,
          license: item.license.toUpperCase(),
          licenseUrl: item.license_url,
          sourceUrl: item.foreign_landing_url || item.detail_url,
        });
      }
    }

    return candidates.slice(0, limit);
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

    // Since we are in Cloudflare Workers, fetch automatically handles redirects safely up to a limit (default 20).
    // We can set redirect: 'follow'
    const response = await fetch(targetUrl.toString(), {
      method: 'GET',
      redirect: 'error',
      headers: {
        'User-Agent': 'NorthSoft.AI.ContentCreator/0.1.0',
        'Accept': 'image/jpeg, image/png, image/webp',
      },
      cf: {
        cacheTtl: 3600,
      }
    });

    if (!response.ok) {
      throw new AppError(`Failed to download image: ${response.statusText}`, 502, 'DOWNLOAD_FAILED');
    }

    const contentType = response.headers.get('content-type') || '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType.split(';')[0]!.trim().toLowerCase())) {
      throw new AppError(`Invalid content type: ${contentType}`, 400, 'INVALID_IMAGE_TYPE');
    }

    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    // Limit to 10MB
    if (contentLength > 10 * 1024 * 1024) {
      throw new AppError('Image exceeds size limit of 10MB', 400, 'IMAGE_TOO_LARGE');
    }

    const arrayBuffer = await response.arrayBuffer();
    
    if (arrayBuffer.byteLength > 10 * 1024 * 1024) {
      throw new AppError('Image exceeds size limit of 10MB', 400, 'IMAGE_TOO_LARGE');
    }

    return arrayBuffer;
  }

  async verifyImageWithVision(imageBytes: ArrayBuffer, topicTitle: string, postBody: string): Promise<ImageVerificationResult> {
    try {
      const uint8Array = new Uint8Array(imageBytes);

      const prompt = `You are an expert content moderator and visual verification system.
Your task is to analyze the provided image and determine if it perfectly matches the given topic and post content.

Topic: "${topicTitle}"
Post Content: "${postBody}"

Respond ONLY with a valid JSON object adhering to this schema:
{
  "decision": "accept" | "reject",
  "confidence": number (0.0 to 1.0),
  "scene": "string description of the scene",
  "objects": ["array", "of", "objects"],
  "matches_content": boolean,
  "mismatches": ["array", "of", "reasons", "it", "doesn't", "match", "if", "any"],
  "reason": "detailed explanation of the decision"
}

Ensure that the image strictly relates to the topic. For example, if the topic is about "software development teams", a picture of developers collaborating is good, but a picture of a cat, a cabbage, or a random group of teenagers is BAD. If unsure, reject.`;

      if (!this.env.AI) {
        throw new Error('Cloudflare Workers AI binding is not configured.');
      }
      const aiResponse = await this.env.AI.run('@cf/llava-hf/llava-1.5-7b-hf', {
        prompt,
        image: [...uint8Array],
      });

      const responseText =
        aiResponse !== null &&
        typeof aiResponse === 'object' &&
        'response' in aiResponse &&
        typeof aiResponse.response === 'string'
          ? aiResponse.response
          : '';
      const jsonStr = this.extractJson(responseText);
      const result = JSON.parse(jsonStr) as ImageVerificationResult;

      // Ensure required fields
      if (
        (result.decision !== 'accept' && result.decision !== 'reject') ||
        typeof result.matches_content !== 'boolean' ||
        typeof result.confidence !== 'number' ||
        !Array.isArray(result.mismatches) ||
        (result.decision === 'accept' && !result.matches_content)
      ) {
        throw new Error('Invalid decision format');
      }

      return result;
    } catch (err: any) {
      console.error('[OpenverseImageService] Vision verification failed:', err);
      return {
        decision: 'reject',
        confidence: 0,
        matches_content: false,
        reason: `Vision API error: ${err.message}`,
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
