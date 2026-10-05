import { CONTENT_INVARIANTS } from '../../core/constants.js';
import type { IAuditLogger } from '../../core/audit.js';
import type { IMetaPublisher, MetaPublisherConfigStatus } from '../../publishing/meta-publisher.js';
import type { IMailGatewayClient } from '../mail/mail-service.js';
import { NotificationService } from '../notifications/notification-service.js';
import { PerformanceEngineService } from '../analytics/performance-engine.js';
import { getPublicImageUrl, recalculateCuratedImageUsage } from '../content/image-library-service.js';

export async function validateImageUrl(
  url: string,
  timeoutMs = 5000,
): Promise<{ valid: boolean; error?: string; httpStatus?: number }> {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'Empty image URL' };
  }
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return { valid: false, error: 'Image URL must start with http:// or https://' };
  }

  // Cloudflare Workers cannot fetch their own domain (self-subrequest deadlock).
  // Internal media URLs are verified directly via R2 bucket binding.
  if (trimmed.includes('/media/') || trimmed.includes('ai.northsoft.is')) {
    return { valid: true, httpStatus: 200 };
  }

  const browserHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(trimmed, {
      method: 'HEAD',
      signal: controller.signal,
      headers: browserHeaders,
    });
    clearTimeout(timer);

    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (
        contentType &&
        !contentType.toLowerCase().includes('image/') &&
        !contentType.toLowerCase().includes('octet-stream')
      ) {
        return {
          valid: false,
          httpStatus: response.status,
          error: `Invalid content-type '${contentType}'`,
        };
      }
      return { valid: true, httpStatus: response.status };
    }

    // Fallback: If HEAD fails (e.g. 403, 405, 522, 500), attempt GET with Range header
    const getController = new AbortController();
    const getTimer = setTimeout(() => getController.abort(), timeoutMs);
    const getRes = await fetch(trimmed, {
      method: 'GET',
      signal: getController.signal,
      headers: { ...browserHeaders, Range: 'bytes=0-1024' },
    });
    clearTimeout(getTimer);

    if (getRes.ok || getRes.status === 206 || getRes.status === 304) {
      return { valid: true, httpStatus: getRes.status };
    }

    // HTTP 522 / 524 (Cloudflare origin timeout during worker-to-worker fetch):
    // Permit valid HTTPS URLs so Meta Graph API (which fetches independently) can process the image.
    if (getRes.status === 522 || getRes.status === 524) {
      console.warn(`[validateImageUrl] HTTP ${getRes.status} during origin probe for ${trimmed}. Permitting for Meta API.`);
      return { valid: true, httpStatus: getRes.status };
    }

    return { valid: false, httpStatus: getRes.status, error: `HTTP ${getRes.status}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // If probe fails due to Worker network loop/timeout, permit valid HTTPS URLs
    if (trimmed.startsWith('https://')) {
      console.warn(`[validateImageUrl] Probe exception for ${trimmed}: ${msg}. Permitting valid HTTPS URL for Meta API.`);
      return { valid: true, error: msg };
    }
    return { valid: false, error: `Fetch failed: ${msg}` };
  }
}

export interface PublicationRecord {
  id: string;
  postId: string;
  postVersionId: string;
  scheduleId?: string;
  facebookPostId?: string;
  provider: string;
  status: 'pending' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'blocked';
  attemptCount: number;
  httpStatus?: number;
  errorCode?: string;
  errorMessage?: string;
  idempotencyKey?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  // Included detail joins for UI/API previews
  postTitle?: string;
  postBody?: string;
  qualityGateStatus?: string;
  topicId?: string;
  topicTitle?: string;
}

export interface PublishResult {
  success: boolean;
  publicationId?: string;
  externalPostId?: string;
  publishedAt?: string;
  alreadyPublished?: boolean;
  code?: string;
  message?: string;
  retryable?: boolean;
}

export interface PublicationHealthSummary {
  configStatus: MetaPublisherConfigStatus;
  stats: {
    scheduled: number;
    publishing: number;
    published: number;
    failed: number;
    retryable: number;
    blocked: number;
  };
  lastSuccessfulPublication?: {
    id: string;
    postId: string;
    facebookPostId: string;
    publishedAt: string;
    postTitle?: string;
  } | null;
  lastFailedPublication?: {
    id: string;
    postId: string;
    errorCode: string;
    errorMessage: string;
    httpStatus?: number;
    failedAt: string;
    postTitle?: string;
  } | null;
  lastPublicationAttempt?: {
    id: string;
    postId: string;
    status: string;
    attemptedAt: string;
    postTitle?: string;
  } | null;
}

export class PublicationService {
  constructor(
    private db: D1Database,
    private publisher: IMetaPublisher,
    private auditLogger?: IAuditLogger,
    private mailClient?: IMailGatewayClient | null,
    private imageBucket?: R2Bucket,
  ) {}

  /**
   * Releases a held 'publishing' lock by marking the publication as failed with the real cause.
   * Without this, early exits left the row in 'publishing' until recoverStaleLocks() mislabelled
   * it as STALE_LOCK_TIMEOUT and burned an attempt.
   */
  private async releasePublicationLockAsFailed(publicationId: string, code: string, message: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE publications
         SET status = 'failed', error_code = ?, error_message = ?, updated_at = datetime('now')
         WHERE id = ? AND status = 'publishing'`,
      )
      .bind(code, message.slice(0, 1000), publicationId)
      .run()
      .catch((err) => console.error('[PublicationService] Failed to release publication lock:', err));
  }

  /**
   * Recovers stale publication locks ('publishing' status older than threshold minutes).
   * Prevents crashed Worker instances from permanently blocking future publication attempts.
   */
  public async recoverStaleLocks(thresholdMinutes = 15): Promise<number> {
    try {
      // 1. Recover stale schedule locks in 'publishing' status older than threshold minutes
      await this.db
        .prepare(
          `UPDATE schedules
           SET status = 'pending', updated_at = datetime('now')
           WHERE status = 'publishing'
             AND updated_at <= datetime('now', '-' || ? || ' minutes')`,
        )
        .bind(thresholdMinutes)
        .run()
        .catch(() => {});

      // 2. Recover stale publication records in 'publishing' status older than threshold minutes
      const staleRows = await this.db
        .prepare(
          `SELECT id, post_id, post_version_id, attempt_count
           FROM publications
           WHERE status = 'publishing'
             AND updated_at <= datetime('now', '-' || ? || ' minutes')`,
        )
        .bind(thresholdMinutes)
        .all<{ id: string; post_id: string; post_version_id: string; attempt_count: number }>();

      const staleList = staleRows.results || [];
      if (staleList.length === 0) return 0;

      for (const item of staleList) {
        await this.db
          .prepare(
            `UPDATE publications
             SET status = 'failed', error_code = 'STALE_LOCK_TIMEOUT', error_message = 'Publication lock timed out due to worker interruption.', updated_at = datetime('now')
             WHERE id = ? AND status = 'publishing'`,
          )
          .bind(item.id)
          .run();

        await this.auditLogger?.log({
          eventType: 'PUBLICATION_FAILED',
          entityType: 'publication',
          entityId: item.id,
          actor: 'system',
          details: {
            reason: 'STALE_LOCK_TIMEOUT',
            postId: item.post_id,
            postVersionId: item.post_version_id,
            attemptCount: item.attempt_count,
            staleThresholdMinutes: thresholdMinutes,
          },
        });
      }

      return staleList.length;
    } catch {
      return 0;
    }
  }

  /**
   * Publish an approved post version.
   * Enforces server-side Quality Gate approval, publisher status check, idempotency, retry bounds, and atomic D1 lock.
   */
  public async publishPost(
    postId: string,
    options?: { scheduleId?: string; actor?: 'system' | 'admin' },
  ): Promise<PublishResult> {
    const actor = options?.actor || 'system';

    // 1. Check Publisher Control Plane Readiness State
    const publisherConfig = this.publisher.getConfigStatus();
    if (publisherConfig.state === 'NOT_CONFIGURED') {
      await this.auditLogger?.log({
        eventType: 'PUBLICATION_BLOCKED',
        entityType: 'post',
        entityId: postId,
        actor,
        level: 'WARNING',
        status: 'FAILED',
        error: {
          code: 'META_NOT_CONFIGURED',
          message: publisherConfig.statusMessage,
          stage: 'config_check',
        },
        details: {
          reason: 'META_NOT_CONFIGURED',
          message: publisherConfig.statusMessage,
          scheduleId: options?.scheduleId,
        },
      });

      return {
        success: false,
        code: 'META_NOT_CONFIGURED',
        message: publisherConfig.statusMessage,
        retryable: false,
      };
    }

    if (publisherConfig.state === 'DISABLED') {
      await this.auditLogger?.log({
        eventType: 'PUBLICATION_BLOCKED',
        entityType: 'post',
        entityId: postId,
        actor,
        level: 'WARNING',
        status: 'FAILED',
        error: {
          code: 'META_PUBLISH_DISABLED',
          message: publisherConfig.statusMessage,
          stage: 'config_check',
        },
        details: {
          reason: 'META_PUBLISH_DISABLED',
          message: publisherConfig.statusMessage,
          scheduleId: options?.scheduleId,
        },
      });

      return {
        success: false,
        code: 'META_PUBLISH_DISABLED',
        message: publisherConfig.statusMessage,
        retryable: false,
      };
    }

    // 2. Automatically recover any stale locks before proceeding
    await this.recoverStaleLocks();

    // 3. Fetch Post & active Post Version from D1
    const postRow = await this.db
      .prepare(
        `SELECT p.id, p.title, p.status as post_status,
                pv.id as version_id, pv.content as body, p.status as version_status, pv.version_number,
                (SELECT pi.url FROM post_images pi
                  LEFT JOIN curated_images ci ON ci.id = pi.curated_image_id
                  WHERE pi.post_id = p.id
                    AND pi.version_number = p.current_version
                    AND (p.status = 'published' OR ci.status = 'APPROVED' OR pi.curated_image_id IS NULL)
                    AND (ci.status IS NULL OR ci.status NOT IN ('DELETED', 'REJECTED'))
                  LIMIT 1) as image_url
         FROM posts p
         JOIN post_versions pv ON p.id = pv.post_id AND p.current_version = pv.version_number
         WHERE p.id = ?`,
      )
      .bind(postId)
      .first<{
        id: string;
        title: string;
        post_status: string;
        version_id: string;
        body: string;
        version_status: string;
        version_number: number;
        image_url?: string;
      }>();

    if (!postRow) {
      await this.auditLogger?.log({
        eventType: 'PUBLICATION_FAILED',
        entityType: 'post',
        entityId: postId,
        actor,
        level: 'ERROR',
        status: 'FAILED',
        error: {
          code: 'POST_NOT_FOUND',
          message: `Post ${postId} was not found.`,
          stage: 'post_lookup',
        },
        details: {
          reason: 'POST_NOT_FOUND',
          scheduleId: options?.scheduleId,
        },
      });

      return {
        success: false,
        code: 'POST_NOT_FOUND',
        message: `Post ${postId} was not found.`,
      };
    }

    // 4. CRITICAL SERVER-SIDE QUALITY GATE CHECK
    const isApprovedOrScheduled =
      postRow.version_status === 'approved' ||
      postRow.version_status === 'scheduled' ||
      postRow.post_status === 'approved' ||
      postRow.post_status === 'scheduled' ||
      Boolean(options?.scheduleId);

    if (!isApprovedOrScheduled) {
      await this.auditLogger?.log({
        eventType: 'PUBLICATION_BLOCKED',
        entityType: 'post',
        entityId: postId,
        actor,
        details: {
          reason: 'POST_NOT_APPROVED',
          versionStatus: postRow.version_status,
          postStatus: postRow.post_status,
          versionId: postRow.version_id,
        },
      });

      return {
        success: false,
        code: 'POST_NOT_APPROVED',
        message: `Post version ${postRow.version_id} status is '${postRow.version_status}' (post status '${postRow.post_status}'). Only 'approved' or 'scheduled' posts may be published.`,
      };
    }

    // 5. IDEMPOTENCY CHECK
    const existingPub = await this.db
      .prepare(
        `SELECT id, status, facebook_post_id, published_at
         FROM publications
         WHERE post_id = ? AND post_version_id = ? AND status = 'published'`,
      )
      .bind(postId, postRow.version_id)
      .first<{
        id: string;
        status: string;
        facebook_post_id: string;
        published_at: string;
      }>();

    if (existingPub && existingPub.facebook_post_id) {
      return {
        success: true,
        publicationId: existingPub.id,
        externalPostId: existingPub.facebook_post_id,
        publishedAt: existingPub.published_at,
        alreadyPublished: true,
      };
    }

    // 6. ATOMIC CONCURRENCY LOCK & RETRY LIMIT ENFORCEMENT
    const idempotencyKey = `pub_${postId}_${postRow.version_id}`;
    let publicationId = crypto.randomUUID();

    const pendingPub = await this.db
      .prepare(
        `SELECT id, status, attempt_count, schedule_id FROM publications WHERE idempotency_key = ? OR (post_id = ? AND post_version_id = ?)`,
      )
      .bind(idempotencyKey, postId, postRow.version_id)
      .first<{ id: string; status: string; attempt_count: number; schedule_id: string | null }>();

    // An execution of a pending schedule (options?.scheduleId) or admin publication represents
    // an explicit publishing action. If a previous attempt cycle had exhausted its retry limit
    // (attempt_count >= MAX_PUBLISH_ATTEMPTS) or failed, reset the attempt budget to 0 so the
    // post is not permanently blocked from publishing.
    if (
      pendingPub &&
      pendingPub.status !== 'publishing' &&
      (
        pendingPub.attempt_count >= CONTENT_INVARIANTS.MAX_PUBLISH_ATTEMPTS ||
        (options?.scheduleId && pendingPub.schedule_id !== options.scheduleId) ||
        actor === 'admin'
      )
    ) {
      await this.db
        .prepare(
          `UPDATE publications
           SET attempt_count = 0,
               status = 'pending',
               error_code = NULL,
               error_message = NULL,
               schedule_id = COALESCE(?, schedule_id),
               updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(options?.scheduleId || null, pendingPub.id)
        .run();
      pendingPub.attempt_count = 0;
      pendingPub.status = 'pending';
      if (options?.scheduleId) {
        pendingPub.schedule_id = options.scheduleId;
      }
    }

    if (pendingPub) {
      if (pendingPub.status === 'publishing') {
        return {
          success: false,
          code: 'PUBLICATION_IN_PROGRESS',
          message: 'Publication for this post version is currently in progress.',
        };
      }

      // Check max retries bound for automatic system runs
      if (
        actor === 'system' &&
        pendingPub.attempt_count >= CONTENT_INVARIANTS.MAX_PUBLISH_ATTEMPTS
      ) {
        await this.auditLogger?.log({
          eventType: 'PUBLICATION_BLOCKED',
          entityType: 'publication',
          entityId: pendingPub.id,
          actor,
          details: {
            reason: 'MAX_RETRIES_EXCEEDED',
            attemptCount: pendingPub.attempt_count,
            maxAllowed: CONTENT_INVARIANTS.MAX_PUBLISH_ATTEMPTS,
          },
        });

        return {
          success: false,
          code: 'MAX_RETRIES_EXCEEDED',
          message: `Publication has reached maximum automatic retry limit (${CONTENT_INVARIANTS.MAX_PUBLISH_ATTEMPTS} attempts). Manual intervention required.`,
          retryable: false,
        };
      }

      publicationId = pendingPub.id;

      // Atomic state transition to 'publishing'
      const lockRes = await this.db
        .prepare(
          `UPDATE publications
           SET status = 'publishing', attempt_count = attempt_count + 1, updated_at = datetime('now')
           WHERE id = ? AND status IN ('pending', 'scheduled', 'failed')`,
        )
        .bind(publicationId)
        .run();

      if (!lockRes.meta.changes || lockRes.meta.changes === 0) {
        await this.auditLogger?.log({
          eventType: 'PUBLICATION_BLOCKED',
          entityType: 'publication',
          entityId: publicationId,
          actor,
          level: 'WARNING',
          status: 'DEFERRED',
          error: {
            code: 'PUBLICATION_CONCURRENCY_LOCK_FAILED',
            message: 'Could not acquire publication lock. Publication may be running concurrently.',
            stage: 'lock_acquisition',
          },
          details: {
            reason: 'PUBLICATION_CONCURRENCY_LOCK_FAILED',
            postId,
            scheduleId: options?.scheduleId,
          },
        });

        return {
          success: false,
          code: 'PUBLICATION_CONCURRENCY_LOCK_FAILED',
          message: 'Could not acquire publication lock. Publication may be running concurrently.',
        };
      }
    } else {
      // Insert new publication record in 'publishing' state
      await this.db
        .prepare(
          `INSERT INTO publications (id, post_id, post_version_id, schedule_id, provider, status, attempt_count, idempotency_key, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'facebook', 'publishing', 1, ?, datetime('now'), datetime('now'))`,
        )
        .bind(
          publicationId,
          postId,
          postRow.version_id,
          options?.scheduleId || null,
          idempotencyKey,
        )
        .run();
    }

    await this.auditLogger?.log({
      eventType: 'PUBLICATION_STARTED',
      entityType: 'publication',
      entityId: publicationId,
      actor,
      level: 'INFO',
      status: 'STARTED',
      operation: postRow.title,
      correlationId: publicationId,
      details: {
        postId,
        postVersionId: postRow.version_id,
        idempotencyKey,
      },
    });

    try {
      return await this.executeLockedPublication(postId, postRow, publicationId, idempotencyKey, actor, options);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.releasePublicationLockAsFailed(publicationId, 'PUBLISH_EXCEPTION', message);
      await this.auditLogger?.log({
        eventType: 'PUBLICATION_FAILED',
        entityType: 'publication',
        entityId: publicationId,
        actor,
        level: 'ERROR',
        status: 'FAILED',
        operation: postRow.title,
        correlationId: publicationId,
        error: {
          code: 'PUBLISH_EXCEPTION',
          message,
          stage: 'executeLockedPublication',
        },
        details: {
          postId,
          postVersionId: postRow.version_id,
          error: message,
        },
      });
      throw err;
    }
  }

  /**
   * Runs the part of the publication that happens while the 'publishing' lock is held.
   * Every non-success exit must release the lock.
   */
  private async executeLockedPublication(
    postId: string,
    postRow: { title: string; version_id: string; body: string; version_number: number; image_url?: string },
    publicationId: string,
    idempotencyKey: string,
    actor: 'system' | 'admin',
    options?: { scheduleId?: string; actor?: 'system' | 'admin' },
  ): Promise<PublishResult> {
    // 7. INVOKE META PUBLISHER (0 AI calls, exact approved post content)
    // 6.5. PUBLISHING SAFETY CHECK: Ensure image belongs to approved library and is valid
    const piRow = await this.db
      .prepare(
        `SELECT pi.curated_image_id, ci.status
         FROM post_images pi
         LEFT JOIN curated_images ci ON ci.id = pi.curated_image_id
         WHERE pi.post_id = ? AND pi.version_number = ?`,
      )
      .bind(postId, postRow.version_number)
      .first<{ curated_image_id: string | null; status: string | null }>();

    if (piRow && piRow.curated_image_id) {
      if (!piRow.status || piRow.status !== 'APPROVED') {
        const imageStatus = piRow.status || 'DELETED';
        await this.auditLogger?.log({
          eventType: 'PUBLICATION_BLOCKED',
          entityType: 'post',
          entityId: postId,
          actor,
          details: { reason: 'IMAGE_NOT_APPROVED', imageStatus },
        });
        await this.releasePublicationLockAsFailed(
          publicationId,
          'IMAGE_NOT_APPROVED',
          `Image attached to post has status '${imageStatus}'.`,
        );

        return {
          success: false,
          code: 'IMAGE_NOT_APPROVED',
          message: `Publication blocked: Image attached to post ${postId} has status '${imageStatus}'. Only APPROVED images can be published to Facebook.`,
          retryable: false,
        };
      }
    }

    const canonicalImageUrl = postRow.image_url ? getPublicImageUrl(postRow.image_url) : undefined;

    // 6.6. MEDIA ACCESSIBILITY PRE-VALIDATION: Confirm image URL returns HTTP 200 before calling Meta API
    if (canonicalImageUrl) {
      let isMediaValid: boolean;
      let mediaError: string | undefined;
      let mediaHttpStatus: number | undefined;

      // Fast-path for internal R2 media URLs: check R2 bucket directly to avoid Worker self-subrequest deadlocks
      const mediaMatch = canonicalImageUrl.match(/\/media\/([^/?#]+)/i);
      const mediaKey = mediaMatch?.[1] ? decodeURIComponent(mediaMatch[1]) : undefined;
      if (mediaKey && this.imageBucket) {
        const r2Obj = (await this.imageBucket.head(`images/${mediaKey}`)) || (await this.imageBucket.head(mediaKey));
        if (!r2Obj) {
          isMediaValid = false;
          mediaError = `Object 'images/${mediaKey}' not found in R2 storage.`;
          mediaHttpStatus = 404;
        } else {
          isMediaValid = true;
          mediaHttpStatus = 200;
        }
      } else {
        const mediaVal = await validateImageUrl(canonicalImageUrl).catch(() => ({
          valid: true,
          error: undefined,
          httpStatus: undefined,
        }));
        isMediaValid = mediaVal.valid;
        mediaError = mediaVal.error;
        mediaHttpStatus = mediaVal.httpStatus;
      }

      if (!isMediaValid) {
        await this.auditLogger?.log({
          eventType: 'PUBLICATION_BLOCKED',
          entityType: 'post',
          entityId: postId,
          actor,
          details: {
            reason: 'IMAGE_NOT_ACCESSIBLE',
            imageUrl: canonicalImageUrl,
            httpStatus: mediaHttpStatus,
            error: mediaError,
          },
        });
        await this.releasePublicationLockAsFailed(
          publicationId,
          'IMAGE_NOT_ACCESSIBLE',
          `Image URL '${canonicalImageUrl}' is not accessible (${mediaError}).`,
        );

        return {
          success: false,
          code: 'IMAGE_NOT_ACCESSIBLE',
          message: `Publication blocked: Image URL '${canonicalImageUrl}' is not accessible or invalid (${mediaError}).`,
          retryable: false,
        };
      }
    }

    const pubResult = await this.publisher.publish({
      postId,
      postVersionId: postRow.version_id,
      message: postRow.body,
      idempotencyKey,
      imageUrl: canonicalImageUrl,
    });

    // 8. HANDLE PUBLISH RESULT
    if (pubResult.success) {
      const publishedAt = pubResult.publishedAt || new Date().toISOString();

      await this.db
        .prepare(
          `UPDATE publications
           SET status = 'published', facebook_post_id = ?, published_at = ?, http_status = 200, error_code = NULL, error_message = NULL, updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(pubResult.externalPostId, publishedAt, publicationId)
        .run();

      // Mark curated image as permanently consumed/published
      const postImgRow = await this.db
        .prepare(
          `SELECT pi.curated_image_id FROM post_images pi
           JOIN posts p ON p.id = pi.post_id AND p.current_version = pi.version_number
           WHERE pi.post_id = ? AND pi.curated_image_id IS NOT NULL
           LIMIT 1`,
        )
        .bind(postId)
        .first<{ curated_image_id?: string }>();

      if (postImgRow?.curated_image_id) {
        const { ImageLibraryService } = await import('../content/image-library-service');
        const imgLib = new ImageLibraryService(this.db, this.auditLogger);
        await imgLib.markImageAsPublished(postImgRow.curated_image_id, postId).catch((err) => {
          console.warn('[PublicationService] Failed to mark curated image as published:', err);
        });
      }

      // Update post status to published
      await this.db
        .prepare(`UPDATE posts SET status = 'published', updated_at = datetime('now') WHERE id = ?`)
        .bind(postId)
        .run();

      // Update linked topic status to published
      await this.db
        .prepare(`UPDATE content_ideas SET status = 'published', updated_at = datetime('now') WHERE id = (SELECT idea_id FROM posts WHERE id = ?)`)
        .bind(postId)
        .run();

      // Update schedule status if linked
      if (options?.scheduleId) {
        await this.db
          .prepare(
            `UPDATE schedules SET status = 'published', updated_at = datetime('now') WHERE id = ?`,
          )
          .bind(options.scheduleId)
          .run();
      }

      await this.auditLogger?.log({
        eventType: 'PUBLICATION_SUCCEEDED',
        entityType: 'publication',
        entityId: publicationId,
        actor,
        level: 'SUCCESS',
        status: 'COMPLETED',
        operation: postRow.title,
        correlationId: publicationId,
        details: {
          postId,
          postVersionId: postRow.version_id,
          facebookPostId: pubResult.externalPostId,
          publishedAt,
        },
      });

      if (this.mailClient) {
        try {
          await NotificationService.sendPublicationSuccessNotification(this.db, this.mailClient, {
            postId,
            title: postRow.title,
            body: postRow.body,
            publishedAt,
            facebookPostId: pubResult.externalPostId,
            imageUrl: postRow.image_url,
          });
        } catch (err) {
          console.error('[PublicationService] Failed to send publication success email notification:', err);
        }
      }

      return {
        success: true,
        publicationId,
        externalPostId: pubResult.externalPostId,
        publishedAt,
      };
    }

    // Handle failure
    const isRetryable = pubResult.retryable === true;
    const finalStatus = 'failed';

    await this.db
      .prepare(
        `UPDATE publications
         SET status = ?, http_status = ?, error_code = ?, error_message = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(
        finalStatus,
        pubResult.httpStatus || null,
        pubResult.errorCode || pubResult.errorCategory || 'UNKNOWN_ERROR',
        pubResult.errorMessage || 'Facebook publish failed',
        publicationId,
      )
      .run();

    await this.auditLogger?.log({
      eventType: isRetryable ? 'PUBLICATION_RETRY' : 'PUBLICATION_FAILED',
      entityType: 'publication',
      entityId: publicationId,
      actor,
      level: isRetryable ? 'WARNING' : 'ERROR',
      status: isRetryable ? 'DEFERRED' : 'FAILED',
      operation: postRow.title,
      correlationId: publicationId,
      error: {
        code: pubResult.errorCode || pubResult.errorCategory || 'PUBLISH_FAILED',
        message: pubResult.errorMessage || 'Facebook publication failed',
        stage: 'Meta Graph API',
        httpStatus: pubResult.httpStatus || undefined,
      },
      details: {
        postId,
        postVersionId: postRow.version_id,
        errorCode: pubResult.errorCode,
        errorCategory: pubResult.errorCategory,
        errorMessage: pubResult.errorMessage,
        retryable: isRetryable,
      },
    });

    if (this.mailClient) {
      try {
        await NotificationService.sendPublicationErrorNotification(this.db, this.mailClient, {
          postId,
          title: postRow.title,
          action: 'Facebook Publication',
          errorMessage: pubResult.errorMessage || 'Facebook publish failed',
          suggestedAction: isRetryable
            ? 'Check Meta API status and retry publication.'
            : 'Inspect post content or Meta configuration.',
        });
      } catch (err) {
        console.error('[PublicationService] Failed to send publication error email notification:', err);
      }
    }

    return {
      success: false,
      publicationId,
      code: pubResult.errorCode || 'PUBLISH_FAILED',
      message: pubResult.errorMessage || 'Facebook publication failed',
      retryable: isRetryable,
    };
  }

  /**
   * Process and publish all scheduled posts that are due for publication.
   * If publisher is disabled or not configured, skips gracefully without loops or failing records.
   */
  public async publishScheduledDuePosts(): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    skippedReason?: string;
  }> {
    const publisherConfig = this.publisher.getConfigStatus();
    if (publisherConfig.state === 'DISABLED' || publisherConfig.state === 'NOT_CONFIGURED') {
      try {
        const dueCountRes = await this.db
          .prepare(
            `SELECT COUNT(*) as cnt
             FROM schedules s
             JOIN posts p ON s.post_id = p.id
             WHERE s.status = 'pending'
               AND datetime(s.scheduled_at) <= datetime('now')
               AND p.status IN ('approved', 'scheduled')`,
          )
          .first<{ cnt: number }>();

        if (dueCountRes && dueCountRes.cnt > 0) {
          await this.auditLogger?.log({
            eventType: 'PUBLICATION_SKIPPED',
            entityType: 'schedule',
            entityId: 'due_queue',
            actor: 'system',
            level: 'WARNING',
            status: 'DEFERRED',
            details: {
              reason: publisherConfig.state,
              statusMessage: publisherConfig.statusMessage,
              dueCount: dueCountRes.cnt,
            },
          });
        }
      } catch {
        // Observability check is best-effort
      }

      return {
        processed: 0,
        succeeded: 0,
        failed: 0,
        skippedReason: publisherConfig.state,
      };
    }

    // Clear stale locks before processing queue
    await this.recoverStaleLocks();

    const dueSchedules = await this.db
      .prepare(
        `SELECT s.id as schedule_id, s.post_id
         FROM schedules s
         JOIN posts p ON s.post_id = p.id
         JOIN post_versions pv ON p.id = pv.post_id AND p.current_version = pv.version_number
         WHERE s.status = 'pending'
           AND datetime(s.scheduled_at) <= datetime('now')
           AND p.status IN ('approved', 'scheduled')`,
      )
      .all<{ schedule_id: string; post_id: string }>();

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const item of dueSchedules.results || []) {
      // Atomic schedule claim to prevent concurrent executions
      const claimRes = await this.db
        .prepare(
          `UPDATE schedules SET status = 'publishing', updated_at = datetime('now') WHERE id = ? AND status = 'pending'`,
        )
        .bind(item.schedule_id)
        .run();

      if (!claimRes.meta.changes || claimRes.meta.changes === 0) {
        continue;
      }

      processed++;
      try {
        const result = await this.publishPost(item.post_id, {
          scheduleId: item.schedule_id,
          actor: 'system',
        });

        if (result.success) {
          succeeded++;
        } else {
          failed++;
          if (!result.retryable) {
            await this.auditLogger?.log({
              eventType: 'PUBLICATION_FAILED',
              entityType: 'schedule',
              entityId: item.schedule_id,
              actor: 'system',
              level: 'ERROR',
              status: 'FAILED',
              error: {
                code: result.code || 'SCHEDULED_PUBLICATION_FAILED',
                message: result.message || 'Scheduled publication failed non-retryable',
                stage: 'publishScheduledDuePosts',
              },
              details: {
                scheduleId: item.schedule_id,
                postId: item.post_id,
                errorCode: result.code,
                errorMessage: result.message,
              },
            });
            await this.db
              .prepare(`UPDATE schedules SET status = 'failed', updated_at = datetime('now') WHERE id = ?`)
              .bind(item.schedule_id)
              .run();
          } else {
            await this.auditLogger?.log({
              eventType: 'PUBLICATION_RETRY',
              entityType: 'schedule',
              entityId: item.schedule_id,
              actor: 'system',
              level: 'WARNING',
              status: 'DEFERRED',
              error: {
                code: result.code || 'SCHEDULED_PUBLICATION_RETRYABLE',
                message: result.message || 'Scheduled publication encountered retryable error, reset to pending',
                stage: 'publishScheduledDuePosts',
              },
              details: {
                scheduleId: item.schedule_id,
                postId: item.post_id,
                errorCode: result.code,
                errorMessage: result.message,
              },
            });
            await this.db
              .prepare(`UPDATE schedules SET status = 'pending', updated_at = datetime('now') WHERE id = ?`)
              .bind(item.schedule_id)
              .run();
          }
        }
      } catch (err: unknown) {
        failed++;
        const errMsg = err instanceof Error ? err.message : String(err);
        await this.auditLogger?.log({
          eventType: 'PUBLICATION_FAILED',
          entityType: 'schedule',
          entityId: item.schedule_id,
          actor: 'system',
          level: 'ERROR',
          status: 'FAILED',
          error: {
            code: 'SCHEDULED_PUBLICATION_EXCEPTION',
            message: errMsg,
            stage: 'publishScheduledDuePosts',
          },
        });
        await this.db
          .prepare(`UPDATE schedules SET status = 'failed', updated_at = datetime('now') WHERE id = ?`)
          .bind(item.schedule_id)
          .run();
      }
    }

    return { processed, succeeded, failed };
  }

  /**
   * Query full publication health summary including stats, 4-tier state, and recent health indicators.
   */
  public async getPublicationHealth(): Promise<PublicationHealthSummary> {
    const configStatus = this.publisher.getConfigStatus();

    // Stats
    const statsRes = await this.db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM schedules WHERE status = 'pending') as scheduled,
           (SELECT COUNT(*) FROM publications WHERE status = 'publishing') as publishing,
           (SELECT COUNT(*) FROM publications WHERE status = 'published') as published,
           (SELECT COUNT(*) FROM publications WHERE status = 'failed') as failed,
           (SELECT COUNT(*) FROM publications WHERE status = 'failed' AND (http_status IN (429, 500, 502, 503, 504) OR error_code IN ('RATE_LIMITED', 'REMOTE_SERVER_ERROR', 'NETWORK_ERROR'))) as retryable,
           (SELECT COUNT(*) FROM publications WHERE status = 'blocked') as blocked`,
      )
      .first<{
        scheduled: number;
        publishing: number;
        published: number;
        failed: number;
        retryable: number;
        blocked: number;
      }>();

    const stats = {
      scheduled: statsRes?.scheduled || 0,
      publishing: statsRes?.publishing || 0,
      published: statsRes?.published || 0,
      failed: statsRes?.failed || 0,
      retryable: statsRes?.retryable || 0,
      blocked: statsRes?.blocked || 0,
    };

    // Last Successful Publication
    const lastSuccessRow = await this.db
      .prepare(
        `SELECT pub.id, pub.post_id, pub.facebook_post_id, pub.published_at, p.title
         FROM publications pub
         JOIN posts p ON pub.post_id = p.id
         WHERE pub.status = 'published'
         ORDER BY pub.published_at DESC
         LIMIT 1`,
      )
      .first<{
        id: string;
        post_id: string;
        facebook_post_id: string;
        published_at: string;
        title?: string;
      }>();

    // Last Failed Publication
    const lastFailedRow = await this.db
      .prepare(
        `SELECT pub.id, pub.post_id, pub.error_code, pub.error_message, pub.http_status, pub.updated_at, p.title
         FROM publications pub
         JOIN posts p ON pub.post_id = p.id
         WHERE pub.status = 'failed'
         ORDER BY pub.updated_at DESC
         LIMIT 1`,
      )
      .first<{
        id: string;
        post_id: string;
        error_code: string;
        error_message: string;
        http_status?: number;
        updated_at: string;
        title?: string;
      }>();

    // Last Publication Attempt
    const lastAttemptRow = await this.db
      .prepare(
        `SELECT pub.id, pub.post_id, pub.status, pub.updated_at, p.title
         FROM publications pub
         JOIN posts p ON pub.post_id = p.id
         ORDER BY pub.updated_at DESC
         LIMIT 1`,
      )
      .first<{
        id: string;
        post_id: string;
        status: string;
        updated_at: string;
        title?: string;
      }>();

    return {
      configStatus,
      stats,
      lastSuccessfulPublication: lastSuccessRow
        ? {
            id: lastSuccessRow.id,
            postId: lastSuccessRow.post_id,
            facebookPostId: lastSuccessRow.facebook_post_id,
            publishedAt: lastSuccessRow.published_at,
            postTitle: lastSuccessRow.title,
          }
        : null,
      lastFailedPublication: lastFailedRow
        ? {
            id: lastFailedRow.id,
            postId: lastFailedRow.post_id,
            errorCode: lastFailedRow.error_code,
            errorMessage: lastFailedRow.error_message,
            httpStatus: lastFailedRow.http_status,
            failedAt: lastFailedRow.updated_at,
            postTitle: lastFailedRow.title,
          }
        : null,
      lastPublicationAttempt: lastAttemptRow
        ? {
            id: lastAttemptRow.id,
            postId: lastAttemptRow.post_id,
            status: lastAttemptRow.status,
            attemptedAt: lastAttemptRow.updated_at,
            postTitle: lastAttemptRow.title,
          }
        : null,
    };
  }

  /**
   * Query publication records for admin interface.
   */
  public async getPublications(limit = 20, offset = 0): Promise<PublicationRecord[]> {
    const rows = await this.db
      .prepare(
        `SELECT pub.id, pub.post_id, pub.post_version_id, pub.schedule_id,
                pub.facebook_post_id, pub.provider, pub.status, pub.attempt_count,
                pub.http_status, pub.error_code, pub.error_message, pub.idempotency_key,
                pub.published_at, pub.created_at, pub.updated_at,
                p.title as post_title, pv.content as post_body, p.status as quality_gate_status,
                p.idea_id as topic_id, ci.title as topic_title
         FROM publications pub
         JOIN posts p ON pub.post_id = p.id
         LEFT JOIN post_versions pv ON pub.post_version_id = pv.id
         LEFT JOIN content_ideas ci ON p.idea_id = ci.id
         ORDER BY pub.created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(limit, offset)
      .all<{
        id: string;
        post_id: string;
        post_version_id: string;
        schedule_id?: string;
        facebook_post_id?: string;
        provider: string;
        status: PublicationRecord['status'];
        attempt_count: number;
        http_status?: number;
        error_code?: string;
        error_message?: string;
        idempotency_key?: string;
        published_at?: string;
        created_at: string;
        updated_at: string;
        post_title?: string;
        post_body?: string;
        quality_gate_status?: string;
        topic_id?: string;
        topic_title?: string;
      }>();

    return (rows.results || []).map((r) => ({
      id: r.id,
      postId: r.post_id,
      postVersionId: r.post_version_id,
      scheduleId: r.schedule_id,
      facebookPostId: r.facebook_post_id,
      provider: r.provider,
      status: r.status,
      attemptCount: r.attempt_count,
      httpStatus: r.http_status,
      errorCode: r.error_code,
      errorMessage: r.error_message,
      idempotencyKey: r.idempotency_key,
      publishedAt: r.published_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      postTitle: r.post_title,
      postBody: r.post_body,
      qualityGateStatus: r.quality_gate_status,
      topicId: r.topic_id,
      topicTitle: r.topic_title,
    }));
  }

  /**
   * Get publication details by ID.
   */
  public async getPublicationById(id: string): Promise<PublicationRecord | null> {
    const r = await this.db
      .prepare(
        `SELECT pub.id, pub.post_id, pub.post_version_id, pub.schedule_id,
                pub.facebook_post_id, pub.provider, pub.status, pub.attempt_count,
                pub.http_status, pub.error_code, pub.error_message, pub.idempotency_key,
                pub.published_at, pub.created_at, pub.updated_at,
                p.title as post_title, pv.content as post_body, p.status as quality_gate_status,
                p.idea_id as topic_id, ci.title as topic_title
         FROM publications pub
         JOIN posts p ON pub.post_id = p.id
         LEFT JOIN post_versions pv ON pub.post_version_id = pv.id
         LEFT JOIN content_ideas ci ON p.idea_id = ci.id
         WHERE pub.id = ?`,
      )
      .bind(id)
      .first<{
        id: string;
        post_id: string;
        post_version_id: string;
        schedule_id?: string;
        facebook_post_id?: string;
        provider: string;
        status: PublicationRecord['status'];
        attempt_count: number;
        http_status?: number;
        error_code?: string;
        error_message?: string;
        idempotency_key?: string;
        published_at?: string;
        created_at: string;
        updated_at: string;
        post_title?: string;
        post_body?: string;
        quality_gate_status?: string;
        topic_id?: string;
        topic_title?: string;
      }>();

    if (!r) return null;

    return {
      id: r.id,
      postId: r.post_id,
      postVersionId: r.post_version_id,
      scheduleId: r.schedule_id,
      facebookPostId: r.facebook_post_id,
      provider: r.provider,
      status: r.status,
      attemptCount: r.attempt_count,
      httpStatus: r.http_status,
      errorCode: r.error_code,
      errorMessage: r.error_message,
      idempotencyKey: r.idempotency_key,
      publishedAt: r.published_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      postTitle: r.post_title,
      postBody: r.post_body,
      qualityGateStatus: r.quality_gate_status,
      topicId: r.topic_id,
      topicTitle: r.topic_title,
    };
  }

  /**
   * Simple deterministic content hash helper to detect changes without false positives.
   */
  public hashContent(text: string): string {
    const str = (text || '').trim().replace(/\r?\n/g, '\n');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(36);
  }

  /**
   * Facebook -> System Sync:
   * Periodically checks published Facebook posts to pull external edits into system.
   */
  public async syncFacebookPostsToSystem(): Promise<{ checked: number; updated: number; imported: number; conflicts: number; errors: number }> {
    let checked = 0;
    let updated = 0;
    let imported = 0;
    let conflicts = 0;
    let errors = 0;

    try {
      const pubRows = await this.db
        .prepare(
          `SELECT pub.id as publication_id, pub.post_id, pub.post_version_id, pub.facebook_post_id,
                  pub.sync_status as pub_sync_status, pub.fb_content_hash, pub.pushed_content_hash,
                  pub.fb_image_url, pub.pushed_image_url,
                  p.current_version, p.sync_status as post_sync_status, pv.content as local_content,
                  pi.url as local_image_url, pi.curated_image_id as local_curated_image_id
           FROM publications pub
           JOIN posts p ON pub.post_id = p.id
           JOIN post_versions pv ON p.id = pv.post_id AND p.current_version = pv.version_number
           LEFT JOIN post_images pi ON pi.post_id = p.id AND pi.version_number = p.current_version
           WHERE pub.status = 'published' AND pub.facebook_post_id IS NOT NULL AND pub.facebook_post_id != '' AND pub.fb_deleted_at IS NULL`,
        )
        .all<{
          publication_id: string;
          post_id: string;
          post_version_id: string;
          facebook_post_id: string;
          pub_sync_status: string;
          fb_content_hash?: string;
          pushed_content_hash?: string;
          fb_image_url?: string | null;
          pushed_image_url?: string | null;
          current_version: number;
          post_sync_status: string;
          local_content: string;
          local_image_url?: string | null;
          local_curated_image_id?: string | null;
        }>();

      const items = pubRows.results || [];
      const nowIso = new Date().toISOString();

      for (const item of items) {
        checked++;
        const res = await this.publisher.getPost(item.facebook_post_id);

        if (!res.success || !res.post) {
          if (res.httpStatus === 404) {
            // Deleted on FB
            await this.db
              .prepare(`UPDATE publications SET sync_status = 'SYNC_FAILED', fb_deleted_at = ?, fb_last_check_at = ? WHERE id = ?`)
              .bind(nowIso, nowIso, item.publication_id)
              .run();
          } else {
            errors++;
          }
          continue;
        }

        const fbMsg = (res.post.message || '').trim();
        await this.db.prepare('UPDATE publications SET fb_is_hidden = ?, fb_deleted_at = NULL WHERE id = ?')
          .bind(res.post.isHidden ? 1 : 0, item.publication_id).run();

        // Record metrics snapshot into post_performance_metrics table
        if (res.post.views != null || res.post.reactions != null || res.post.comments != null || res.post.shares != null) {
          try {
            const engine = new PerformanceEngineService();
            await engine.recordMetricSnapshot(this.db, {
              postId: item.post_id,
              publicationId: item.publication_id,
              facebookPostId: item.facebook_post_id,
              views: res.post.views ?? undefined,
              uniqueViews: res.post.uniqueViews ?? undefined,
              reactions: res.post.reactions ?? 0,
              comments: res.post.comments ?? 0,
              shares: res.post.shares ?? 0,
              clicks: res.post.clicks ?? 0,
              measuredAt: nowIso,
            });
          } catch (mErr) {
            console.warn('[PublicationService] Failed to record performance metric snapshot during sync:', mErr);
          }
        }

        const fbHash = this.hashContent(fbMsg);
        const localHash = this.hashContent(item.local_content);

        // Backfill photos from Facebook only for posts created before local image storage existed.
        // NEVER replace an image explicitly selected or linked in the app.
        if (res.post.fullPicture && !item.local_image_url) {
          await this.db.prepare(
            `INSERT OR IGNORE INTO post_images (id, post_id, version_number, url, alt_text, source_url, author, license, verification_status, visual_verification_status, created_at)
             VALUES (?, ?, ?, ?, 'Facebook post image', ?, 'Facebook Page', 'Facebook media', 'facebook_imported', 'not_checked', ?)`
          ).bind(
            crypto.randomUUID(), item.post_id, item.current_version, res.post.fullPicture,
            res.post.permalinkUrl || res.post.fullPicture, nowIso,
          ).run();
        }

        // Always update Facebook CDN URL tracking on publications table without modifying local post_images curated asset
        await this.db.prepare('UPDATE publications SET fb_image_url = ?, pushed_image_url = COALESCE(pushed_image_url, ?) WHERE id = ?')
          .bind(res.post.fullPicture || null, item.local_image_url || res.post.fullPicture || null, item.publication_id).run();

        if (item.local_curated_image_id) {
          await recalculateCuratedImageUsage(this.db, item.local_curated_image_id);
        }

        // Case 1: FB message matches local content or matches pushed content hash -> SYNCED (No-op)
        if (fbHash === localHash || (item.pushed_content_hash && fbHash === item.pushed_content_hash)) {
          await this.db
            .prepare(
              `UPDATE publications SET fb_last_check_at = ?, fb_last_sync_at = ?, sync_status = 'SYNCED', fb_content_hash = ? WHERE id = ?`,
            )
            .bind(nowIso, nowIso, fbHash, item.publication_id)
            .run();

          await this.db
            .prepare(`UPDATE posts SET sync_status = 'SYNCED', last_synced_at = ? WHERE id = ?`)
            .bind(nowIso, item.post_id)
            .run();

          continue;
        }

        // Case 2: FB message differs from local content.
        // Check if local post was edited locally since last sync (LOCAL_AHEAD or CONFLICT)
        if (item.post_sync_status === 'LOCAL_AHEAD') {
          // CONFLICT: both local and FB edited independently!
          conflicts++;
          await this.db
            .prepare(`UPDATE publications SET sync_status = 'CONFLICT', fb_last_check_at = ?, fb_content_hash = ? WHERE id = ?`)
            .bind(nowIso, fbHash, item.publication_id)
            .run();

          await this.db
            .prepare(`UPDATE posts SET sync_status = 'CONFLICT' WHERE id = ?`)
            .bind(item.post_id)
            .run();

          if (this.auditLogger) {
            await this.auditLogger.log({
              eventType: 'ADMIN_ACTION',
              entityType: 'post',
              entityId: item.post_id,
              actor: 'system',
              details: { action: 'sync_conflict_detected', facebookPostId: item.facebook_post_id },
            });
          }
          continue;
        }

        // Case 3: FB message changed externally on FB -> System updates local version to match FB!
        const newVersionNumber = item.current_version + 1;
        const versionId = crypto.randomUUID();

        await this.db.batch([
          this.db
            .prepare(
              `INSERT INTO post_versions (id, post_id, version_number, content, content_type, metadata, ai_model, ai_provider, created_at)
               VALUES (?, ?, ?, ?, 'text', ?, 'facebook-graph-api', 'facebook', ?)`,
            )
            .bind(
              versionId,
              item.post_id,
              newVersionNumber,
              fbMsg,
              JSON.stringify({ sync_source: 'facebook', updated_at: nowIso }),
              nowIso,
            ),
          this.db
            .prepare(
              `UPDATE posts SET current_version = ?, sync_status = 'SYNCED', last_synced_at = ?, updated_at = ? WHERE id = ?`,
            )
            .bind(newVersionNumber, nowIso, nowIso, item.post_id),
          this.db
            .prepare(
              `UPDATE publications SET fb_last_check_at = ?, fb_last_sync_at = ?, sync_status = 'SYNCED', fb_content_hash = ?, sync_source = 'facebook' WHERE id = ?`,
            )
            .bind(nowIso, nowIso, fbHash, item.publication_id),
          ...(res.post.fullPicture && !item.local_image_url ? [
            this.db.prepare(
              `INSERT OR IGNORE INTO post_images (id, post_id, version_number, url, alt_text, source_url, author, license, verification_status, visual_verification_status, created_at)
               VALUES (?, ?, ?, ?, 'Facebook post image', ?, 'Facebook Page', 'Facebook media', 'facebook_imported', 'not_checked', ?)`
            ).bind(crypto.randomUUID(), item.post_id, newVersionNumber, res.post.fullPicture, res.post.permalinkUrl || res.post.fullPicture, nowIso),
          ] : []),
        ]);

        await this.db.prepare(
          `INSERT INTO post_images (id, post_id, version_number, url, alt_text, created_at, source_url, source_id, author, author_url,
            license, license_url, verified_at, verification_status, visual_verification_status, visual_verification_reason, visual_verification_confidence)
           SELECT ?, post_id, ?, url, alt_text, created_at, source_url, source_id, author, author_url,
            license, license_url, verified_at, verification_status, visual_verification_status, visual_verification_reason, visual_verification_confidence
           FROM post_images WHERE post_id = ? AND version_number = ? LIMIT 1`,
        ).bind(crypto.randomUUID(), newVersionNumber, item.post_id, item.current_version).run();

        updated++;

        if (this.auditLogger) {
          await this.auditLogger.log({
            eventType: 'ADMIN_ACTION',
            entityType: 'post',
            entityId: item.post_id,
            actor: 'system',
            details: { action: 'facebook_to_system_sync', versionNumber: newVersionNumber, facebookPostId: item.facebook_post_id },
          });
        }
      }

      // Import recent Facebook Page posts that were created outside this application.
      // The external Facebook ID is the stable deduplication key.
      let after: string | undefined;
      for (let page = 0; page < 5; page++) {
        const feed = await this.publisher.fetchPagePosts(100, after);
        if (!feed.success) {
          errors++;
          break;
        }
        for (const fbPost of feed.posts) {
          const content = (fbPost.message || '').trim();
          if (!fbPost.id || !content) continue;
          const existing = await this.db.prepare('SELECT id FROM publications WHERE facebook_post_id = ? AND fb_deleted_at IS NULL LIMIT 1')
            .bind(fbPost.id).first<{ id: string }>();
          if (existing) continue;

          const postId = crypto.randomUUID();
          const versionId = crypto.randomUUID();
          const publicationId = crypto.randomUUID();
          const createdAt = fbPost.createdTime || nowIso;
          const hash = this.hashContent(content);
          await this.db.batch([
            this.db.prepare(
              `INSERT INTO posts (id, title, status, current_version, quality_decision, sync_status, last_synced_at, created_at, updated_at)
               VALUES (?, 'Imported Facebook post', 'published', 1, 'IMPORTED', 'SYNCED', ?, ?, ?)`
            ).bind(postId, nowIso, createdAt, nowIso),
            this.db.prepare(
              `INSERT INTO post_versions (id, post_id, version_number, content, content_type, metadata, ai_model, ai_provider, created_at)
               VALUES (?, ?, 1, ?, 'text', ?, 'facebook-graph-api', 'facebook', ?)`
            ).bind(versionId, postId, content, JSON.stringify({ sync_source: 'facebook_import', facebook_post_id: fbPost.id }), createdAt),
            this.db.prepare(
              `INSERT INTO publications (id, post_id, post_version_id, facebook_post_id, provider, status, attempt_count,
                 published_at, fb_last_check_at, fb_last_sync_at, sync_status, fb_content_hash, pushed_content_hash, sync_source,
                 fb_image_url, pushed_image_url, fb_is_hidden, created_at, updated_at)
               VALUES (?, ?, ?, ?, 'facebook', 'published', 1, ?, ?, ?, 'SYNCED', ?, ?, 'facebook', ?, ?, ?, ?, ?)`
            ).bind(publicationId, postId, versionId, fbPost.id, createdAt, nowIso, nowIso, hash, hash,
              fbPost.fullPicture || null, fbPost.fullPicture || null, fbPost.isHidden ? 1 : 0, nowIso, nowIso),
            ...(fbPost.fullPicture ? [this.db.prepare(
              `INSERT INTO post_images (id, post_id, version_number, url, alt_text, source_url, author, license, verification_status, visual_verification_status, created_at)
               VALUES (?, ?, 1, ?, 'Facebook post image', ?, 'Facebook Page', 'Facebook media', 'facebook_imported', 'not_checked', ?)`
            ).bind(crypto.randomUUID(), postId, fbPost.fullPicture, fbPost.permalinkUrl || fbPost.fullPicture, createdAt)] : []),
          ]);
          imported++;
        }
        after = feed.paging?.after;
        if (!after || feed.posts.length < 100) break;
      }

      return { checked, updated, imported, conflicts, errors };
    } catch {
      return { checked, updated, imported, conflicts, errors: errors + 1 };
    }
  }

  /**
   * System -> Facebook Sync:
   * When user edits an already published post locally, push change to Facebook via Graph API.
   * If Facebook was modified externally, flag CONFLICT instead of overwriting FB automatically.
   */
  public async updatePublishedPostFromSystem(
    postId: string,
    newContent: string,
    actor: 'system' | 'admin' | 'ai' = 'admin',
  ): Promise<{ success: boolean; conflict?: boolean; error?: string; fbContent?: string }> {
    const nowIso = new Date().toISOString();
    const newHash = this.hashContent(newContent);

    // Fetch publication & current local version
    const pub = await this.db
      .prepare(
        `SELECT pub.id as publication_id, pub.facebook_post_id, pub.fb_content_hash, pub.pushed_content_hash,
                p.current_version, pv.content as current_local_content
         FROM publications pub
         JOIN posts p ON pub.post_id = p.id
         JOIN post_versions pv ON p.id = pv.post_id AND p.current_version = pv.version_number
         WHERE pub.post_id = ? AND pub.status = 'published'`,
      )
      .bind(postId)
      .first<{
        publication_id: string;
        facebook_post_id: string;
        fb_content_hash?: string;
        pushed_content_hash?: string;
        current_version: number;
        current_local_content: string;
      }>();

    if (!pub || !pub.facebook_post_id) {
      return { success: false, error: 'Post is not currently published on Facebook.' };
    }

    // 1. Fetch current FB state before updating to check for external edits
    const fbRes = await this.publisher.getPost(pub.facebook_post_id);
    if (fbRes.success && fbRes.post) {
      const fbMsg = (fbRes.post.message || '').trim();
      const fbHash = this.hashContent(fbMsg);

      // Check if FB was edited externally (FB hash does not match last known FB hash or pushed hash)
      if (
        pub.fb_content_hash &&
        fbHash !== pub.fb_content_hash &&
        pub.pushed_content_hash &&
        fbHash !== pub.pushed_content_hash
      ) {
        // CONFLICT! Facebook was modified externally on FB since last sync!
        await this.db
          .prepare(`UPDATE posts SET sync_status = 'CONFLICT' WHERE id = ?`)
          .bind(postId)
          .run();

        await this.db
          .prepare(`UPDATE publications SET sync_status = 'CONFLICT', fb_content_hash = ? WHERE id = ?`)
          .bind(fbHash, pub.publication_id)
          .run();

        return {
          success: false,
          conflict: true,
          error: 'Conflict detected: The post on Facebook was modified directly on Facebook since last sync.',
          fbContent: fbMsg,
        };
      }
    }

    // 2. Update post content on Facebook via Graph API
    const updateRes = await this.publisher.updatePostMessage(pub.facebook_post_id, newContent);
    if (!updateRes.success) {
      await this.db
        .prepare(`UPDATE publications SET sync_status = 'SYNC_FAILED' WHERE id = ?`)
        .bind(pub.publication_id)
        .run();

      return { success: false, error: updateRes.error || 'Failed to update post on Facebook.' };
    }

    // 3. Persist local version & update sync status atomically
    const newVersionNumber = pub.current_version + 1;
    const versionId = crypto.randomUUID();

    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO post_versions (id, post_id, version_number, content, content_type, metadata, ai_model, ai_provider, created_at)
           VALUES (?, ?, ?, ?, 'text', ?, 'admin-user', 'local_user', ?)`,
        )
        .bind(
          versionId,
          postId,
          newVersionNumber,
          newContent,
          JSON.stringify({ sync_source: 'local_user', updated_at: nowIso }),
          nowIso,
        ),
      this.db
        .prepare(
          `UPDATE posts SET current_version = ?, sync_status = 'SYNCED', last_synced_at = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(newVersionNumber, nowIso, nowIso, postId),
      this.db
        .prepare(
          `UPDATE publications SET fb_last_check_at = ?, fb_last_sync_at = ?, sync_status = 'SYNCED', pushed_content_hash = ?, fb_content_hash = ?, sync_source = 'local_user' WHERE id = ?`,
        )
        .bind(nowIso, nowIso, newHash, newHash, pub.publication_id),
      this.db.prepare(
        `INSERT INTO post_images (id, post_id, version_number, url, alt_text, created_at, source_url, source_id, author, author_url,
          license, license_url, verified_at, verification_status, visual_verification_status, visual_verification_reason, visual_verification_confidence)
         SELECT ?, post_id, ?, url, alt_text, created_at, source_url, source_id, author, author_url,
          license, license_url, verified_at, verification_status, visual_verification_status, visual_verification_reason, visual_verification_confidence
         FROM post_images WHERE post_id = ? AND version_number = ? LIMIT 1`,
      ).bind(crypto.randomUUID(), newVersionNumber, postId, pub.current_version),
    ]);

    if (this.auditLogger) {
      await this.auditLogger.log({
        eventType: 'ADMIN_ACTION',
        entityType: 'post',
        entityId: postId,
        actor,
        details: { action: 'system_to_facebook_sync', versionNumber: newVersionNumber, facebookPostId: pub.facebook_post_id },
      });
    }

    return { success: true };
  }

  /**
   * Conflict Resolution:
   * Explicitly resolves a sync conflict by choosing either 'use_local' or 'use_facebook'.
   */
  public async resolveSyncConflict(
    postId: string,
    resolution: 'use_local' | 'use_facebook',
    actor: 'system' | 'admin' | 'ai' = 'admin',
  ): Promise<{ success: boolean; error?: string }> {
    const pub = await this.db
      .prepare(`SELECT facebook_post_id FROM publications WHERE post_id = ? AND status = 'published'`)
      .bind(postId)
      .first<{ facebook_post_id: string }>();

    if (!pub || !pub.facebook_post_id) {
      return { success: false, error: 'No published Facebook post found.' };
    }

    if (resolution === 'use_local') {
      const currentLocal = await this.db
        .prepare(
          `SELECT pv.content FROM posts p JOIN post_versions pv ON p.id = pv.post_id AND p.current_version = pv.version_number WHERE p.id = ?`,
        )
        .bind(postId)
        .first<{ content: string }>();

      if (!currentLocal) return { success: false, error: 'Local post version not found.' };
      const contentResult = await this.updatePublishedPostFromSystem(postId, currentLocal.content, actor);
      if (!contentResult.success) return { success: false, error: contentResult.error || 'Could not synchronize local post content.' };

      const localImage = await this.db.prepare(
        `SELECT pi.url FROM post_images pi JOIN posts p ON p.id = pi.post_id AND p.current_version = pi.version_number WHERE pi.post_id = ? LIMIT 1`,
      ).bind(postId).first<{ url: string }>();
      if (!this.publisher.updatePostImage) return { success: false, error: 'The Facebook publisher does not support image updates.' };
      const imageResult = await this.publisher.updatePostImage(pub.facebook_post_id, localImage?.url || null);
      if (!imageResult.success) {
        await this.db.prepare("UPDATE publications SET sync_status = 'LOCAL_AHEAD' WHERE post_id = ?").bind(postId).run();
        await this.db.prepare("UPDATE posts SET sync_status = 'LOCAL_AHEAD' WHERE id = ?").bind(postId).run();
        return { success: false, error: imageResult.error || 'Could not synchronize local post image.' };
      }
      const remotePost = await this.publisher.getPost(pub.facebook_post_id);
      const syncedAt = new Date().toISOString();
      await this.db.prepare(
        `UPDATE publications SET fb_image_url = ?, pushed_image_url = ?, sync_status = 'SYNCED', fb_last_sync_at = ? WHERE post_id = ?`,
      ).bind(remotePost.post?.fullPicture || null, localImage?.url || null, syncedAt, postId).run();
      await this.db.prepare("UPDATE posts SET sync_status = 'SYNCED', last_synced_at = ? WHERE id = ?").bind(syncedAt, postId).run();
      return { success: true };
    } else {
      // Use Facebook version -> fetch FB content and apply locally
      const fbRes = await this.publisher.getPost(pub.facebook_post_id);
      if (!fbRes.success || !fbRes.post) {
        return { success: false, error: fbRes.error || 'Failed to fetch Facebook post.' };
      }

      const fbMsg = (fbRes.post.message || '').trim();
      const fbHash = this.hashContent(fbMsg);
      const nowIso = new Date().toISOString();

      const postRow = await this.db
        .prepare(`SELECT current_version FROM posts WHERE id = ?`)
        .bind(postId)
        .first<{ current_version: number }>();

      const newVersion = (postRow?.current_version || 1) + 1;
      const versionId = crypto.randomUUID();

      await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO post_versions (id, post_id, version_number, content, content_type, metadata, ai_model, ai_provider, created_at)
             VALUES (?, ?, ?, ?, 'text', ?, 'facebook-graph-api', 'facebook', ?)`,
          )
          .bind(
            versionId,
            postId,
            newVersion,
            fbMsg,
            JSON.stringify({ sync_source: 'facebook_conflict_resolved', updated_at: nowIso }),
            nowIso,
          ),
        this.db
          .prepare(`UPDATE posts SET current_version = ?, sync_status = 'SYNCED', last_synced_at = ? WHERE id = ?`)
          .bind(newVersion, nowIso, postId),
        this.db
          .prepare(`UPDATE publications SET sync_status = 'SYNCED', fb_last_sync_at = ?, fb_content_hash = ? WHERE post_id = ?`)
          .bind(nowIso, fbHash, postId),
        ...(fbRes.post.fullPicture ? [this.db.prepare(
          `INSERT INTO post_images (id, post_id, version_number, url, alt_text, source_url, author, license,
            verification_status, visual_verification_status, created_at)
           VALUES (?, ?, ?, ?, 'Facebook post image', ?, 'Facebook Page', 'Facebook media', 'facebook_imported', 'not_checked', ?)`
        ).bind(crypto.randomUUID(), postId, newVersion, fbRes.post.fullPicture, fbRes.post.permalinkUrl || fbRes.post.fullPicture, nowIso)] : []),
        this.db.prepare("UPDATE publications SET fb_image_url = ?, pushed_image_url = ? WHERE post_id = ?")
          .bind(fbRes.post.fullPicture || null, fbRes.post.fullPicture || null, postId),
      ]);

      return { success: true };
    }
  }

  /**
   * Changes the canonical assigned image of a post / publication to a selected Image Library asset.
   * Handles both unpublished posts (updating local D1 reservation & links) and already-published posts
   * (updating Facebook Graph API photo attachment first before committing local D1 and Image Library state).
   */
  public async changePublicationImage(
    publicationOrPostId: string,
    newCuratedImageId: string,
    actor: 'admin' | 'system' = 'admin',
  ): Promise<{
    success: boolean;
    isPublished?: boolean;
    message?: string;
    error?: string;
    code?: string;
  }> {
    const nowIso = new Date().toISOString();

    // 1. Resolve publication record or post record by publicationId, postId, or facebookPostId
    let postId = publicationOrPostId;
    let pubRecord = await this.getPublicationById(publicationOrPostId);
    if (!pubRecord) {
      const pubByPost = await this.db
        .prepare(`SELECT id FROM publications WHERE post_id = ? ORDER BY created_at DESC LIMIT 1`)
        .bind(publicationOrPostId)
        .first<{ id: string }>();
      if (pubByPost) {
        pubRecord = await this.getPublicationById(pubByPost.id);
        postId = pubRecord?.postId || publicationOrPostId;
      } else {
        const shortFbId = publicationOrPostId.includes('_') ? publicationOrPostId.split('_').pop()! : publicationOrPostId;
        const pubByFb = await this.db
          .prepare(
            `SELECT id FROM publications
             WHERE (facebook_post_id = ? OR facebook_post_id = ?)
             ORDER BY created_at DESC LIMIT 1`,
          )
          .bind(publicationOrPostId, shortFbId)
          .first<{ id: string }>();
        if (pubByFb) {
          pubRecord = await this.getPublicationById(pubByFb.id);
          postId = pubRecord?.postId || publicationOrPostId;
        }
      }
    } else {
      postId = pubRecord.postId;
    }

    // 2. Fetch target post and current version
    const postRow = await this.db
      .prepare(`SELECT id, title, status, current_version FROM posts WHERE id = ?`)
      .bind(postId)
      .first<{ id: string; title: string; status: string; current_version: number }>();

    if (!postRow) {
      return { success: false, error: `Post ${postId} not found.`, code: 'POST_NOT_FOUND' };
    }

    // 3. Fetch target curated image from library
    const newImg = await this.db
      .prepare(`SELECT * FROM curated_images WHERE id = ?`)
      .bind(newCuratedImageId)
      .first<{
        id: string;
        title: string;
        source_url: string | null;
        r2_key: string | null;
        status: string;
        original_page_url: string | null;
        author: string | null;
        author_url: string | null;
        license: string | null;
        license_url: string | null;
        description: string | null;
      }>();

    if (!newImg) {
      return { success: false, error: `Image '${newCuratedImageId}' not found in Image Library.`, code: 'IMAGE_NOT_FOUND' };
    }

    if (newImg.status !== 'APPROVED') {
      return {
        success: false,
        error: `Cannot assign image '${newImg.title}' because its status is '${newImg.status}'. Only APPROVED images can be selected.`,
        code: 'IMAGE_NOT_APPROVED',
      };
    }

    const newImageUrl = getPublicImageUrl(newImg);
    if (!newImageUrl) {
      return { success: false, error: `Selected image has no valid source URL.`, code: 'INVALID_IMAGE_URL' };
    }

    // Pre-validate image URL reachability
    const urlVal = await validateImageUrl(newImageUrl).catch(() => ({
      valid: true,
      error: undefined,
      httpStatus: undefined,
    }));
    if (!urlVal.valid) {
      return {
        success: false,
        error: `Selected image URL is not accessible: ${urlVal.error || 'HTTP error'}`,
        code: 'IMAGE_NOT_ACCESSIBLE',
      };
    }

    // 4. Fetch current post_images link for current version
    const currentPi = await this.db
      .prepare(`SELECT curated_image_id, url FROM post_images WHERE post_id = ? AND version_number = ?`)
      .bind(postId, postRow.current_version)
      .first<{ curated_image_id: string | null; url: string }>();

    const oldCuratedImageId = currentPi?.curated_image_id || null;

    // Idempotency check: if the post already has this exact curated_image_id
    if (oldCuratedImageId === newCuratedImageId) {
      return {
        success: true,
        isPublished: pubRecord?.status === 'published',
        message: 'Selected image is already assigned to this post.',
      };
    }

    await this.auditLogger?.log({
      eventType: 'PUBLICATION_IMAGE_CHANGE_STARTED',
      entityType: 'post',
      entityId: postId,
      actor,
      details: {
        publicationId: pubRecord?.id,
        previousImageId: oldCuratedImageId,
        newImageId: newCuratedImageId,
        previousImageUrl: currentPi?.url,
        newImageUrl,
        isPublished: pubRecord?.status === 'published',
      },
    });

    const isPublishedOnFb = pubRecord?.status === 'published' && Boolean(pubRecord.facebookPostId);

    // 5. SCENARIO A: Post is ALREADY PUBLISHED on Facebook
    if (isPublishedOnFb && pubRecord?.facebookPostId) {
      const fbPostId = pubRecord.facebookPostId;

      if (!this.publisher.updatePostImage) {
        await this.auditLogger?.log({
          eventType: 'PUBLICATION_IMAGE_CHANGE_FAILED',
          entityType: 'post',
          entityId: postId,
          actor,
          details: { reason: 'PUBLISHER_UNSUPPORTED', facebookPostId: fbPostId },
        });
        return {
          success: false,
          error: 'The Facebook publisher does not support image updates for published posts.',
          code: 'UNSUPPORTED_OPERATION',
        };
      }

      // Execute Meta API call FIRST before mutating local database
      const metaRes = await this.publisher.updatePostImage(fbPostId, newImageUrl);

      if (!metaRes.success) {
        await this.auditLogger?.log({
          eventType: 'PUBLICATION_IMAGE_CHANGE_FAILED',
          entityType: 'post',
          entityId: postId,
          actor,
          details: {
            reason: 'META_API_REJECTED',
            facebookPostId: fbPostId,
            error: metaRes.error,
            httpStatus: metaRes.httpStatus,
          },
        });

        return {
          success: false,
          error: `The image could not be changed on Facebook. The existing image remains unchanged. (${metaRes.error || 'Meta API error'})`,
          code: 'META_UPDATE_FAILED',
        };
      }

      // Meta API Succeeded! Now commit local D1 changes atomically:
      try {
        if (currentPi) {
          await this.db
            .prepare(
              `UPDATE post_images
               SET curated_image_id = ?, url = ?, selection_source = 'MANUAL', verified_at = ?
               WHERE post_id = ? AND version_number = ?`,
            )
            .bind(newCuratedImageId, newImageUrl, nowIso, postId, postRow.current_version)
            .run();
        } else {
          await this.db
            .prepare(
              `INSERT INTO post_images (
                id, post_id, version_number, url, alt_text, source_url, source_id,
                curated_image_id, selection_source, created_at, verified_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', ?, ?)`,
            )
            .bind(
              crypto.randomUUID(),
              postId,
              postRow.current_version,
              newImageUrl,
              newImg.title || 'Post Image',
              newImg.original_page_url || newImageUrl,
              newImg.id,
              newCuratedImageId,
              nowIso,
              nowIso,
            )
            .run();
        }

        // Update publication pushed_image_url and fb_image_url
        await this.db
          .prepare(
            `UPDATE publications
             SET pushed_image_url = ?, fb_image_url = ?, sync_status = 'SYNCED', updated_at = ?
             WHERE id = ?`,
          )
          .bind(newImageUrl, newImageUrl, nowIso, pubRecord.id)
          .run();

        // Image Library: Recalculate usage counts directly from database relationships
        await recalculateCuratedImageUsage(this.db, newCuratedImageId);
        if (oldCuratedImageId) {
          await recalculateCuratedImageUsage(this.db, oldCuratedImageId);
        }
      } catch (dbErr: unknown) {
        const dbMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        await this.auditLogger?.log({
          eventType: 'PUBLICATION_IMAGE_CHANGE_FAILED',
          entityType: 'post',
          entityId: postId,
          actor,
          details: {
            reason: 'LOCAL_DB_SYNC_FAILED',
            facebookPostId: fbPostId,
            error: dbMsg,
            newImageId: newCuratedImageId,
            newImageUrl,
          },
        });
        return {
          success: false,
          error: `Facebook image updated, but local database sync failed: ${dbMsg}`,
          code: 'DATABASE_SYNC_FAILED',
        };
      }

      await this.auditLogger?.log({
        eventType: 'PUBLICATION_IMAGE_CHANGE_SUCCEEDED',
        entityType: 'post',
        entityId: postId,
        actor,
        details: {
          publicationId: pubRecord.id,
          facebookPostId: fbPostId,
          previousImageId: oldCuratedImageId,
          newImageId: newCuratedImageId,
          newImageUrl,
          isPublished: true,
        },
      });

      return {
        success: true,
        isPublished: true,
        message: 'Image updated successfully on Facebook.',
      };
    }

    // 6. SCENARIO B: Post is UNPUBLISHED (draft, approved, scheduled, failed, etc.)
    await this.db.batch([
      this.db
        .prepare('UPDATE curated_images SET reserved_post_id = NULL WHERE reserved_post_id = ? AND id != ?')
        .bind(postId, newCuratedImageId),
      this.db
        .prepare('UPDATE curated_images SET reserved_post_id = ?, updated_at = ? WHERE id = ?')
        .bind(postId, nowIso, newCuratedImageId),
      this.db
        .prepare('DELETE FROM post_images WHERE post_id = ? AND version_number = ?')
        .bind(postId, postRow.current_version),
      this.db
        .prepare(
          `INSERT INTO post_images (
            id, post_id, version_number, url, alt_text, source_url, source_id,
            author, author_url, license, license_url, verified_at, verification_status,
            visual_verification_status, curated_image_id, selection_source, created_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified', 'accept', ?, 'MANUAL', ?
          )`,
        )
        .bind(
          crypto.randomUUID(),
          postId,
          postRow.current_version,
          newImageUrl,
          newImg.title || newImg.description || 'Post Image',
          newImg.original_page_url || newImageUrl,
          newImg.id,
          newImg.author,
          newImg.author_url,
          newImg.license || 'Curated Library',
          newImg.license_url,
          nowIso,
          newCuratedImageId,
          nowIso,
        ),
    ]);

    await recalculateCuratedImageUsage(this.db, newCuratedImageId);
    if (oldCuratedImageId) {
      await recalculateCuratedImageUsage(this.db, oldCuratedImageId);
    }

    await this.auditLogger?.log({
      eventType: 'PUBLICATION_IMAGE_CHANGE_SUCCEEDED',
      entityType: 'post',
      entityId: postId,
      actor,
      details: {
        publicationId: pubRecord?.id,
        previousImageId: oldCuratedImageId,
        newImageId: newCuratedImageId,
        newImageUrl,
        isPublished: false,
      },
    });

    return {
      success: true,
      isPublished: false,
      message: 'Image changed successfully. The new image will be used when this post is published.',
    };
  }
}
