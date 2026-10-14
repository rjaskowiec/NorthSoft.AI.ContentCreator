/**
 * Admin API — Curated Image Library Route Handler
 */

import { Hono } from 'hono';
import type { AppEnv } from '../../index';
import { csrfProtection } from '../../core/auth/csrf';
import { ImageLibraryService } from '../../services/content/image-library-service';
import { OpenverseImageService } from '../../services/content/image-service';

export const imagesRouter = new Hono<AppEnv>();

/**
 * GET /api/admin/images
 * Returns paginated curated image library records with category/status filters and search.
 */
imagesRouter.get('/images', async (c) => {
  const db = c.env.DB;
  const status = (c.req.query('status') || 'ALL').trim();
  const category = (c.req.query('category') || '').trim();
  const source = (c.req.query('source') || 'ALL').trim();
  const search = (c.req.query('search') || '').trim();
  const limit = parseInt(c.req.query('limit') || '24', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const imgService = new ImageLibraryService(db);
  c.executionCtx?.waitUntil(imgService.purgeExpiredRejectedImages(7, c.env.IMAGE_BUCKET));

  const result = await imgService.listImages({
    status,
    category,
    source,
    search,
    limit,
    offset,
  });

  return c.json({
    success: true,
    images: result.images,
    total: result.total,
    counts: result.counts,
  });
});

/**
 * GET /api/admin/images/discovery-topics
 * Returns system content pillars and active candidate topics from D1 taxonomy for image discovery.
 */
imagesRouter.get('/images/discovery-topics', async (c) => {
  const db = c.env.DB;
  const { CONTENT_PILLARS } = await import('../../services/research/taxonomy');
  const pillars = Object.values(CONTENT_PILLARS).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
  }));

  const systemTopicsRes = await db
    .prepare('SELECT id, title, category, content_pillar FROM content_ideas ORDER BY created_at DESC LIMIT 15')
    .all<{ id: string; title: string; category?: string; content_pillar?: string }>()
    .catch(() => ({ results: [] }));

  return c.json({
    success: true,
    pillars,
    systemTopics: systemTopicsRes.results || [],
  });
});

/**
 * POST /api/admin/images/candidate-discovery
 * Triggers candidate collection for candidate topics or custom search query.
 */
imagesRouter.post('/images/candidate-discovery', csrfProtection, async (c) => {
  const db = c.env.DB;
  const body = (await c.req.json().catch(() => ({}))) as { query?: string; category?: string };
  const query = (body.query || 'technology business').trim();
  if (!query) {
    return c.json({ success: false, error: 'Topic or search query is required.' }, 400);
  }

  const { determineContentPillar, CONTENT_PILLARS } = await import('../../services/research/taxonomy');
  const pillarKey = determineContentPillar(query, query);
  const pillarInfo = CONTENT_PILLARS[pillarKey];
  const category = (body.category || pillarInfo?.name || 'Technology').trim();

  const openverse = new OpenverseImageService(c.env);
  const imgService = new ImageLibraryService(db);
  const { buildDiscoveryQueryHierarchy } = await import('../../services/content/image-service');
  const { evaluateImageRelevance, filterDiverseCandidates } = await import('../../services/content/image-relevance-evaluator');
  const { checkEditorialBrandSafety } = await import('../../services/content/editorial-policy');

  try {
    // Generate bounded retry queries: initial query -> broader business query -> category scene
    const searchQueries = buildDiscoveryQueryHierarchy(query, category);
    let chosenQuery = query;
    let rawCandidates: any[] = [];
    let relevantCandidatesWithScore: any[] = [];

    for (const q of searchQueries) {
      chosenQuery = q;
      const candidates = await openverse.searchImages(q, 10);
      if (candidates.length === 0) continue;

      rawCandidates = candidates;

      // 1. Filter out candidates failing editorial brand safety
      const safeCandidates = candidates.filter((cand) => {
        const safety = checkEditorialBrandSafety({
          title: cand.title,
          summary: (cand.tags || []).join(' '),
        });
        return safety.passed;
      });

      // 2. Filter through multi-pillar Business Relevance Evaluator
      const scored = safeCandidates
        .map((cand) => {
          const relevance = evaluateImageRelevance(
            {
              title: cand.title,
              keywords: (cand.tags || []).join(', '),
              tags: cand.tags,
              description: cand.title,
              discoveryQuery: q,
            },
            `${q} ${category}`,
          );
          return { cand, relevance };
        })
        .filter(({ relevance }) => relevance.qualified);

      if (scored.length > 0) {
        relevantCandidatesWithScore = scored;
        break; // Found good candidates, no further retries needed
      }
    }

    // 3. Apply Diversity Filter to avoid series of identical events/sessions
    const diverseCandidates = filterDiverseCandidates(
      relevantCandidatesWithScore.map(({ cand, relevance }) => ({
        ...cand,
        relevanceScore: relevance.score,
        relevanceReason: relevance.reasons.join('; '),
      })),
      2,
    );

    let addedCount = 0;
    let skippedCount = 0;

    for (const cand of diverseCandidates) {
      const existing = cand.url ? await db.prepare('SELECT id FROM curated_images WHERE source_url = ?').bind(cand.url).first() : null;
      if (existing) {
        skippedCount++;
      } else {
        const id = await imgService.addCandidate({
          title: cand.title,
          sourceUrl: cand.url,
          originalPageUrl: cand.sourceUrl,
          author: cand.author,
          authorUrl: cand.authorUrl,
          license: cand.license,
          licenseUrl: cand.licenseUrl,
          category,
          keywords: (cand.tags || []).join(', '),
          description: `Discovered from Openverse topic: "${chosenQuery}"`,
          discoveryQuery: chosenQuery,
          score: cand.relevanceScore,
          visualRelevanceScore: cand.relevanceScore ? cand.relevanceScore / 100 : 0.7,
          visualRelevanceReason: cand.relevanceReason || 'Verified business relevance',
        });
        if (id) {
          addedCount++;
        } else {
          skippedCount++;
        }
      }
    }

    let aiGeneratedCount = 0;
    let aiGenerationNotice: string | null = null;

    // 4. Automatic AI Generation Supplement:
    // If web search yielded zero new qualified candidates, automatically supplement with Cloudflare Workers AI
    // without requiring manual prompt input, provided daily quota is available.
    if (addedCount === 0 && c.env.AI && c.env.IMAGE_BUCKET) {
      try {
        const { AiImageGeneratorService } = await import('../../services/content/ai-image-generator');
        const aiGenerator = new AiImageGeneratorService(c.env);
        const quotaCheck = await aiGenerator.checkDailyImageQuota(db);

        if (quotaCheck.allowed) {
          await aiGenerator.generateAndPersistImage(db, c.req.url, {
            description: query,
            category,
          });
          aiGeneratedCount = 1;
          addedCount += 1;
        } else {
          aiGenerationNotice = quotaCheck.reason || 'AI generation skipped (quota limit reached).';
        }
      } catch (aiErr: unknown) {
        console.warn('[candidate-discovery] AI generation supplement skipped:', aiErr);
        aiGenerationNotice = aiErr instanceof Error ? aiErr.message : String(aiErr);
      }
    }

    const steps = [
      { step: 'strategy', label: 'Topic & strategy initialized', status: 'completed' },
      { step: 'search', label: `Searching image sources (Query: "${chosenQuery}")`, status: 'completed', details: `Found ${rawCandidates.length} candidate(s)` },
      { step: 'metadata', label: 'Evaluating candidate metadata & quality', status: 'completed' },
      { step: 'dedup', label: 'Checking duplicates & reuse window', status: 'completed', details: `${skippedCount} duplicate(s) skipped` },
    ];

    if (aiGeneratedCount > 0) {
      steps.push({
        step: 'ai_supplement',
        label: 'Automatic Cloudflare Workers AI supplement',
        status: 'completed',
        details: '1 photorealistic business image generated via SDXL-Lightning & saved as PENDING',
      });
    }

    steps.push({
      step: 'save',
      label: 'Saving candidates to Image Library',
      status: 'completed',
      details: `${addedCount} new candidate(s) saved as PENDING (${aiGeneratedCount} AI generated)`,
    });

    return c.json({
      success: true,
      topic: query,
      chosenQuery,
      category,
      totalDiscovered: rawCandidates.length + aiGeneratedCount,
      addedCount,
      skippedCount,
      aiGeneratedCount,
      aiGenerationNotice,
      steps,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: `Candidate discovery failed: ${message}` }, 500);
  }
});

/**
 * POST /api/admin/images/generate
 * Generates a photorealistic business image via Cloudflare Workers AI.
 * Strict limits: 1 image/day, author "NorthSoft", license "NorthSoft internal use", status "PENDING".
 */
imagesRouter.post('/images/generate', csrfProtection, async (c) => {
  const db = c.env.DB;
  const body = (await c.req.json().catch(() => ({}))) as {
    description?: string;
    category?: string;
    postContext?: string;
  };

  const description = (body.description || '').trim();
  const category = (body.category || 'General').trim();
  const postContext = (body.postContext || '').trim();

  if (!description) {
    return c.json({ success: false, error: 'Image search description or prompt is required for AI generation.' }, 400);
  }

  const { AiImageGeneratorService } = await import('../../services/content/ai-image-generator');
  const generator = new AiImageGeneratorService(c.env);

  try {
    const result = await generator.generateAndPersistImage(db, c.req.url, {
      description,
      category,
      postContext: postContext || undefined,
    });

    return c.json({
      success: true,
      image: result,
      message: 'Image generated successfully via Cloudflare Workers AI and saved as PENDING for review.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const status = (err as any)?.statusCode || (err as any)?.status || 500;
    return c.json({ success: false, error: message }, status);
  }
});

/**
 * POST /api/admin/images/auto-extract-metadata
 * Analyzes an uploaded file name or URL to automatically deduce title, keywords, and description.
 * Uses AI with intelligent token analysis, filtering out random hashes and falling back to category keywords.
 */
imagesRouter.post('/images/auto-extract-metadata', csrfProtection, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    filename?: string;
    url?: string;
    category?: string;
  };

  const { extractImageMetadataWithAI } = await import('../../services/content/image-metadata-extractor');
  const { getAIProvider } = await import('../../ai/factory');
  let aiProvider;
  try {
    aiProvider = getAIProvider(c.env, 'researcher');
  } catch {
    // Falls back to heuristic extraction if AI is unavailable
  }

  const result = await extractImageMetadataWithAI(
    {
      filename: body.filename,
      url: body.url,
      category: body.category,
    },
    aiProvider,
  );

  return c.json({
    success: true,
    result,
  });
});

/**
 * POST /api/admin/images
 * Manually adds an image to the library via file upload or HTTPS URL.
 */
imagesRouter.post('/images', csrfProtection, async (c) => {
  const db = c.env.DB;
  const imgService = new ImageLibraryService(db);

  let title: string;
  let category: string;
  let keywords: string;
  let description: string;
  let author: string;
  let license: string;
  let notes: string;
  let status: 'APPROVED' | 'PENDING' = 'APPROVED';
  let sourceUrl: string | undefined;
  let r2Key: string | undefined;
  let sourceType: 'UPLOADED' | 'URL';

  try {
    const { extractImageMetadataWithAI } = await import('../../services/content/image-metadata-extractor');
    const { getAIProvider } = await import('../../ai/factory');
    let aiProvider;
    try {
      aiProvider = getAIProvider(c.env, 'researcher');
    } catch {
      // Ignore
    }

    if ((c.req.header('content-type') || '').includes('multipart/form-data')) {
      const form = await c.req.formData();
      const file = form.get('file');
      title = String(form.get('title') || '').trim();
      category = String(form.get('category') || 'General').trim();
      keywords = String(form.get('keywords') || '').trim();
      description = String(form.get('description') || '').trim();
      author = String(form.get('author') || '').trim();
      license = String(form.get('license') || 'Manual Upload').trim();
      notes = String(form.get('notes') || '').trim();
      if (form.get('status') === 'PENDING') status = 'PENDING';

      if (!(file instanceof File)) {
        return c.json({ success: false, error: 'Please choose an image file to upload.' }, 400);
      }
      if (file.size < 1 || file.size > 10 * 1024 * 1024) {
        return c.json({ success: false, error: 'Image file size must be less than 10MB.' }, 413);
      }

      // If user left title, keywords or description blank, automatically deduce them
      if (!title || !keywords || !description) {
        const auto = await extractImageMetadataWithAI({ filename: file.name, category }, aiProvider);
        if (!title) title = auto.title;
        if (!keywords) keywords = auto.keywords;
        if (!description) description = auto.description;
      }

      const bytes = await file.arrayBuffer();
      const data = new Uint8Array(bytes);
      let ext = 'jpg';
      let mimeType = 'image/jpeg';

      if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
        ext = 'jpg';
        mimeType = 'image/jpeg';
      } else if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
        ext = 'png';
        mimeType = 'image/png';
      } else if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) {
        ext = 'webp';
        mimeType = 'image/webp';
      } else {
        return c.json({ success: false, error: 'Only valid JPEG, PNG, and WebP images are supported.' }, 400);
      }

      if (c.env.IMAGE_BUCKET) {
        const key = `${crypto.randomUUID()}.${ext}`;
        await c.env.IMAGE_BUCKET.put(`images/${key}`, bytes, {
          httpMetadata: { contentType: mimeType, cacheControl: 'public, max-age=31536000, immutable' },
        });
        r2Key = key;
        sourceUrl = `${new URL(c.req.url).origin}/media/${key}`;
        sourceType = 'UPLOADED';
      } else {
        return c.json({ success: false, error: 'Cloudflare R2 IMAGE_BUCKET is not configured.' }, 503);
      }
    } else {
      const body = (await c.req.json().catch(() => ({}))) as {
        title?: string;
        url?: string;
        category?: string;
        keywords?: string;
        description?: string;
        author?: string;
        license?: string;
        notes?: string;
        status?: 'APPROVED' | 'PENDING';
      };

      const inputUrl = (body.url || '').trim();
      if (!inputUrl) {
        return c.json({ success: false, error: 'Image URL is required.' }, 400);
      }

      const parsed = new URL(inputUrl);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
        return c.json({ success: false, error: 'Use a valid public HTTPS image URL.' }, 400);
      }

      title = (body.title || '').trim();
      category = (body.category || 'General').trim();
      keywords = (body.keywords || '').trim();
      description = (body.description || '').trim();
      author = (body.author || '').trim();
      license = (body.license || 'HTTPS Import').trim();
      notes = (body.notes || '').trim();
      status = body.status === 'PENDING' ? 'PENDING' : 'APPROVED';
      sourceUrl = inputUrl;
      sourceType = 'URL';

      // If user left title, keywords or description blank, automatically deduce them
      if (!title || !keywords || !description) {
        const auto = await extractImageMetadataWithAI({ url: inputUrl, category }, aiProvider);
        if (!title) title = auto.title;
        if (!keywords) keywords = auto.keywords;
        if (!description) description = auto.description;
      }

      // Download and save to R2 if storage is configured
      if (c.env.IMAGE_BUCKET) {
        try {
          const openverse = new OpenverseImageService(c.env);
          const bytes = await openverse.downloadImage(inputUrl);
          const data = new Uint8Array(bytes);
          let ext = 'jpg';
          let mimeType = 'image/jpeg';
          if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
            ext = 'png';
            mimeType = 'image/png';
          } else if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) {
            ext = 'webp';
            mimeType = 'image/webp';
          }
          const key = `${crypto.randomUUID()}.${ext}`;
          await c.env.IMAGE_BUCKET.put(`images/${key}`, bytes, {
            httpMetadata: { contentType: mimeType, cacheControl: 'public, max-age=31536000, immutable' },
          });
          r2Key = key;
          sourceUrl = `${new URL(c.req.url).origin}/media/${key}`;
        } catch (dlErr) {
          console.warn('[ImageAPI] Optional R2 cache download failed, keeping original source URL:', dlErr);
        }
      }
    }

    const imageId = await imgService.addManualImage({
      title,
      sourceType,
      sourceUrl,
      r2Key,
      category,
      keywords,
      description,
      author,
      license,
      notes,
      status,
    });

    return c.json({
      success: true,
      imageId,
      sourceUrl,
      message: 'Image added to library successfully.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: message }, 400);
  }
});

/**
 * PATCH /api/admin/images/:id
 * Updates metadata (category, keywords, description, status, etc.) of a curated image.
 */
imagesRouter.patch('/images/:id', csrfProtection, async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id') || '';
  const body = (await c.req.json().catch(() => ({}))) as {
    title?: string;
    category?: string;
    keywords?: string;
    tags?: string;
    description?: string;
    notes?: string;
    sourceUrl?: string;
    author?: string;
    license?: string;
    status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DELETED';
  };

  const imgService = new ImageLibraryService(db);
  const updated = await imgService.updateMetadata(id, body);

  if (!updated) {
    return c.json({ success: false, error: 'Image record not found or no changes made.' }, 404);
  }

  return c.json({ success: true, id, message: 'Image metadata updated.' });
});

/**
 * DELETE /api/admin/images/:id
 * Marks a curated image as DELETED.
 */
imagesRouter.delete('/images/:id', csrfProtection, async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id') || '';

  const imgService = new ImageLibraryService(db);
  const updated = await imgService.updateMetadata(id, { status: 'DELETED' });

  if (!updated) {
    return c.json({ success: false, error: 'Image record not found.' }, 404);
  }

  return c.json({ success: true, id, message: 'Image marked as deleted.' });
});

/**
 * POST /api/admin/images/bulk-action
 * Bulk approves, rejects, or deletes multiple selected image IDs.
 */
imagesRouter.post('/images/bulk-action', csrfProtection, async (c) => {
  const db = c.env.DB;
  const body = (await c.req.json().catch(() => ({}))) as {
    ids?: string[];
    action?: 'approve' | 'reject' | 'delete';
  };

  const ids = Array.isArray(body.ids) ? body.ids.filter((i): i is string => typeof i === 'string' && i.trim().length > 0) : [];
  const action = body.action;

  if (ids.length === 0 || !action) {
    return c.json({ success: false, error: 'ids (array) and action ("approve" | "reject" | "delete") are required.' }, 400);
  }

  const targetStatus = action === 'approve' ? 'APPROVED' : action === 'reject' ? 'REJECTED' : 'DELETED';
  const imgService = new ImageLibraryService(db);

  let updatedCount = 0;
  for (const id of ids) {
    const success = await imgService.updateMetadata(id, { status: targetStatus });
    if (success) updatedCount++;
  }

  return c.json({
    success: true,
    updatedCount,
    action,
  });
});

/**
 * POST /api/admin/images/purge-rejected
 * Hard-purges REJECTED images older than 7 days.
 */
imagesRouter.post('/images/purge-rejected', csrfProtection, async (c) => {
  const db = c.env.DB;
  const imgService = new ImageLibraryService(db);
  const result = await imgService.purgeExpiredRejectedImages(7, c.env.IMAGE_BUCKET);
  return c.json({
    success: true,
    purgedCount: result.purgedCount,
    purgedIds: result.purgedIds,
  });
});
