/**
 * NorthSoft.AI.ContentCreator — Autonomous Research Engine Service
 *
 * Orchestrates source ingestion, inspiration tracking, substantive content angle deduplication,
 * topic cooldowns, and intelligent scheduling into the Content Ideas Queue.
 */

import { D1AuditLogger, type IAuditLogger } from '../../core/audit';
import { formatResearchPromptPayload } from '../../core/security/prompt-injection';
import { isAiExecutionPermitted } from '../../core/ai-window-policy';
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

    // 0. AI Background Window Check: Automated cron research is restricted to 18:00–23:30 UTC
    if (!isAiExecutionPermitted(triggerType)) {
      return {
        runId,
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
        errorMessage:
          'Outside AI background execution window (18:00–23:30 UTC). Research run deferred.',
        durationMs: Date.now() - startTime,
        localEstimatedTokens: 0,
        cloudflareVerifiedUsage: null,
        usageSource: 'none',
        usageTimestamp: nowIso,
      };
    }

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
    let rejectedRecentCooldown = 0;
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
      // Strictly enforce source freshness: only process items fetched/published since the last completed run.
      // Prevents re-analyzing the same old 50 records when RSS feeds have no new updates.
      let watermarkIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      try {
        const lastCompletedRun = await this.db
          .prepare(
            "SELECT started_at, completed_at FROM research_runs WHERE status = 'completed' AND id != ? ORDER BY started_at DESC LIMIT 1",
          )
          .bind(runId)
          .first<{ started_at?: string; completed_at?: string }>();

        if (lastCompletedRun?.started_at) {
          watermarkIso = lastCompletedRun.started_at;
        }
      } catch {
        // Fallback to 7 days
      }

      let candidateItems: RawItemRecord[] = [];
      try {
        const candidateRes = await this.db
          .prepare(
            `SELECT id, source_id, title, url, url_hash, content_summary, published_at, active_angles_count
             FROM research_items
             WHERE status != 'REJECTED' 
               AND (active_angles_count IS NULL OR active_angles_count < 3)
               AND (
                 (published_at IS NOT NULL AND published_at >= ?) OR 
                 (fetched_at >= ?)
               )
             ORDER BY fetched_at DESC
             LIMIT 50`,
          )
          .bind(watermarkIso, watermarkIso)
          .all<RawItemRecord>();
        candidateItems = candidateRes.results || [];
      } catch {
        try {
          const candidateRes = await this.db
            .prepare(
              `SELECT id, source_id, title, url, url_hash, content_summary, published_at
               FROM research_items
               WHERE (fetched_at >= ? OR published_at >= ?)
               ORDER BY fetched_at DESC LIMIT 50`,
            )
            .bind(watermarkIso, watermarkIso)
            .all<RawItemRecord>();
          candidateItems = candidateRes.results || [];
        } catch {
          candidateItems = [];
        }
      }

      // Editorial Seeds Layer:
      // If fresh RSS items are scarce (or zero), inject evergreen editorial seeds
      // representing fundamental small-business client problems for NorthSoft.
      try {
        const seedSlotsNeeded = Math.max(0, 5 - candidateItems.length);
        if (seedSlotsNeeded > 0) {
          const seedsRes = await this.db
            .prepare(
              `SELECT id, pillar, cluster_key, title, business_problem, client_opportunity, suggested_angle
               FROM editorial_seeds
               WHERE enabled = 1
               ORDER BY times_used ASC, last_used_at ASC NULLS FIRST
               LIMIT ?`,
            )
            .bind(seedSlotsNeeded)
            .all<{
              id: string;
              pillar: string;
              cluster_key: string;
              title: string;
              business_problem: string;
              client_opportunity: string;
              suggested_angle: string;
            }>();

          const seeds = seedsRes.results || [];
          for (const seed of seeds) {
            candidateItems.push({
              id: `seed-${seed.id}`,
              source_id: 'editorial_seeds',
              title: seed.title,
              url: `https://northsoft.is/insights/${seed.cluster_key}`,
              url_hash: `seed-${seed.id}`,
              content_summary: `${seed.business_problem} Client opportunity: ${seed.client_opportunity}. Practical angle: ${seed.suggested_angle}`,
              published_at: nowIso,
              active_angles_count: 0,
            });
          }
        }
      } catch {
        // Fallback if editorial_seeds table does not exist yet
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
      const history = await topicRegistry.getRecentTopicHistory(21);
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
Your objective is to read a source item and discover a genuine business opportunity for small-business owners, then derive a focused social-media post topic (Facebook/Instagram).

CRITICAL LANGUAGE REQUIREMENT:
- ALL OUTPUT MUST BE WRITTEN STRICTLY AND 100% IN ENGLISH. All topic titles, hooks, angles, summaries, key points, and questions MUST be in clean, human, conversational English.

CORE REASONING DISCOVERY PROCESS (Insight → Opportunity → Cluster → Topic):
1. MARKET PHENOMENON: Identify the observable market trend, consumer shift, platform change, or tech development from the source.
2. CUSTOMER PAIN / OPPORTUNITY: Translate that phenomenon into a direct, concrete business problem or opportunity for a small business owner (e.g. lost website inquiries, slow response times, customer confusion, manual admin overload).
3. CONTROLLED TOPIC CLUSTER: Select the single best matching cluster from the approved NorthSoft cluster taxonomy:
   - ai_search_visibility (AI search like ChatGPT/Perplexity finding local services)
   - aeo_answer_engines (Answer Engine Optimization and structured answers)
   - local_seo_maps (Google Business Profile and local map rankings)
   - website_speed_conversion (Load speed impacting mobile bounce rates)
   - mobile_first_experience (Smartphone UX and tap navigation)
   - landing_page_clarity (Clear value proposition and removing clutter)
   - lead_response_time (Speed to lead and avoiding lost inquiries)
   - contact_form_friction (Simplifying contact pages to double quote submissions)
   - pricing_service_transparency (Publishing starting rates to build buyer trust)
   - chatbot_first_touch (24/7 AI chat answering routine questions after hours)
   - internal_workflow_automation (Automating repetitive spreadsheet busywork)
   - ai_content_overload (Standing out with authentic proof against generic AI noise)
   - reviews_social_proof (Systematic Google reviews and client proof)
   - brand_credibility_trust (Modern website credibility and looking established)
   - customer_communication_channels (Meeting customer preferences: messaging vs phone tag)
   - time_management_entrepreneur (Owner bottleneck and delegating repetitive tech)
   - tech_stack_simplification (Reducing software tool sprawl and subscriptions)
   - local_competition_positioning (Competing directly without paying middleman commissions)
   - seasonal_demand_shifts (Preparing digital channels for seasonal traffic shifts)
   - local_service_booking (Frictionless online booking for appointment-based services)
4. BUSINESS ANGLE: How a NorthSoft service (website overhaul, local SEO, speed optimization, workflow automation, AI assistant) naturally solves this without sounding like a forced sales pitch.
5. FINAL TOPIC: A mid-level, focused social post topic (NOT just the article headline).

CRITICAL RULES:
1. ABSOLUTELY NO CORPORATE / MARKETING JARGON. Forbidden: "unlock potential", "digital transformation", "game changer", "holistic approach", "scaling your business", "new era of entrepreneurship", "revolutionizing the way", "leverage synergy", "maximize conversion".
2. SOURCE AS INSPIRATION: The article is a loose springboard, not something to summarize. Do NOT merely repeat tech release details.
3. FACT PRESERVATION: Never invent fake numbers, percentages, or false statistics.
4. If the source cannot yield any credible small-business angle, return {"usefulAngle": false, "reason": "NO_USEFUL_ANGLE"}.

Return ONLY a valid JSON object matching this schema:
{
  "usefulAngle": true,
  "marketPhenomenon": "What observable trend or change is happening in the market or technology",
  "customerOpportunity": "The concrete pain point, risk, or opportunity for a small business owner",
  "clusterKey": "One exact cluster key from the approved taxonomy list above",
  "title": "A focused, conversational social post topic for business owners",
  "angle": "How the customer opportunity connects to a practical digital solution",
  "hook": "A concise question or observation that opens the finished post",
  "summary": "A short summary of the advice to share in social copy",
  "keyPoints": ["One concrete implication for an owner", "One practical next step"],
  "contentPillar": "WEBSITE | MARKETING | SALES | AI | SMALL_BUSINESS | CUSTOMER_EXPERIENCE | LOCAL_BUSINESS",
  "postType": "LIST | CHECKLIST | QUESTION | STAT_INSIGHT | MYTH | TIPS | COMPARISON | PROBLEM_SOLUTION | ENGAGEMENT",
  "engagementQuestion": "Simple question at the end encouraging readers to comment",
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

          // Step 4.1: Topic Cluster Memory & Topic Fatigue Check (First line of diversity)
          const clusterCooldown = TopicRegistry.isClusterInCooldown(ideaData.clusterKey, history);

          if (clusterCooldown.inCooldown) {
            rejectedRecentCooldown++;
            await this.auditLogger.log({
              eventType: 'CLUSTER_COOLDOWN_REJECTED',
              entityType: 'content_idea',
              entityId: item.id,
              actor: 'ai',
              details: {
                clusterKey: ideaData.clusterKey,
                conflictingCluster: clusterCooldown.conflictingCluster,
                reason: clusterCooldown.reason,
              },
            });
            continue;
          }

          // Step 4.2: Duplicate Detection Check against history and active angles (Last line of defense)
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

          // Check if title is a duplicate or near-duplicate against existing content_ideas
          const existingIdeasRes = await this.db
            .prepare('SELECT title FROM content_ideas ORDER BY created_at DESC LIMIT 100')
            .all<{ title: string }>();
          const existingIdeaTitles = (existingIdeasRes.results || []).map((row) => row.title);

          if (TopicRegistry.isDuplicateAngle(ideaData.title, existingIdeaTitles)) {
            rejectedDuplicateAngle++;
            await this.auditLogger.log({
              eventType: 'DUPLICATE_TITLE_REJECTED',
              entityType: 'content_idea',
              entityId: item.id,
              actor: 'ai',
              details: { title: ideaData.title },
            });
            continue;
          }

          const ideaId = crypto.randomUUID();
          const pillar = ideaData.contentPillar;
          pillarBreakdown[pillar] = (pillarBreakdown[pillar] || 0) + 1;

          // Insert into content_ideas (queued) with cluster_key, market_phenomenon, and customer_opportunity
          try {
            await this.db
              .prepare(
                `INSERT INTO content_ideas (
                  id, title, description, short_description, content_angle, hook, category, content_pillar,
                  source_type, source_url, source_title, source_published_at, relevance_score,
                  engagement_potential, commercial_relevance, suggested_publish_date, priority, status,
                  cluster_key, market_phenomenon, customer_opportunity, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'research', ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?)`,
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
                ideaData.clusterKey,
                ideaData.marketPhenomenon,
                ideaData.customerOpportunity,
                nowIso,
                nowIso,
              )
              .run();
          } catch {
            // Fallback for older database schema
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
          }

          // Record in Topic History with cluster_key
          await topicRegistry.recordTopicHistory({
            idea_id: ideaId,
            content_pillar: pillar,
            content_angle: ideaData.angle,
            title: ideaData.title,
            cluster_key: ideaData.clusterKey,
            status: 'queued',
            suggested_publish_date: scheduling.suggestedDate,
          });

          // Add to in-memory history so subsequent candidates in this run respect cluster cooldown
          history.push({
            id: ideaId,
            idea_id: ideaId,
            content_pillar: pillar,
            content_angle: ideaData.angle,
            title: ideaData.title,
            cluster_key: ideaData.clusterKey,
            status: 'queued',
            suggested_publish_date: scheduling.suggestedDate,
            created_at: nowIso,
          });

          // If derived from an editorial seed, increment seed usage
          if (item.id.startsWith('seed-')) {
            const realSeedId = item.id.replace('seed-', '');
            try {
              await this.db
                .prepare(
                  'UPDATE editorial_seeds SET times_used = times_used + 1, last_used_at = ? WHERE id = ?',
                )
                .bind(nowIso, realSeedId)
                .run();
            } catch {
              // Ignore fallback
            }
          }

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

    // Fetch Telemetry Summary (Cloudflare Verified & Application Safety)
    const telemetry = await this.quotaManager.getFullUsageSummary(this.db, this.env);
    const localEstTokens =
      telemetry.internalDiagnostics?.estimatedTokensToday ?? telemetry.todayNeurons ?? 0;
    const cfVerifiedNeurons = telemetry.cloudflareVerifiedUsage?.actualNeurons ?? null;
    const usageSource = telemetry.cloudflareVerifiedUsage?.source ?? 'Cloudflare Analytics';
    const usageTimestamp =
      telemetry.cloudflareVerifiedUsage?.lastUpdated || new Date().toISOString();

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
