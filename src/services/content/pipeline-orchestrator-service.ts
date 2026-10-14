/**
 * NorthSoft.AI.ContentCreator — Pipeline Orchestrator Service
 *
 * Single control point for the content pipeline. Four stages, each runnable manually:
 *   1. Topics      — AI research / content discovery (ResearchService)
 *   2. Posts       — AI post generation + quality gates (ContentPlannerService)
 *   3. Images      — image assignment: approved library first, then Openverse fallback
 *   4. Scheduling  — publication slots chosen by IntelligentSchedulingService (no AI)
 *
 * Automation (single master switch) is need-driven, not frequency-driven:
 *   - The cron tick (every 5 min) always runs the non-AI scheduling stage when posts are ready.
 *   - Inside the nightly AI window (22:00–23:45 UTC, right before the 00:00 UTC neuron reset)
 *     each tick performs ONE bounded AI step, chosen by what is currently missing:
 *       a) images for approved posts  →  b) topic backlog below minimum  →
 *       c) schedule coverage below target (up to max posts per night).
 *   - Actual Facebook publication stays with PublicationService.publishScheduledDuePosts().
 *
 * Enforces a single execution lock per stage / automation tick (PIPELINE_ALREADY_RUNNING).
 */

import { getAIProvider } from '../../ai/factory';
import { D1AuditLogger, type IAuditLogger } from '../../core/audit';
import {
  AI_BACKGROUND_WINDOW,
  AI_BACKGROUND_WINDOW_LABEL,
  getNextAiWindowStart,
  isWithinAiBackgroundWindow,
} from '../../core/ai-window-policy';
import { CloudflareUsageService } from '../cloudflare/cloudflare-usage-service';
import { IntelligentSchedulingService } from '../publishing/intelligent-scheduler-service';
import { ResearchService } from '../research/research-service';
import { ContentPlannerService } from './content-planner-service';
import { ImageLibraryService } from './image-library-service';
import { OpenverseImageService } from './image-service';

export type PipelineStage = 'topics' | 'posts' | 'images' | 'scheduling';
export type PipelineActor = 'admin' | 'system';

const ACTIVE_TOPIC_STATUSES = "('queued', 'new', 'accepted', 'discovered', 'pending')";

export interface DiscoveryStageResult {
  runId: string;
  sourcesChecked: number;
  rawItemsDiscovered: number;
  aiInferenceRequests: number;
  aiInferenceSuccessful: number;
  aiInferenceFailed: number;
  usefulInspirations: number;
  noUsefulAngleCount: number;
  duplicatesFound: number;
  rejectedCount: number;
  newProposalsCount: number;
  proposals: Array<{
    id: string;
    title: string;
    contentAngle: string;
    contentPillar: string;
    sourceUrl?: string;
  }>;
  cloudflareVerifiedNeurons: number | null;
  estimatedTokens: number;
  durationMs: number;
}

export interface GenerationStageResult {
  runId: string;
  postId?: string;
  ideaId?: string;
  title: string;
  body: string;
  qualityScore: number;
  classification: {
    pillar: string;
    postType: string;
    engagementPotential: number;
    clarity: number;
    practicalValue: number;
    brandRelevance: number;
    originality: number;
  };
  finalDecision: 'PASS' | 'REJECTED' | 'BLOCKED' | 'DEFERRED';
  rejectionReason?: string;
  durationMs: number;
}

export interface ImagesStageResult {
  runId: string;
  processed: number;
  assignedFromLibrary: number;
  assignedFromOpenverse: number;
  generatedFromAi: number;
  notFound: number;
  details: Array<{ postId: string; title: string; source: 'library' | 'openverse' | 'ai' | 'none'; error?: string }>;
  durationMs: number;
}

export interface SchedulingStageResult {
  runId: string;
  scheduledCount: number;
  skippedWithoutImage: number;
  slots: Array<{ postId: string; postTitle: string; scheduledAtIso: string; reason: string }>;
  durationMs: number;
}

export interface StageRunResult {
  stage: PipelineStage;
  success: boolean;
  summary: string;
  result?: DiscoveryStageResult | GenerationStageResult | ImagesStageResult | SchedulingStageResult;
  error?: string;
}

export interface AutomationTickResult {
  ran: boolean;
  reason: string;
  steps: StageRunResult[];
}

export interface SchedulerConfig {
  enabled: boolean;
  minTopicBacklog: number;
  targetCoverageDays: number;
  maxPostsPerNight: number;
  updatedAt?: string;
}

export interface PipelineStatus {
  config: SchedulerConfig;
  window: {
    label: string;
    inWindow: boolean;
    nextWindowStart: string;
  };
  counts: {
    availableTopics: number;
    postsWithoutImage: number;
    readyToSchedule: number;
    scheduledPending: number;
    coverageDays: number;
    postsGeneratedTonight: number;
  };
  needs: {
    topics: boolean;
    posts: boolean;
    images: boolean;
    scheduling: boolean;
  };
}

const DEFAULT_CONFIG: SchedulerConfig = {
  enabled: false,
  minTopicBacklog: 5,
  targetCoverageDays: 14,
  maxPostsPerNight: 3,
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function newRunId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

export class PipelineOrchestratorService {
  private auditLogger: IAuditLogger;
  private cfUsageService: CloudflareUsageService;

  constructor(
    private db: D1Database,
    private env: Env,
    auditLogger?: IAuditLogger,
  ) {
    this.auditLogger = auditLogger ?? new D1AuditLogger(db);
    this.cfUsageService = CloudflareUsageService.fromEnv(env);
  }

  // ---------------------------------------------------------------------------
  // Locks
  // ---------------------------------------------------------------------------

  /**
   * Acquire execution lock for idempotency / duplicate run protection
   */
  async acquireLock(lockKey: string, runId: string, actor: string, ttlSeconds = 300): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

    await this.db
      .prepare('DELETE FROM pipeline_execution_locks WHERE expires_at <= ?')
      .bind(now.toISOString())
      .run();

    try {
      await this.db
        .prepare(
          `INSERT INTO pipeline_execution_locks (lock_key, run_id, actor, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(lockKey, runId, actor, now.toISOString(), expiresAt)
        .run();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Release execution lock
   */
  async releaseLock(lockKey: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM pipeline_execution_locks WHERE lock_key = ?')
      .bind(lockKey)
      .run();
  }

  private async withLock<T>(lockKey: string, actor: PipelineActor, ttlSeconds: number, fn: (runId: string) => Promise<T>): Promise<T> {
    const runId = newRunId(lockKey);
    const acquired = await this.acquireLock(lockKey, runId, actor, ttlSeconds);
    if (!acquired) {
      throw new Error(`PIPELINE_ALREADY_RUNNING: ${lockKey} is already running.`);
    }
    try {
      return await fn(runId);
    } finally {
      await this.releaseLock(lockKey);
    }
  }

  // ---------------------------------------------------------------------------
  // STAGE 1 — Topics (Content Discovery)
  // ---------------------------------------------------------------------------

  async runDiscovery(actor: PipelineActor = 'admin'): Promise<DiscoveryStageResult> {
    return this.withLock('stage_discovery', actor, 600, async (runId) => {
      const startTime = Date.now();
      const researchProvider = getAIProvider(this.env, 'researcher');
      const researchService = new ResearchService(this.db, researchProvider, this.auditLogger);
      const res = await researchService.runResearchPipeline(actor === 'admin' ? 'manual' : 'cron');

      const recentProposals = await this.db
        .prepare(
          `SELECT id, title, content_angle, content_pillar, source_url
           FROM content_ideas
           WHERE status IN ${ACTIVE_TOPIC_STATUSES}
           ORDER BY created_at DESC
           LIMIT 10`,
        )
        .all<{ id: string; title: string; content_angle: string; content_pillar: string; source_url: string }>();

      const cfTelemetry = await this.cfUsageService.getVerifiedUsage();

      return {
        runId,
        sourcesChecked: res.sourcesChecked,
        rawItemsDiscovered: res.itemsDiscovered,
        aiInferenceRequests: res.aiInferenceRequests,
        aiInferenceSuccessful: res.aiInferenceSuccessful,
        aiInferenceFailed: res.aiInferenceFailed,
        usefulInspirations: res.potentialAnglesDiscovered,
        noUsefulAngleCount: res.noUsefulAngleCount,
        duplicatesFound: res.duplicatesFound,
        rejectedCount: (res.rejectedIrrelevant || 0) + (res.rejectedTooTechnical || 0) + (res.rejectedRecentCooldown || 0),
        newProposalsCount: res.topicsCreated,
        proposals: (recentProposals.results || []).map((p) => ({
          id: p.id,
          title: p.title,
          contentAngle: p.content_angle || '',
          contentPillar: p.content_pillar || 'GENERAL',
          sourceUrl: p.source_url || undefined,
        })),
        cloudflareVerifiedNeurons: cfTelemetry.actualNeurons,
        estimatedTokens: Math.round(res.itemsDiscovered * 120),
        durationMs: Date.now() - startTime,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // STAGE 2 — Posts (Generation & Quality)
  // ---------------------------------------------------------------------------

  async runPostGeneration(ideaId?: string, actor: PipelineActor = 'admin'): Promise<GenerationStageResult> {
    return this.withLock('stage_generation', actor, 600, async (runId) => {
      const startTime = Date.now();

      let targetIdeaId = ideaId;
      if (!targetIdeaId) {
        const topIdea = await this.db
          .prepare(
            `SELECT id FROM content_ideas
             WHERE status IN ${ACTIVE_TOPIC_STATUSES}
             ORDER BY relevance_score DESC, priority DESC, created_at ASC
             LIMIT 1`,
          )
          .first<{ id: string }>();
        if (!topIdea) {
          throw new Error('No candidate content ideas available in queue. Run topic discovery first.');
        }
        targetIdeaId = topIdea.id;
      }

      const ideaRow = await this.db
        .prepare('SELECT title FROM content_ideas WHERE id = ?')
        .bind(targetIdeaId)
        .first<{ title: string }>();

      const planner = new ContentPlannerService(this.db, this.env, this.auditLogger);
      const planResult = await planner.generatePostFromTopic(targetIdeaId, actor);

      const emptyClassification = {
        pillar: 'GENERAL',
        postType: 'SHORT_SOCIAL',
        engagementPotential: 0,
        clarity: 0,
        practicalValue: 0,
        brandRelevance: 0,
        originality: 0,
      };

      if (planResult.status !== 'approved' || !planResult.postId) {
        return {
          runId,
          ideaId: targetIdeaId,
          title: ideaRow?.title || 'Unapproved Draft',
          body: '',
          qualityScore: planResult.qualityScore || 0,
          classification: emptyClassification,
          finalDecision:
            planResult.status === 'blocked' ? 'BLOCKED' : planResult.status === 'deferred' ? 'DEFERRED' : 'REJECTED',
          rejectionReason: planResult.errorMessage || 'Failed quality gate evaluation.',
          durationMs: Date.now() - startTime,
        };
      }

      const postRow = await this.db
        .prepare(
          `SELECT p.id, p.title, p.quality_score, v.content, v.metadata
           FROM posts p
           JOIN post_versions v ON p.id = v.post_id AND p.current_version = v.version_number
           WHERE p.id = ?`,
        )
        .bind(planResult.postId)
        .first<{ id: string; title: string; quality_score: number; content: string; metadata: string }>();

      let meta: Record<string, unknown> = {};
      if (postRow?.metadata) {
        try {
          meta = JSON.parse(postRow.metadata);
        } catch {
          // ignore malformed metadata
        }
      }

      return {
        runId,
        postId: planResult.postId,
        ideaId: targetIdeaId,
        title: postRow?.title || ideaRow?.title || 'Generated Post',
        body: postRow?.content || '',
        qualityScore: postRow?.quality_score || planResult.qualityScore || 0,
        classification: {
          ...emptyClassification,
          pillar: String(meta.pillar || 'SMALL_BUSINESS'),
          postType: 'SHORT_POST',
        },
        finalDecision: 'PASS',
        durationMs: Date.now() - startTime,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // STAGE 3 — Images
  // ---------------------------------------------------------------------------

  /**
   * Assigns images to approved, unpublished posts that do not have one for their current version.
   * Order: best APPROVED image from the curated library, then Openverse search (the found
   * candidate is added to the library as APPROVED — same behaviour as the manual "search image").
   */
  async runImagesStage(actor: PipelineActor = 'admin', limit = 5): Promise<ImagesStageResult> {
    return this.withLock('stage_images', actor, 300, async (runId) => {
      const startTime = Date.now();
      const rows = await this.db
        .prepare(
          `SELECT p.id, p.title, pv.content, ci.category
           FROM posts p
           JOIN post_versions pv ON pv.post_id = p.id AND pv.version_number = p.current_version
           LEFT JOIN content_ideas ci ON ci.id = p.idea_id
           WHERE p.status IN ('approved', 'scheduled')
             AND NOT EXISTS (SELECT 1 FROM post_images pi WHERE pi.post_id = p.id AND pi.version_number = p.current_version)
           ORDER BY p.created_at ASC
           LIMIT ?`,
        )
        .bind(limit)
        .all<{ id: string; title: string; content: string; category: string | null }>();

      const imgLibrary = new ImageLibraryService(this.db, this.auditLogger);
      const openverse = new OpenverseImageService(this.env);
      const result: ImagesStageResult = {
        runId,
        processed: 0,
        assignedFromLibrary: 0,
        assignedFromOpenverse: 0,
        generatedFromAi: 0,
        notFound: 0,
        details: [],
        durationMs: 0,
      };

      let recentlyUsedUrls: Set<string> | null = null;

      for (const post of rows.results || []) {
        result.processed++;
        const category = post.category || 'Technology & Business';
        try {
          const libMatch = await imgLibrary.findBestApprovedImage(post.title, category, post.content, post.id);
          if (libMatch) {
            await imgLibrary.reserveImageForDraft(libMatch.image.id, post.id, false);
            result.assignedFromLibrary++;
            result.details.push({ postId: post.id, title: post.title, source: 'library' });
            continue;
          }

          if (!recentlyUsedUrls) {
            const used = await this.db
              .prepare('SELECT url FROM post_images ORDER BY created_at DESC LIMIT 50')
              .all<{ url: string }>();
            recentlyUsedUrls = new Set((used.results || []).map((r) => r.url));
          }

          const found = await openverse.findBestImage(post.title, category, post.content, recentlyUsedUrls);
          if (found) {
            const cand = found.candidate;
            await imgLibrary.addCandidate({
              title: cand.title || 'Selected Illustration',
              sourceUrl: cand.sourceUrl || cand.url,
              originalPageUrl: cand.sourceUrl || cand.url,
              author: cand.author || undefined,
              authorUrl: cand.authorUrl || undefined,
              license: cand.license || undefined,
              licenseUrl: cand.licenseUrl || undefined,
              category,
              description: post.title,
              score: found.score,
            });
            // STRICT POLICY: Never auto-approve discovered candidates.
            // They stay in PENDING for manual admin review. The post remains without an image.
            result.assignedFromOpenverse++;
            result.details.push({ postId: post.id, title: post.title, source: 'openverse' });
            continue;
          }

          // Automatic AI Generation Fallback:
          // If web search found nothing suitable, generate a realistic business image candidate via Workers AI
          // if Cloudflare bindings are configured and daily quota (1/day) is available.
          let aiGenerated = false;
          if (this.env.AI && this.env.IMAGE_BUCKET) {
            try {
              const { AiImageGeneratorService } = await import('./ai-image-generator');
              const aiGen = new AiImageGeneratorService(this.env);
              const quota = await aiGen.checkDailyImageQuota(this.db);
              if (quota.allowed) {
                const originUrl = 'https://ai.northsoft.is';
                await aiGen.generateAndPersistImage(this.db, originUrl, {
                  category,
                  description: post.title,
                  postContext: post.content ? post.content.slice(0, 150) : undefined,
                });
                result.generatedFromAi++;
                result.details.push({ postId: post.id, title: post.title, source: 'ai' });
                aiGenerated = true;
              }
            } catch (aiErr: unknown) {
              console.warn('[runImagesStage] AI generation fallback skipped:', aiErr);
            }
          }

          if (!aiGenerated) {
            result.notFound++;
            result.details.push({ postId: post.id, title: post.title, source: 'none' });
          }
        } catch (err: unknown) {
          result.notFound++;
          result.details.push({
            postId: post.id,
            title: post.title,
            source: 'none',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      result.durationMs = Date.now() - startTime;
      return result;
    });
  }

  // ---------------------------------------------------------------------------
  // STAGE 4 — Scheduling (IntelligentSchedulingService, no AI)
  // ---------------------------------------------------------------------------

  /**
   * Schedules approved posts that have an image and no pending schedule, using the
   * existing IntelligentSchedulingService slot proposal algorithm.
   */
  async runSchedulingStage(actor: PipelineActor = 'admin'): Promise<SchedulingStageResult> {
    return this.withLock('stage_scheduling', actor, 120, async (runId) => {
      const startTime = Date.now();

      const ready = await this.db
        .prepare(
          `SELECT p.id FROM posts p
           WHERE p.status = 'approved'
             AND EXISTS (SELECT 1 FROM post_images pi WHERE pi.post_id = p.id AND pi.version_number = p.current_version)
             AND NOT EXISTS (SELECT 1 FROM schedules s WHERE s.post_id = p.id AND s.status IN ('pending', 'publishing'))
             AND NOT EXISTS (SELECT 1 FROM publications pub WHERE pub.post_id = p.id AND pub.status = 'published')
           ORDER BY p.quality_score DESC, p.created_at ASC
           LIMIT 20`,
        )
        .all<{ id: string }>();

      const withoutImage = await this.db
        .prepare(
          `SELECT COUNT(*) as cnt FROM posts p
           WHERE p.status = 'approved'
             AND NOT EXISTS (SELECT 1 FROM post_images pi WHERE pi.post_id = p.id AND pi.version_number = p.current_version)`,
        )
        .first<{ cnt: number }>();

      const postIds = (ready.results || []).map((r) => r.id);
      const result: SchedulingStageResult = {
        runId,
        scheduledCount: 0,
        skippedWithoutImage: withoutImage?.cnt ?? 0,
        slots: [],
        durationMs: 0,
      };

      if (postIds.length > 0) {
        const scheduler = new IntelligentSchedulingService();
        const slots = await scheduler.proposeIntelligentSchedules(this.db, postIds);
        for (const slot of slots) {
          await this.commitSchedule(slot.postId, slot.scheduledAtIso, slot.decisionMetadata, actor);
          result.scheduledCount++;
          result.slots.push({
            postId: slot.postId,
            postTitle: slot.postTitle,
            scheduledAtIso: slot.scheduledAtIso,
            reason: slot.reason,
          });
        }
      }

      result.durationMs = Date.now() - startTime;
      return result;
    });
  }

  private async commitSchedule(
    postId: string,
    scheduledAtIso: string,
    decisionMetadata: unknown,
    actor: PipelineActor,
  ): Promise<void> {
    const nowIso = new Date().toISOString();
    const metadataJson = decisionMetadata ? JSON.stringify(decisionMetadata) : null;
    const existing = await this.db.prepare('SELECT id FROM schedules WHERE post_id = ?').bind(postId).first<{ id: string }>();

    if (existing) {
      await this.db
        .prepare("UPDATE schedules SET scheduled_at = ?, status = 'pending', decision_metadata = ?, updated_at = ? WHERE post_id = ?")
        .bind(scheduledAtIso, metadataJson, nowIso, postId)
        .run();
    } else {
      await this.db
        .prepare(
          `INSERT INTO schedules (id, post_id, scheduled_at, timezone, status, decision_metadata, created_at, updated_at)
           VALUES (?, ?, ?, 'UTC', 'pending', ?, ?, ?)`,
        )
        .bind(crypto.randomUUID(), postId, scheduledAtIso, metadataJson, nowIso, nowIso)
        .run();
    }

    await this.db.prepare("UPDATE posts SET status = 'scheduled', updated_at = ? WHERE id = ?").bind(nowIso, postId).run();
    await this.db
      .prepare(
        `UPDATE content_ideas SET status = 'scheduled', updated_at = ?
         WHERE id = (SELECT idea_id FROM posts WHERE id = ?)`,
      )
      .bind(nowIso, postId)
      .run();

    await this.auditLogger.log({
      eventType: 'POST_SCHEDULED',
      entityType: 'post',
      entityId: postId,
      actor,
      details: { scheduledAt: scheduledAtIso, strategy: 'intelligent_scheduler' },
    });
  }

  // ---------------------------------------------------------------------------
  // Unified stage runner (manual buttons + automation)
  // ---------------------------------------------------------------------------

  async runStage(stage: PipelineStage, actor: PipelineActor = 'admin'): Promise<StageRunResult> {
    const triggerType = actor === 'admin' ? 'manual' : 'cron';
    const runId = newRunId(`stage-${stage}`);
    await this.recordRunStart(runId, triggerType);

    try {
      let res: StageRunResult;
      switch (stage) {
        case 'topics': {
          const r = await this.runDiscovery(actor);
          res = { stage, success: true, result: r, summary: `Nowe tematy: ${r.newProposalsCount}` };
          await this.recordRunEnd(runId, 'completed', 'topics', { topicsDiscovered: r.newProposalsCount, message: res.summary });
          break;
        }
        case 'posts': {
          const r = await this.runPostGeneration(undefined, actor);
          const ok = r.finalDecision === 'PASS';
          res = {
            stage,
            success: ok,
            result: r,
            summary: ok ? `Wygenerowano post: "${r.title}"` : `Post odrzucony (${r.finalDecision}): ${r.rejectionReason || ''}`,
          };
          await this.recordRunEnd(runId, ok ? 'completed' : r.finalDecision === 'DEFERRED' ? 'deferred' : 'failed', 'posts', {
            postId: r.postId,
            topicsSelected: 1,
            message: res.summary,
          });
          break;
        }
        case 'images': {
          const r = await this.runImagesStage(actor);
          const assigned = r.assignedFromLibrary + r.assignedFromOpenverse;
          res = {
            stage,
            success: true,
            result: r,
            summary: `Obrazy: przypisano ${assigned} (biblioteka ${r.assignedFromLibrary}, Openverse ${r.assignedFromOpenverse}), brak ${r.notFound}`,
          };
          await this.recordRunEnd(runId, 'completed', 'images', { message: res.summary });
          break;
        }
        case 'scheduling': {
          const r = await this.runSchedulingStage(actor);
          res = {
            stage,
            success: true,
            result: r,
            summary: `Zaplanowano ${r.scheduledCount} post(ów)` + (r.skippedWithoutImage ? `, ${r.skippedWithoutImage} czeka na obraz` : ''),
          };
          await this.recordRunEnd(runId, 'completed', 'scheduling', { message: res.summary });
          break;
        }
        default:
          throw new Error(`Unknown pipeline stage: ${String(stage)}`);
      }
      return res;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.recordRunEnd(runId, 'failed', stage, { message });
      return { stage, success: false, summary: message, error: message };
    }
  }

  /**
   * Manual "run everything now": topics (only if backlog is low) → one post → images → scheduling.
   * Never publishes directly; publication happens at the scheduled time.
   */
  async runAllStages(actor: PipelineActor = 'admin'): Promise<StageRunResult[]> {
    const config = await this.getSchedulerConfig();
    const counts = await this.getCounts();
    const steps: StageRunResult[] = [];

    if (counts.availableTopics < config.minTopicBacklog) {
      steps.push(await this.runStage('topics', actor));
    }
    steps.push(await this.runStage('posts', actor));
    steps.push(await this.runStage('images', actor));
    steps.push(await this.runStage('scheduling', actor));
    return steps;
  }

  // ---------------------------------------------------------------------------
  // Automation (cron tick)
  // ---------------------------------------------------------------------------

  /**
   * Called by the Worker cron every 5 minutes. Performs at most one AI step per tick
   * inside the nightly window, plus non-AI scheduling whenever posts are ready.
   */
  async runAutomationTick(now: Date = new Date()): Promise<AutomationTickResult> {
    const config = await this.getSchedulerConfig();
    if (!config.enabled) {
      return { ran: false, reason: 'Automation is disabled.', steps: [] };
    }

    const runId = newRunId('automation');
    const acquired = await this.acquireLock('automation_tick', runId, 'system', 900);
    if (!acquired) {
      return { ran: false, reason: 'Previous automation tick still running.', steps: [] };
    }

    const steps: StageRunResult[] = [];
    try {
      const counts = await this.getCounts(now);
      const needs = this.evaluateNeeds(config, counts);

      if (isWithinAiBackgroundWindow(now)) {
        let aiStage: PipelineStage | null = null;
        if (needs.images) aiStage = 'images';
        else if (needs.topics && !(await this.stageRanTonight('topics', now))) aiStage = 'topics';
        else if (needs.posts) aiStage = 'posts';

        if (aiStage) {
          steps.push(await this.runStage(aiStage, 'system'));
        }
      }

      const countsAfter = steps.length > 0 ? await this.getCounts(now) : counts;
      if (countsAfter.readyToSchedule > 0) {
        steps.push(await this.runStage('scheduling', 'system'));
      }

      return {
        ran: steps.length > 0,
        reason: steps.length > 0 ? steps.map((s) => s.summary).join(' | ') : 'Nothing to do.',
        steps,
      };
    } finally {
      await this.releaseLock('automation_tick');
    }
  }

  private evaluateNeeds(config: SchedulerConfig, counts: PipelineStatus['counts']): PipelineStatus['needs'] {
    return {
      topics: counts.availableTopics < config.minTopicBacklog,
      posts:
        counts.availableTopics > 0 &&
        counts.coverageDays < config.targetCoverageDays &&
        counts.postsGeneratedTonight < config.maxPostsPerNight,
      images: counts.postsWithoutImage > 0,
      scheduling: counts.readyToSchedule > 0,
    };
  }

  private tonightWindowStartIso(now: Date): string {
    const start = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      AI_BACKGROUND_WINDOW.START_HOUR_UTC,
      AI_BACKGROUND_WINDOW.START_MINUTE_UTC,
    ));
    if (now.getTime() < start.getTime()) start.setUTCDate(start.getUTCDate() - 1);
    return start.toISOString();
  }

  private async stageRanTonight(stage: PipelineStage, now: Date): Promise<boolean> {
    const row = await this.db
      .prepare(
        "SELECT id FROM orchestrator_runs WHERE trigger_type = 'cron' AND result_status = ? AND started_at >= ? LIMIT 1",
      )
      .bind(stage, this.tonightWindowStartIso(now))
      .first<{ id: string }>();
    return Boolean(row);
  }

  async getCounts(now: Date = new Date()): Promise<PipelineStatus['counts']> {
    const scalar = async (sql: string, ...binds: unknown[]): Promise<number> => {
      try {
        const stmt = this.db.prepare(sql);
        const row = await (binds.length ? stmt.bind(...binds) : stmt).first<{ cnt: number }>();
        return Number(row?.cnt ?? 0);
      } catch {
        return 0;
      }
    };

    const [availableTopics, postsWithoutImage, readyToSchedule, scheduledPending, postsGeneratedTonight] = await Promise.all([
      scalar(`SELECT COUNT(*) as cnt FROM content_ideas WHERE status IN ${ACTIVE_TOPIC_STATUSES}`),
      scalar(
        `SELECT COUNT(*) as cnt FROM posts p
         WHERE p.status IN ('approved', 'scheduled')
           AND NOT EXISTS (SELECT 1 FROM post_images pi WHERE pi.post_id = p.id AND pi.version_number = p.current_version)`,
      ),
      scalar(
        `SELECT COUNT(*) as cnt FROM posts p
         WHERE p.status = 'approved'
           AND EXISTS (SELECT 1 FROM post_images pi WHERE pi.post_id = p.id AND pi.version_number = p.current_version)
           AND NOT EXISTS (SELECT 1 FROM schedules s WHERE s.post_id = p.id AND s.status IN ('pending', 'publishing'))`,
      ),
      scalar("SELECT COUNT(*) as cnt FROM schedules WHERE status IN ('pending', 'publishing') AND scheduled_at > ?", now.toISOString()),
      scalar(
        "SELECT COUNT(*) as cnt FROM orchestrator_runs WHERE trigger_type = 'cron' AND result_status = 'posts' AND status = 'completed' AND started_at >= ?",
        this.tonightWindowStartIso(now),
      ),
    ]);

    let coverageDays: number;
    try {
      coverageDays = (await new IntelligentSchedulingService().calculateScheduleCoverageDays(this.db)).coverageDays;
    } catch {
      coverageDays = 0;
    }

    return { availableTopics, postsWithoutImage, readyToSchedule, scheduledPending, coverageDays, postsGeneratedTonight };
  }

  async getStatus(now: Date = new Date()): Promise<PipelineStatus> {
    const config = await this.getSchedulerConfig();
    const counts = await this.getCounts(now);
    return {
      config,
      window: {
        label: AI_BACKGROUND_WINDOW_LABEL,
        inWindow: isWithinAiBackgroundWindow(now),
        nextWindowStart: getNextAiWindowStart(now).toISOString(),
      },
      counts,
      needs: this.evaluateNeeds(config, counts),
    };
  }

  // ---------------------------------------------------------------------------
  // Run history (orchestrator_runs)
  // ---------------------------------------------------------------------------

  private async recordRunStart(runId: string, triggerType: 'manual' | 'cron'): Promise<void> {
    try {
      const nowIso = new Date().toISOString();
      await this.db
        .prepare(
          `INSERT INTO orchestrator_runs (id, trigger_type, status, started_at, created_at)
           VALUES (?, ?, 'running', ?, ?)`,
        )
        .bind(runId, triggerType, nowIso, nowIso)
        .run();
    } catch {
      // history is best-effort
    }
  }

  private async recordRunEnd(
    runId: string,
    status: 'completed' | 'failed' | 'deferred',
    stage: PipelineStage,
    extra: { postId?: string; topicsDiscovered?: number; topicsSelected?: number; message?: string },
  ): Promise<void> {
    try {
      await this.db
        .prepare(
          `UPDATE orchestrator_runs
           SET status = ?, finished_at = ?, result_status = ?, post_id = ?, topics_discovered = ?, topics_selected = ?, error_message = ?
           WHERE id = ?`,
        )
        .bind(
          status,
          new Date().toISOString(),
          stage,
          extra.postId || null,
          extra.topicsDiscovered ?? 0,
          extra.topicsSelected ?? 0,
          extra.message ? extra.message.substring(0, 500) : null,
          runId,
        )
        .run();
    } catch {
      // history is best-effort
    }
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  async getSchedulerConfig(): Promise<SchedulerConfig> {
    let row: {
      enabled: number;
      min_topic_backlog?: number;
      target_coverage_days?: number;
      max_posts_per_night?: number;
      updated_at?: string;
    } | null;
    try {
      row = await this.db
        .prepare("SELECT * FROM pipeline_scheduler_config WHERE id = 'default'")
        .first();
    } catch {
      row = null;
    }

    if (!row) return { ...DEFAULT_CONFIG };

    return {
      enabled: Boolean(row.enabled),
      minTopicBacklog: clampInt(row.min_topic_backlog, 0, 100, DEFAULT_CONFIG.minTopicBacklog),
      targetCoverageDays: clampInt(row.target_coverage_days, 1, 90, DEFAULT_CONFIG.targetCoverageDays),
      maxPostsPerNight: clampInt(row.max_posts_per_night, 0, 10, DEFAULT_CONFIG.maxPostsPerNight),
      updatedAt: row.updated_at,
    };
  }

  async updateSchedulerConfig(input: Partial<SchedulerConfig>): Promise<SchedulerConfig> {
    const current = await this.getSchedulerConfig();
    const updated: SchedulerConfig = {
      enabled: input.enabled !== undefined ? Boolean(input.enabled) : current.enabled,
      minTopicBacklog: clampInt(input.minTopicBacklog ?? current.minTopicBacklog, 0, 100, current.minTopicBacklog),
      targetCoverageDays: clampInt(input.targetCoverageDays ?? current.targetCoverageDays, 1, 90, current.targetCoverageDays),
      maxPostsPerNight: clampInt(input.maxPostsPerNight ?? current.maxPostsPerNight, 0, 10, current.maxPostsPerNight),
      updatedAt: new Date().toISOString(),
    };

    await this.db
      .prepare(
        `INSERT INTO pipeline_scheduler_config (
          id, enabled, min_topic_backlog, target_coverage_days, max_posts_per_night, updated_at
        ) VALUES ('default', ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          enabled = excluded.enabled,
          min_topic_backlog = excluded.min_topic_backlog,
          target_coverage_days = excluded.target_coverage_days,
          max_posts_per_night = excluded.max_posts_per_night,
          updated_at = excluded.updated_at`,
      )
      .bind(
        updated.enabled ? 1 : 0,
        updated.minTopicBacklog,
        updated.targetCoverageDays,
        updated.maxPostsPerNight,
        updated.updatedAt,
      )
      .run();

    await this.auditLogger.log({
      eventType: 'CONFIG_CHANGED',
      entityType: 'scheduler_config',
      entityId: 'default',
      actor: 'admin',
      details: {
        enabled: updated.enabled,
        minTopicBacklog: updated.minTopicBacklog,
        targetCoverageDays: updated.targetCoverageDays,
        maxPostsPerNight: updated.maxPostsPerNight,
      },
    });

    return updated;
  }
}
