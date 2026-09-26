/**
 * NorthSoft.AI.ContentCreator — Master Content Planner & Generation Orchestrator
 *
 * Orchestrates the complete Phase 3B pipeline:
 * Topic Selection → Writer AI → Static Validation → Independent QA → Policy Review → Quality Gate → Bounded Regeneration → D1 Persistence.
 *
 * Enforces zero-cost neuron budget checks before generation, post versioning, and auditable status transitions.
 */

import { D1AuditLogger, type IAuditLogger } from '../../core/audit';
import { evaluatePipelineGate } from '../../core/quality-gate';
import { getAIProvider } from '../../ai/factory';
import { PolicyReviewService } from './policy-service';
import { QualityReviewerService } from './qa-service';
import { StaticValidator } from './static-validator';
import {
  WriterService,
  type PostDraft,
  type ResearchSourceItem,
  type ResearchTopicItem,
} from './writer-service';
import { QuotaManager } from '../ai/quota-manager';

export interface GenerationResultSummary {
  postId?: string;
  topicId: string;
  status: 'approved' | 'blocked' | 'rejected' | 'deferred' | 'failed';
  currentVersion: number;
  qualityScore?: number;
  qualityDecision?: string;
  errorMessage?: string;
  durationMs: number;
}

export class ContentPlannerService {
  private quotaManager: QuotaManager;
  private staticValidator: StaticValidator;
  private policyService: PolicyReviewService;
  private auditLogger: IAuditLogger;

  constructor(
    private db: D1Database,
    private env: Env,
    auditLogger?: IAuditLogger,
  ) {
    this.quotaManager = new QuotaManager();
    this.staticValidator = new StaticValidator();
    this.policyService = new PolicyReviewService();
    this.auditLogger = auditLogger ?? new D1AuditLogger(db);
  }

  /**
   * Executes autonomous post draft generation from a selected topic.
   */
  async generatePostFromTopic(
    topicId: string,
    actor: 'system' | 'admin' = 'system',
  ): Promise<GenerationResultSummary> {
    const startTime = Date.now();
    const nowIso = new Date().toISOString();

    // 1. Fetch Candidate Topic
    const topicRow = await this.db
      .prepare('SELECT id, title, description, category FROM content_ideas WHERE id = ?')
      .bind(topicId)
      .first<ResearchTopicItem>();

    if (!topicRow) {
      return {
        topicId,
        status: 'failed',
        currentVersion: 0,
        errorMessage: `Topic ID ${topicId} not found in content_ideas.`,
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Fetch Supporting Research Sources
    const sourcesRes = await this.db
      .prepare(
        'SELECT id, title, url, content_summary as summary FROM research_items WHERE status = "ANALYZED" ORDER BY fetched_at DESC LIMIT 3',
      )
      .all<ResearchSourceItem>();

    const sources = sourcesRes.results || [];
    if (sources.length === 0) {
      // Fallback dummy source if none analyzed yet
      sources.push({
        id: 'src-default',
        title: topicRow.title,
        url: 'https://ai.northsoft.is',
        summary: topicRow.description,
      });
    }

    // 3. Pre-flight Worst-Case Neuron Budget Check (Writer + QA = ~3000 Neurons)
    const budgetCheck = await this.quotaManager.checkCapacity(
      this.db,
      'cloudflare-workers-ai',
      'default',
      { estimatedNeuronCost: 3000 },
    );

    if (!budgetCheck.allowed) {
      await this.auditLogger.log({
        eventType: 'AI_QUOTA_DEFERRED',
        entityType: 'content_idea',
        entityId: topicId,
        actor,
        details: { reason: budgetCheck.reason },
      });

      return {
        topicId,
        status: 'deferred',
        currentVersion: 0,
        errorMessage: budgetCheck.reason || 'Deferred due to AI neuron budget ceiling.',
        durationMs: Date.now() - startTime,
      };
    }

    const postId = crypto.randomUUID();
    let currentVersion = 0;
    let finalDecision: 'PASS' | 'FAIL' | 'BLOCKED' = 'FAIL';
    let finalScore = 0;
    let lastDraft: PostDraft | undefined;
    let runErrorMessage: string | undefined;

    // 4. Initial Post Record Creation
    await this.db
      .prepare(
        `INSERT INTO posts (id, idea_id, title, status, current_version, regeneration_count, created_at, updated_at)
         VALUES (?, ?, ?, 'draft', 1, 0, ?, ?)`,
      )
      .bind(postId, topicId, topicRow.title, nowIso, nowIso)
      .run();

    await this.auditLogger.log({
      eventType: 'POST_GENERATION_STARTED',
      entityType: 'post',
      entityId: postId,
      actor,
      details: { topicTitle: topicRow.title },
    });

    const writerProvider = getAIProvider(this.env, 'writer');
    const qaProvider = getAIProvider(this.env, 'qa');

    const writerService = new WriterService(this.db, writerProvider);
    const qaService = new QualityReviewerService(this.db, qaProvider);

    // 5. Generation & Bounded Regeneration Loop (Max 3 attempts = 2 retries)
    for (let attempt = 1; attempt <= 3; attempt++) {
      currentVersion = attempt;

      if (attempt > 1) {
        // Quota check before regeneration
        const regenQuota = await this.quotaManager.checkCapacity(
          this.db,
          writerProvider.name,
          'default',
          { estimatedNeuronCost: 2000 },
        );

        if (!regenQuota.allowed) {
          runErrorMessage = `Regeneration deferred: ${regenQuota.reason}`;
          break;
        }

        await this.auditLogger.log({
          eventType: 'POST_REGENERATION_STARTED',
          entityType: 'post',
          entityId: postId,
          actor,
          details: { attemptNumber: attempt },
        });
      }

      // 5a. Call Writer AI
      const genRes = await writerService.generateDraft(topicRow, sources);
      if (genRes.deferred) {
        runErrorMessage = `Writer deferred: ${genRes.error}`;
        break;
      }
      if (!genRes.draft) {
        runErrorMessage = genRes.error || 'Writer service failed to produce draft.';
        break;
      }

      lastDraft = genRes.draft;

      // 5b. Persist Version in post_versions (Never overwrite previous versions!)
      const versionId = crypto.randomUUID();
      await this.db
        .prepare(
          `INSERT INTO post_versions (id, post_id, version_number, content, content_type, metadata, ai_model, ai_provider, created_at)
           VALUES (?, ?, ?, ?, 'text', ?, ?, ?, ?)`,
        )
        .bind(
          versionId,
          postId,
          attempt,
          lastDraft.body,
          JSON.stringify({
            claims: lastDraft.claims,
            hashtags: lastDraft.hashtags,
            cta: lastDraft.callToAction,
          }),
          'llama-3.1-8b-instruct',
          writerProvider.name,
          new Date().toISOString(),
        )
        .run();

      await this.auditLogger.log({
        eventType: 'POST_GENERATED',
        entityType: 'post_version',
        entityId: versionId,
        actor: 'ai',
        details: { versionNumber: attempt, bodyLength: lastDraft.body.length },
      });

      // 5c. Static Validation
      const staticResult = this.staticValidator.validate(lastDraft);
      if (!staticResult.valid) {
        await this.auditLogger.log({
          eventType: 'STATIC_VALIDATION_FAILED',
          entityType: 'post_version',
          entityId: versionId,
          actor: 'system',
          details: { errors: staticResult.errors },
        });
      } else {
        await this.auditLogger.log({
          eventType: 'STATIC_VALIDATION_PASSED',
          entityType: 'post_version',
          entityId: versionId,
          actor: 'system',
          details: { warnings: staticResult.warnings },
        });
      }

      // 5d. Policy Review
      await this.auditLogger.log({
        eventType: 'POLICY_REVIEW_STARTED',
        entityType: 'post_version',
        entityId: versionId,
        actor: 'system',
        details: { attempt },
      });

      const policyResult = this.policyService.evaluate(lastDraft);
      if (!policyResult.passed) {
        await this.auditLogger.log({
          eventType: 'POLICY_REVIEW_FAILED',
          entityType: 'post_version',
          entityId: versionId,
          actor: 'system',
          details: { violations: policyResult.violations },
        });
      } else {
        await this.auditLogger.log({
          eventType: 'POLICY_REVIEW_PASSED',
          entityType: 'post_version',
          entityId: versionId,
          actor: 'system',
          details: { riskLevel: policyResult.riskLevel },
        });
      }

      // 5e. Independent QA Review
      await this.auditLogger.log({
        eventType: 'QA_STARTED',
        entityType: 'post_version',
        entityId: versionId,
        actor: 'ai',
        details: { attempt },
      });

      const qaRes = await qaService.reviewDraft(lastDraft, sources);
      if (qaRes.deferred || !qaRes.review) {
        runErrorMessage = qaRes.error || 'QA Reviewer service unavailable.';
        break;
      }

      const qaReview = qaRes.review;
      finalScore = qaReview.score;

      // Persist Quality Check in quality_checks
      const checkId = crypto.randomUUID();
      await this.db
        .prepare(
          `INSERT INTO quality_checks (
            id, post_id, post_version_id, attempt_number, decision, score, checks, issues, required_changes, reviewer_model, reviewer_provider, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          checkId,
          postId,
          versionId,
          attempt,
          qaReview.verdict,
          qaReview.score,
          JSON.stringify({
            factual_accuracy: qaReview.verdict,
            policy_risk: policyResult.passed ? 'PASS' : 'FAIL',
          }),
          JSON.stringify(qaReview.factualIssues),
          JSON.stringify(qaReview.requiredChanges),
          'llama-3.1-8b-instruct',
          qaProvider.name,
          new Date().toISOString(),
        )
        .run();

      if (qaReview.verdict === 'PASS') {
        await this.auditLogger.log({
          eventType: 'QA_PASSED',
          entityType: 'post_version',
          entityId: versionId,
          actor: 'ai',
          details: { score: qaReview.score, reasoning: qaReview.reasoning },
        });
      } else {
        await this.auditLogger.log({
          eventType: 'QA_FAILED',
          entityType: 'post_version',
          entityId: versionId,
          actor: 'ai',
          details: { score: qaReview.score, issues: qaReview.factualIssues },
        });
      }

      // 5f. Evaluate Quality Gate Decision
      finalDecision = evaluatePipelineGate({
        staticValid: staticResult.valid,
        qaVerdict: qaReview.verdict,
        qaScore: qaReview.score,
        policyPassed: policyResult.passed,
        attemptNumber: attempt,
      });

      if (finalDecision === 'PASS') {
        // Successful generation & review pass!
        await this.db
          .prepare(
            `UPDATE posts
             SET status = 'approved', current_version = ?, quality_score = ?, quality_decision = 'PASS', updated_at = ?
             WHERE id = ?`,
          )
          .bind(attempt, finalScore, new Date().toISOString(), postId)
          .run();

        // Update content_ideas status to used
        await this.db
          .prepare("UPDATE content_ideas SET status = 'used' WHERE id = ?")
          .bind(topicId)
          .run();

        await this.auditLogger.log({
          eventType: 'POST_APPROVED',
          entityType: 'post',
          entityId: postId,
          actor: 'system',
          details: { finalScore, attemptNumber: attempt },
        });

        return {
          postId,
          topicId,
          status: 'approved',
          currentVersion: attempt,
          qualityScore: finalScore,
          qualityDecision: 'PASS',
          durationMs: Date.now() - startTime,
        };
      }

      // If blocked or reached max retries, exit loop
      if (finalDecision === 'BLOCKED') {
        break;
      }
    }

    // 6. Handle Rejection or Permanent Block
    const finalPostStatus = finalDecision === 'BLOCKED' ? 'blocked' : 'rejected';
    const blockReason =
      runErrorMessage || `Failed quality gate evaluation after ${currentVersion} attempts.`;

    await this.db
      .prepare(
        `UPDATE posts
         SET status = ?, current_version = ?, quality_score = ?, quality_decision = ?, blocked_at = ?, blocked_reason = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        finalPostStatus,
        currentVersion,
        finalScore,
        finalDecision,
        finalPostStatus === 'blocked' ? new Date().toISOString() : null,
        blockReason.substring(0, 500),
        new Date().toISOString(),
        postId,
      )
      .run();

    await this.auditLogger.log({
      eventType: 'POST_BLOCKED',
      entityType: 'post',
      entityId: postId,
      actor: 'system',
      details: { decision: finalDecision, reason: blockReason },
    });

    return {
      postId,
      topicId,
      status: finalPostStatus,
      currentVersion,
      qualityScore: finalScore,
      qualityDecision: finalDecision,
      errorMessage: blockReason,
      durationMs: Date.now() - startTime,
    };
  }
}
