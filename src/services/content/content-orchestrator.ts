/**
 * NorthSoft.AI.ContentCreator — Autonomous Content Pipeline Orchestrator
 *
 * Connects Research, Topic Selection, Neuron Quota Checks, Writer, Static Validation,
 * Independent QA, Policy Review, Quality Gate, Bounded Regeneration, and Internal Scheduling
 * into a single deterministic, budget-aware autonomous execution pipeline.
 *
 * Obeying mandatory invariants:
 *  - ContentCreator Daily Neuron hard limit = 7,500 Neurons/day
 *  - Customer AI has priority; ContentCreator defers if capacity is low
 *  - ZERO paid AI fallback
 *  - ZERO Facebook publishing in this phase (output is SCHEDULED internally)
 */

import { getAIProvider } from '../../ai/factory';
import { D1AuditLogger, type IAuditLogger } from '../../core/audit';
import { QuotaManager } from '../ai/quota-manager';
import { ResearchService } from '../research/research-service';
import { ContentPlannerService } from './content-planner-service';

export interface OrchestrationResult {
  runId: string;
  status: 'completed' | 'deferred' | 'failed';
  resultStatus?:
    'approved' | 'scheduled' | 'deferred' | 'blocked' | 'rejected' | 'no_topic' | 'failed';
  postId?: string;
  topicId?: string;
  topicTitle?: string;
  neuronsUsed: number;
  errorMessage?: string;
  durationMs: number;
}

export class ContentOrchestrator {
  private quotaManager: QuotaManager;
  private auditLogger: IAuditLogger;

  constructor(
    private db: D1Database,
    private env: Env,
    auditLogger?: IAuditLogger,
  ) {
    this.quotaManager = new QuotaManager();
    this.auditLogger = auditLogger ?? new D1AuditLogger(db);
  }

  /**
   * Executes the full autonomous pipeline:
   * Concurrency Lock → Research → Topic Selection & Cooldown → Pre-flight Budget Check → Writer/QA/Policy → Quality Gate → Internal Scheduling.
   */
  async runPipeline(triggerType: 'cron' | 'manual' = 'cron'): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const nowIso = new Date().toISOString();
    const runId = `orch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // 1. Concurrency Protection: Check if an autonomous run is already in progress (started within last 5 mins)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const activeRun = await this.db
      .prepare(
        'SELECT id FROM orchestrator_runs WHERE status = "running" AND started_at >= ? LIMIT 1',
      )
      .bind(fiveMinutesAgo)
      .first<{ id: string }>();

    if (activeRun) {
      const msg = `Concurrent orchestrator run in progress (${activeRun.id}). Run deferred.`;
      await this.auditLogger.log({
        eventType: 'ORCHESTRATOR_RUN_DEFERRED',
        entityType: 'orchestrator_run',
        entityId: runId,
        actor: triggerType === 'manual' ? 'admin' : 'system',
        details: { reason: msg },
      });

      return {
        runId,
        status: 'deferred',
        resultStatus: 'deferred',
        neuronsUsed: 0,
        errorMessage: msg,
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Insert initial run record into orchestrator_runs
    await this.db
      .prepare(
        `INSERT INTO orchestrator_runs (
          id, trigger_type, status, started_at, created_at
        ) VALUES (?, ?, 'running', ?, ?)`,
      )
      .bind(runId, triggerType, nowIso, nowIso)
      .run();

    await this.auditLogger.log({
      eventType: 'ORCHESTRATOR_RUN_STARTED',
      entityType: 'orchestrator_run',
      entityId: runId,
      actor: triggerType === 'manual' ? 'admin' : 'system',
      details: { triggerType },
    });

    try {
      // 3. Automated Research Phase (if candidate topics low)
      const unusedTopicsCount = await this.db
        .prepare('SELECT COUNT(*) as cnt FROM content_ideas WHERE status IN ("new", "accepted")')
        .first<{ cnt: number }>();

      let topicsDiscovered = unusedTopicsCount?.cnt ?? 0;

      if (topicsDiscovered === 0) {
        const researchProvider = getAIProvider(this.env, 'researcher');
        const researchService = new ResearchService(this.db, researchProvider);
        const researchRes = await researchService.runResearchPipeline(triggerType);
        topicsDiscovered = researchRes.topicsCreated;
      }

      // 4. Daily Post Limit Check (Default: 1 post per day)
      const todayStr = nowIso.split('T')[0] ?? '';
      const postsToday = await this.db
        .prepare(
          'SELECT COUNT(*) as cnt FROM posts WHERE date(created_at) = ? AND status IN ("approved", "scheduled", "published")',
        )
        .bind(todayStr)
        .first<{ cnt: number }>();

      const postsTodayCount = postsToday?.cnt ?? 0;
      const maxPostsPerDay = 1; // Conservative target limit

      if (postsTodayCount >= maxPostsPerDay) {
        const deferMsg = `Daily post generation limit reached (${postsTodayCount}/${maxPostsPerDay} posts today). Skipping pipeline generation.`;
        await this.completeRun(runId, 'completed', 'deferred', {
          topicsDiscovered,
          topicsEligible: 0,
          topicsSelected: 0,
          neuronsUsed: 0,
          errorMessage: deferMsg,
        });

        await this.auditLogger.log({
          eventType: 'ORCHESTRATOR_RUN_DEFERRED',
          entityType: 'orchestrator_run',
          entityId: runId,
          actor: 'system',
          details: { reason: deferMsg },
        });

        return {
          runId,
          status: 'deferred',
          resultStatus: 'deferred',
          neuronsUsed: 0,
          errorMessage: deferMsg,
          durationMs: Date.now() - startTime,
        };
      }

      // 5. Candidate Topic Selection with Deterministic Cooldown & Filtering
      const candidateTopics = await this.db
        .prepare(
          `SELECT id, title, description, category, priority
           FROM content_ideas
           WHERE status IN ("new", "accepted")
           ORDER BY priority DESC, created_at ASC
           LIMIT 10`,
        )
        .all<{
          id: string;
          title: string;
          description: string;
          category: string;
          priority: number;
        }>();

      const eligibleTopics = candidateTopics.results || [];
      if (eligibleTopics.length === 0) {
        const noTopicMsg = 'No candidate research topics available for content generation.';
        await this.completeRun(runId, 'completed', 'no_topic', {
          topicsDiscovered,
          topicsEligible: 0,
          topicsSelected: 0,
          neuronsUsed: 0,
          errorMessage: noTopicMsg,
        });

        return {
          runId,
          status: 'completed',
          resultStatus: 'no_topic',
          neuronsUsed: 0,
          errorMessage: noTopicMsg,
          durationMs: Date.now() - startTime,
        };
      }

      // Select topic that hasn't been generated in the last 7 days
      let selectedTopic = eligibleTopics[0]!;
      for (const topic of eligibleTopics) {
        const recentUsage = await this.db
          .prepare(
            `SELECT p.id FROM posts p
             JOIN content_ideas ci ON p.idea_id = ci.id
             WHERE ci.title = ? AND p.created_at >= datetime('now', '-7 days')
             LIMIT 1`,
          )
          .bind(topic.title)
          .first<{ id: string }>();

        if (!recentUsage) {
          selectedTopic = topic;
          break;
        }
      }

      await this.auditLogger.log({
        eventType: 'TOPIC_SELECTED',
        entityType: 'content_idea',
        entityId: selectedTopic.id,
        actor: 'system',
        details: { title: selectedTopic.title, category: selectedTopic.category },
      });

      // 6. Pre-flight Workflow Budget Check (Estimate Writer + QA = 3000 Neurons)
      const budgetCheck = await this.quotaManager.checkCapacity(
        this.db,
        'cloudflare-workers-ai',
        'default',
        { estimatedNeuronCost: 3000 },
      );

      if (!budgetCheck.allowed) {
        const deferMsg =
          budgetCheck.reason || 'Deferred due to AI neuron hard limit (7,500 Neurons/day).';
        await this.completeRun(runId, 'deferred', 'deferred', {
          topicsDiscovered,
          topicsEligible: eligibleTopics.length,
          topicsSelected: 1,
          neuronsUsed: 0,
          errorMessage: deferMsg,
        });

        await this.auditLogger.log({
          eventType: 'ORCHESTRATOR_RUN_DEFERRED',
          entityType: 'orchestrator_run',
          entityId: runId,
          actor: triggerType === 'manual' ? 'admin' : 'system',
          details: { reason: deferMsg },
        });

        return {
          runId,
          status: 'deferred',
          resultStatus: 'deferred',
          topicId: selectedTopic.id,
          topicTitle: selectedTopic.title,
          neuronsUsed: 0,
          errorMessage: deferMsg,
          durationMs: Date.now() - startTime,
        };
      }

      // 7. Execute Content Generation Pipeline via ContentPlannerService
      const planner = new ContentPlannerService(this.db, this.env, this.auditLogger);
      const planResult = await planner.generatePostFromTopic(
        selectedTopic.id,
        triggerType === 'manual' ? 'admin' : 'system',
      );

      // Query neurons consumed during this orchestrator run
      const neuronsRes = await this.db
        .prepare('SELECT SUM(neurons_used) as total FROM ai_runs WHERE created_at >= ?')
        .bind(nowIso)
        .first<{ total: number | null }>();
      const runNeuronsUsed = neuronsRes?.total ?? 0;

      // 8. Internal Scheduling (If Post APPROVED)
      let finalResultStatus:
        'scheduled' | 'approved' | 'blocked' | 'rejected' | 'deferred' | 'failed' =
        planResult.status === 'approved' ? 'scheduled' : planResult.status;

      if (planResult.status === 'approved' && planResult.postId) {
        const scheduleId = `sched-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

        // Schedule post for tomorrow 09:00 UTC
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
        tomorrow.setUTCHours(9, 0, 0, 0);
        const scheduledAtIso = tomorrow.toISOString();

        await this.db
          .prepare(
            `INSERT INTO schedules (id, post_id, scheduled_at, timezone, status, created_at, updated_at)
             VALUES (?, ?, ?, 'UTC', 'pending', ?, ?)`,
          )
          .bind(scheduleId, planResult.postId, scheduledAtIso, nowIso, nowIso)
          .run();

        await this.db
          .prepare("UPDATE posts SET status = 'scheduled', updated_at = ? WHERE id = ?")
          .bind(nowIso, planResult.postId)
          .run();

        await this.auditLogger.log({
          eventType: 'POST_SCHEDULED',
          entityType: 'post',
          entityId: planResult.postId,
          actor: 'system',
          details: { scheduleId, scheduledAt: scheduledAtIso },
        });

        finalResultStatus = 'scheduled';
      }

      await this.completeRun(runId, 'completed', finalResultStatus, {
        topicsDiscovered,
        topicsEligible: eligibleTopics.length,
        topicsSelected: 1,
        writerCalls: 1,
        qaCalls: 1,
        policyCalls: 1,
        regenerations: planResult.currentVersion > 1 ? planResult.currentVersion - 1 : 0,
        neuronsUsed: runNeuronsUsed,
        postId: planResult.postId,
        errorMessage: planResult.errorMessage,
      });

      await this.auditLogger.log({
        eventType: 'ORCHESTRATOR_RUN_COMPLETED',
        entityType: 'orchestrator_run',
        entityId: runId,
        actor: triggerType === 'manual' ? 'admin' : 'system',
        details: {
          resultStatus: finalResultStatus,
          postId: planResult.postId,
          topicId: selectedTopic.id,
          neuronsUsed: runNeuronsUsed,
        },
      });

      return {
        runId,
        status: 'completed',
        resultStatus: finalResultStatus,
        postId: planResult.postId,
        topicId: selectedTopic.id,
        topicTitle: selectedTopic.title,
        neuronsUsed: runNeuronsUsed,
        errorMessage: planResult.errorMessage,
        durationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await this.completeRun(runId, 'failed', 'failed', {
        neuronsUsed: 0,
        errorMessage: errorMsg,
      });

      await this.auditLogger.log({
        eventType: 'WORKFLOW_FAILED',
        entityType: 'orchestrator_run',
        entityId: runId,
        actor: triggerType === 'manual' ? 'admin' : 'system',
        details: { error: errorMsg },
      });

      return {
        runId,
        status: 'failed',
        resultStatus: 'failed',
        neuronsUsed: 0,
        errorMessage: errorMsg,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Updates an orchestrator_runs record with completion status and metrics.
   */
  private async completeRun(
    runId: string,
    status: 'completed' | 'deferred' | 'failed',
    resultStatus: string,
    metrics: {
      topicsDiscovered?: number;
      topicsEligible?: number;
      topicsSelected?: number;
      writerCalls?: number;
      qaCalls?: number;
      policyCalls?: number;
      regenerations?: number;
      neuronsUsed?: number;
      postId?: string;
      errorMessage?: string;
    },
  ): Promise<void> {
    const finishedAt = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE orchestrator_runs
         SET status = ?, finished_at = ?, topics_discovered = ?, topics_eligible = ?, topics_selected = ?,
             writer_calls = ?, qa_calls = ?, policy_calls = ?, regenerations = ?, neurons_used = ?,
             result_status = ?, post_id = ?, error_message = ?
         WHERE id = ?`,
      )
      .bind(
        status,
        finishedAt,
        metrics.topicsDiscovered ?? 0,
        metrics.topicsEligible ?? 0,
        metrics.topicsSelected ?? 0,
        metrics.writerCalls ?? 0,
        metrics.qaCalls ?? 0,
        metrics.policyCalls ?? 0,
        metrics.regenerations ?? 0,
        metrics.neuronsUsed ?? 0,
        resultStatus,
        metrics.postId || null,
        metrics.errorMessage ? metrics.errorMessage.substring(0, 500) : null,
        runId,
      )
      .run();
  }
}
