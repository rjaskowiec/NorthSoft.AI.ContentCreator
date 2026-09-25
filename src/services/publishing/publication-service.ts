/**
 * Autonomous Publication Service
 *
 * Coordinates internal scheduling and Facebook publishing via IMetaPublisher.
 *
 * Critical Invariants:
 * 1. SERVER-SIDE QUALITY GATE ENFORCEMENT: Only posts with status 'approved' can be published.
 * 2. IDEMPOTENCY: Duplicate calls for an already published version return the existing published record.
 * 3. D1 CONCURRENCY LOCKING: Atomic status transitions ('scheduled' -> 'publishing') prevent parallel workers from publishing twice.
 * 4. ZERO AI CALLS: Publishing is deterministic and consumes zero Neurons.
 * 5. SAFE DEGRADATION: Handles META_NOT_CONFIGURED gracefully without crashing.
 */

import type { IAuditLogger } from '../../core/audit.js';
import type { IMetaPublisher } from '../../publishing/meta-publisher.js';

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

export class PublicationService {
  constructor(
    private db: D1Database,
    private publisher: IMetaPublisher,
    private auditLogger?: IAuditLogger,
  ) {}

  /**
   * Publish an approved post version.
   * Enforces server-side Quality Gate approval, idempotency, and atomic D1 lock.
   */
  public async publishPost(
    postId: string,
    options?: { scheduleId?: string; actor?: 'system' | 'admin' },
  ): Promise<PublishResult> {
    const actor = options?.actor || 'system';

    // 1. Fetch Post & active Post Version from D1
    const postRow = await this.db
      .prepare(
        `SELECT p.id, p.title, p.status as post_status,
                pv.id as version_id, pv.body, pv.status as version_status, pv.version_number
         FROM posts p
         JOIN post_versions pv ON p.current_version_id = pv.id
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

    // 2. CRITICAL SERVER-SIDE QUALITY GATE CHECK
    if (postRow.version_status !== 'approved') {
      await this.auditLogger?.log({
        eventType: 'PUBLICATION_FAILED',
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

    // 3. IDEMPOTENCY CHECK
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

    // 4. ATOMIC CONCURRENCY LOCK
    const idempotencyKey = `pub_${postId}_${postRow.version_id}`;
    let publicationId = crypto.randomUUID();

    // Check if there is an in-progress or pending publication record
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

    // 5. INVOKE META PUBLISHER
    const pubResult = await this.publisher.publish({
      postId,
      postVersionId: postRow.version_id,
      message: postRow.body,
      idempotencyKey,
    });

    // 6. HANDLE PUBLISH RESULT
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
        pubResult.errorCode || 'UNKNOWN_ERROR',
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
   */
  public async publishScheduledDuePosts(): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
  }> {
    const dueSchedules = await this.db
      .prepare(
        `SELECT s.id as schedule_id, s.post_id
         FROM schedules s
         JOIN posts p ON s.post_id = p.id
         JOIN post_versions pv ON p.current_version_id = pv.id
         WHERE s.status = 'pending'
           AND s.scheduled_at <= datetime('now')
           AND pv.status = 'approved'`,
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
   * Query publication records for admin interface.
   */
  public async getPublications(limit = 20, offset = 0): Promise<PublicationRecord[]> {
    const rows = await this.db
      .prepare(
        `SELECT pub.id, pub.post_id, pub.post_version_id, pub.schedule_id,
                pub.facebook_post_id, pub.provider, pub.status, pub.attempt_count,
                pub.http_status, pub.error_code, pub.error_message, pub.idempotency_key,
                pub.published_at, pub.created_at, pub.updated_at,
                p.title as post_title, pv.body as post_body, pv.status as quality_gate_status
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
                p.title as post_title, pv.body as post_body, pv.status as quality_gate_status
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
