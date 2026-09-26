/**
 * NorthSoft.AI.ContentCreator — Autonomous Research Engine Service
 *
 * Orchestrates research source ingestion, deduplication, SSRF-safe fetching,
 * AI topic extraction, candidate topic creation, and comprehensive audit logging.
 */

import { D1AuditLogger, type IAuditLogger } from '../../core/audit';
import { formatResearchPromptPayload } from '../../core/security/prompt-injection';
import type { IAIProvider } from '../../ai/provider';
import { QuotaManager } from '../ai/quota-manager';
import {
  RssSourceAdapter,
  type RawResearchItem,
  type ResearchSourceRecord,
} from './source-adapter';
import { validateCandidateTopicOutput } from './validator';

export interface ResearchRunSummary {
  runId: string;
  triggerType: 'cron' | 'manual';
  status: 'completed' | 'failed';
  sourcesChecked: number;
  itemsFound: number;
  topicsCreated: number;
  errorMessage?: string;
  durationMs: number;
}

export class ResearchService {
  private quotaManager: QuotaManager;

  constructor(
    private db: D1Database,
    private aiProvider: IAIProvider,
    private auditLogger: IAuditLogger = new D1AuditLogger(db),
  ) {
    this.quotaManager = new QuotaManager();
  }

  /**
   * Executes the research discovery and topic creation pipeline.
   */
  async runResearchPipeline(triggerType: 'cron' | 'manual' = 'cron'): Promise<ResearchRunSummary> {
    const startTime = Date.now();
    const runId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    // 1. Lock Check / Idempotency: Prevent concurrent active runs
    const recentRunning = await this.db
      .prepare(
        "SELECT id FROM research_runs WHERE status = 'running' AND started_at > datetime('now', '-5 minutes')",
      )
      .first();

    if (recentRunning) {
      return {
        runId: (recentRunning.id as string) || runId,
        triggerType,
        status: 'completed',
        sourcesChecked: 0,
        itemsFound: 0,
        topicsCreated: 0,
        errorMessage: 'Skipped: Another research run is currently in progress',
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Create Run Entry
    await this.db
      .prepare(
        `INSERT INTO research_runs (id, trigger_type, status, started_at)
         VALUES (?, ?, 'running', ?)`,
      )
      .bind(runId, triggerType, nowIso)
      .run();

    await this.auditLogger.log({
      eventType: 'RESEARCH_RUN_STARTED',
      entityType: 'research_run',
      entityId: runId,
      actor: triggerType === 'manual' ? 'admin' : 'system',
      details: { triggerType },
    });

    let sourcesChecked = 0;
    let itemsFound = 0;
    let topicsCreated = 0;
    let runErrorMessage: string | undefined;

    try {
      // 3. Load enabled sources ordered by priority
      const sourcesResult = await this.db
        .prepare(
          'SELECT id, name, url, type, category, enabled, priority, last_checked_at, last_status, last_error FROM research_sources WHERE enabled = 1 ORDER BY priority DESC',
        )
        .all<ResearchSourceRecord>();

      const sources = sourcesResult.results || [];
      const adapter = new RssSourceAdapter();

      // 4. Ingest each source independently (fault-isolated)
      for (const source of sources) {
        sourcesChecked++;
        const checkTimeIso = new Date().toISOString();

        try {
          const rawItems: RawResearchItem[] = await adapter.fetchItems(source);

          await this.db
            .prepare(
              "UPDATE research_sources SET last_checked_at = ?, last_status = 'success', last_error = NULL WHERE id = ?",
            )
            .bind(checkTimeIso, source.id)
            .run();

          await this.auditLogger.log({
            eventType: 'RESEARCH_SOURCE_FETCHED',
            entityType: 'research_source',
            entityId: source.id,
            actor: 'system',
            details: {
              sourceName: source.name,
              itemCount: rawItems.length,
            },
          });

          // 5. Store and Deduplicate Raw Items
          for (const item of rawItems) {
            // Check deterministic url_hash
            const existing = await this.db
              .prepare('SELECT id FROM research_items WHERE url_hash = ?')
              .bind(item.urlHash)
              .first();

            if (existing) {
              await this.auditLogger.log({
                eventType: 'RESEARCH_ITEM_DUPLICATE',
                entityType: 'research_item',
                entityId: (existing.id as string) || item.urlHash,
                actor: 'system',
                details: { url: item.url },
              });
              continue;
            }

            const itemId = crypto.randomUUID();
            await this.db
              .prepare(
                `INSERT INTO research_items (id, source_id, title, url, url_hash, content_summary, published_at, fetched_at, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'NEW')`,
              )
              .bind(
                itemId,
                item.sourceId,
                item.title,
                item.url,
                item.urlHash,
                item.summary,
                item.publishedAt,
                checkTimeIso,
              )
              .run();

            itemsFound++;

            await this.auditLogger.log({
              eventType: 'RESEARCH_ITEM_CREATED',
              entityType: 'research_item',
              entityId: itemId,
              actor: 'system',
              details: {
                title: item.title,
                url: item.url,
              },
            });
          }
        } catch (err: unknown) {
          const errMessage = err instanceof Error ? err.message : 'Source fetch failed';
          await this.db
            .prepare(
              "UPDATE research_sources SET last_checked_at = ?, last_status = 'failed', last_error = ? WHERE id = ?",
            )
            .bind(checkTimeIso, errMessage.substring(0, 500), source.id)
            .run();

          await this.auditLogger.log({
            eventType: 'RESEARCH_SOURCE_FAILED',
            entityType: 'research_source',
            entityId: source.id,
            actor: 'system',
            details: {
              sourceName: source.name,
              error: errMessage,
            },
          });
        }
      }

      // 6. AI Topic Discovery on NEW items (Cost control: max 5 items per run)
      const newItemsResult = await this.db
        .prepare(
          "SELECT id, source_id, title, url, url_hash, content_summary, published_at FROM research_items WHERE status = 'NEW' ORDER BY fetched_at DESC LIMIT 5",
        )
        .all<{
          id: string;
          source_id: string;
          title: string;
          url: string;
          url_hash: string;
          content_summary: string;
          published_at: string;
        }>();

      const newItems = newItemsResult.results || [];

      for (const item of newItems) {
        // Enforce ZERO-COST AI Capacity Check BEFORE executing AI request
        const capacity = await this.quotaManager.checkCapacity(
          this.db,
          this.aiProvider.name,
          'default',
        );

        if (!capacity.allowed) {
          await this.auditLogger.log({
            eventType: 'AI_QUOTA_EXCEEDED',
            entityType: 'research_item',
            entityId: item.id,
            actor: 'system',
            level: 'WARNING',
            status: 'DEFERRED',
            operation: item.title,
            correlationId: runId,
            details: { reason: capacity.reason },
          });

          await this.auditLogger.log({
            eventType: 'RESEARCH_DEFERRED',
            entityType: 'research_item',
            entityId: item.id,
            actor: 'system',
            level: 'WARNING',
            status: 'DEFERRED',
            operation: item.title,
            correlationId: runId,
            details: { status: 'DEFERRED_NO_FREE_AI_CAPACITY' },
          });

          // Mark item status as DEFERRED
          await this.db
            .prepare("UPDATE research_items SET status = 'DEFERRED' WHERE id = ?")
            .bind(item.id)
            .run();

          // Gracefully defer further AI calls during this run
          break;
        }

        const aiStartTime = Date.now();

        const systemInstructions = `You are a Senior Technology Research Analyst for NorthSoft AI.
Analyze the provided external article data and evaluate its potential for an autonomous content creation pipeline.
Return a valid JSON object containing:
{
  "title": "Clear, engaging topic headline",
  "summary": "2-3 sentence overview of the technical topic",
  "sourceUrl": "the source URL",
  "sourceName": "the source publisher",
  "publishedAt": "ISO date",
  "relevanceScore": 0-100 integer rating,
  "categories": ["Category1", "Category2"],
  "keyClaims": ["Claim 1", "Claim 2"],
  "whyRelevant": "Why this matters to small business technology and modern cloud infrastructure",
  "confidence": 0.0-1.0
}`;

        const unparsedPayload = `Title: ${item.title}\nURL: ${item.url}\nSummary: ${item.content_summary}`;
        const { systemPrompt, userPrompt } = formatResearchPromptPayload(
          systemInstructions,
          unparsedPayload,
        );

        await this.auditLogger.log({
          eventType: 'AI_RESEARCH_STARTED',
          entityType: 'research_item',
          entityId: item.id,
          actor: 'ai',
          level: 'INFO',
          status: 'STARTED',
          operation: item.title,
          correlationId: runId,
          details: { title: item.title, url: item.url },
        });

        try {
          const completion = await this.aiProvider.complete({
            role: 'researcher',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.2,
            responseFormat: 'json',
          });

          // Record usage via QuotaManager
          await this.quotaManager.recordUsage(this.db, {
            provider: completion.provider,
            model: completion.model,
            role: 'researcher',
            inputTokens: completion.usage.promptTokens,
            outputTokens: completion.usage.completionTokens,
            success: true,
            durationMs: completion.durationMs,
          });

          await this.auditLogger.log({
            eventType: 'AI_RESEARCH_COMPLETED',
            entityType: 'research_item',
            entityId: item.id,
            actor: 'ai',
            level: 'SUCCESS',
            status: 'COMPLETED',
            operation: item.title,
            correlationId: runId,
            durationMs: Date.now() - aiStartTime,
            details: {
              model: completion.model,
              provider: completion.provider,
              tokens: completion.usage.totalTokens,
            },
          });

          // Validate AI JSON Output
          const valRes = validateCandidateTopicOutput(completion.content);
          if (!valRes.valid || !valRes.data) {
            await this.db
              .prepare("UPDATE research_items SET status = 'FAILED' WHERE id = ?")
              .bind(item.id)
              .run();
            await this.auditLogger.log({
              eventType: 'AI_RESEARCH_FAILED',
              entityType: 'research_item',
              entityId: item.id,
              actor: 'ai',
              level: 'ERROR',
              status: 'FAILED',
              operation: item.title,
              correlationId: runId,
              durationMs: Date.now() - aiStartTime,
              error: {
                message: valRes.errors ? valRes.errors.join('; ') : 'AI candidate topic output validation failed',
                stage: 'JSON Validation',
                code: 'VALIDATION_FAILED',
              },
              details: { errors: valRes.errors },
            });
            continue;
          }

          const topicData = valRes.data;

          // Check if candidate topic with exact title already exists in content_ideas
          const existingIdea = await this.db
            .prepare('SELECT id FROM content_ideas WHERE title = ?')
            .bind(topicData.title)
            .first();

          if (existingIdea) {
            await this.db
              .prepare("UPDATE research_items SET status = 'DUPLICATE' WHERE id = ?")
              .bind(item.id)
              .run();
            continue;
          }

          // Insert Candidate Topic into content_ideas
          const ideaId = crypto.randomUUID();
          const mainCategory = topicData.categories[0] || 'General';

          await this.db
            .prepare(
              `INSERT INTO content_ideas (id, title, description, category, source_type, priority, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, 'research', ?, 'new', ?, ?)`,
            )
            .bind(
              ideaId,
              topicData.title,
              topicData.summary,
              mainCategory,
              topicData.relevanceScore,
              nowIso,
              nowIso,
            )
            .run();

          // Mark item as ANALYZED
          await this.db
            .prepare("UPDATE research_items SET status = 'ANALYZED' WHERE id = ?")
            .bind(item.id)
            .run();

          topicsCreated++;

          await this.auditLogger.log({
            eventType: 'TOPIC_CREATED',
            entityType: 'content_idea',
            entityId: ideaId,
            actor: 'ai',
            level: 'SUCCESS',
            status: 'COMPLETED',
            operation: topicData.title,
            correlationId: runId,
            details: {
              title: topicData.title,
              category: mainCategory,
              relevanceScore: topicData.relevanceScore,
            },
          });
        } catch (aiErr: unknown) {
          const aiErrMsg = aiErr instanceof Error ? aiErr.message : 'AI completion failed';

          await this.quotaManager.recordUsage(this.db, {
            provider: this.aiProvider.name,
            model: 'unknown',
            role: 'researcher',
            success: false,
            durationMs: Date.now() - aiStartTime,
            errorMessage: aiErrMsg,
          });

          await this.db
            .prepare("UPDATE research_items SET status = 'FAILED' WHERE id = ?")
            .bind(item.id)
            .run();

          await this.auditLogger.log({
            eventType: 'AI_RESEARCH_FAILED',
            entityType: 'research_item',
            entityId: item.id,
            actor: 'ai',
            level: 'ERROR',
            status: 'FAILED',
            operation: item.title,
            correlationId: runId,
            durationMs: Date.now() - aiStartTime,
            error: {
              message: aiErrMsg,
              stage: 'Workers AI completion',
              code: 'AI_COMPLETION_ERROR',
              httpStatus: 500,
            },
            details: { title: item.title, error: aiErrMsg },
          });
        }
      }
    } catch (globalErr: unknown) {
      runErrorMessage =
        globalErr instanceof Error ? globalErr.message : 'Global research pipeline failure';
    }

    const durationMs = Date.now() - startTime;
    const finalStatus = runErrorMessage ? 'failed' : 'completed';

    // Update Run record
    await this.db
      .prepare(
        `UPDATE research_runs 
         SET status = ?, sources_checked = ?, items_found = ?, topics_created = ?, error_message = ?, completed_at = ?
         WHERE id = ?`,
      )
      .bind(
        finalStatus,
        sourcesChecked,
        itemsFound,
        topicsCreated,
        runErrorMessage || null,
        new Date().toISOString(),
        runId,
      )
      .run();

    return {
      runId,
      triggerType,
      status: finalStatus,
      sourcesChecked,
      itemsFound,
      topicsCreated,
      errorMessage: runErrorMessage,
      durationMs,
    };
  }
}
