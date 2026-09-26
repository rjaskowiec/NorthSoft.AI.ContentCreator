/**
 * NorthSoft.AI.ContentCreator — Autonomous Research Engine Service
 *
 * Orchestrates multi-pillar research source ingestion, fallback levels (Level 1-3),
 * deduplication, relevance & brand exclusion filtering, AI topic extraction,
 * diversity-aware candidate topic creation, and comprehensive diagnostics.
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
import {
  determineContentPillar,
  evaluateRelevance,
  isExcludedTopic,
  selectDiverseCandidates,
  MAX_AI_RESEARCH_CANDIDATES_PER_RUN,
  MAX_CANDIDATES_PER_PILLAR,
  type SelectableCandidate,
} from './taxonomy';

interface RawItemRecord {
  id: string;
  source_id: string;
  title: string;
  url: string;
  url_hash: string;
  content_summary: string;
  published_at: string;
}

export interface ResearchRunSummary {
  runId: string;
  triggerType: 'cron' | 'manual';
  status: 'completed' | 'failed';
  sourcesChecked: number;
  itemsDiscovered: number;
  itemsNormalized: number;
  duplicatesFound: number;
  rejectedIrrelevant: number;
  rejectedLowQuality: number;
  topicsCreated: number;
  pillarBreakdown: Record<string, number>;
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
   * Executes the research discovery and topic creation pipeline using Multi-Pillar Balanced Collection.
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
        itemsDiscovered: 0,
        itemsNormalized: 0,
        duplicatesFound: 0,
        rejectedIrrelevant: 0,
        rejectedLowQuality: 0,
        topicsCreated: 0,
        pillarBreakdown: {},
        errorMessage: 'Skipped: Another research run is currently in progress',
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Create Run Entry
    try {
      await this.db
        .prepare(
          `INSERT INTO research_runs (id, trigger_type, status, started_at)
           VALUES (?, ?, 'running', ?)`,
        )
        .bind(runId, triggerType, nowIso)
        .run();
    } catch {
      // Fallback if DB table lacks new columns yet
    }

    await this.auditLogger.log({
      eventType: 'RESEARCH_RUN_STARTED',
      entityType: 'research_run',
      entityId: runId,
      actor: triggerType === 'manual' ? 'admin' : 'system',
      details: { triggerType },
    });

    let sourcesChecked = 0;
    let itemsDiscovered = 0;
    let itemsNormalized = 0;
    let duplicatesFound = 0;
    let rejectedIrrelevant = 0;
    let rejectedLowQuality = 0;
    let topicsCreated = 0;
    const pillarBreakdown: Record<string, number> = {
      WEB_TECHNOLOGY: 0,
      ONLINE_PRESENCE: 0,
      MARKETING: 0,
      SMALL_BUSINESS: 0,
      AI_AUTOMATION: 0,
      LOCAL_BUSINESS: 0,
    };
    let runErrorMessage: string | undefined;

    try {
      // Load all enabled sources across all pillars
      const sourcesResult = await this.db
        .prepare(
          'SELECT id, name, url, type, category, enabled, priority, last_checked_at, last_status, last_error FROM research_sources WHERE enabled = 1 ORDER BY priority DESC',
        )
        .all<ResearchSourceRecord>();

      const sources = sourcesResult.results || [];
      const adapter = new RssSourceAdapter();

      // Step 1: Ingest and deduplicate raw items across ALL enabled sources
      for (const source of sources) {
        sourcesChecked++;
        const checkTimeIso = new Date().toISOString();

        try {
          const rawItems: RawResearchItem[] = await adapter.fetchItems(source);
          itemsDiscovered += rawItems.length;

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

          // Store and Deduplicate Raw Items
          for (const item of rawItems) {
            itemsNormalized++;

            // Exclusion check (politics, entertainment, clickbait)
            const exclusion = isExcludedTopic(item.title, item.summary);
            if (exclusion.excluded) {
              rejectedIrrelevant++;
              continue;
            }

            // Check deterministic url_hash
            const existing = await this.db
              .prepare('SELECT id FROM research_items WHERE url_hash = ?')
              .bind(item.urlHash)
              .first();

            if (existing) {
              duplicatesFound++;
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

      // Step 2: Fetch unanalyzed research items for relevance evaluation & diversity selection
      const newItemsResult = await this.db
        .prepare(
          "SELECT id, source_id, title, url, url_hash, content_summary, published_at FROM research_items WHERE status IN ('NEW', 'DEFERRED') ORDER BY fetched_at DESC LIMIT 50",
        )
        .all<RawItemRecord>();

      const candidateItems = newItemsResult.results || [];
      const selectableCandidates: SelectableCandidate<RawItemRecord>[] = [];

      for (const item of candidateItems) {
        // Check NorthSoft audience relevance before AI selection
        const relEval = evaluateRelevance(item.title, item.content_summary);
        if (!relEval.passed) {
          rejectedIrrelevant++;
          await this.db
            .prepare("UPDATE research_items SET status = 'REJECTED' WHERE id = ?")
            .bind(item.id)
            .run();
          continue;
        }

        selectableCandidates.push({
          item,
          pillar: relEval.pillar,
          score: relEval.score,
        });
      }

      // Step 3: Multi-Pillar Diversity Selection (MAX 6 total candidates, MAX 2 per pillar)
      const selectedCandidates = selectDiverseCandidates(
        selectableCandidates,
        MAX_AI_RESEARCH_CANDIDATES_PER_RUN,
        MAX_CANDIDATES_PER_PILLAR,
      );

      // Step 4: Execute Workers AI completion on selected diverse candidate pool
      for (const candidate of selectedCandidates) {
        const item = candidate.item;

        // Enforce AI Quota Capacity Check
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

          await this.db
            .prepare("UPDATE research_items SET status = 'DEFERRED' WHERE id = ?")
            .bind(item.id)
            .run();
          break;
        }

        const aiStartTime = Date.now();

        const systemInstructions = `You are a Senior Content Research Analyst for NorthSoft AI.
NorthSoft builds websites, digital presence, local SEO, online marketing, automation, and AI for small and local businesses.
Evaluate the provided article data and extract a practical, highly engaging topic idea suitable for small business owners.
Return a valid JSON object containing:
{
  "title": "Clear, engaging headline for small business owners",
  "summary": "2-3 sentence overview explaining why this matters to a small business owner",
  "sourceUrl": "the source URL",
  "sourceName": "the source publisher",
  "publishedAt": "ISO date",
  "relevanceScore": 0-100 integer rating,
  "categories": ["Category1", "Category2"],
  "keyClaims": ["Key takeaway 1", "Key takeaway 2"],
  "whyRelevant": "Why this is useful for small business growth, websites, or digital presence",
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

          await this.quotaManager.recordUsage(this.db, {
            provider: completion.provider,
            model: completion.model,
            role: 'researcher',
            inputTokens: completion.usage.promptTokens,
            outputTokens: completion.usage.completionTokens,
            success: true,
            durationMs: completion.durationMs,
          });

          const valRes = validateCandidateTopicOutput(completion.content);
          if (!valRes.valid || !valRes.data) {
            rejectedLowQuality++;
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
                message: valRes.errors ? valRes.errors.join('; ') : 'AI JSON output validation failed',
                stage: 'JSON Validation',
                code: 'VALIDATION_FAILED',
              },
              details: { errors: valRes.errors },
            });
            continue;
          }

          const topicData = valRes.data;

          // Title deduplication against content_ideas
          const existingIdea = await this.db
            .prepare('SELECT id FROM content_ideas WHERE title = ?')
            .bind(topicData.title)
            .first();

          if (existingIdea) {
            duplicatesFound++;
            await this.db
              .prepare("UPDATE research_items SET status = 'DUPLICATE' WHERE id = ?")
              .bind(item.id)
              .run();
            continue;
          }

          const ideaId = crypto.randomUUID();
          const pillar = determineContentPillar(topicData.title, topicData.summary, topicData.categories);
          pillarBreakdown[pillar] = (pillarBreakdown[pillar] || 0) + 1;

          await this.db
            .prepare(
              `INSERT INTO content_ideas (id, title, description, category, source_type, priority, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, 'research', ?, 'new', ?, ?)`,
            )
            .bind(
              ideaId,
              topicData.title,
              topicData.summary,
              pillar,
              topicData.relevanceScore,
              nowIso,
              nowIso,
            )
            .run();

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
              pillar,
              relevanceScore: topicData.relevanceScore,
            },
          });
        } catch (aiErr: unknown) {
          rejectedLowQuality++;
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
        }
      }
    } catch (globalErr: unknown) {
      runErrorMessage =
        globalErr instanceof Error ? globalErr.message : 'Global research pipeline failure';
    }

    const durationMs = Date.now() - startTime;
    const finalStatus = runErrorMessage ? 'failed' : 'completed';

    // Update Run record with comprehensive diagnostic metrics
    try {
      await this.db
        .prepare(
          `UPDATE research_runs 
           SET status = ?, sources_checked = ?, items_found = ?, topics_created = ?,
               items_discovered = ?, items_normalized = ?, duplicates_found = ?,
               rejected_irrelevant = ?, rejected_low_quality = ?, pillar_breakdown = ?,
               error_message = ?, completed_at = ?
           WHERE id = ?`,
        )
        .bind(
          finalStatus,
          sourcesChecked,
          itemsDiscovered,
          topicsCreated,
          itemsDiscovered,
          itemsNormalized,
          duplicatesFound,
          rejectedIrrelevant,
          rejectedLowQuality,
          JSON.stringify(pillarBreakdown),
          runErrorMessage || null,
          new Date().toISOString(),
          runId,
        )
        .run();
    } catch {
      // Fallback for schema versions without new diagnostic columns
      await this.db
        .prepare(
          `UPDATE research_runs 
           SET status = ?, sources_checked = ?, items_found = ?, topics_created = ?, error_message = ?, completed_at = ?
           WHERE id = ?`,
        )
        .bind(
          finalStatus,
          sourcesChecked,
          itemsDiscovered,
          topicsCreated,
          runErrorMessage || null,
          new Date().toISOString(),
          runId,
        )
        .run();
    }

    await this.auditLogger.log({
      eventType: 'RESEARCH_RUN_COMPLETED',
      entityType: 'research_run',
      entityId: runId,
      actor: triggerType === 'manual' ? 'admin' : 'system',
      level: finalStatus === 'completed' ? 'SUCCESS' : 'ERROR',
      status: finalStatus === 'completed' ? 'COMPLETED' : 'FAILED',
      operation: 'Research Discovery Pipeline',
      correlationId: runId,
      durationMs,
      details: {
        sourcesChecked,
        itemsDiscovered,
        itemsNormalized,
        duplicatesFound,
        rejectedIrrelevant,
        rejectedLowQuality,
        topicsCreated,
        pillarBreakdown,
      },
    });

    return {
      runId,
      triggerType,
      status: finalStatus,
      sourcesChecked,
      itemsDiscovered,
      itemsNormalized,
      duplicatesFound,
      rejectedIrrelevant,
      rejectedLowQuality,
      topicsCreated,
      pillarBreakdown,
      errorMessage: runErrorMessage,
      durationMs,
    };
  }
}
