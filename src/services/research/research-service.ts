/**
 * NorthSoft.AI.ContentCreator — Autonomous Research Engine Service
 *
 * Orchestrates source ingestion, inspiration tracking, substantive content angle deduplication,
 * topic cooldowns, and intelligent scheduling into the Content Ideas Queue.
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
  active_angles_count?: number;
}

export interface ResearchRunSummary {
  runId: string;
  triggerType: 'cron' | 'manual';
  status: 'completed' | 'failed';
  sourcesChecked: number;
  rawItemsDiscovered: number;
  newSourcesCount: number;
  knownSourcesCount: number;
  sourceReuseCandidates: number;
  potentialAnglesDiscovered: number;
  noUsefulAngleCount: number;
  rejectedTooTechnical: number;
  rejectedIrrelevant: number;
  rejectedDuplicateAngle: number;
  rejectedRecentCooldown: number;
  ideasQueued: number;
  ideasDeferred: number;
  aiProviderName: string;
  aiModelName: string;
  aiInferenceRequests: number;
  aiInferenceSuccessful: number;
  aiInferenceFailed: number;
  fallbackExecutions: number;
  topicsCreated: number; // Backward compatibility
  duplicatesFound: number; // Backward compatibility
  itemsDiscovered: number; // Backward compatibility
  itemsNormalized: number; // Backward compatibility
  rejectedLowQuality: number; // Backward compatibility
  pillarBreakdown: Record<string, number>;
  errorMessage?: string;
  durationMs: number;
  localEstimatedTokens: number;
  cloudflareVerifiedUsage: number | null;
  usageSource: string;
  usageTimestamp: string;
}

export class ResearchService {
  private quotaManager: QuotaManager;

  constructor(
    private db: D1Database,
    private aiProvider: IAIProvider,
    private auditLogger: IAuditLogger = new D1AuditLogger(db),
    private env?: Env,
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
        rawItemsDiscovered: 0,
        newSourcesCount: 0,
        knownSourcesCount: 0,
        sourceReuseCandidates: 0,
        potentialAnglesDiscovered: 0,
        noUsefulAngleCount: 0,
        rejectedTooTechnical: 0,
        rejectedIrrelevant: 0,
        rejectedDuplicateAngle: 0,
        rejectedRecentCooldown: 0,
        ideasQueued: 0,
        ideasDeferred: 0,
        aiProviderName: this.aiProvider.name,
        aiModelName: '@cf/meta/llama-3.1-8b-instruct-fp8',
        aiInferenceRequests: 0,
        aiInferenceSuccessful: 0,
        aiInferenceFailed: 0,
        fallbackExecutions: 0,
        topicsCreated: 0,
        duplicatesFound: 0,
        itemsDiscovered: 0,
        itemsNormalized: 0,
        rejectedLowQuality: 0,
        pillarBreakdown: {},
        errorMessage: 'Skipped: Another research run is currently in progress',
        durationMs: Date.now() - startTime,
        localEstimatedTokens: 0,
        cloudflareVerifiedUsage: null,
        usageSource: 'none',
        usageTimestamp: nowIso,
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
    let rawItemsDiscovered = 0;
    let newSourcesCount = 0;
    let knownSourcesCount = 0;
    let sourceReuseCandidates = 0;
    let potentialAnglesDiscovered = 0;
    let noUsefulAngleCount = 0;
    let aiInferenceRequests = 0;
    let aiInferenceSuccessful = 0;
    let aiInferenceFailed = 0;
    let fallbackExecutions = 0;

    if (this.aiProvider.name === 'mock') {
      fallbackExecutions++;
    }

    let rejectedIrrelevant = 0;
    let rejectedTooTechnical = 0;
    let rejectedDuplicateAngle = 0;
    const rejectedRecentCooldown = 0;
    let ideasQueued = 0;
    let ideasDeferred = 0;

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

      // Step 1: Ingest and register raw source items (Technical Source Deduplication)
      for (const source of sources) {
        sourcesChecked++;
        const checkTimeIso = new Date().toISOString();

        try {
          const rawItems: RawResearchItem[] = await adapter.fetchItems(source);
          rawItemsDiscovered += rawItems.length;

          await this.db
            .prepare(
              "UPDATE research_sources SET last_checked_at = ?, last_status = 'success', last_error = NULL WHERE id = ?",
            )
            .bind(checkTimeIso, source.id)
            .run();

          for (const item of rawItems) {
            // Check if source URL is already known in research_items
            const existing = await this.db
              .prepare('SELECT id FROM research_items WHERE url_hash = ?')
              .bind(item.urlHash)
              .first();

            if (existing) {
              knownSourcesCount++;
            } else {
              newSourcesCount++;
              const itemId = crypto.randomUUID();
              await this.db
                .prepare(
                  `INSERT INTO research_items (id, source_id, title, url, url_hash, content_summary, published_at, fetched_at, status, active_angles_count)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'NEW', 0)`,
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

      // Step 2: Fetch source items eligible for angle extraction
      // Max 3 active angles per source material to prevent single-source domination
      let candidateItems: RawItemRecord[] = [];
      try {
        const candidateRes = await this.db
          .prepare(
            `SELECT id, source_id, title, url, url_hash, content_summary, published_at, active_angles_count
             FROM research_items
             WHERE status != 'REJECTED' AND (active_angles_count IS NULL OR active_angles_count < 3)
             ORDER BY fetched_at DESC
             LIMIT 50`,
          )
          .all<RawItemRecord>();
        candidateItems = candidateRes.results || [];
      } catch {
        const candidateRes = await this.db
          .prepare(
            "SELECT id, source_id, title, url, url_hash, content_summary, published_at FROM research_items ORDER BY fetched_at DESC LIMIT 50",
          )
          .all<RawItemRecord>();
        candidateItems = candidateRes.results || [];
      }

      sourceReuseCandidates = candidateItems.length;
      const selectableCandidates: SelectableCandidate<RawItemRecord>[] = [];

      for (const item of candidateItems) {
        // Exclusion check (politics, entertainment, clickbait)
        const exclusion = isExcludedTopic(item.title, item.content_summary);
        if (exclusion.excluded) {
          rejectedIrrelevant++;
          continue;
        }

        // Relevance & quality score
        const relEval = evaluateRelevance(item.title, item.content_summary);
        if (!relEval.passed) {
          rejectedTooTechnical++;
          continue;
        }

        selectableCandidates.push({
          item,
          pillar: relEval.pillar,
          score: relEval.score,
        });
      }

      // Step 3: Multi-Pillar Diversity Selection
      const selectedCandidates = selectDiverseCandidates(
        selectableCandidates,
        MAX_AI_RESEARCH_CANDIDATES_PER_RUN,
        MAX_CANDIDATES_PER_PILLAR,
      );

      const topicRegistry = new TopicRegistry(this.db);
      const history = await topicRegistry.getRecentTopicHistory();
      potentialAnglesDiscovered = selectedCandidates.length;

      // Step 4: Execute Workers AI completion to extract social post angles for selected candidate sources
      for (const candidate of selectedCandidates) {
        const item = candidate.item;

        // Enforce AI Quota Capacity Check
        const capacity = await this.quotaManager.checkCapacity(
          this.db,
          this.aiProvider.name,
          'default',
        );

        if (!capacity.allowed) {
          ideasDeferred++;
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
          break;
        }

        const aiStartTime = Date.now();

        const systemInstructions = `You are a Content Scout for NorthSoft AI.
NorthSoft builds websites, landing pages, local SEO, online marketing, automation, and AI solutions for small and local businesses.
Your objective is to read the provided source item and extract a SIMPLE, PRACTICAL, HIGHLY ENGAGING SOCIAL MEDIA POST IDEA (Facebook/Instagram) for a small business owner.

CORE PHILOSOPHY:
- Treat the source item as INSPIRATION / FACT ANCHOR, NOT as a text to translate or summarize.
- Ask: "Why would a small business owner want to read this?" (getting clients, saving time, improving service, automating annoying tasks).
- Prefer simple social formats: LIST ("5 rzeczy..."), CHECKLIST ("Sprawdź czy..."), QUESTION ("Czy Twoja firma...?"), STAT_INSIGHT ("Coraz więcej firm..."), MYTH, TIPS ("3 proste sposoby..."), COMPARISON ("FB vs własna strona"), PROBLEM_SOLUTION, ENGAGEMENT.

CRITICAL RULES:
1. ABSOLUTELY NO CORPORATE / MARKETING JARGON. The following buzzwords are FORBIDDEN:
   "odblokuj potencjał", "transformacja cyfrowa", "game changer", "holistyczne podejście", "skalowanie biznesu",
   "nowa era przedsiębiorczości", "rewolucjonizuje sposób", "wykorzystaj synergię", "maksymalizuj konwersję".
2. FACT PRESERVATION RULE: If referencing specific numbers, percentages, or statistics from the source, KEEP THEM 100% ACCURATE. NEVER fabricate or invent stats, percentages, quotes, or fake research not present in the source. If there are no numbers in the source, write a broad, honest observation without inventing fake numbers.
3. Write in friendly, human conversational Polish.
4. NO ARTIFICIAL BRIDGES: If the source item does NOT offer a genuine, logical, or clear inspiration for a small business owner post (e.g. internal compiler releases, framework updates, corporate announcements without small-business application), DO NOT FORCE AN ARTIFICIAL POST. Instead, return: {"usefulAngle": false, "reason": "NO_USEFUL_ANGLE"}.

Return ONLY a valid JSON object matching this schema:
{
  "usefulAngle": true,
  "title": "Chwytliwy nagłówek posta w prostym języku dla właściciela małej firmy",
  "angle": "Proste wyjaśnienie ujęcia tematu i dlaczego ma znaczenie dla przedsiębiorcy",
  "hook": "Pierwsze zdanie przykuwające uwagę w social media",
  "summary": "Krótki zarys treści posta (2-3 zdania)",
  "keyPoints": ["Praktyczny punkt 1", "Praktyczny punkt 2", "Praktyczny punkt 3"],
  "contentPillar": "WEBSITE | MARKETING | SALES | AI | SMALL_BUSINESS | CUSTOMER_EXPERIENCE | LOCAL_BUSINESS",
  "postType": "LIST | CHECKLIST | QUESTION | STAT_INSIGHT | MYTH | TIPS | COMPARISON | PROBLEM_SOLUTION | ENGAGEMENT",
  "engagementQuestion": "Proste pytanie na końcu posta zachęcające klientów do dyskusji",
  "commercialRelevance": 85,
  "engagementPotential": 90,
  "relevanceScore": 80
}`;

        const unparsedPayload = `Title: ${item.title}\nURL: ${item.url}\nSummary: ${item.content_summary}`;
        const { systemPrompt, userPrompt } = formatResearchPromptPayload(
          systemInstructions,
          unparsedPayload,
        );

        try {
          aiInferenceRequests++;
          const completion = await this.aiProvider.complete({
            role: 'researcher',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            responseFormat: 'json',
          });
          aiInferenceSuccessful++;

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
            rejectedTooTechnical++;
            continue;
          }

          const ideaData = valRes.data;

          if (ideaData.usefulAngle === false) {
            noUsefulAngleCount++;
            await this.auditLogger.log({
              eventType: 'AI_RESEARCH_COMPLETED',
              entityType: 'research_item',
              entityId: item.id,
              actor: 'ai',
              level: 'INFO',
              status: 'COMPLETED',
              operation: 'Content Scout Inference',
              correlationId: runId,
              durationMs: completion.durationMs,
              details: {
                provider: completion.provider,
                model: completion.model,
                result: 'NO_USEFUL_ANGLE',
                reason: ideaData.noUsefulAngleReason || 'NO_USEFUL_ANGLE',
              },
            });
            continue;
          }

          // Check if angle is a substantive duplicate against TopicRegistry history
          const scheduling = topicRegistry.calculateSuggestedPublishDate(
            ideaData.contentPillar as ContentPillar,
            ideaData.angle,
            history,
          );

          if (scheduling.isDuplicateAngle) {
            rejectedDuplicateAngle++;
            await this.auditLogger.log({
              eventType: 'DUPLICATE_ANGLE_REJECTED',
              entityType: 'content_idea',
              entityId: item.id,
              actor: 'ai',
              details: { angle: ideaData.angle, title: ideaData.title },
            });
            continue;
          }

          // Check if exact title already exists in content_ideas
          const existingTitle = await this.db
            .prepare('SELECT id FROM content_ideas WHERE title = ?')
            .bind(ideaData.title)
            .first();

          if (existingTitle) {
            rejectedDuplicateAngle++;
            continue;
          }

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
            // Fallback for older database schema
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

          // Increment active_angles_count on source material
          try {
            await this.db
              .prepare(
                "UPDATE research_items SET active_angles_count = COALESCE(active_angles_count, 0) + 1, last_angle_generated_at = ?, status = 'ANALYZED' WHERE id = ?",
              )
              .bind(nowIso, item.id)
              .run();
          } catch {
            // Fallback
          }

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
          aiInferenceFailed++;
          rejectedTooTechnical++;
          const aiErrMsg = aiErr instanceof Error ? aiErr.message : 'AI completion failed';

          await this.quotaManager.recordUsage(this.db, {
            provider: this.aiProvider.name,
            model: 'unknown',
            role: 'researcher',
            success: false,
            durationMs: Date.now() - aiStartTime,
            errorMessage: aiErrMsg,
          });
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
          rawItemsDiscovered,
          ideasQueued,
          rawItemsDiscovered,
          rawItemsDiscovered,
          rejectedDuplicateAngle,
          rejectedIrrelevant,
          rejectedTooTechnical,
          JSON.stringify(pillarBreakdown),
          runErrorMessage || null,
          new Date().toISOString(),
          runId,
        )
        .run();
    } catch {
      // Fallback
    }

    // Fetch Telemetry Summary (Cloudflare Verified & Local Safety Budget)
    const telemetry = await this.quotaManager.getFullUsageSummary(this.db, this.env);
    const localEstTokens = telemetry.applicationMetrics.todayEstimatedTokens;
    const cfVerifiedNeurons = telemetry.cloudflareVerifiedUsage.actualNeurons;
    const usageSource = telemetry.cloudflareVerifiedUsage.source;
    const usageTimestamp = telemetry.cloudflareVerifiedUsage.lastUpdated || new Date().toISOString();

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
        rawItemsDiscovered,
        newSourcesCount,
        knownSourcesCount,
        sourceReuseCandidates,
        potentialAnglesDiscovered,
        noUsefulAngleCount,
        rejectedTooTechnical,
        rejectedIrrelevant,
        rejectedDuplicateAngle,
        rejectedRecentCooldown,
        ideasQueued,
        ideasDeferred,
        pillarBreakdown,
        aiProviderName: this.aiProvider.name,
        aiModelName: '@cf/meta/llama-3.1-8b-instruct-fp8',
        aiInferenceRequests,
        aiInferenceSuccessful,
        aiInferenceFailed,
        fallbackExecutions,
        localEstimatedTokens: localEstTokens,
        cloudflareVerifiedUsage: cfVerifiedNeurons,
        usageSource,
        usageTimestamp,
      },
    });

    console.log(
      `[AI DISCOVERY METRICS]\n` +
        `AI provider: ${this.aiProvider.name}\n` +
        `Model: @cf/meta/llama-3.1-8b-instruct-fp8\n` +
        `Inference requests: ${aiInferenceRequests}\n` +
        `Successful responses: ${aiInferenceSuccessful}\n` +
        `Failed responses: ${aiInferenceFailed}\n` +
        `NO_USEFUL_ANGLE: ${noUsefulAngleCount}\n` +
        `Useful angles: ${ideasQueued}\n` +
        `Fallback executions: ${fallbackExecutions}\n` +
        `Local Estimated Tokens: ${localEstTokens}\n` +
        `Cloudflare Verified Neurons: ${cfVerifiedNeurons ?? 'Not Available'}\n` +
        `Usage Source: ${usageSource}`,
    );

    return {
      runId,
      triggerType,
      status: finalStatus,
      sourcesChecked,
      rawItemsDiscovered,
      newSourcesCount,
      knownSourcesCount,
      sourceReuseCandidates,
      potentialAnglesDiscovered,
      noUsefulAngleCount,
      rejectedTooTechnical,
      rejectedIrrelevant,
      rejectedDuplicateAngle,
      rejectedRecentCooldown,
      ideasQueued,
      ideasDeferred,
      aiProviderName: this.aiProvider.name,
      aiModelName: '@cf/meta/llama-3.1-8b-instruct-fp8',
      aiInferenceRequests,
      aiInferenceSuccessful,
      aiInferenceFailed,
      fallbackExecutions,
      topicsCreated: ideasQueued,
      duplicatesFound: rejectedDuplicateAngle,
      itemsDiscovered: rawItemsDiscovered,
      itemsNormalized: rawItemsDiscovered,
      rejectedLowQuality: rejectedTooTechnical,
      pillarBreakdown,
      errorMessage: runErrorMessage,
      durationMs,
      localEstimatedTokens: localEstTokens,
      cloudflareVerifiedUsage: cfVerifiedNeurons,
      usageSource,
      usageTimestamp,
    };
  }
}
