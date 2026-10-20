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
import { AppError } from '../../core/errors';
import { D1AuditLogger, type IAuditLogger } from '../../core/audit';
import {
  AI_BACKGROUND_WINDOW,
  AI_BACKGROUND_WINDOW_LABEL,
  getNextAiWindowStart,
  isAiExecutionPermitted,
  isWithinAiBackgroundWindow,
} from '../../core/ai-window-policy';
import { CloudflareUsageService } from '../cloudflare/cloudflare-usage-service';
import { D1QuotaService } from '../cloudflare/d1-quota-service';
import { IntelligentSchedulingService } from '../publishing/intelligent-scheduler-service';
import { ResearchService } from '../research/research-service';
import { TopicRegistry } from '../research/topic-registry';
import { ContentPlannerService } from './content-planner-service';
import { ImageLibraryService } from './image-library-service';
import { OpenverseImageService } from './image-service';

export type PipelineStage = 'topics' | 'posts' | 'images' | 'scheduling';
export type PipelineActor = 'admin' | 'system';

/**
 * Business outcome of a run, distinct from technical execution status (completed/failed):
 *  - COMPLETED_WITH_OUTPUT: at least one durable artefact was produced (topic, deferred topic, post, image, schedule)
 *  - COMPLETED_NO_WORK:     ran correctly but there was nothing eligible to do (legitimate idle state)
 *  - BLOCKED:               eligible work exists but a named blocker prevents progress
 *  - FAILED:                a stage threw or produced only failures
 */
export type PipelineOutcome = 'COMPLETED_WITH_OUTPUT' | 'COMPLETED_NO_WORK' | 'BLOCKED' | 'FAILED';

/** Granular classification of AI operations */
export type AiOutcome = 'EXECUTED' | 'AWAITING_WINDOW' | 'BLOCKED_QUOTA' | 'NO_WORK_NEEDED' | 'FAILED';

/** Granular classification of non-AI deterministic operations (24/7) */
export type DeterministicOutcome = 'EXECUTED' | 'BLOCKED_DEPENDENCY' | 'NO_WORK_NEEDED' | 'FAILED';

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
  deferredCount: number;
  invalidResponses: number;
  candidatesEvaluated: number;
  seedsSkippedCooldown: number;
  deferralReasons: string[];
  researchError?: string;
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
  outcome?: PipelineOutcome;
  error?: string;
}

export interface AutomationTickResult {
  ran: boolean;
  reason: string;
  outcome?: PipelineOutcome;
  aiOutcome?: AiOutcome;
  deterministicOutcome?: DeterministicOutcome;
  /** Named blockers when work is blocked (e.g. AI quota exhaustion or posts awaiting an approved image). */
  blockers?: string[];
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
    deferredTopics?: number;
  };
  needs: {
    topics: boolean;
    posts: boolean;
    images: boolean;
    scheduling: boolean;
  };
  modes?: {
    aiOperations: 'window_restricted';
    deterministicOperations: 'always_active_24_7';
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

  async runDiscovery(actor: PipelineActor = 'admin'): Promise<DiscoveryStageResult> {
    const d1QuotaService = new D1QuotaService();
    const d1Status = await d1QuotaService.getD1UsageStatus(this.db, this.cfUsageService);
    const deferCheck = d1QuotaService.shouldDeferStage('topics', d1Status, actor === 'admin');
    if (deferCheck.defer) {
      throw new AppError(deferCheck.reason || "Stage 'topics' blocked: D1 Protective Mode Active.", 409, 'PROTECTIVE_MODE_ACTIVE');
    }

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
        deferredCount: res.ideasDeferred,
        invalidResponses: res.aiInvalidResponses ?? 0,
        candidatesEvaluated: res.candidatesEvaluated ?? res.aiInferenceRequests,
        seedsSkippedCooldown: res.seedsSkippedCooldown ?? 0,
        deferralReasons: res.deferralReasons ?? [],
        researchError: res.status === 'failed' ? res.errorMessage || 'Research pipeline failed' : undefined,
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

  async runPostGeneration(ideaId?: string, actor: PipelineActor = 'admin', nowDate: Date = new Date()): Promise<GenerationStageResult> {
    if (!isAiExecutionPermitted(actor, nowDate)) {
      return {
        runId: newRunId('stage_generation_deferred'),
        ideaId,
        title: 'Post generation deferred',
        body: '',
        qualityScore: 0,
        classification: {
          pillar: 'GENERAL',
          postType: 'SHORT_SOCIAL',
          engagementPotential: 0,
          clarity: 0,
          practicalValue: 0,
          brandRelevance: 0,
          originality: 0,
        },
        finalDecision: 'DEFERRED',
        rejectionReason: `Outside AI background execution window (${AI_BACKGROUND_WINDOW_LABEL}). Post generation deferred.`,
        durationMs: 0,
      };
    }

    const d1QuotaService = new D1QuotaService();
    const d1Status = await d1QuotaService.getD1UsageStatus(this.db, this.cfUsageService);
    const deferCheck = d1QuotaService.shouldDeferStage('posts', d1Status, actor === 'admin');
    if (deferCheck.defer) {
      throw new AppError(deferCheck.reason || "Stage 'posts' blocked: D1 Protective Mode Active.", 409, 'PROTECTIVE_MODE_ACTIVE');
    }

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
      const planResult = await planner.generatePostFromTopic(targetIdeaId, actor, nowDate);

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

  /**
   * Assigns images to approved, unpublished posts that do not have one for their current version.
   * Order: best APPROVED image from the curated library, then Openverse search (the found
   * candidate is added to the library as APPROVED — same behaviour as the manual "search image").
   */
  async runImagesStage(actor: PipelineActor = 'admin', limit = 5, nowDate?: Date): Promise<ImagesStageResult> {
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
          // ONLY during the nightly AI window (or when manually triggered by admin)
          let aiGenerated = false;
          const isAiAllowed = nowDate !== undefined ? isAiExecutionPermitted(actor, nowDate) : true;
          if (isAiAllowed && this.env.AI && this.env.IMAGE_BUCKET) {
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

    const scheduleStmt = existing
      ? this.db
          .prepare("UPDATE schedules SET scheduled_at = ?, status = 'pending', decision_metadata = ?, updated_at = ? WHERE post_id = ?")
          .bind(scheduledAtIso, metadataJson, nowIso, postId)
      : this.db
          .prepare(
            `INSERT INTO schedules (id, post_id, scheduled_at, timezone, status, decision_metadata, created_at, updated_at)
             VALUES (?, ?, ?, 'UTC', 'pending', ?, ?, ?)`,
          )
          .bind(crypto.randomUUID(), postId, scheduledAtIso, metadataJson, nowIso, nowIso);

    const postStmt = this.db.prepare("UPDATE posts SET status = 'scheduled', updated_at = ? WHERE id = ?").bind(nowIso, postId);
    const ideaStmt = this.db
      .prepare(
        `UPDATE content_ideas SET status = 'scheduled', updated_at = ?
         WHERE id = (SELECT idea_id FROM posts WHERE id = ?)`,
      )
      .bind(nowIso, postId);

    // Atomically commit schedule, post status, and content_idea in one batch
    await this.db.batch([scheduleStmt, postStmt, ideaStmt]);

    await this.auditLogger.log({
      eventType: 'POST_SCHEDULED',
      entityType: 'post',
      entityId: postId,
      actor,
      details: { scheduledAt: scheduledAtIso, strategy: 'intelligent_scheduler' },
    });
  }

  async runStage(stage: PipelineStage, actor: PipelineActor = 'admin', now: Date = new Date()): Promise<StageRunResult> {
    // Execution-layer protective mode enforcement: check quota before running expensive stages
    if (stage !== 'scheduling') {
      const d1QuotaService = new D1QuotaService();
      const d1Status = await d1QuotaService.getD1UsageStatus(this.db, this.cfUsageService);
      const deferCheck = d1QuotaService.shouldDeferStage(stage, d1Status, actor === 'admin');
      if (deferCheck.defer) {
        const errorMsg = deferCheck.reason || `Stage '${stage}' blocked: D1 Protective Mode Active.`;
        throw new AppError(errorMsg, 409, 'PROTECTIVE_MODE_ACTIVE');
      }
    }

    const triggerType = actor === 'admin' ? 'manual' : 'cron';
    const runId = newRunId(`stage-${stage}`);
    await this.recordRunStart(runId, triggerType, stage);

    // AI execution window policy check: non-admin automated AI stages cannot run outside the window
    if (actor !== 'admin' && (stage === 'topics' || stage === 'posts') && !isWithinAiBackgroundWindow(now)) {
      const deferMsg = `Outside AI background execution window (${AI_BACKGROUND_WINDOW_LABEL}). Stage '${stage}' deferred until next nightly window.`;
      await this.recordRunEnd(runId, 'deferred', stage, {
        message: deferMsg,
        details: { outcome: 'BLOCKED', stage, reason: deferMsg },
      });
      return {
        stage,
        success: true,
        outcome: 'BLOCKED',
        summary: deferMsg,
      };
    }

    try {
      let res: StageRunResult;
      switch (stage) {
        case 'topics': {
          const r = await this.runDiscovery(actor);
          const found = r.rawItemsDiscovered;
          const accepted = r.newProposalsCount;
          const rejected = r.rejectedCount + r.duplicatesFound + r.noUsefulAngleCount;
          const outcome: PipelineOutcome = r.researchError
            ? 'FAILED'
            : accepted + r.deferredCount > 0
              ? 'COMPLETED_WITH_OUTPUT'
              : r.candidatesEvaluated === 0 && r.aiInferenceRequests === 0
                ? 'COMPLETED_NO_WORK'
                : 'BLOCKED';
          res = {
            stage,
            success: !r.researchError,
            result: r,
            outcome,
            summary:
              `Znaleziono ${found} elementów źródłowych, oceniono AI ${r.candidatesEvaluated}, ` +
              `odrzucono ${rejected}, odroczono ${r.deferredCount}, zaakceptowano ${accepted}` +
              (r.invalidResponses ? `, nieprawidłowe odpowiedzi AI ${r.invalidResponses}` : '') +
              (r.aiInferenceFailed ? `, błędy AI ${r.aiInferenceFailed}` : ''),
          };
          await this.recordRunEnd(runId, r.researchError ? 'failed' : 'completed', 'topics', {
            topicsDiscovered: accepted,
            message: res.summary,
            neuronsUsed: r.cloudflareVerifiedNeurons ?? 0,
            details: {
              outcome,
              itemsFound: found,
              itemsAccepted: accepted,
              itemsRejected: rejected,
              itemsDeferred: r.deferredCount,
              candidatesEvaluated: r.candidatesEvaluated,
              duplicates: r.duplicatesFound,
              noUsefulAngle: r.noUsefulAngleCount,
              invalidAiResponses: r.invalidResponses,
              aiFailures: r.aiInferenceFailed,
              seedsSkippedCooldown: r.seedsSkippedCooldown,
              deferralReasons: r.deferralReasons,
              researchError: r.researchError,
              proposals: r.proposals.map((p) => ({ id: p.id, title: p.title, pillar: p.contentPillar, status: 'accepted' })),
              sourcesChecked: r.sourcesChecked,
              aiRequests: r.aiInferenceRequests,
            },
          });
          break;
        }
        case 'posts': {
          const r = await this.runPostGeneration(undefined, actor, now);
          const ok = r.finalDecision === 'PASS';
          const postOutcome: PipelineOutcome = ok
            ? 'COMPLETED_WITH_OUTPUT'
            : r.finalDecision === 'DEFERRED' || r.finalDecision === 'BLOCKED'
              ? 'BLOCKED'
              : 'FAILED';
          res = {
            stage,
            success: ok,
            result: r,
            outcome: postOutcome,
            summary: ok ? `Wygenerowano post: "${r.title}"` : `Post odrzucony (${r.finalDecision}): ${r.rejectionReason || ''}`,
          };
          await this.recordRunEnd(runId, ok ? 'completed' : r.finalDecision === 'DEFERRED' ? 'deferred' : 'failed', 'posts', {
            postId: r.postId,
            topicsSelected: 1,
            message: res.summary,
            details: {
              outcome: postOutcome,
              postId: r.postId,
              ideaId: r.ideaId,
              title: r.title,
              finalDecision: r.finalDecision,
              qualityScore: r.qualityScore,
              rejectionReason: r.rejectionReason,
              classification: r.classification,
            },
          });
          break;
        }
        case 'images': {
          const r = await this.runImagesStage(actor, 5, now);
          // Only a library match actually attaches an image. Openverse/AI results are PENDING candidates
          // that still need manual approval, so the post remains blocked until then.
          const attached = r.assignedFromLibrary;
          const candidatesCreated = r.assignedFromOpenverse + r.generatedFromAi;
          const imageOutcome: PipelineOutcome =
            r.processed === 0 ? 'COMPLETED_NO_WORK' : attached > 0 ? 'COMPLETED_WITH_OUTPUT' : 'BLOCKED';
          res = {
            stage,
            success: true,
            result: r,
            outcome: imageOutcome,
            summary: `Ilustracje: przetworzono ${r.processed}, dołączono ${attached} z biblioteki, kandydaci do akceptacji ${candidatesCreated} (Openverse ${r.assignedFromOpenverse}, AI ${r.generatedFromAi}), bez wyniku ${r.notFound}`,
          };
          await this.recordRunEnd(runId, 'completed', 'images', {
            message: res.summary,
            details: {
              outcome: imageOutcome,
              processed: r.processed,
              attachedFromLibrary: attached,
              candidatesAwaitingApproval: candidatesCreated,
              assignedFromLibrary: r.assignedFromLibrary,
              assignedFromOpenverse: r.assignedFromOpenverse,
              generatedFromAi: r.generatedFromAi,
              notFound: r.notFound,
              assignedDetails: r.details,
            },
          });
          break;
        }
        case 'scheduling': {
          const r = await this.runSchedulingStage(actor);
          const schedOutcome: PipelineOutcome =
            r.scheduledCount > 0 ? 'COMPLETED_WITH_OUTPUT' : r.skippedWithoutImage > 0 ? 'BLOCKED' : 'COMPLETED_NO_WORK';
          res = {
            stage,
            success: true,
            result: r,
            outcome: schedOutcome,
            summary: `Zaplanowano ${r.scheduledCount} post(ów)` + (r.skippedWithoutImage ? `, ${r.skippedWithoutImage} czeka na obraz` : ''),
          };
          await this.recordRunEnd(runId, 'completed', 'scheduling', {
            message: res.summary,
            details: {
              scheduledCount: r.scheduledCount,
              skippedWithoutImage: r.skippedWithoutImage,
              slots: r.slots.map((s) => ({ postId: s.postId, title: s.postTitle, scheduledAt: s.scheduledAtIso, reason: s.reason })),
            },
          });
          break;
        }
        default:
          throw new Error(`Unknown pipeline stage: ${String(stage)}`);
      }
      return res;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.recordRunEnd(runId, 'failed', stage, {
        message,
        details: { error: message, stage },
      });
      return { stage, success: false, summary: message, error: message };
    }
  }

  /**
   * Manual "run everything now": topics (only if backlog is low) → one post → images → scheduling.
   * Never publishes directly; publication happens at the scheduled time.
   */
  async runAllStages(actor: PipelineActor = 'admin'): Promise<StageRunResult[]> {
    // Check protective mode upfront before starting any batch stage
    const d1QuotaService = new D1QuotaService();
    const d1Status = await d1QuotaService.getD1UsageStatus(this.db, this.cfUsageService);
    const deferCheck = d1QuotaService.shouldDeferStage('runAllStages', d1Status, actor === 'admin');
    if (deferCheck.defer) {
      const errorMsg = deferCheck.reason || 'Batch pipeline blocked: D1 Protective Mode Active.';
      throw new AppError(errorMsg, 409, 'PROTECTIVE_MODE_ACTIVE');
    }

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

  /**
   * Called by the Worker cron every 5 minutes.
   * Architecture: Decoupled two-domain scheduling:
   *  1. Non-AI / Deterministic domain (24/7): deferred topic promotions, approved post scheduling,
   *     and dependency status tracking run throughout the day whenever work exists.
   *  2. AI domain: strictly restricted to the configured nightly window (20:00–23:45 UTC)
   *     before midnight neuron reset to protect quota. Quota exhaustion never blocks deterministic tasks.
   */
  async runAutomationTick(now: Date = new Date(), preloadedConfig?: SchedulerConfig): Promise<AutomationTickResult> {
    const config = preloadedConfig ?? (await this.getSchedulerConfig());
    if (!config.enabled) {
      return { ran: false, reason: 'Automation is disabled.', steps: [] };
    }

    const inAiWindow = isWithinAiBackgroundWindow(now);
    const nowIso = now.toISOString();

    if (!inAiWindow) {
      // Outside AI background window:
      // Single-query index seek checks for any eligible deterministic work (approved schedulable post OR due deferred topic)
      // to guarantee zero writes and exactly 1 fast read outside the window.
      const deterministicWork = await this.db
        .prepare(
          `SELECT p.id FROM posts p
           WHERE p.status = 'approved'
             AND EXISTS (SELECT 1 FROM post_images pi WHERE pi.post_id = p.id AND pi.version_number = p.current_version)
             AND NOT EXISTS (SELECT 1 FROM schedules s WHERE s.post_id = p.id AND s.status IN ('pending', 'publishing'))
           UNION ALL
           SELECT id as id FROM content_ideas
           WHERE status = 'deferred' AND (suggested_publish_date IS NULL OR suggested_publish_date <= ?)
           LIMIT 1`,
        )
        .bind(nowIso)
        .first<{ id: string }>();

      if (!deterministicWork) {
        return {
          ran: false,
          reason: 'Outside AI background window and no approved posts awaiting scheduling.',
          outcome: 'COMPLETED_NO_WORK',
          aiOutcome: 'AWAITING_WINDOW',
          deterministicOutcome: 'NO_WORK_NEEDED',
          steps: [],
        };
      }
    }

    const runId = newRunId('automation');
    const acquired = await this.acquireLock('automation_tick', runId, 'system', 900);
    if (!acquired) {
      return { ran: false, reason: 'Previous automation tick still running.', steps: [] };
    }

    const steps: StageRunResult[] = [];
    let promotedFromDeferred = 0;
    let aiOutcome: AiOutcome = inAiWindow ? 'NO_WORK_NEEDED' : 'AWAITING_WINDOW';
    let deterministicOutcome: DeterministicOutcome = 'NO_WORK_NEEDED';
    let aiQuotaBlockedReason: string | undefined;

    try {
      // 1. DETERMINISTIC STAGE: Cooldown-expired deferred topics are promoted back to 'queued' 24/7
      try {
        const promoRes = await new TopicRegistry(this.db).promoteDeferredTopics(now);
        promotedFromDeferred = promoRes.promoted;
      } catch (promoErr: unknown) {
        console.warn('[automation_tick] promoteDeferredTopics non-fatal error:', promoErr);
      }

      const counts = await this.getCounts(now);
      const needs = this.evaluateNeeds(config, counts);

      // 2. AI WORKER / AI STAGES: Executed STRICTLY inside the nightly window before midnight neuron reset
      if (inAiWindow) {
        let aiStage: PipelineStage | null = null;
        if (needs.images && !(await this.stageRanTonight('images', now))) aiStage = 'images';
        else if (needs.topics && !(await this.stageRanTonight('topics', now))) aiStage = 'topics';
        else if (needs.posts && (await this.postAttemptsTonight(now)) < config.maxPostsPerNight * 2) aiStage = 'posts';

        if (aiStage) {
          const d1QuotaService = new D1QuotaService();
          const d1Status = await d1QuotaService.getD1UsageStatus(this.db, this.cfUsageService);
          const deferCheck = d1QuotaService.shouldDeferStage(aiStage, d1Status, false);

          if (deferCheck.defer) {
            aiOutcome = 'BLOCKED_QUOTA';
            aiQuotaBlockedReason = deferCheck.reason || 'Deferred by D1 Protective Mode';
            steps.push({
              stage: aiStage,
              success: false,
              outcome: 'BLOCKED',
              summary: aiQuotaBlockedReason,
              error: aiQuotaBlockedReason,
            });
          } else {
            try {
              const aiStepResult = await this.runStage(aiStage, 'system');
              steps.push(aiStepResult);

              if (aiStepResult.outcome === 'BLOCKED') {
                aiOutcome = 'BLOCKED_QUOTA';
                aiQuotaBlockedReason = aiStepResult.summary;
              } else if (aiStepResult.outcome === 'COMPLETED_WITH_OUTPUT') {
                aiOutcome = 'EXECUTED';
              } else if (aiStepResult.outcome === 'FAILED' || !aiStepResult.success) {
                aiOutcome = 'FAILED';
              } else {
                aiOutcome = 'NO_WORK_NEEDED';
              }
            } catch (aiErr: unknown) {
              const errMsg = aiErr instanceof Error ? aiErr.message : String(aiErr);
              const isQuotaOrRateLimit = /quota|rate limit|429|protective mode|neuron/i.test(errMsg);
              aiOutcome = isQuotaOrRateLimit ? 'BLOCKED_QUOTA' : 'FAILED';
              if (isQuotaOrRateLimit) {
                aiQuotaBlockedReason = errMsg;
              }
              steps.push({
                stage: aiStage,
                success: false,
                outcome: isQuotaOrRateLimit ? 'BLOCKED' : 'FAILED',
                summary: `AI stage '${aiStage}' deferred: ${errMsg}`,
                error: errMsg,
              });
            }
          }
        } else {
          aiOutcome = 'NO_WORK_NEEDED';
        }
      }

      // 3. DETERMINISTIC STAGE: Scheduling approved posts with images 24/7
      // Runs independently of AI outcome or quota state!
      const countsAfter = steps.length > 0 ? await this.getCounts(now) : counts;
      if (countsAfter.readyToSchedule > 0) {
        try {
          const schedStep = await this.runStage('scheduling', 'system');
          steps.push(schedStep);
          if (schedStep.success && schedStep.outcome === 'COMPLETED_WITH_OUTPUT') {
            deterministicOutcome = 'EXECUTED';
          } else if (schedStep.outcome === 'BLOCKED') {
            deterministicOutcome = 'BLOCKED_DEPENDENCY';
          } else if (schedStep.outcome === 'FAILED') {
            deterministicOutcome = 'FAILED';
          }
        } catch (schedErr: unknown) {
          const errMsg = schedErr instanceof Error ? schedErr.message : String(schedErr);
          deterministicOutcome = 'FAILED';
          steps.push({
            stage: 'scheduling',
            success: false,
            outcome: 'FAILED',
            summary: `Scheduling failed: ${errMsg}`,
            error: errMsg,
          });
        }
      } else if (promotedFromDeferred > 0) {
        deterministicOutcome = 'EXECUTED';
      } else if (countsAfter.postsWithoutImage > 0) {
        deterministicOutcome = 'BLOCKED_DEPENDENCY';
      } else {
        deterministicOutcome = 'NO_WORK_NEEDED';
      }

      // 4. OBSERVABILITY & OUTCOME EVALUATION
      const blockers: string[] = [];
      if (aiQuotaBlockedReason) {
        blockers.push(`AI stage blocked: ${aiQuotaBlockedReason}`);
      }
      if (countsAfter.postsWithoutImage > 0) {
        blockers.push(`${countsAfter.postsWithoutImage} post(s) awaiting an approved image`);
      }

      const executed = steps.filter((s) => s.outcome !== undefined || s.success !== undefined);
      let outcome: PipelineOutcome;
      if (steps.some((s) => s.outcome === 'COMPLETED_WITH_OUTPUT') || promotedFromDeferred > 0) {
        outcome = 'COMPLETED_WITH_OUTPUT';
      } else if (
        executed.length > 0 &&
        executed.every((s) => s.outcome === 'FAILED' || (!s.success && s.outcome === undefined))
      ) {
        outcome = 'FAILED';
      } else if (blockers.length > 0 || steps.some((s) => s.outcome === 'BLOCKED')) {
        outcome = 'BLOCKED';
      } else {
        outcome = 'COMPLETED_NO_WORK';
      }

      const stepSummary = steps.map((s) => s.summary).join(' | ');
      const promotionNote = promotedFromDeferred > 0 ? `Przywrócono z odroczonych: ${promotedFromDeferred}` : '';
      const windowNote = !inAiWindow ? `AI window: outside (${AI_BACKGROUND_WINDOW_LABEL})` : '';
      const reason = [stepSummary, promotionNote, windowNote].filter(Boolean).join(' | ') || 'Nothing to do.';

      return {
        ran: steps.length > 0 || promotedFromDeferred > 0,
        reason,
        outcome,
        aiOutcome,
        deterministicOutcome,
        blockers: blockers.length > 0 ? blockers : undefined,
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

  private async postAttemptsTonight(now: Date): Promise<number> {
    try {
      const row = await this.db
        .prepare(
          "SELECT COUNT(*) as cnt FROM orchestrator_runs WHERE trigger_type = 'cron' AND stage = 'posts' AND started_at >= ?",
        )
        .bind(this.tonightWindowStartIso(now))
        .first<{ cnt: number }>();
      return Number(row?.cnt ?? 0);
    } catch {
      return 0;
    }
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

    const [availableTopics, postsWithoutImage, readyToSchedule, scheduledPending, postsGeneratedTonight, deferredTopics] = await Promise.all([
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
      scalar("SELECT COUNT(*) as cnt FROM content_ideas WHERE status = 'deferred'"),
    ]);

    let coverageDays: number;
    try {
      coverageDays = (await new IntelligentSchedulingService().calculateScheduleCoverageDays(this.db)).coverageDays;
    } catch {
      coverageDays = 0;
    }

    return { availableTopics, postsWithoutImage, readyToSchedule, scheduledPending, coverageDays, postsGeneratedTonight, deferredTopics };
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
      modes: {
        aiOperations: 'window_restricted',
        deterministicOperations: 'always_active_24_7',
      },
    };
  }

  private async recordRunStart(runId: string, triggerType: 'manual' | 'cron', stage?: PipelineStage): Promise<void> {
    try {
      const nowIso = new Date().toISOString();
      await this.db
        .prepare(
          `INSERT INTO orchestrator_runs (id, trigger_type, status, stage, started_at, created_at)
           VALUES (?, ?, 'running', ?, ?, ?)`,
        )
        .bind(runId, triggerType, stage || null, nowIso, nowIso)
        .run();
    } catch {
      // Fallback for older schemas missing stage column
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
  }

  private async recordRunEnd(
    runId: string,
    status: 'completed' | 'failed' | 'deferred',
    stage: PipelineStage,
    extra: {
      postId?: string;
      topicsDiscovered?: number;
      topicsSelected?: number;
      message?: string;
      neuronsUsed?: number;
      d1RowsWritten?: number;
      d1RowsRead?: number;
      details?: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      const detailsJson = extra.details ? JSON.stringify(extra.details) : null;
      await this.db
        .prepare(
          `UPDATE orchestrator_runs
           SET status = ?, finished_at = ?, stage = ?, result_status = ?, post_id = ?,
               topics_discovered = ?, topics_selected = ?, error_message = ?,
               neurons_used = ?, d1_rows_written = ?, d1_rows_read = ?, details = ?
           WHERE id = ?`,
        )
        .bind(
          status,
          new Date().toISOString(),
          stage,
          stage,
          extra.postId || null,
          extra.topicsDiscovered ?? 0,
          extra.topicsSelected ?? 0,
          extra.message ? extra.message.substring(0, 500) : null,
          extra.neuronsUsed ?? 0,
          extra.d1RowsWritten ?? 0,
          extra.d1RowsRead ?? 0,
          detailsJson,
          runId,
        )
        .run();
    } catch {
      // Fallback for older schema without new columns
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
  }

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

  async getAutomationActivity(filters: {
    period?: '1h' | '6h' | '24h' | '7d' | '30d' | 'custom';
    startDate?: string;
    endDate?: string;
    stage?: 'all' | 'topics' | 'posts' | 'images' | 'scheduling' | 'errors';
    limit?: number;
    offset?: number;
  }): Promise<{
    items: Array<{
      id: string;
      runId: string;
      triggerType: 'manual' | 'cron';
      status: 'completed' | 'failed' | 'deferred' | 'running';
      stage: PipelineStage | 'unknown';
      startedAt: string;
      finishedAt: string | null;
      durationSeconds: number | null;
      summary: string;
      errorMessage?: string | null;
      neuronsUsed: number;
      d1RowsWritten: number;
      d1RowsRead: number;
      details?: Record<string, unknown>;
    }>;
    total: number;
  }> {
    const period = filters.period || '24h';
    const limit = Math.min(Math.max(1, filters.limit || 20), 100);
    const offset = Math.max(0, filters.offset || 0);

    const now = Date.now();
    let startTimeIso: string;

    if (period === '1h') {
      startTimeIso = new Date(now - 60 * 60 * 1000).toISOString();
    } else if (period === '6h') {
      startTimeIso = new Date(now - 6 * 60 * 60 * 1000).toISOString();
    } else if (period === '24h') {
      startTimeIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    } else if (period === '7d') {
      startTimeIso = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    } else if (period === '30d') {
      startTimeIso = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    } else if (period === 'custom' && filters.startDate) {
      startTimeIso = new Date(filters.startDate).toISOString();
    } else {
      startTimeIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    }

    const whereClauses: string[] = ['created_at >= ?'];
    const bindings: unknown[] = [startTimeIso];

    if (period === 'custom' && filters.endDate) {
      whereClauses.push('created_at <= ?');
      bindings.push(new Date(filters.endDate).toISOString());
    }

    if (filters.stage && filters.stage !== 'all') {
      if (filters.stage === 'errors') {
        whereClauses.push("status = 'failed'");
      } else {
        whereClauses.push('(stage = ? OR result_status = ?)');
        bindings.push(filters.stage, filters.stage);
      }
    }

    const whereSql = whereClauses.join(' AND ');

    let countRow: { total: number } | null;
    let rowsRes: { results?: Array<Record<string, unknown>> };

    try {
      countRow = await this.db
        .prepare(`SELECT COUNT(*) as total FROM orchestrator_runs WHERE ${whereSql}`)
        .bind(...bindings)
        .first<{ total: number }>();

      rowsRes = await this.db
        .prepare(
          `SELECT id, trigger_type, status, stage, started_at, finished_at,
                  topics_discovered, topics_eligible, topics_selected,
                  writer_calls, qa_calls, policy_calls, regenerations,
                  neurons_used, result_status, post_id, error_message,
                  d1_rows_written, d1_rows_read, details, created_at
           FROM orchestrator_runs
           WHERE ${whereSql}
           ORDER BY created_at DESC
           LIMIT ? OFFSET ?`,
        )
        .bind(...bindings, limit, offset)
        .all<Record<string, unknown>>();
    } catch {
      // Fallback if migration columns are not yet present in some environment
      countRow = await this.db
        .prepare(`SELECT COUNT(*) as total FROM orchestrator_runs WHERE created_at >= ?`)
        .bind(startTimeIso)
        .first<{ total: number }>()
        .catch(() => ({ total: 0 }));

      rowsRes = await this.db
        .prepare(
          `SELECT id, trigger_type, status, started_at, finished_at,
                  topics_discovered, topics_eligible, topics_selected,
                  neurons_used, result_status, post_id, error_message, created_at
           FROM orchestrator_runs
           WHERE created_at >= ?
           ORDER BY created_at DESC
           LIMIT ? OFFSET ?`,
        )
        .bind(startTimeIso, limit, offset)
        .all<Record<string, unknown>>()
        .catch(() => ({ results: [] }));
    }

    const items = (rowsRes.results || []).map((row) => {
      const id = String(row.id || '');
      const triggerType = (row.trigger_type === 'manual' ? 'manual' : 'cron') as 'manual' | 'cron';
      const status = (String(row.status || 'completed')) as 'completed' | 'failed' | 'deferred' | 'running';

      let rawStage = String(row.stage || row.result_status || '').toLowerCase();
      if (!['topics', 'posts', 'images', 'scheduling'].includes(rawStage)) {
        if (id.includes('topics') || id.includes('discovery')) rawStage = 'topics';
        else if (id.includes('posts') || id.includes('generate')) rawStage = 'posts';
        else if (id.includes('images')) rawStage = 'images';
        else if (id.includes('scheduling')) rawStage = 'scheduling';
        else rawStage = 'unknown';
      }
      const stage = rawStage as PipelineStage | 'unknown';

      const startedAt = String(row.started_at || row.created_at || new Date().toISOString());
      const finishedAt = row.finished_at ? String(row.finished_at) : null;
      let durationSeconds: number | null = null;
      if (startedAt && finishedAt) {
        durationSeconds = Math.max(0, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000));
      }

      let parsedDetails: Record<string, unknown> | undefined;
      if (row.details && typeof row.details === 'string') {
        try {
          parsedDetails = JSON.parse(row.details);
        } catch {
          parsedDetails = undefined;
        }
      }

      // Generate human-friendly summary
      let summary = String(row.error_message || '');
      if (parsedDetails && parsedDetails.message) {
        summary = String(parsedDetails.message);
      } else if (!summary || summary === 'null') {
        switch (stage) {
          case 'topics':
            summary = `Wyszukiwanie tematów: znaleziono ${(row.topics_discovered as number) || 0} nowych propozycji`;
            break;
          case 'posts':
            summary = row.post_id ? `Utworzono post (ID: ${String(row.post_id).substring(0, 8)})` : 'Generowanie postów zakończone';
            break;
          case 'images':
            summary = 'Dopasowanie i weryfikacja ilustracji';
            break;
          case 'scheduling':
            summary = 'Planowanie publikacji gotowych postów';
            break;
          default:
            summary = `Uruchomienie etapu: ${stage} (${status})`;
            break;
        }
      }

      return {
        id,
        runId: id,
        triggerType,
        status,
        stage,
        startedAt,
        finishedAt,
        durationSeconds,
        summary,
        errorMessage: row.error_message ? String(row.error_message) : null,
        neuronsUsed: Number(row.neurons_used || 0),
        d1RowsWritten: Number(row.d1_rows_written || 0),
        d1RowsRead: Number(row.d1_rows_read || 0),
        details: parsedDetails,
      };
    });

    return {
      items,
      total: countRow?.total || items.length,
    };
  }
}
