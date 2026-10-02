/**
 * NorthSoft.AI.ContentCreator — Curated Image Library Service
 *
 * Central authority for managing administrator-curated images, candidate discovery ingestion,
 * metadata editing, approval workflows, deterministic matching algorithms, and reservation/usage tracking.
 */

import { D1AuditLogger, type IAuditLogger } from '../../core/audit';

export interface CuratedImageRow {
  id: string;
  title: string;
  source_type: 'DISCOVERED' | 'UPLOADED' | 'URL';
  source_url: string | null;
  original_page_url: string | null;
  author: string | null;
  author_url: string | null;
  license: string | null;
  license_url: string | null;
  category: string;
  secondary_categories: string | null;
  keywords: string | null;
  tags: string | null;
  description: string | null;
  notes: string | null;
  r2_key: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DELETED';
  discovery_query: string | null;
  discovery_score: number;
  usage_count: number;
  historical_usage_count?: number;
  last_used_at: string | null;
  used_in_post_id: string | null;
  reserved_post_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CandidateImageInput {
  title: string;
  sourceUrl?: string;
  originalPageUrl?: string;
  author?: string;
  authorUrl?: string;
  license?: string;
  licenseUrl?: string;
  category?: string;
  keywords?: string;
  description?: string;
  discoveryQuery?: string;
  score?: number;
}

export interface ManualImageInput {
  title: string;
  sourceType: 'UPLOADED' | 'URL';
  sourceUrl?: string;
  r2Key?: string;
  category: string;
  keywords?: string;
  description?: string;
  author?: string;
  authorUrl?: string;
  license?: string;
  licenseUrl?: string;
  notes?: string;
  status?: 'APPROVED' | 'PENDING';
}

export class ImageLibraryService {
  private auditLogger: IAuditLogger;

  constructor(
    private db: D1Database,
    auditLogger?: IAuditLogger,
  ) {
    this.auditLogger = auditLogger ?? new D1AuditLogger(db);
  }

  /**
   * Adds an automatically discovered image as a PENDING candidate in the library.
   */
  async addCandidate(candidate: CandidateImageInput): Promise<string> {
    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const sourceUrl = candidate.sourceUrl?.trim() || null;

    // Deduplication check by source_url if provided
    if (sourceUrl) {
      const existing = await this.db
        .prepare('SELECT id FROM curated_images WHERE source_url = ?')
        .bind(sourceUrl)
        .first<{ id: string }>();

      if (existing) {
        return existing.id;
      }
    }

    await this.db
      .prepare(
        `INSERT INTO curated_images (
          id, title, source_type, source_url, original_page_url, author, author_url,
          license, license_url, category, keywords, description, status,
          discovery_query, discovery_score, created_at, updated_at
        ) VALUES (?, ?, 'DISCOVERED', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)`,
      )
      .bind(
        id,
        candidate.title.trim() || 'Discovered Image',
        sourceUrl,
        candidate.originalPageUrl?.trim() || null,
        candidate.author?.trim() || null,
        candidate.authorUrl?.trim() || null,
        candidate.license?.trim() || 'Custom',
        candidate.licenseUrl?.trim() || null,
        (candidate.category || 'Technology').trim(),
        candidate.keywords?.trim() || null,
        candidate.description?.trim() || null,
        candidate.discoveryQuery?.trim() || null,
        candidate.score || 0,
        nowIso,
        nowIso,
      )
      .run();

    return id;
  }

  /**
   * Adds a manual image (Upload or HTTPS URL) directly into the library.
   */
  async addManualImage(input: ManualImageInput): Promise<string> {
    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO curated_images (
          id, title, source_type, source_url, r2_key, category, keywords, description,
          author, author_url, license, license_url, notes, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.title.trim() || 'Manual Image',
        input.sourceType,
        input.sourceUrl?.trim() || null,
        input.r2Key?.trim() || null,
        input.category.trim() || 'General',
        input.keywords?.trim() || null,
        input.description?.trim() || null,
        input.author?.trim() || null,
        input.authorUrl?.trim() || null,
        input.license?.trim() || 'Manual',
        input.licenseUrl?.trim() || null,
        input.notes?.trim() || null,
        input.status || 'APPROVED',
        nowIso,
        nowIso,
      )
      .run();

    await this.auditLogger.log({
      eventType: 'IMAGE_LIBRARY_ADDED',
      entityType: 'curated_image',
      entityId: id,
      actor: 'admin',
      details: { sourceType: input.sourceType, category: input.category },
    });

    return id;
  }

  /**
   * Updates metadata and/or status of a curated image.
   */
  async updateMetadata(
    id: string,
    updates: Partial<{
      title: string;
      category: string;
      keywords: string;
      tags: string;
      description: string;
      notes: string;
      sourceUrl: string;
      author: string;
      license: string;
      status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DELETED';
    }>,
  ): Promise<boolean> {
    const fields: string[] = ['updated_at = ?'];
    const bindings: unknown[] = [new Date().toISOString()];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      bindings.push(updates.title.trim());
    }
    if (updates.category !== undefined) {
      fields.push('category = ?');
      bindings.push(updates.category.trim());
    }
    if (updates.keywords !== undefined) {
      fields.push('keywords = ?');
      bindings.push(updates.keywords.trim());
    }
    if (updates.tags !== undefined) {
      fields.push('tags = ?');
      bindings.push(updates.tags.trim());
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      bindings.push(updates.description.trim());
    }
    if (updates.notes !== undefined) {
      fields.push('notes = ?');
      bindings.push(updates.notes.trim());
    }
    if (updates.sourceUrl !== undefined) {
      fields.push('source_url = ?');
      bindings.push(updates.sourceUrl.trim());
    }
    if (updates.author !== undefined) {
      fields.push('author = ?');
      bindings.push(updates.author.trim());
    }
    if (updates.license !== undefined) {
      fields.push('license = ?');
      bindings.push(updates.license.trim());
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      bindings.push(updates.status);
    }

    bindings.push(id);
    const res = await this.db
      .prepare(`UPDATE curated_images SET ${fields.join(', ')} WHERE id = ?`)
      .bind(...bindings)
      .run();

    const updated = (res.meta?.changes ?? 0) > 0;

    if (updated && updates.status && (updates.status === 'DELETED' || updates.status === 'REJECTED')) {
      await this.db.batch([
        this.db
          .prepare('UPDATE curated_images SET reserved_post_id = NULL WHERE id = ?')
          .bind(id),
        this.db
          .prepare(
            `DELETE FROM post_images
             WHERE (curated_image_id = ? OR url IN (SELECT source_url FROM curated_images WHERE id = ? AND source_url IS NOT NULL))
               AND post_id IN (SELECT id FROM posts WHERE status != 'published')`,
          )
          .bind(id, id),
      ]);
    }

    return updated;
  }

  /**
   * Deterministic matching algorithm: Finds best APPROVED image for a post topic/content.
   * Enforces 90-day reuse exclusion policy and candidate ranking.
   */
  async findBestApprovedImage(
    topicTitle: string,
    category: string,
    bodyText: string,
    currentDraftPostId?: string,
  ): Promise<{ image: CuratedImageRow; matchScore: number; matchReason: string } | null> {
    // 1. Query all APPROVED images that are available (not reserved by another draft)
    const rows = await this.db
      .prepare(
        `SELECT * FROM curated_images
         WHERE status = 'APPROVED'
           AND (reserved_post_id IS NULL OR reserved_post_id = ?)`,
      )
      .bind(currentDraftPostId || '')
      .all<CuratedImageRow>();

    const candidates = rows.results || [];
    if (candidates.length === 0) {
      return null;
    }

    const now = Date.now();
    const REUSE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

    const postCategoryNorm = category.toUpperCase().trim();
    const textNorm = `${topicTitle} ${bodyText}`.toLowerCase();
    const words = new Set(textNorm.split(/\W+/).filter((w) => w.length > 3));

    let bestMatch: CuratedImageRow | null = null;
    let bestScore = -1;
    let bestReason = '';

    for (const img of candidates) {
      // Reuse policy check: Exclude images used within the last 90 days
      if (img.usage_count > 0 && img.last_used_at) {
        const lastUsedMs = new Date(img.last_used_at).getTime();
        if (!isNaN(lastUsedMs) && now - lastUsedMs < REUSE_WINDOW_MS) {
          continue; // Recently used within 90 days, skip
        }
      }

      let score = 0;
      const reasons: string[] = [];

      // Category match
      const imgCategoryNorm = img.category.toUpperCase().trim();
      if (imgCategoryNorm === postCategoryNorm) {
        score += 30;
        reasons.push(`Category match (${img.category})`);
      } else if (imgCategoryNorm.includes(postCategoryNorm) || postCategoryNorm.includes(imgCategoryNorm)) {
        score += 15;
        reasons.push(`Partial category match (${img.category})`);
      }

      // Keyword match
      if (img.keywords) {
        const keywordsList = img.keywords.toLowerCase().split(/[\s,;]+/);
        let kwMatches = 0;
        for (const kw of keywordsList) {
          if (kw.length > 2 && words.has(kw)) {
            kwMatches++;
          }
        }
        if (kwMatches > 0) {
          score += Math.min(30, kwMatches * 10);
          reasons.push(`${kwMatches} matching keyword(s)`);
        }
      }

      // Description match
      if (img.description) {
        const descWords = img.description.toLowerCase().split(/\W+/);
        let descMatches = 0;
        for (const dw of descWords) {
          if (dw.length > 3 && words.has(dw)) {
            descMatches++;
          }
        }
        if (descMatches > 0) {
          score += Math.min(20, descMatches * 5);
          reasons.push(`Description match`);
        }
      }

      // Unused bonus
      if (img.usage_count === 0) {
        score += 20;
        reasons.push('Unused asset bonus');
      } else {
        score += 5; // 90+ days old reusable bonus
        reasons.push('Eligible for quarterly reuse');
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = img;
        bestReason = reasons.join(', ');
      }
    }

    if (!bestMatch || bestScore <= 20) {
      return null;
    }

    return {
      image: bestMatch,
      matchScore: bestScore,
      matchReason: bestReason,
    };
  }

  /**
   * Reserves an image for a draft post and links it in post_images.
   */
  async reserveImageForDraft(imageId: string, postId: string, isManual = false): Promise<void> {
    const img = await this.db
      .prepare('SELECT * FROM curated_images WHERE id = ?')
      .bind(imageId)
      .first<CuratedImageRow>();

    if (!img) {
      throw new Error(`Curated image ${imageId} not found.`);
    }

    if (img.status !== 'APPROVED') {
      throw new Error(`Cannot assign image ${imageId} because its status is '${img.status}'. Only APPROVED images can be selected.`);
    }

    const postRow = await this.db
      .prepare('SELECT current_version FROM posts WHERE id = ?')
      .bind(postId)
      .first<{ current_version: number }>();
    const currentVersion = postRow?.current_version ?? 1;

    // Detect previous image attached to this post
    const prevPi = await this.db
      .prepare('SELECT curated_image_id FROM post_images WHERE post_id = ? AND version_number = ?')
      .bind(postId, currentVersion)
      .first<{ curated_image_id: string | null }>();
    const prevImageId = prevPi?.curated_image_id || null;

    const nowIso = new Date().toISOString();

    // Batch database updates safely
    await this.db.batch([
      // 1. Release previous image reservation for this post
      this.db.prepare('UPDATE curated_images SET reserved_post_id = NULL WHERE reserved_post_id = ?').bind(postId),
      // 2. Reserve new image
      this.db.prepare('UPDATE curated_images SET reserved_post_id = ?, updated_at = ? WHERE id = ?').bind(postId, nowIso, imageId),
      // 3. Clear existing post_images for current version
      this.db.prepare('DELETE FROM post_images WHERE post_id = ?').bind(postId),
      // 4. Insert post_images link
      this.db.prepare(
        `INSERT INTO post_images (
          id, post_id, version_number, url, alt_text, source_url, source_id, author, author_url,
          license, license_url, verified_at, verification_status, visual_verification_status,
          curated_image_id, selection_source, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified', 'accept', ?, ?, ?
        )`,
      ).bind(
        crypto.randomUUID(),
        postId,
        currentVersion,
        img.source_url || img.r2_key || 'post-image',
        img.title || img.description || 'Post Image',
        img.original_page_url || img.source_url,
        img.id,
        img.author,
        img.author_url,
        img.license || 'Curated Library',
        img.license_url,
        nowIso,
        imageId,
        isManual ? 'MANUAL' : 'AUTO',
        nowIso,
      ),
    ]);

    await recalculateCuratedImageUsage(this.db, imageId);
    if (prevImageId && prevImageId !== imageId) {
      await recalculateCuratedImageUsage(this.db, prevImageId);
    }

    await this.auditLogger.log({
      eventType: 'IMAGE_RESERVED_FOR_DRAFT',
      entityType: 'curated_image',
      entityId: imageId,
      actor: isManual ? 'admin' : 'system',
      details: { postId, isManual, previousImageId: prevImageId },
    });
  }

  /**
   * Releases an image reservation held by a post draft.
   */
  async releaseDraftReservation(postId: string): Promise<void> {
    const prevPi = await this.db
      .prepare('SELECT curated_image_id FROM post_images WHERE post_id = ?')
      .bind(postId)
      .first<{ curated_image_id: string | null }>();
    const prevImageId = prevPi?.curated_image_id || null;

    await this.db
      .prepare('UPDATE curated_images SET reserved_post_id = NULL WHERE reserved_post_id = ?')
      .bind(postId)
      .run();

    if (prevImageId) {
      await recalculateCuratedImageUsage(this.db, prevImageId);
    }
  }

  /**
   * Marks an image as successfully published to Facebook.
   * Updates usage count, last_used_at, used_in_post_id, and clears reservation.
   */
  async markImageAsPublished(imageId: string, postId: string): Promise<void> {
    const nowIso = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE curated_images
         SET usage_count = usage_count + 1,
             historical_usage_count = historical_usage_count + 1,
             last_used_at = ?,
             used_in_post_id = ?,
             reserved_post_id = NULL,
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(nowIso, postId, nowIso, imageId)
      .run();

    await this.auditLogger.log({
      eventType: 'IMAGE_PUBLISHED',
      entityType: 'curated_image',
      entityId: imageId,
      actor: 'system',
      details: { postId },
    });
  }

  /**
   * Returns a paginated list of curated images with counts by status.
   * Efficient: queries persisted indexed columns without expensive sequential re-calculations on read.
   */
  async listImages(options: {
    status?: string;
    category?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    images: CuratedImageRow[];
    total: number;
    counts: { pending: number; approved: number; rejected: number; used: number; total: number };
  }> {
    const limit = options.limit || 24;
    const offset = options.offset || 0;
    const statusFilter = (options.status || 'ALL').toUpperCase().trim();
    const categoryFilter = (options.category || '').trim();
    const searchTerm = (options.search || '').trim().toLowerCase();

    const whereClauses: string[] = ["status != 'DELETED'"];
    const bindings: unknown[] = [];

    if (statusFilter === 'USED') {
      whereClauses.push('(usage_count > 0 OR COALESCE(historical_usage_count, 0) > 0)');
    } else if (statusFilter !== 'ALL') {
      whereClauses.push('status = ?');
      bindings.push(statusFilter);
    }

    if (categoryFilter) {
      whereClauses.push('category = ?');
      bindings.push(categoryFilter);
    }

    if (searchTerm) {
      whereClauses.push(
        '(LOWER(title) LIKE ? OR LOWER(keywords) LIKE ? OR LOWER(description) LIKE ? OR LOWER(category) LIKE ?)',
      );
      const searchPattern = `%${searchTerm}%`;
      bindings.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRes = await this.db
      .prepare(`SELECT COUNT(*) as total FROM curated_images ${whereSql}`)
      .bind(...bindings)
      .first<{ total: number }>();

    const rowsRes = await this.db
      .prepare(
        `SELECT * FROM curated_images ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...bindings, limit, offset)
      .all<CuratedImageRow>();

    // Counts summary across active library
    const countsRes = await this.db
      .prepare(
        `SELECT
          SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approved,
          SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) as rejected,
          SUM(CASE WHEN usage_count > 0 OR COALESCE(historical_usage_count, 0) > 0 THEN 1 ELSE 0 END) as used,
          COUNT(*) as total
         FROM curated_images WHERE status != 'DELETED'`,
      )
      .first<{ pending: number; approved: number; rejected: number; used: number; total: number }>();

    return {
      images: rowsRes.results || [],
      total: countRes?.total || 0,
      counts: {
        pending: countsRes?.pending || 0,
        approved: countsRes?.approved || 0,
        rejected: countsRes?.rejected || 0,
        used: countsRes?.used || 0,
        total: countsRes?.total || 0,
      },
    };
  }
}

/**
 * Resolves the canonical, publicly accessible absolute HTTP/HTTPS URL for a curated image asset.
 * Guarantees that Cloudflare R2 bucket images are served via the application's public `/media/:key` endpoint
 * so Meta Graph API and external services can retrieve the media reliably without authentication.
 */
export function getPublicImageUrl(
  input: { source_url?: string | null; r2_key?: string | null } | string | null | undefined,
  origin = 'https://ai.northsoft.is',
): string {
  if (!input) return '';

  const cleanOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;

    let key = trimmed;
    if (key.startsWith('/media/')) key = key.substring(7);
    else if (key.startsWith('media/')) key = key.substring(6);
    else if (key.startsWith('images/')) key = key.substring(7);
    else if (key.startsWith('/images/')) key = key.substring(8);

    return `${cleanOrigin}/media/${key}`;
  }

  const r2Key = (input.r2_key || '').trim();
  const sourceUrl = (input.source_url || '').trim();

  if (r2Key) {
    let key = r2Key;
    if (key.startsWith('images/')) key = key.substring(7);
    else if (key.startsWith('/images/')) key = key.substring(8);
    else if (key.startsWith('/media/')) key = key.substring(7);
    else if (key.startsWith('media/')) key = key.substring(6);
    return `${cleanOrigin}/media/${key}`;
  }

  if (sourceUrl) {
    if (/^https?:\/\//i.test(sourceUrl)) {
      return sourceUrl;
    }
    let key = sourceUrl;
    if (key.startsWith('/media/')) key = key.substring(7);
    else if (key.startsWith('media/')) key = key.substring(6);
    else if (key.startsWith('images/')) key = key.substring(7);
    else if (key.startsWith('/images/')) key = key.substring(8);
    return `${cleanOrigin}/media/${key}`;
  }

  return '';
}

/**
 * Derives and synchronizes exact usage statistics for a Curated Image asset.
 * Enforces one canonical state:
 * - currentUsageCount (usage_count): count of active posts referencing this image at their current version
 * - historicalUsageCount: total times this image was published to Facebook/external provider
 * - used_in_post_id: most recent active post using the asset
 * - reserved_post_id: post ID if an active draft/scheduled post reserves it; cleared when published or reassigned
 */
export async function recalculateCuratedImageUsage(db: D1Database, imageId: string): Promise<void> {
  if (!imageId) return;

  const curImg = await db
    .prepare('SELECT id, source_url, r2_key FROM curated_images WHERE id = ?')
    .bind(imageId)
    .first<{ id: string; source_url: string | null; r2_key: string | null }>();

  if (!curImg) return;

  const publicUrl = getPublicImageUrl(curImg);

  // 1. Calculate CURRENT usage: count of active posts currently using this image in their current version
  const currentUsageRes = await db
    .prepare(
      `SELECT COUNT(DISTINCT p.id) as current_count,
              MAX(p.id) as latest_post_id
       FROM posts p
       JOIN post_images pi ON pi.post_id = p.id AND pi.version_number = p.current_version
       WHERE (pi.curated_image_id = ?
              OR (pi.curated_image_id IS NULL AND (pi.source_id = ? OR (pi.url IS NOT NULL AND pi.url != '' AND (pi.url = ? OR (? != '' AND pi.url = ?))))))
         AND p.status != 'rejected'`,
    )
    .bind(imageId, imageId, curImg.source_url || '', publicUrl, publicUrl)
    .first<{ current_count: number; latest_post_id: string | null }>();

  const currentCount = currentUsageRes?.current_count || 0;
  const usedInPostId = currentCount > 0 ? currentUsageRes?.latest_post_id || null : null;

  // 2. Calculate HISTORICAL usage: count of distinct publications where this image was published
  // Look across publications joined with post_images, direct publication pushed_image_url, and audit_log
  const pubRes = await db
    .prepare(
      `SELECT COUNT(DISTINCT CASE WHEN pub.facebook_post_id IS NOT NULL AND TRIM(pub.facebook_post_id) != '' THEN pub.facebook_post_id ELSE pub.post_id END) as pub_count,
              MAX(pub.published_at) as max_published_at
       FROM publications pub
       JOIN post_images pi ON pi.post_id = pub.post_id
       WHERE (pi.curated_image_id = ?
              OR (pi.curated_image_id IS NULL AND (pi.source_id = ? OR (pi.url IS NOT NULL AND pi.url != '' AND (pi.url = ? OR (? != '' AND pi.url = ?))))))
         AND pub.status = 'published'`,
    )
    .bind(imageId, imageId, curImg.source_url || '', publicUrl, publicUrl)
    .first<{ pub_count: number; max_published_at: string | null }>();

  // Check audit_log for historical IMAGE_PUBLISHED events for this image
  const auditRes = await db
    .prepare(
      `SELECT COUNT(DISTINCT CASE WHEN json_extract(details, '$.postId') IS NOT NULL THEN json_extract(details, '$.postId') ELSE id END) as audit_pub_count,
              MAX(created_at) as max_audit_time
       FROM audit_log
       WHERE event_type = 'IMAGE_PUBLISHED' AND entity_id = ?`,
    )
    .bind(imageId)
    .first<{ audit_pub_count: number; max_audit_time: string | null }>();

  const historicalCount = Math.max(pubRes?.pub_count || 0, auditRes?.audit_pub_count || 0);

  // Latest published timestamp
  const pubTime = pubRes?.max_published_at || null;
  const auditTime = auditRes?.max_audit_time || null;
  let lastUsedAt: string | null;
  if (pubTime && auditTime) {
    lastUsedAt = new Date(pubTime) > new Date(auditTime) ? pubTime : auditTime;
  } else {
    lastUsedAt = pubTime || auditTime || (historicalCount > 0 ? new Date().toISOString() : null);
  }

  // 3. Determine reservation state:
  // Only held if an active, UNPUBLISHED post (draft, approved, scheduled) is currently linked to this image
  const draftUsage = await db
    .prepare(
      `SELECT p.id FROM posts p
       JOIN post_images pi ON pi.post_id = p.id AND pi.version_number = p.current_version
       WHERE (pi.curated_image_id = ?
              OR (pi.curated_image_id IS NULL AND (pi.source_id = ? OR (pi.url IS NOT NULL AND pi.url != '' AND (pi.url = ? OR (? != '' AND pi.url = ?))))))
         AND p.status IN ('draft', 'approved', 'scheduled')
       ORDER BY p.updated_at DESC LIMIT 1`,
    )
    .bind(imageId, imageId, curImg.source_url || '', publicUrl, publicUrl)
    .first<{ id: string }>();

  const reservedPostId = draftUsage?.id || null;
  const nowIso = new Date().toISOString();

  await db
    .prepare(
      `UPDATE curated_images
       SET usage_count = ?,
           historical_usage_count = ?,
           last_used_at = ?,
           used_in_post_id = ?,
           reserved_post_id = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(currentCount, historicalCount, lastUsedAt, usedInPostId, reservedPostId, nowIso, imageId)
    .run();
}

/**
 * Recalculates usage statistics and reservation states across all images in the library.
 */
export async function recalculateAllCuratedImageUsages(db: D1Database): Promise<void> {
  const images = await db.prepare('SELECT id FROM curated_images').all<{ id: string }>();
  if (images && images.results) {
    for (const img of images.results) {
      await recalculateCuratedImageUsage(db, img.id);
    }
  }
}

