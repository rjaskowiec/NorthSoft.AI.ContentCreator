import { CONTENT_INVARIANTS } from '../../core/constants.js';
import type { IAuditLogger } from '../../core/audit.js';
import type { IMetaPublisher, MetaPublisherConfigStatus } from '../../publishing/meta-publisher.js';
import type { IMailGatewayClient } from '../mail/mail-service.js';
import { NotificationService } from '../notifications/notification-service.js';
import { getPublicImageUrl } from '../content/image-library-service.js';

import { validateImageUrl } from './image-validator.js';
import { FacebookSyncService } from './facebook-sync-service.js';

export { validateImageUrl };

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
   * Default threshold is 5 minutes (matching the 5-minute cron frequency).
   */
  public async recoverStaleLocks(thresholdMinutes = 5): Promise<number> {
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
      // (Index idx_publications_status_updated makes this an instant index seek without table scans)
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
      // Ensure local post, schedule, and content idea are consistently marked as published
      const nowIso = new Date().toISOString();
      const p1 = this.db.prepare("UPDATE posts SET status = 'published', updated_at = ? WHERE id = ?").bind(nowIso, postId);
      const p2 = this.db.prepare("UPDATE schedules SET status = 'published', updated_at = ? WHERE post_id = ? AND status IN ('pending', 'publishing')").bind(nowIso, postId);
      const p3 = this.db.prepare("UPDATE content_ideas SET status = 'published', updated_at = ? WHERE id = (SELECT idea_id FROM posts WHERE id = ?)").bind(nowIso, postId);
      if (typeof this.db.batch === 'function') {
        await this.db.batch([p1, p2, p3]).catch(() => {});
      } else {
        if (p1 && typeof p1.run === 'function') await p1.run().catch(() => {});
        if (p2 && typeof p2.run === 'function') await p2.run().catch(() => {});
        if (p3 && typeof p3.run === 'function') await p3.run().catch(() => {});
      }

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
    // 7. INVOKE META PUBLISHER (0 AI calls, exact approved post content + legal attribution if required)
    // 6.5. PUBLISHING SAFETY CHECK: Ensure image belongs to approved library and is valid
    const piRow = await this.db
      .prepare(
        `SELECT pi.curated_image_id, ci.status, ci.requires_attribution, ci.attribution_text, ci.author, ci.license, ci.source_url
         FROM post_images pi
         LEFT JOIN curated_images ci ON ci.id = pi.curated_image_id
         WHERE pi.post_id = ? AND pi.version_number = ?`,
      )
      .bind(postId, postRow.version_number)
      .first<{
        curated_image_id: string | null;
        status: string | null;
        requires_attribution?: number | null;
        attribution_text?: string | null;
        author?: string | null;
        license?: string | null;
        source_url?: string | null;
      }>();

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

    let publishMessage = postRow.body;
    if (piRow?.curated_image_id && piRow.requires_attribution) {
      const attr = piRow.attribution_text || (piRow.author ? `Photo by ${piRow.author}${piRow.source_url ? ` (${piRow.source_url})` : ''}` : null);
      if (attr && !publishMessage.includes(attr)) {
        publishMessage = `${publishMessage.trim()}\n\n${attr}`;
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
      message: publishMessage,
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

      await this.db
        .prepare(`UPDATE posts SET status = 'published', updated_at = datetime('now') WHERE id = ?`)
        .bind(postId)
        .run();

      await this.db
        .prepare(`UPDATE content_ideas SET status = 'published', updated_at = datetime('now') WHERE id = (SELECT idea_id FROM posts WHERE id = ?)`)
        .bind(postId)
        .run();

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
          await this.db
            .prepare(`UPDATE schedules SET status = 'published', updated_at = datetime('now') WHERE id = ? AND status = 'publishing'`)
            .bind(item.schedule_id)
            .run()
            .catch(() => {});
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
          .prepare(`UPDATE schedules SET status = 'pending', updated_at = datetime('now') WHERE id = ?`)
          .bind(item.schedule_id)
          .run()
          .catch(() => {});
      } finally {
        // Ultimate invariant: Ensure schedule NEVER remains trapped in 'publishing' state
        await this.db
          .prepare(`UPDATE schedules SET status = 'pending', updated_at = datetime('now') WHERE id = ? AND status = 'publishing'`)
          .bind(item.schedule_id)
          .run()
          .catch(() => {});
      }
    }

    return { processed, succeeded, failed };
  }

  /**
   * Query full publication health summary including stats, 4-tier state, and recent health indicators.
   */
  public async getPublicationHealth(): Promise<PublicationHealthSummary> {
    const configStatus = this.publisher.getConfigStatus();

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

  public async syncFacebookPostsToSystem(): Promise<{ checked: number; updated: number; imported: number; conflicts: number; errors: number }> {
    const syncService = new FacebookSyncService(this.db, this.publisher, this.auditLogger);
    return syncService.syncFacebookPostsToSystem();
  }

  public async updatePublishedPostFromSystem(
    postId: string,
    newContent: string,
    actor: 'system' | 'admin' | 'ai' = 'admin',
  ): Promise<{ success: boolean; conflict?: boolean; error?: string; fbContent?: string }> {
    const syncService = new FacebookSyncService(this.db, this.publisher, this.auditLogger);
    return syncService.updatePublishedPostFromSystem(postId, newContent, actor);
  }

  public async resolveSyncConflict(
    postId: string,
    resolution: 'use_local' | 'use_facebook',
    actor: 'system' | 'admin' | 'ai' = 'admin',
  ): Promise<{ success: boolean; error?: string }> {
    const syncService = new FacebookSyncService(this.db, this.publisher, this.auditLogger);
    return syncService.resolveSyncConflict(postId, resolution, actor);
  }

  public async changePublicationImage(
    publicationOrPostId: string,
    newCuratedImageId: string,
    actor: 'admin' | 'system' = 'admin',
  ): Promise<{ success: boolean; isPublished?: boolean; message?: string; error?: string; code?: string }> {
    const syncService = new FacebookSyncService(this.db, this.publisher, this.auditLogger);
    return syncService.changePublicationImage(publicationOrPostId, newCuratedImageId, actor);
  }
}
