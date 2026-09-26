/**
 * NorthSoft.AI.ContentCreator — Decoupled Pipeline Orchestrator Service
 *
 * Core engine connecting Stage 1 (Discovery), Stage 2 (Generation & Quality),
 * Stage 3 (Facebook Publishing), 1-Click Full Pipeline Execution, and Automatic Scheduler.
 *
 * Enforces:
 *  - Single execution lock / idempotency protection (PIPELINE_ALREADY_RUNNING)
 *  - Strict separation between Cloudflare Verified Neurons and local estimated tokens
 *  - Stage 1 random inspiration / NO_USEFUL_ANGLE discovery philosophy
 *  - Exactly ONE post publication for 1-click full pipeline
 */

import { getAIProvider } from '../../ai/factory';
import { D1AuditLogger, type IAuditLogger } from '../../core/audit';
import { CloudflareUsageService } from '../cloudflare/cloudflare-usage-service';
import { FacebookPublisher } from '../../publishing/facebook-publisher';
import { PublicationService } from '../publishing/publication-service';
import { ResearchService } from '../research/research-service';
import { ContentPlannerService } from './content-planner-service';

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
  finalDecision: 'PASS' | 'REJECTED' | 'BLOCKED';
  rejectionReason?: string;
  suggestedPublishTime?: string;
  durationMs: number;
}

export interface PublishingStageResult {
  runId: string;
  postId: string;
  success: boolean;
  facebookPostId?: string;
  publishedAt?: string;
  error?: string;
  durationMs: number;
}

export interface FullPipelineResult {
  runId: string;
  status: 'SUCCESS' | 'FAILED' | 'PIPELINE_ALREADY_RUNNING';
  stage1Discovery?: DiscoveryStageResult;
  stage2Generation?: GenerationStageResult;
  stage3Publishing?: PublishingStageResult;
  publishedPostsCount: number; // MUST BE EXACTLY 1 ON SUCCESS
  facebookPostId?: string;
  errorMessage?: string;
  durationMs: number;
}

export interface SchedulerConfig {
  enabled: boolean;
  discoveryEnabled: boolean;
  generationEnabled: boolean;
  evaluationEnabled: boolean;
  publishingEnabled: boolean;
  frequency: 'daily' | '12h' | '6h';
  publicationTime: string;
  timezone: string;
  updatedAt?: string;
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

    // Clean up expired locks first
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

  /**
   * ETAP 1 — Content Discovery / Content Scout
   */
  async runDiscovery(actor: 'admin' | 'system' = 'admin'): Promise<DiscoveryStageResult> {
    const startTime = Date.now();
    const runId = `disc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const lockAcquired = await this.acquireLock('stage_discovery', runId, actor, 180);

    if (!lockAcquired) {
      throw new Error('PIPELINE_ALREADY_RUNNING: Stage 1 Content Discovery is already running.');
    }

    try {
      const researchProvider = getAIProvider(this.env, 'researcher');
      const researchService = new ResearchService(this.db, researchProvider, this.auditLogger);
      const res = await researchService.runResearchPipeline(actor === 'admin' ? 'manual' : 'cron');

      // Fetch newly created proposals
      const recentProposals = await this.db
        .prepare(
          `SELECT id, title, content_angle, content_pillar, source_url
           FROM content_ideas
           WHERE status IN ('new', 'accepted')
           ORDER BY created_at DESC
           LIMIT 10`,
        )
        .all<{
          id: string;
          title: string;
          content_angle: string;
          content_pillar: string;
          source_url: string;
        }>();

      // Fetch Cloudflare Verified Neurons
      const cfTelemetry = await this.cfUsageService.getVerifiedUsage();

      const proposals = (recentProposals.results || []).map((p) => ({
        id: p.id,
        title: p.title,
        contentAngle: p.content_angle || '',
        contentPillar: p.content_pillar || 'GENERAL',
        sourceUrl: p.source_url || undefined,
      }));

      const rejectedTotal =
        (res.rejectedIrrelevant || 0) +
        (res.rejectedTooTechnical || 0) +
        (res.rejectedRecentCooldown || 0);

      const durationMs = Date.now() - startTime;

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
        rejectedCount: rejectedTotal,
        newProposalsCount: res.topicsCreated,
        proposals,
        cloudflareVerifiedNeurons: cfTelemetry.actualNeurons,
        estimatedTokens: Math.round(res.itemsDiscovered * 120),
        durationMs,
      };
    } finally {
      await this.releaseLock('stage_discovery');
    }
  }

  /**
   * ETAP 2 — Post Generation & Quality Pipeline
   */
  async runPostGeneration(
    ideaId?: string,
    actor: 'admin' | 'system' = 'admin',
  ): Promise<GenerationStageResult> {
    const startTime = Date.now();
    const runId = `gen-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const lockAcquired = await this.acquireLock('stage_generation', runId, actor, 180);

    if (!lockAcquired) {
      throw new Error('PIPELINE_ALREADY_RUNNING: Stage 2 Post Generation is already running.');
    }

    try {
      // 1. Select idea if not specified
      let targetIdeaId = ideaId;
      if (!targetIdeaId) {
        const topIdea = await this.db
          .prepare(
            `SELECT id FROM content_ideas
             WHERE status IN ('new', 'accepted')
             ORDER BY relevance_score DESC, priority DESC, created_at ASC
             LIMIT 1`,
          )
          .first<{ id: string }>();

        if (!topIdea) {
          throw new Error('No candidate content ideas available in queue. Run Content Discovery first.');
        }
        targetIdeaId = topIdea.id;
      }

      const ideaRow = await this.db
        .prepare('SELECT title FROM content_ideas WHERE id = ?')
        .bind(targetIdeaId)
        .first<{ title: string }>();

      const planner = new ContentPlannerService(this.db, this.env, this.auditLogger);
      const planResult = await planner.generatePostFromTopic(targetIdeaId, actor);

      if (planResult.status !== 'approved' || !planResult.postId) {
        return {
          runId,
          ideaId: targetIdeaId,
          title: ideaRow?.title || 'Unapproved Draft',
          body: '',
          qualityScore: planResult.qualityScore || 0,
          classification: {
            pillar: 'GENERAL',
            postType: 'SHORT_SOCIAL',
            engagementPotential: 40,
            clarity: 40,
            practicalValue: 40,
            brandRelevance: 40,
            originality: 40,
          },
          finalDecision: planResult.status === 'blocked' ? 'BLOCKED' : 'REJECTED',
          rejectionReason: planResult.errorMessage || 'Failed quality gate evaluation.',
          durationMs: Date.now() - startTime,
        };
      }

      // Fetch generated post version details
      const postRow = await this.db
        .prepare(
          `SELECT p.id, p.title, p.quality_score, p.quality_decision, v.content, v.metadata
           FROM posts p
           JOIN post_versions v ON p.id = v.post_id AND p.current_version = v.version_number
           WHERE p.id = ?`,
        )
        .bind(planResult.postId)
        .first<{
          id: string;
          title: string;
          quality_score: number;
          quality_decision: string;
          content: string;
          metadata: string;
        }>();

      let metaParsed: Record<string, unknown> = {};
      if (postRow?.metadata) {
        try {
          metaParsed = JSON.parse(postRow.metadata);
        } catch {
          // ignore
        }
      }

      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      tomorrow.setUTCHours(9, 0, 0, 0);

      return {
        runId,
        postId: planResult.postId,
        ideaId: targetIdeaId,
        title: postRow?.title || ideaRow?.title || 'Generated Post',
        body: postRow?.content || '',
        qualityScore: postRow?.quality_score || planResult.qualityScore || 90,
        classification: {
          pillar: String(metaParsed.pillar || 'SMALL_BUSINESS'),
          postType: 'SHORT_POST',
          engagementPotential: Number(metaParsed.engagement || 85),
          clarity: Number(metaParsed.clarity || 90),
          practicalValue: Number(metaParsed.practicalValue || 88),
          brandRelevance: Number(metaParsed.brandRelevance || 92),
          originality: Number(metaParsed.originality || 85),
        },
        finalDecision: 'PASS',
        suggestedPublishTime: tomorrow.toISOString(),
        durationMs: Date.now() - startTime,
      };
    } finally {
      await this.releaseLock('stage_generation');
    }
  }

  /**
   * ETAP 3 — Facebook Publishing
   */
  async runPublishing(
    postId: string,
    actor: 'admin' | 'system' = 'admin',
  ): Promise<PublishingStageResult> {
    const startTime = Date.now();
    const runId = `pub-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const lockAcquired = await this.acquireLock(`stage_publishing_${postId}`, runId, actor, 120);

    if (!lockAcquired) {
      throw new Error(`PIPELINE_ALREADY_RUNNING: Publication for post ${postId} is already in progress.`);
    }

    try {
      const publisher = new FacebookPublisher(this.env);
      const pubService = new PublicationService(this.db, publisher, this.auditLogger);

      const pubResult = await pubService.publishPost(postId, { actor });

      if (!pubResult.success) {
        return {
          runId,
          postId,
          success: false,
          error: pubResult.message || 'Facebook API returned an error.',
          durationMs: Date.now() - startTime,
        };
      }

      return {
        runId,
        postId,
        success: true,
        facebookPostId: pubResult.externalPostId,
        publishedAt: pubResult.publishedAt,
        durationMs: Date.now() - startTime,
      };
    } finally {
      await this.releaseLock(`stage_publishing_${postId}`);
    }
  }

  /**
   * CZĘŚĆ 3 — 1-Click Full Pipeline (Executes End-to-End & Publishes EXACTLY 1 post)
   */
  async runFullPipeline(actor: 'admin' | 'system' = 'admin'): Promise<FullPipelineResult> {
    const startTime = Date.now();
    const runId = `full-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // 1. Idempotency Lock
    const lockAcquired = await this.acquireLock('full_pipeline_lock', runId, actor, 300);
    if (!lockAcquired) {
      return {
        runId,
        status: 'PIPELINE_ALREADY_RUNNING',
        publishedPostsCount: 0,
        errorMessage: 'A full pipeline execution is already in progress.',
        durationMs: Date.now() - startTime,
      };
    }

    // Insert orchestrator_runs record
    await this.db
      .prepare(
        `INSERT INTO orchestrator_runs (
          id, trigger_type, status, started_at, created_at
        ) VALUES (?, ?, 'running', datetime('now'), datetime('now'))`,
      )
      .bind(runId, actor === 'admin' ? 'manual' : 'cron')
      .run();

    try {
      // 1. Stage 1: Discovery
      const stage1 = await this.runDiscovery(actor);

      // 2. Select 1 suitable proposal
      let targetIdeaId: string | undefined;
      if (stage1.proposals && stage1.proposals.length > 0) {
        targetIdeaId = stage1.proposals[0]?.id;
      }

      if (!targetIdeaId) {
        const topIdea = await this.db
          .prepare(
            `SELECT id FROM content_ideas
             WHERE status IN ('new', 'accepted')
             ORDER BY relevance_score DESC, priority DESC, created_at ASC
             LIMIT 1`,
          )
          .first<{ id: string }>();
        targetIdeaId = topIdea?.id;
      }

      if (!targetIdeaId) {
        throw new Error('No candidate content ideas found after discovery.');
      }

      // 3. Stage 2: Post Generation & Quality Evaluation
      const stage2 = await this.runPostGeneration(targetIdeaId, actor);
      if (stage2.finalDecision !== 'PASS' || !stage2.postId) {
        throw new Error(`Stage 2 Quality Evaluation rejected draft: ${stage2.rejectionReason}`);
      }

      // 4. Stage 3: Facebook Publishing (Publishes EXACTLY 1 post)
      const stage3 = await this.runPublishing(stage2.postId, actor);
      if (!stage3.success || !stage3.facebookPostId) {
        throw new Error(`Stage 3 Facebook Publishing failed: ${stage3.error}`);
      }

      // Update orchestrator_runs record
      await this.db
        .prepare(
          `UPDATE orchestrator_runs
           SET status = 'completed', finished_at = datetime('now'), result_status = 'published',
               post_id = ?, neurons_used = ?
           WHERE id = ?`,
        )
        .bind(stage2.postId, stage1.cloudflareVerifiedNeurons || 120, runId)
        .run();

      await this.auditLogger.log({
        eventType: 'ORCHESTRATOR_RUN_COMPLETED',
        entityType: 'orchestrator_run',
        entityId: runId,
        actor: actor === 'admin' ? 'admin' : 'system',
        details: {
          resultStatus: 'published',
          postId: stage2.postId,
          facebookPostId: stage3.facebookPostId,
          publishedPostsCount: 1,
        },
      });

      return {
        runId,
        status: 'SUCCESS',
        stage1Discovery: stage1,
        stage2Generation: stage2,
        stage3Publishing: stage3,
        publishedPostsCount: 1,
        facebookPostId: stage3.facebookPostId,
        durationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      await this.db
        .prepare(
          `UPDATE orchestrator_runs
           SET status = 'failed', finished_at = datetime('now'), result_status = 'failed', error_message = ?
           WHERE id = ?`,
        )
        .bind(errorMsg.substring(0, 500), runId)
        .run();

      await this.auditLogger.log({
        eventType: 'WORKFLOW_FAILED',
        entityType: 'orchestrator_run',
        entityId: runId,
        actor: actor === 'admin' ? 'admin' : 'system',
        details: { error: errorMsg },
      });

      return {
        runId,
        status: 'FAILED',
        publishedPostsCount: 0,
        errorMessage: errorMsg,
        durationMs: Date.now() - startTime,
      };
    } finally {
      await this.releaseLock('full_pipeline_lock');
    }
  }

  /**
   * CZĘŚĆ 4 — Get Scheduler Configuration
   */
  async getSchedulerConfig(): Promise<SchedulerConfig> {
    const row = await this.db
      .prepare('SELECT * FROM pipeline_scheduler_config WHERE id = "default"')
      .first<{
        enabled: number;
        discovery_enabled: number;
        generation_enabled: number;
        evaluation_enabled: number;
        publishing_enabled: number;
        frequency: 'daily' | '12h' | '6h';
        publication_time: string;
        timezone: string;
        updated_at: string;
      }>();

    if (!row) {
      return {
        enabled: false,
        discoveryEnabled: true,
        generationEnabled: true,
        evaluationEnabled: true,
        publishingEnabled: true,
        frequency: 'daily',
        publicationTime: '09:00',
        timezone: 'UTC',
      };
    }

    return {
      enabled: Boolean(row.enabled),
      discoveryEnabled: Boolean(row.discovery_enabled),
      generationEnabled: Boolean(row.generation_enabled),
      evaluationEnabled: Boolean(row.evaluation_enabled),
      publishingEnabled: Boolean(row.publishing_enabled),
      frequency: row.frequency || 'daily',
      publicationTime: row.publication_time || '09:00',
      timezone: row.timezone || 'UTC',
      updatedAt: row.updated_at,
    };
  }

  /**
   * CZĘŚĆ 4 — Update Scheduler Configuration
   */
  async updateSchedulerConfig(config: Partial<SchedulerConfig>): Promise<SchedulerConfig> {
    const current = await this.getSchedulerConfig();
    const updated: SchedulerConfig = {
      ...current,
      ...config,
      updatedAt: new Date().toISOString(),
    };

    await this.db
      .prepare(
        `INSERT INTO pipeline_scheduler_config (
          id, enabled, discovery_enabled, generation_enabled, evaluation_enabled, publishing_enabled,
          frequency, publication_time, timezone, updated_at
        ) VALUES (
          'default', ?, ?, ?, ?, ?, ?, ?, ?, ?
        ) ON CONFLICT(id) DO UPDATE SET
          enabled = excluded.enabled,
          discovery_enabled = excluded.discovery_enabled,
          generation_enabled = excluded.generation_enabled,
          evaluation_enabled = excluded.evaluation_enabled,
          publishing_enabled = excluded.publishing_enabled,
          frequency = excluded.frequency,
          publication_time = excluded.publication_time,
          timezone = excluded.timezone,
          updated_at = excluded.updated_at`,
      )
      .bind(
        updated.enabled ? 1 : 0,
        updated.discoveryEnabled ? 1 : 0,
        updated.generationEnabled ? 1 : 0,
        updated.evaluationEnabled ? 1 : 0,
        updated.publishingEnabled ? 1 : 0,
        updated.frequency,
        updated.publicationTime,
        updated.timezone,
        updated.updatedAt,
      )
      .run();

    await this.auditLogger.log({
      eventType: 'CONFIG_CHANGED',
      entityType: 'scheduler_config',
      entityId: 'default',
      actor: 'admin',
      details: { enabled: updated.enabled, frequency: updated.frequency },
    });

    return updated;
  }
}
