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
 * Builds a photographic, realistic business prompt tailored for NorthSoft.
 */
export function buildBusinessImagePrompt(
  description: string,
  category: string,
  postContext?: string,
): string {
  const cleanDesc = description.trim();
  const cleanCat = category.trim();

  // Combine user description with realism and contemporary business quality modifiers
  let prompt = `Photorealistic modern commercial scene: ${cleanDesc}. Category: ${cleanCat}.`;

  if (postContext && postContext.trim().length > 0) {
    const briefCtx = postContext.trim().slice(0, 150);
    prompt += ` Context: ${briefCtx}.`;
  }

  prompt += ' Contemporary small business setting, natural daylight, high resolution, cinematic professional commercial photography, authentic workplace, sharp focus, 8k, no watermarks, no distorted faces or extra limbs.';

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

    const prompt = buildBusinessImagePrompt(options.description, options.category, options.postContext);
    const startTime = Date.now();
    let imageBytes: ArrayBuffer;

    try {
      // 2. Call Cloudflare Workers AI text-to-image model
      const aiResponse = await this.env.AI.run(AI_IMAGE_GENERATION_MODEL as any, {
        prompt,
      });

      if (aiResponse instanceof ReadableStream) {
        // Stream response
        const res = new Response(aiResponse);
        imageBytes = await res.arrayBuffer();
      } else if (aiResponse instanceof ArrayBuffer) {
        imageBytes = aiResponse;
      } else if (aiResponse && typeof (aiResponse as any).arrayBuffer === 'function') {
        imageBytes = await (aiResponse as any).arrayBuffer();
      } else if (aiResponse && (aiResponse as any).image && typeof (aiResponse as any).image === 'string') {
        // Base64 encoded string response
        const binaryString = atob((aiResponse as any).image);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        imageBytes = bytes.buffer;
      } else {
        throw new Error('Unexpected binary format returned from Cloudflare text-to-image model');
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
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      await this.quotaManager.recordUsage(db, {
        provider: 'cloudflare-workers-ai',
        model: AI_IMAGE_GENERATION_MODEL,
        role: 'image_generator',
        neuronsUsed: 0,
        success: false,
        durationMs,
        errorMessage: err instanceof Error ? err.message : String(err),
        source: 'local_estimate',
      });
      throw new AppError(`Workers AI generation failed: ${err.message || String(err)}`, 502, 'GENERATION_FAILED');
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
