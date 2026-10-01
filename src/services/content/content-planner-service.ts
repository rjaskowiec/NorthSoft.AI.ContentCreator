/**
 * NorthSoft.AI.ContentCreator — Master Content Planner & Generation Orchestrator
 *
 * Orchestrates the automated content generation pipeline:
 * Topic Selection → Content Writer → Static Validation → Quality Review → Policy Review → Quality Gate → Bounded Regeneration → Database Persistence.
 *
 * Enforces zero-cost neuron budget checks before generation, post versioning, and auditable status transitions.
 */

import { D1AuditLogger, type IAuditLogger } from '../../core/audit';
import { evaluatePipelineGate } from '../../core/quality-gate';
import { ContentQualityGate } from './content-quality-gate';
import { getAIProvider } from '../../ai/factory';
import { OpenverseImageService } from './image-service';
import { PolicyReviewService } from './policy-service';
import { QualityReviewerService } from './qa-service';
import { StaticValidator } from './static-validator';
import {
  WriterService,
  isInstructionJsonOrInvalidPost,
  type PostDraft,
  type ResearchSourceItem,
  type ResearchTopicItem,
} from './writer-service';
import { QuotaManager } from '../ai/quota-manager';
import { SocialMediaQualityGate } from './social-media-quality-gate';

export interface GenerationResultSummary {
  postId?: string;
  topicId: string;
  status: 'approved' | 'blocked' | 'rejected' | 'deferred' | 'failed';
  currentVersion: number;
  qualityScore?: number;
  qualityDecision?: string;
  errorMessage?: string;
  durationMs?: number;
}

export class ContentPlannerService {
  private quotaManager: QuotaManager;
  private staticValidator: StaticValidator;
  private contentQualityGate: ContentQualityGate;
  private policyService: PolicyReviewService;
  private auditLogger: IAuditLogger;

  constructor(
    private db: D1Database,
    private env: Env,
    auditLogger?: IAuditLogger,
  ) {
    this.quotaManager = new QuotaManager();
    this.staticValidator = new StaticValidator();
    this.contentQualityGate = new ContentQualityGate();
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
      .prepare('SELECT id, title, description, category, source_url, source_title, content_angle FROM content_ideas WHERE id = ?')
      .bind(topicId)
      .first<ResearchTopicItem & { source_url?: string; source_title?: string; content_angle?: string }>();

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
    const sources: ResearchSourceItem[] = [];
    if (topicRow.source_url) {
      const sourceRow = await this.db
        .prepare('SELECT id, title, url, content_summary as summary FROM research_items WHERE url = ? AND status = "ANALYZED"')
        .bind(topicRow.source_url)
        .first<ResearchSourceItem>();
      
      if (sourceRow) {
        sources.push(sourceRow);
      } else {
        sources.push({
          id: 'src-mapped',
          title: topicRow.source_title || topicRow.title,
          url: topicRow.source_url,
          summary: topicRow.description,
        });
      }
    } else {
      // If no specific source is attached, do NOT fetch generic top 3.
      // Use the topic description as the source to ensure variation.
      sources.push({
        id: 'src-default',
        title: topicRow.title,
        url: 'https://ai.northsoft.is',
        summary: (topicRow.content_angle ? 'Angle: ' + topicRow.content_angle + '\\n' : '') + (topicRow.description || topicRow.title),
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

    const existingPost = await this.db.prepare(
      `SELECT p.id, p.current_version, p.regeneration_count,
              COALESCE((SELECT MAX(pv.version_number) FROM post_versions pv WHERE pv.post_id = p.id), p.current_version) AS latest_version
       FROM posts p WHERE p.idea_id = ? ORDER BY p.created_at DESC LIMIT 1`,
    ).bind(topicId).first<{ id: string; current_version: number; regeneration_count: number; latest_version: number }>();
    let postId: string | undefined = existingPost?.id;
    let postExists = Boolean(existingPost);
    const createdPostThisRun = !existingPost;
    const baseVersion = existingPost?.latest_version || 0;
    const originalRegenerationCount = existingPost?.regeneration_count || 0;
    let currentVersion = existingPost?.current_version || 0;
    let finalDecision: 'PASS' | 'FAIL' | 'BLOCKED' = 'FAIL';
    let smqgPass = true;
    let finalScore = 0;
    let lastDraft: PostDraft | undefined;
    let runErrorMessage: string | undefined;

    const writerProvider = getAIProvider(this.env, 'writer');
    const qaProvider = getAIProvider(this.env, 'qa');

    const writerService = new WriterService(this.db, writerProvider);
    const qaService = new QualityReviewerService(this.db, qaProvider);

    // Helper to execute DB batch or sequential statements safely
    const executeBatch = async (statements: unknown[]) => {
      const dbAny = this.db as unknown as { batch?: (stmts: unknown[]) => Promise<unknown> };
      if (typeof dbAny.batch === 'function') {
        await dbAny.batch(statements);
      } else {
        for (const stmt of statements) {
          const s = stmt as { run?: () => Promise<unknown> };
          if (s && typeof s.run === 'function') {
            await s.run();
          }
        }
      }
    };

    // 4. Generation & Bounded Regeneration Loop (Max 3 attempts = 2 retries)
    let correctionHint: string | undefined;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const versionNumber = baseVersion + attempt;
      currentVersion = versionNumber;

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

        if (postId) {
          await this.auditLogger.log({
            eventType: 'POST_REGENERATION_STARTED',
            entityType: 'post',
            entityId: postId,
            actor,
            details: { attemptNumber: attempt },
          });
        }
      }

      // 4a. Call Writer AI BEFORE inserting post record in DB
      const genRes = await writerService.generateDraft(topicRow, sources, undefined, correctionHint);
      if (genRes.deferred) {
        runErrorMessage = `Writer deferred: ${genRes.error}`;
        break;
      }
      if (!genRes.draft) {
        runErrorMessage = genRes.error || 'Writer service failed to produce valid draft.';
        await this.auditLogger.log({
          eventType: 'POST_GENERATION_STARTED',
          entityType: 'content_idea',
          entityId: topicId,
          actor: 'ai',
          details: { attemptNumber: attempt, error: runErrorMessage },
        });
        continue;
      }

      if (isInstructionJsonOrInvalidPost(genRes.draft.body)) {
        runErrorMessage = 'Writer produced AI instruction JSON instead of valid post text.';
        await this.auditLogger.log({
          eventType: 'POST_GENERATION_STARTED',
          entityType: 'content_idea',
          entityId: topicId,
          actor: 'ai',
          details: { attemptNumber: attempt, error: runErrorMessage },
        });
        continue;
      }

      lastDraft = genRes.draft;
      // Evaluate Social Media Quality Gate
      const smqg = new SocialMediaQualityGate();
      const smqgResult = smqg.evaluate(lastDraft);
      smqgPass = smqgResult.pass;
      if (!smqgPass) {
        await this.auditLogger.log({
          eventType: 'SMQG_FAILED',
          entityType: 'content_idea',
          entityId: topicId,
          actor: 'system',
          details: { score: smqgResult.score, warnings: smqgResult.warnings, attempt },
        });
        // Build corrective feedback for next regeneration attempt
        const criticalWarnings = smqgResult.warnings.filter((w) => w.severity === 'critical' || w.severity === 'high');
        if (criticalWarnings.length > 0) {
          correctionHint = criticalWarnings.map((w) => `[${w.dimension}] ${w.reason}`).join('\n');
        }
      } else {
        correctionHint = undefined; // Clear hint if this attempt passed
      }
      const metadataJson = JSON.stringify({
        claims: lastDraft.claims,
        hashtags: lastDraft.hashtags,
        cta: lastDraft.callToAction,
        imageSearchQuery: lastDraft.imageSearchQuery,
      });

      // 4b. Image Selection via Curated Image Library (Only APPROVED images may be used)
      const { ImageLibraryService } = await import('./image-library-service');
      const imgLibrary = new ImageLibraryService(this.db, this.auditLogger);
      const openverseService = new OpenverseImageService(this.env);

      // Try finding an approved image in the library
      const approvedMatch = await imgLibrary.findBestApprovedImage(
        topicRow.title,
        topicRow.category || 'Technology & Business',
        lastDraft.body,
        postId,
      );

      // Background Candidate Discovery: Collect candidates into PENDING library if needed
      try {
        const query = lastDraft.imageSearchQuery || topicRow.title;
        const candidates = await openverseService.searchImages(query, 5);
        for (const cand of candidates) {
          await imgLibrary.addCandidate({
            title: cand.title,
            sourceUrl: cand.url,
            originalPageUrl: cand.sourceUrl,
            author: cand.author,
            authorUrl: cand.authorUrl,
            license: cand.license,
            licenseUrl: cand.licenseUrl,
            category: topicRow.category || 'Technology',
            keywords: (cand.tags || []).join(', '),
            description: `Auto-discovered for topic: ${topicRow.title}`,
            discoveryQuery: query,
          });
        }
      } catch (discErr) {
        console.warn('[ContentPlanner] Candidate discovery failed:', discErr);
      }

      // Persist Post & Version in D1 atomically
      const versionId = crypto.randomUUID();
      const versionCreatedAt = new Date().toISOString();

      if (!postExists) {
        postId = crypto.randomUUID();

        const statements = [
          this.db
            .prepare(
              `INSERT INTO posts (id, idea_id, title, status, current_version, regeneration_count, created_at, updated_at)
               VALUES (?, ?, ?, 'draft', 1, 0, ?, ?)`,
            )
            .bind(postId, topicId, topicRow.title, nowIso, nowIso),
          this.db
            .prepare(
              `INSERT INTO post_versions (id, post_id, version_number, content, content_type, metadata, ai_model, ai_provider, created_at)
               VALUES (?, ?, ?, ?, 'text', ?, ?, ?, ?)`,
            )
            .bind(
              versionId,
              postId,
              versionNumber,
              lastDraft.body,
              metadataJson,
              'llama-3.1-8b-instruct',
              writerProvider.name,
              versionCreatedAt,
            ),
        ];

        await executeBatch(statements);
        postExists = true;

        if (approvedMatch) {
          await imgLibrary.reserveImageForDraft(approvedMatch.image.id, postId, false);
        }

        await this.auditLogger.log({
          eventType: 'POST_GENERATION_STARTED',
          entityType: 'post',
          entityId: postId,
          actor,
          details: { topicTitle: topicRow.title },
        });
      } else {
        // Subsequent regeneration attempt
        const statements = [
          this.db
            .prepare(
              `INSERT INTO post_versions (id, post_id, version_number, content, content_type, metadata, ai_model, ai_provider, created_at)
               VALUES (?, ?, ?, ?, 'text', ?, ?, ?, ?)`,
            )
            .bind(
              versionId,
              postId!,
              versionNumber,
              lastDraft.body,
              metadataJson,
              'llama-3.1-8b-instruct',
              writerProvider.name,
              versionCreatedAt,
            ),
        ];

        if (createdPostThisRun) {
          statements.push(
            this.db.prepare('UPDATE posts SET current_version = ?, updated_at = ? WHERE id = ?')
              .bind(versionNumber, new Date().toISOString(), postId!),
          );
        }

        await executeBatch(statements);

        if (approvedMatch && postId) {
          await imgLibrary.reserveImageForDraft(approvedMatch.image.id, postId, false);
        }
      }

      await this.auditLogger.log({
        eventType: 'POST_GENERATED',
        entityType: 'post_version',
        entityId: versionId,
        actor: 'ai',
        details: { versionNumber, bodyLength: lastDraft.body.length },
      });

      // 4c. Static Validation
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

      // 4c-2. Content Quality Gate (Semantic Substance & Anti-Filler Check)
      const contentQualityResult = this.contentQualityGate.evaluate(lastDraft, topicRow.title, [
        topicRow.description,
        topicRow.content_angle,
        ...sources.map((source) => source.summary),
      ].filter((text): text is string => Boolean(text)));
      if (!contentQualityResult.passed) {
        await this.auditLogger.log({
          eventType: 'CONTENT_QUALITY_GATE_FAILED',
          entityType: 'post_version',
          entityId: versionId,
          actor: 'system',
          details: { reasons: contentQualityResult.reasons, score: contentQualityResult.score },
        });
      } else {
        await this.auditLogger.log({
          eventType: 'CONTENT_QUALITY_GATE_PASSED',
          entityType: 'post_version',
          entityId: versionId,
          actor: 'system',
          details: { score: contentQualityResult.score },
        });
      }

      // 4d. Policy Review
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

      // 4e. Independent QA Review
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
          postId!,
          versionId,
          versionNumber,
          qaReview.verdict,
          qaReview.score,
          JSON.stringify({
            factual_accuracy: qaReview.verdict,
            content_quality: contentQualityResult.passed ? 'PASS' : 'FAIL',
            policy_risk: policyResult.passed ? 'PASS' : 'FAIL',
          }),
          JSON.stringify(qaReview.factualIssues.concat(contentQualityResult.reasons)),
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

      // 4f. Evaluate Quality Gate Decision
      finalDecision = evaluatePipelineGate({
        staticValid: staticResult.valid,
        contentQualityPassed: contentQualityResult.passed && smqgPass,
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
             SET status = 'approved', current_version = ?, quality_score = ?, quality_decision = 'PASS',
                 regeneration_count = ?,
                 sync_status = CASE WHEN EXISTS (SELECT 1 FROM publications pub WHERE pub.post_id = posts.id AND pub.status = 'published') THEN 'LOCAL_AHEAD' ELSE sync_status END,
                 updated_at = ?
             WHERE id = ?`,
          )
          .bind(versionNumber, finalScore, existingPost ? originalRegenerationCount + 1 : originalRegenerationCount, new Date().toISOString(), postId!)
          .run();

        // Update content_ideas status to post_generated
        await this.db
          .prepare("UPDATE content_ideas SET status = 'post_generated', updated_at = datetime('now') WHERE id = ?")
          .bind(topicId)
          .run();

        await this.auditLogger.log({
          eventType: 'POST_APPROVED',
          entityType: 'post',
          entityId: postId!,
          actor: 'system',
          details: { finalScore, attemptNumber: attempt },
        });

        return {
          postId: postId!,
          topicId,
          status: 'approved',
          currentVersion: versionNumber,
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

    // 5. Handle Case Where Generation Failed — Clean up any created D1 rows so NO incomplete post remains
    if (createdPostThisRun && postId) {
      await executeBatch([
        this.db.prepare('DELETE FROM quality_checks WHERE post_id = ?').bind(postId),
        this.db.prepare('DELETE FROM post_versions WHERE post_id = ?').bind(postId),
        this.db.prepare('DELETE FROM posts WHERE id = ?').bind(postId),
      ]);
    }

    const blockReason =
      runErrorMessage || `Failed quality gate evaluation after ${currentVersion} attempts.`;

    await this.auditLogger.log({
      eventType: 'WORKFLOW_FAILED',
      entityType: 'content_idea',
      entityId: topicId,
      actor,
      details: { reason: blockReason, currentVersion },
    });

    return {
      topicId,
      status: 'failed',
      currentVersion,
      qualityScore: finalScore,
      qualityDecision: finalDecision,
      errorMessage: blockReason,
      durationMs: Date.now() - startTime,
    };
  }
}
