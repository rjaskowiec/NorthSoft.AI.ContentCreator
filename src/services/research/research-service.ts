/**
 * NorthSoft.AI.ContentCreator — Autonomous Research Engine Service
 *
 * Orchestrates multi-pillar research source ingestion, deduplication, basic quality filtering,
 * AI post-angle extraction, diversity-aware queueing, topic cooldowns, and intelligent scheduling.
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
import { validateCandidateIdeaOutput } from './validator';
import {
  evaluateRelevance,
  isExcludedTopic,
  selectDiverseCandidates,
  MAX_AI_RESEARCH_CANDIDATES_PER_RUN,
  MAX_CANDIDATES_PER_PILLAR,
  type SelectableCandidate,
  type ContentPillar,
} from './taxonomy';
import { TopicRegistry } from './topic-registry';

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
  ideasQueued: number;
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
   * Executes the research discovery and content idea queueing pipeline.
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
        ideasQueued: 0,
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
      // Fallback
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
    let ideasQueued = 0;

    const pillarBreakdown: Record<string, number> = {
      WEBSITE: 0,
      MARKETING: 0,
      SALES: 0,
      AI: 0,
      SMALL_BUSINESS: 0,
      CUSTOMER_EXPERIENCE: 0,
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
          }
        } catch (err: unknown) {
          const errMessage = err instanceof Error ? err.message : 'Source fetch failed';
          await this.db
            .prepare(
              "UPDATE research_sources SET last_checked_at = ?, last_status = 'failed', last_error = ? WHERE id = ?",
            )
            .bind(checkTimeIso, errMessage.substring(0, 500), source.id)
            .run();
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

      // Step 3: Multi-Pillar Diversity Selection (MAX 12 total candidates, MAX 3 per pillar)
      const selectedCandidates = selectDiverseCandidates(
        selectableCandidates,
        MAX_AI_RESEARCH_CANDIDATES_PER_RUN,
        MAX_CANDIDATES_PER_PILLAR,
      );

      const topicRegistry = new TopicRegistry(this.db);
      const history = await topicRegistry.getRecentTopicHistory();

      // Step 4: Execute Workers AI completion to extract social post angles for selected candidates
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

        const systemInstructions = `You are a Senior Content Discovery Specialist for NorthSoft AI.
NorthSoft builds websites, landing pages, local SEO, online marketing, automation, and AI solutions for small and local businesses.
Your objective is to read the provided article/news item and extract a simple, practical, highly engaging SOCIAL MEDIA POST IDEA for a small business owner.

GUIDELINES:
- DO NOT create long academic articles or expert technical analyses.
- Create a simple, engaging content angle that delivers a quick bite of useful knowledge.
- The idea must encourage interaction (likes, comments, shares) and naturally show how NorthSoft can help.
- Identify the most appropriate Content Pillar from: WEBSITE, MARKETING, SALES, AI, SMALL_BUSINESS, CUSTOMER_EXPERIENCE, LOCAL_BUSINESS.

Return ONLY a valid JSON object matching this schema:
{
  "title": "Short, catchy social post headline for a small business owner",
  "angle": "Simple explanation of the content angle and why it matters to a small business owner",
  "hook": "Scroll-stopping first sentence or hook for the post",
  "summary": "2-3 sentence overview of the idea",
  "keyPoints": ["Key takeaway 1", "Key takeaway 2", "Key takeaway 3"],
  "contentPillar": "WEBSITE | MARKETING | SALES | AI | SMALL_BUSINESS | CUSTOMER_EXPERIENCE | LOCAL_BUSINESS",
  "engagementQuestion": "Engaging question to prompt comments from business owners",
  "commercialRelevance": 85,
  "engagementPotential": 90,
  "relevanceScore": 80
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
            temperature: 0.3,
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

          const valRes = validateCandidateIdeaOutput(completion.content);
          if (!valRes.valid || !valRes.data) {
            rejectedLowQuality++;
            await this.db
              .prepare("UPDATE research_items SET status = 'FAILED' WHERE id = ?")
              .bind(item.id)
              .run();
            continue;
          }

          const ideaData = valRes.data;

          // Check if exact duplicate angle or title exists in DB
          const existingIdea = await this.db
            .prepare('SELECT id FROM content_ideas WHERE title = ?')
            .bind(ideaData.title)
            .first();

          if (existingIdea) {
            duplicatesFound++;
            await this.db
              .prepare("UPDATE research_items SET status = 'DUPLICATE' WHERE id = ?")
              .bind(item.id)
              .run();
            continue;
          }

          // Calculate intelligent suggested_publish_date using TopicRegistry
          const scheduling = topicRegistry.calculateSuggestedPublishDate(
            ideaData.contentPillar as ContentPillar,
            ideaData.angle,
            history,
          );

          const ideaId = crypto.randomUUID();
          const pillar = ideaData.contentPillar;
          pillarBreakdown[pillar] = (pillarBreakdown[pillar] || 0) + 1;

          // Insert into content_ideas (queued)
          try {
            await this.db
              .prepare(
                `INSERT INTO content_ideas (
                  id, title, description, short_description, content_angle, hook, category, content_pillar,
                  source_type, source_url, source_title, source_published_at, relevance_score,
                  engagement_potential, commercial_relevance, suggested_publish_date, priority, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'research', ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
              )
              .bind(
                ideaId,
                ideaData.title,
                ideaData.summary,
                ideaData.summary,
                ideaData.angle,
                ideaData.hook,
                pillar,
                pillar,
                item.url,
                item.title,
                item.published_at,
                ideaData.relevanceScore,
                ideaData.engagementPotential,
                ideaData.commercialRelevance,
                scheduling.suggestedDate,
                ideaData.commercialRelevance,
                nowIso,
                nowIso,
              )
              .run();
          } catch {
            // Backward compatible fallback for older database schema
            await this.db
              .prepare(
                `INSERT INTO content_ideas (id, title, description, category, source_type, priority, status, created_at, updated_at)
                 VALUES (?, ?, ?, ?, 'research', ?, 'queued', ?, ?)`,
              )
              .bind(
                ideaId,
                ideaData.title,
                ideaData.summary,
                pillar,
                ideaData.relevanceScore,
                nowIso,
                nowIso,
              )
              .run();
          }

          // Record in Topic History
          await topicRegistry.recordTopicHistory({
            idea_id: ideaId,
            content_pillar: pillar,
            content_angle: ideaData.angle,
            title: ideaData.title,
            status: 'queued',
            suggested_publish_date: scheduling.suggestedDate,
          });

          await this.db
            .prepare("UPDATE research_items SET status = 'ANALYZED' WHERE id = ?")
            .bind(item.id)
            .run();

          topicsCreated++;
          ideasQueued++;

          await this.auditLogger.log({
            eventType: 'TOPIC_CREATED',
            entityType: 'content_idea',
            entityId: ideaId,
            actor: 'ai',
            level: 'SUCCESS',
            status: 'COMPLETED',
            operation: ideaData.title,
            correlationId: runId,
            details: {
              title: ideaData.title,
              pillar,
              angle: ideaData.angle,
              suggestedDate: scheduling.suggestedDate,
              relevanceScore: ideaData.relevanceScore,
              engagementPotential: ideaData.engagementPotential,
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

    // Update Run record with diagnostic metrics
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
      // Fallback
    }

    await this.auditLogger.log({
      eventType: 'RESEARCH_RUN_COMPLETED',
      entityType: 'research_run',
      entityId: runId,
      actor: triggerType === 'manual' ? 'admin' : 'system',
      level: finalStatus === 'completed' ? 'SUCCESS' : 'ERROR',
      status: finalStatus === 'completed' ? 'COMPLETED' : 'FAILED',
      operation: 'Content Discovery Pipeline',
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
        ideasQueued,
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
      ideasQueued,
      pillarBreakdown,
      errorMessage: runErrorMessage,
      durationMs,
    };
  }
}
