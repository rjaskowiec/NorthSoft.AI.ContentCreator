import type { IAuditLogger } from '../../core/audit.js';
import type { IMetaPublisher } from '../../publishing/meta-publisher.js';
import { PerformanceEngineService } from '../analytics/performance-engine.js';
import { getPublicImageUrl, recalculateCuratedImageUsage } from '../content/image-library-service.js';
import { validateImageUrl } from './image-validator.js';

export function hashContent(text: string): string {
  const str = (text || '').trim().replace(/\r?\n/g, '\n');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

export class FacebookSyncService {
  constructor(
    private db: D1Database,
    private publisher: IMetaPublisher,
    private auditLogger?: IAuditLogger,
  ) {}

  public hashContent(text: string): string {
    return hashContent(text);
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
                  pub.fb_image_url, pub.pushed_image_url, pub.fb_is_hidden, pub.fb_last_check_at,
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
          fb_is_hidden?: number | null;
          fb_last_check_at?: string | null;
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
        const newIsHidden = res.post.isHidden ? 1 : 0;
        if (item.fb_is_hidden !== newIsHidden) {
          await this.db.prepare('UPDATE publications SET fb_is_hidden = ?, fb_deleted_at = NULL WHERE id = ?')
            .bind(newIsHidden, item.publication_id).run();
        }

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
            console.warn('[FacebookSyncService] Failed to record performance metric snapshot during sync:', mErr);
          }
        }

        const fbHash = this.hashContent(fbMsg);
        const localHash = this.hashContent(item.local_content);

        if (res.post.fullPicture && !item.local_image_url) {
          await this.db.prepare(
            `INSERT OR IGNORE INTO post_images (id, post_id, version_number, url, alt_text, source_url, author, license, verification_status, visual_verification_status, created_at)
             VALUES (?, ?, ?, ?, 'Facebook post image', ?, 'Facebook Page', 'Facebook media', 'facebook_imported', 'not_checked', ?)`
          ).bind(
            crypto.randomUUID(), item.post_id, item.current_version, res.post.fullPicture,
            res.post.permalinkUrl || res.post.fullPicture, nowIso,
          ).run();
        }

        const newFbImageUrl = res.post.fullPicture || null;
        if (item.fb_image_url !== newFbImageUrl || (!item.pushed_image_url && (item.local_image_url || newFbImageUrl))) {
          await this.db.prepare('UPDATE publications SET fb_image_url = ?, pushed_image_url = COALESCE(pushed_image_url, ?) WHERE id = ?')
            .bind(newFbImageUrl, item.local_image_url || newFbImageUrl, item.publication_id).run();
        }

        if (item.local_curated_image_id) {
          await recalculateCuratedImageUsage(this.db, item.local_curated_image_id);
        }

        if (fbHash === localHash || (item.pushed_content_hash && fbHash === item.pushed_content_hash)) {
          const checkAgeMs = item.fb_last_check_at ? Date.now() - new Date(item.fb_last_check_at).getTime() : Infinity;
          // Only update DB if sync_status was not SYNCED or hash changed, or at most once every 6 hours
          if (item.pub_sync_status !== 'SYNCED' || item.fb_content_hash !== fbHash || checkAgeMs > 6 * 60 * 60 * 1000) {
            await this.db
              .prepare(
                `UPDATE publications SET fb_last_check_at = ?, fb_last_sync_at = ?, sync_status = 'SYNCED', fb_content_hash = ? WHERE id = ?`,
              )
              .bind(nowIso, nowIso, fbHash, item.publication_id)
              .run();
          }

          if (item.post_sync_status !== 'SYNCED') {
            await this.db
              .prepare(`UPDATE posts SET sync_status = 'SYNCED', last_synced_at = ? WHERE id = ?`)
              .bind(nowIso, item.post_id)
              .run();
          }

          continue;
        }

        if (item.post_sync_status === 'LOCAL_AHEAD') {
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

          const existingLocalPost = await this.db.prepare(
            `SELECT p.id as post_id, p.idea_id, pv.id as version_id, pv.content as body, p.status as post_status,
                    s.scheduled_at as schedule_time, s.status as schedule_status
             FROM posts p
             JOIN post_versions pv ON p.id = pv.post_id AND p.current_version = pv.version_number
             LEFT JOIN schedules s ON s.post_id = p.id AND s.status IN ('pending', 'scheduled')
             WHERE p.quality_decision IS NULL OR p.quality_decision != 'IMPORTED'
             ORDER BY p.created_at DESC`
          ).all<{ post_id: string; idea_id: string | null; version_id: string; body: string; post_status: string; schedule_time: string | null; schedule_status: string | null }>();

          const normalize = (t: string) => (t || '').trim().toLowerCase().replace(/\s+/g, ' ');
          const normFbContent = normalize(content);

          const matchedLocal = existingLocalPost.results?.find(row => {
            if (row.schedule_time && new Date(row.schedule_time).getTime() > Date.now()) {
              return false;
            }
            const normBody = normalize(row.body);
            if (!normBody || !normFbContent) return false;
            if (normBody === normFbContent) return true;
            if (normFbContent.length >= 100 && normBody.length >= 100) {
              const prefixLen = Math.min(100, Math.min(normFbContent.length, normBody.length));
              if (normBody.slice(0, prefixLen) === normFbContent.slice(0, prefixLen)) {
                return true;
              }
            }
            return false;
          });

          if (matchedLocal) {
            const matchedPostId = matchedLocal.post_id;
            const matchedVersionId = matchedLocal.version_id;
            const publicationId = crypto.randomUUID();
            const createdAt = fbPost.createdTime || nowIso;
            const hash = this.hashContent(content);

            await this.db.batch([
              this.db.prepare(
                `INSERT INTO publications (id, post_id, post_version_id, facebook_post_id, provider, status, attempt_count,
                   published_at, fb_last_check_at, fb_last_sync_at, sync_status, fb_content_hash, pushed_content_hash, sync_source,
                   fb_image_url, pushed_image_url, fb_is_hidden, created_at, updated_at)
                 VALUES (?, ?, ?, ?, 'facebook', 'published', 1, ?, ?, ?, 'SYNCED', ?, ?, 'facebook_reconciled', ?, ?, ?, ?, ?)`
              ).bind(publicationId, matchedPostId, matchedVersionId, fbPost.id, createdAt, nowIso, nowIso, hash, hash,
                fbPost.fullPicture || null, fbPost.fullPicture || null, fbPost.isHidden ? 1 : 0, nowIso, nowIso),
              this.db.prepare(
                `UPDATE posts SET status = 'published', sync_status = 'SYNCED', last_synced_at = ?, updated_at = ? WHERE id = ?`
              ).bind(nowIso, nowIso, matchedPostId),
              this.db.prepare(
                `UPDATE schedules SET status = 'published', updated_at = ? WHERE post_id = ? AND status IN ('pending', 'publishing')`
              ).bind(nowIso, matchedPostId),
              ...(matchedLocal.idea_id ? [
                this.db.prepare(
                  `UPDATE content_ideas SET status = 'published', updated_at = ? WHERE id = ?`
                ).bind(nowIso, matchedLocal.idea_id)
              ] : [])
            ]);

            updated++;
            continue;
          }

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
   */
  public async updatePublishedPostFromSystem(
    postId: string,
    newContent: string,
    actor: 'system' | 'admin' | 'ai' = 'admin',
  ): Promise<{ success: boolean; conflict?: boolean; error?: string; fbContent?: string }> {
    const nowIso = new Date().toISOString();
    const newHash = this.hashContent(newContent);

    const pub = await this.db
      .prepare(
        `SELECT pub.id as publication_id, pub.facebook_post_id, pub.fb_content_hash, pub.pushed_content_hash,
                p.current_version, pv.content as current_local_content
         FROM publications pub
         JOIN posts p ON pub.post_id = p.id
         JOIN post_versions pv ON p.id = pv.post_id AND p.current_version = pv.version_number
         WHERE pub.post_id = ? AND pub.status = 'published' AND pub.facebook_post_id IS NOT NULL`,
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
      return { success: false, error: 'No published Facebook post record found for this post ID.' };
    }

    const fbPostRes = await this.publisher.getPost(pub.facebook_post_id);
    if (!fbPostRes.success || !fbPostRes.post) {
      return { success: false, error: fbPostRes.error || 'Failed to verify current post state on Facebook.' };
    }

    const currentFbContent = (fbPostRes.post.message || '').trim();
    const currentFbHash = this.hashContent(currentFbContent);

    if (pub.fb_content_hash && currentFbHash !== pub.fb_content_hash) {
      await this.db
        .prepare(`UPDATE publications SET sync_status = 'CONFLICT', fb_content_hash = ? WHERE id = ?`)
        .bind(currentFbHash, pub.publication_id)
        .run();

      await this.db.prepare(`UPDATE posts SET sync_status = 'CONFLICT' WHERE id = ?`).bind(postId).run();

      return {
        success: false,
        conflict: true,
        error: 'Conflict: Facebook post has been edited directly on Facebook. Please resolve the conflict in the admin panel.',
        fbContent: currentFbContent,
      };
    }

    const updateRes = await this.publisher.updatePostMessage(pub.facebook_post_id, newContent);
    if (!updateRes.success) {
      await this.db.prepare(`UPDATE publications SET sync_status = 'LOCAL_AHEAD' WHERE id = ?`).bind(pub.publication_id).run();
      await this.db.prepare(`UPDATE posts SET sync_status = 'LOCAL_AHEAD' WHERE id = ?`).bind(postId).run();
      return { success: false, error: updateRes.error || 'Failed to update post message on Facebook.' };
    }

    const newVersionNumber = pub.current_version + 1;
    const versionId = crypto.randomUUID();

    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO post_versions (id, post_id, version_number, content, content_type, metadata, ai_model, ai_provider, created_at)
           VALUES (?, ?, ?, ?, 'text', ?, 'admin-edit', 'manual', ?)`,
        )
        .bind(
          versionId,
          postId,
          newVersionNumber,
          newContent,
          JSON.stringify({ updated_by: actor, pushed_to_fb: true, updated_at: nowIso }),
          nowIso,
        ),
      this.db
        .prepare(`UPDATE posts SET current_version = ?, sync_status = 'SYNCED', last_synced_at = ?, updated_at = ? WHERE id = ?`)
        .bind(newVersionNumber, nowIso, nowIso, postId),
      this.db
        .prepare(
          `UPDATE publications
           SET fb_last_check_at = ?, fb_last_sync_at = ?, sync_status = 'SYNCED',
               fb_content_hash = ?, pushed_content_hash = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(nowIso, nowIso, newHash, newHash, nowIso, pub.publication_id),
      this.db
        .prepare(
          `INSERT INTO post_images (id, post_id, version_number, url, alt_text, created_at, source_url, source_id, author, author_url,
            license, license_url, verified_at, verification_status, visual_verification_status, visual_verification_reason, visual_verification_confidence)
           SELECT ?, post_id, ?, url, alt_text, created_at, source_url, source_id, author, author_url,
            license, license_url, verified_at, verification_status, visual_verification_status, visual_verification_reason, visual_verification_confidence
           FROM post_images WHERE post_id = ? AND version_number = ? LIMIT 1`,
        )
        .bind(crypto.randomUUID(), newVersionNumber, postId, pub.current_version),
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
   * Chooses either 'use_local' or 'use_facebook'.
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
   * Changes the assigned image of a post / publication to a selected Image Library asset.
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

    let postId = publicationOrPostId;
    let pubRecord: { id: string; postId: string; status: string; facebookPostId?: string } | null = null;

    const pubRow = await this.db
      .prepare(`SELECT id, post_id, status, facebook_post_id FROM publications WHERE id = ?`)
      .bind(publicationOrPostId)
      .first<{ id: string; post_id: string; status: string; facebook_post_id?: string }>();

    if (pubRow) {
      pubRecord = {
        id: pubRow.id,
        postId: pubRow.post_id,
        status: pubRow.status,
        facebookPostId: pubRow.facebook_post_id,
      };
      postId = pubRow.post_id;
    } else {
      const pubByPost = await this.db
        .prepare(`SELECT id, post_id, status, facebook_post_id FROM publications WHERE post_id = ? ORDER BY created_at DESC LIMIT 1`)
        .bind(publicationOrPostId)
        .first<{ id: string; post_id: string; status: string; facebook_post_id?: string }>();

      if (pubByPost) {
        pubRecord = {
          id: pubByPost.id,
          postId: pubByPost.post_id,
          status: pubByPost.status,
          facebookPostId: pubByPost.facebook_post_id,
        };
        postId = pubByPost.post_id;
      } else {
        const shortFbId = publicationOrPostId.includes('_') ? publicationOrPostId.split('_').pop()! : publicationOrPostId;
        const pubByFb = await this.db
          .prepare(
            `SELECT id, post_id, status, facebook_post_id FROM publications
             WHERE (facebook_post_id = ? OR facebook_post_id = ?)
             ORDER BY created_at DESC LIMIT 1`,
          )
          .bind(publicationOrPostId, shortFbId)
          .first<{ id: string; post_id: string; status: string; facebook_post_id?: string }>();

        if (pubByFb) {
          pubRecord = {
            id: pubByFb.id,
            postId: pubByFb.post_id,
            status: pubByFb.status,
            facebookPostId: pubByFb.facebook_post_id,
          };
          postId = pubByFb.post_id;
        }
      }
    }

    const postRow = await this.db
      .prepare(`SELECT id, title, status, current_version FROM posts WHERE id = ?`)
      .bind(postId)
      .first<{ id: string; title: string; status: string; current_version: number }>();

    if (!postRow) {
      return { success: false, error: `Post ${postId} not found.`, code: 'POST_NOT_FOUND' };
    }

    const newImg = await this.db
      .prepare(`SELECT * FROM curated_images WHERE id = ?`)
      .bind(newCuratedImageId)
      .first<{
        id: string;
        title: string;
        source_url: string | null;
        r2_key: string | null;
        status: string;
        reserved_post_id?: string | null;
        last_used_at?: string | null;
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

    if (newImg.reserved_post_id && newImg.reserved_post_id !== postId) {
      return {
        success: false,
        error: `Image '${newCuratedImageId}' is already reserved by post ${newImg.reserved_post_id}.`,
        code: 'IMAGE_RESERVED',
      };
    }

    if (newImg.last_used_at) {
      const lastUsedMs = new Date(newImg.last_used_at).getTime();
      const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
      if (!isNaN(lastUsedMs) && Date.now() - lastUsedMs < ninetyDaysMs) {
        return {
          success: false,
          error: `Image '${newCuratedImageId}' was used in publication within the last 90 days (last used: ${newImg.last_used_at}) and cannot be assigned.`,
          code: 'IMAGE_RECENTLY_USED',
        };
      }
    }

    const newImageUrl = getPublicImageUrl(newImg);
    if (!newImageUrl) {
      return { success: false, error: `Selected image has no valid source URL.`, code: 'INVALID_IMAGE_URL' };
    }

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

    const currentPi = await this.db
      .prepare(`SELECT curated_image_id, url FROM post_images WHERE post_id = ? AND version_number = ?`)
      .bind(postId, postRow.current_version)
      .first<{ curated_image_id: string | null; url: string }>();

    const oldCuratedImageId = currentPi?.curated_image_id || null;

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

        await this.db
          .prepare(
            `UPDATE publications
             SET pushed_image_url = ?, fb_image_url = ?, sync_status = 'SYNCED', updated_at = ?
             WHERE id = ?`,
          )
          .bind(newImageUrl, newImageUrl, nowIso, pubRecord.id)
          .run();

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
