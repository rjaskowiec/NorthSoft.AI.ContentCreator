import { CONTENT_INVARIANTS } from '../../core/constants.js';
import type { IAuditLogger } from '../../core/audit.js';
import type { IMetaPublisher, MetaPublisherConfigStatus } from '../../publishing/meta-publisher.js';

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
  ) {}

  /**
   * Recovers stale publication locks ('publishing' status older than threshold minutes).
   * Prevents crashed Worker instances from permanently blocking future publication attempts.
   */
  public async recoverStaleLocks(thresholdMinutes = 15): Promise<number> {
    try {
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
      return {
        success: false,
        code: 'META_NOT_CONFIGURED',
        message: publisherConfig.statusMessage,
        retryable: false,
      };
    }

    if (publisherConfig.state === 'DISABLED') {
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
                pv.id as version_id, COALESCE(pv.content, pv.body) as body, COALESCE(pv.status, p.status, 'approved') as version_status, pv.version_number
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
      }>();

    if (!postRow) {
      return {
        success: false,
        code: 'POST_NOT_FOUND',
        message: `Post ${postId} was not found.`,
      };
    }

    // 4. CRITICAL SERVER-SIDE QUALITY GATE CHECK
    if (postRow.version_status !== 'approved') {
      await this.auditLogger?.log({
        eventType: 'PUBLICATION_BLOCKED',
        entityType: 'post',
        entityId: postId,
        actor,
        details: {
          reason: 'POST_NOT_APPROVED',
          versionStatus: postRow.version_status,
          versionId: postRow.version_id,
        },
      });

      return {
        success: false,
        code: 'POST_NOT_APPROVED',
        message: `Post version ${postRow.version_id} status is '${postRow.version_status}'. Only 'approved' posts may be published.`,
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
        `SELECT id, status, attempt_count FROM publications WHERE idempotency_key = ? OR (post_id = ? AND post_version_id = ?)`,
      )
      .bind(idempotencyKey, postId, postRow.version_id)
      .first<{ id: string; status: string; attempt_count: number }>();

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
      details: {
        postId,
        postVersionId: postRow.version_id,
        idempotencyKey,
      },
    });

    // 7. INVOKE META PUBLISHER (0 AI calls, exact approved post content)
    const pubResult = await this.publisher.publish({
      postId,
      postVersionId: postRow.version_id,
      message: postRow.body,
      idempotencyKey,
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

      // Update post status to published
      await this.db
        .prepare(`UPDATE posts SET status = 'published', updated_at = datetime('now') WHERE id = ?`)
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
        details: {
          postId,
          postVersionId: postRow.version_id,
          facebookPostId: pubResult.externalPostId,
          publishedAt,
        },
      });

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
      details: {
        postId,
        postVersionId: postRow.version_id,
        errorCode: pubResult.errorCode,
        errorCategory: pubResult.errorCategory,
        errorMessage: pubResult.errorMessage,
        retryable: isRetryable,
      },
    });

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
           AND s.scheduled_at <= datetime('now')
           AND (pv.status = 'approved' OR p.status = 'approved')`,
      )
      .all<{ schedule_id: string; post_id: string }>();

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const item of dueSchedules.results || []) {
      processed++;
      const result = await this.publishPost(item.post_id, {
        scheduleId: item.schedule_id,
        actor: 'system',
      });
      if (result.success) {
        succeeded++;
      } else {
        failed++;
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
                p.title as post_title, COALESCE(pv.content, pv.body) as post_body, COALESCE(pv.status, p.status, 'approved') as quality_gate_status
         FROM publications pub
         JOIN posts p ON pub.post_id = p.id
         LEFT JOIN post_versions pv ON pub.post_version_id = pv.id
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
                p.title as post_title, COALESCE(pv.content, pv.body) as post_body, COALESCE(pv.status, p.status, 'approved') as quality_gate_status
         FROM publications pub
         JOIN posts p ON pub.post_id = p.id
         LEFT JOIN post_versions pv ON pub.post_version_id = pv.id
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
    };
  }
}
