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
  const search = (c.req.query('search') || '').trim();
  const limit = parseInt(c.req.query('limit') || '24', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const imgService = new ImageLibraryService(db);
  const result = await imgService.listImages({
    status,
    category,
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
 * POST /api/admin/images/candidate-discovery
 * Triggers candidate collection for candidate topics or custom search query.
 */
imagesRouter.post('/images/candidate-discovery', csrfProtection, async (c) => {
  const db = c.env.DB;
  const body = (await c.req.json().catch(() => ({}))) as { query?: string; category?: string };
  const query = (body.query || 'technology business').trim();
  const category = (body.category || 'Technology').trim();

  const openverse = new OpenverseImageService(c.env);
  const imgService = new ImageLibraryService(db);

  try {
    const candidates = await openverse.searchImages(query, 10);
    let addedCount = 0;

    for (const cand of candidates) {
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
        description: `Discovered from Openverse query: "${query}"`,
        discoveryQuery: query,
      });
      if (id) addedCount++;
    }

    return c.json({
      success: true,
      addedCount,
      totalDiscovered: candidates.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: `Candidate discovery failed: ${message}` }, 500);
  }
});

/**
 * POST /api/admin/images
 * Manually adds an image to the library via file upload or HTTPS URL.
 */
imagesRouter.post('/images', csrfProtection, async (c) => {
  const db = c.env.DB;
  const imgService = new ImageLibraryService(db);

  let title = 'Manual Image';
  let category = 'General';
  let keywords = '';
  let description = '';
  let author = '';
  let license = 'Manual';
  let notes = '';
  let status: 'APPROVED' | 'PENDING' = 'APPROVED';
  let sourceUrl: string | undefined;
  let r2Key: string | undefined;
  let sourceType: 'UPLOADED' | 'URL' = 'URL';

  try {
    if ((c.req.header('content-type') || '').includes('multipart/form-data')) {
      const form = await c.req.formData();
      const file = form.get('file');
      title = String(form.get('title') || 'Uploaded Image').trim();
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

      title = (body.title || 'URL Image').trim();
      category = (body.category || 'General').trim();
      keywords = (body.keywords || '').trim();
      description = (body.description || '').trim();
      author = (body.author || '').trim();
      license = (body.license || 'HTTPS Import').trim();
      notes = (body.notes || '').trim();
      status = body.status === 'PENDING' ? 'PENDING' : 'APPROVED';
      sourceUrl = inputUrl;
      sourceType = 'URL';

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
