/**
 * NorthSoft.AI.ContentCreator — Autonomous Research Engine Service
 *
 * Orchestrates source ingestion, inspiration tracking, substantive content angle deduplication,
 * topic cooldowns, and intelligent scheduling into the Content Ideas Queue.
 */

import { D1AuditLogger, type IAuditLogger } from '../../core/audit';
import { formatResearchPromptPayload } from '../../core/security/prompt-injection';
import { AI_BACKGROUND_WINDOW_LABEL, isAiExecutionPermitted } from '../../core/ai-window-policy';
import type { IAIProvider } from '../../ai/provider';
import { QuotaManager } from '../ai/quota-manager';
import {
  RssSourceAdapter,
  type RawResearchItem,
  type ResearchSourceRecord,
} from './source-adapter';
import { validateBatchCandidateIdeasOutput } from './validator';
import {
  evaluateRelevance,
  isExcludedTopic,
  selectDiverseCandidates,
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
  fetched_at?: string;
  status?: string;
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
  /** AI replied but the payload failed schema validation (counted separately from quality rejections). */
  aiInvalidResponses?: number;
  /** Seeds read from the pool / skipped because their cluster is in cooldown. */
  seedsConsidered?: number;
  seedsSkippedCooldown?: number;
  /** Candidates that actually reached an AI request. */
  candidatesEvaluated?: number;
  /** Distinct reasons topics were deferred (retained for later) rather than discarded. */
  deferralReasons?: string[];
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

    // 0. AI Background Window Check: Automated cron research is restricted to the nightly AI window (22:00–23:45 UTC)
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
          `Outside AI background execution window (${AI_BACKGROUND_WINDOW_LABEL}). Research run deferred.`,
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
    let aiInvalidResponses = 0;
    let seedsConsidered = 0;
    const seedsSkippedCooldown = 0;
    let candidatesEvaluated = 0;
    const deferralReasons: string[] = [];
    let actualAiModel = '@cf/meta/llama-3.1-8b-instruct-fp8';

    if (this.aiProvider.name === 'mock') {
      fallbackExecutions++;
    }

    let rejectedIrrelevant = 0;
    const rejectedTooTechnical = 0;
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
              try {
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
              } catch {
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
      // Sources serve as inspiration springboards; unanalyzed (NEW) items are prioritized
      let candidateItems: RawItemRecord[] = [];
      try {
        const candidateRes = await this.db
          .prepare(
            `SELECT id, source_id, title, url, url_hash, content_summary, published_at, fetched_at, status, active_angles_count
             FROM research_items
             WHERE status != 'REJECTED' 
               AND (active_angles_count IS NULL OR active_angles_count < 3)
             ORDER BY (status = 'NEW') DESC, fetched_at DESC
             LIMIT 60`,
          )
          .all<RawItemRecord>();
        candidateItems = candidateRes.results || [];
      } catch {
        try {
          const candidateRes = await this.db
            .prepare(
              `SELECT id, source_id, title, url, url_hash, content_summary, published_at, fetched_at, status
               FROM research_items
               WHERE status != 'REJECTED'
               ORDER BY (status = 'NEW') DESC, fetched_at DESC LIMIT 60`,
            )
            .all<RawItemRecord>();
          candidateItems = candidateRes.results || [];
        } catch {
          candidateItems = [];
        }
      }

      const topicRegistry = new TopicRegistry(this.db);
      const history = await topicRegistry.getRecentTopicHistory(21);

      // Editorial Seeds Layer:
      // If fresh items from RSS are few, inject evergreen editorial seeds
      // representing fundamental small-business client problems for NorthSoft.
      // Cooldown does NOT prevent seeds from inspiring new creative angles.
      try {
        const seedSlotsNeeded = Math.max(0, 10 - candidateItems.length);
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
            seedsConsidered++;
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
        // Hard exclusion check (scams, adult, gambling, war, clickbait)
        const exclusion = isExcludedTopic(item.title, item.content_summary);
        if (exclusion.excluded) {
          rejectedIrrelevant++;
          continue;
        }

        // Determine pillar and baseline score for multi-pillar sampling
        const relEval = evaluateRelevance(item.title, item.content_summary);
        selectableCandidates.push({
          item,
          pillar: relEval.pillar,
          score: relEval.score,
        });
      }

      // Step 3: Multi-Pillar Diversity Selection (sample up to 15 diverse candidate inspirations)
      const selectedCandidates = selectDiverseCandidates(
        selectableCandidates,
        15,
        3,
      );

      // Step 4: AI Creative Angle Generation over diverse inspirations
      if (selectedCandidates.length > 0) {
        // Enforce AI Quota Capacity Check
        const capacity = await this.quotaManager.checkCapacity(
          this.db,
          this.aiProvider.name,
          'default',
        );

        if (!capacity.allowed) {
          ideasDeferred += selectedCandidates.length;
          deferralReasons.push(`AI quota: ${capacity.reason || 'capacity unavailable'}`);
          await this.auditLogger.log({
            eventType: 'AI_QUOTA_EXCEEDED',
            entityType: 'research_item',
            entityId: selectedCandidates[0]?.item.id || 'batch',
            actor: 'system',
            level: 'WARNING',
            status: 'DEFERRED',
            operation: 'Batch Content Discovery',
            correlationId: runId,
            details: { reason: capacity.reason },
          });
        } else {
          const aiStartTime = Date.now();
          aiInferenceRequests++;
          candidatesEvaluated = selectedCandidates.length;

          // Rotate seeds on attempt so one unproductive seed cannot starve the rest
          for (const candidate of selectedCandidates) {
            if (candidate.item.id.startsWith('seed-')) {
              try {
                await this.db
                  .prepare('UPDATE editorial_seeds SET last_used_at = ? WHERE id = ?')
                  .bind(nowIso, candidate.item.id.replace('seed-', ''))
                  .run();
              } catch {
                // Ignore if seeds table is unavailable
              }
            }
          }

          // Build context of recently used topics and clusters to guide diversity
          const recentHistoryTopics = history
            .slice(-15)
            .map((h) => `- [${h.cluster_key || 'general'}] ${h.title}`)
            .join('\n');

          // Build formatted inspirations payload (up to 12 items for optimal prompt length)
          const inspirationsList = selectedCandidates
            .slice(0, 12)
            .map((c, idx) => {
              const it = c.item;
              return `[Inspiration #${idx + 1}]\nTitle: ${it.title}\nSource: ${it.url}\nSummary: ${it.content_summary.slice(0, 400)}`;
            })
            .join('\n\n');

          const systemInstructions = `You are a Senior Creative Content Scout for NorthSoft AI.
NorthSoft delivers high-performing websites, modern landing pages, local SEO, online marketing, automation, and AI solutions for small and local business owners (e.g., trade contractors, healthcare clinics, boutique law firms, accounting practices, local retailers, specialty service providers).

CORE PRINCIPLE:
Sources are INSPIRATION and SPRINGBOARDS, NOT rigid thematic filters or texts to summarize.
Your job is NOT to repeat technical release notes or summarize news articles.
Instead, observe the trends, technology shifts, or real-world consumer patterns described in the inspirations, and translate them into fresh, compelling, actionable business angles and social media post topics for small business owners.
You can draw inspiration from one source, or synthesize ideas connecting multiple sources.

CRITICAL LANGUAGE REQUIREMENT:
- ALL OUTPUT MUST BE WRITTEN STRICTLY AND 100% IN ENGLISH. All topic titles, hooks, angles, summaries, key points, and questions MUST be in clean, human, conversational English.

APPROVED NORTHSOFT TOPIC CLUSTERS:
1. ai_search_visibility (AI search like ChatGPT/Perplexity finding local services)
2. aeo_answer_engines (Answer Engine Optimization and structured answers)
3. local_seo_maps (Google Business Profile and local map rankings)
4. website_speed_conversion (Load speed impacting mobile bounce rates)
5. mobile_first_experience (Smartphone UX and tap navigation)
6. landing_page_clarity (Clear value proposition and removing clutter)
7. lead_response_time (Speed to lead and avoiding lost inquiries)
8. contact_form_friction (Simplifying contact pages to double quote submissions)
9. pricing_service_transparency (Publishing starting rates to build buyer trust)
10. chatbot_first_touch (24/7 AI chat answering routine questions after hours)
11. internal_workflow_automation (Automating repetitive spreadsheet busywork)
12. ai_content_overload (Standing out with authentic proof against generic AI noise)
13. reviews_social_proof (Systematic Google reviews and client proof)
14. brand_credibility_trust (Modern website credibility and looking established)
15. customer_communication_channels (Meeting customer preferences: messaging vs phone tag)
16. time_management_entrepreneur (Owner bottleneck and delegating repetitive tech)
17. tech_stack_simplification (Reducing software tool sprawl and subscriptions)
18. local_competition_positioning (Competing directly without paying middleman commissions)
19. seasonal_demand_shifts (Preparing digital channels for seasonal traffic shifts)
20. local_service_booking (Frictionless online booking for appointment-based services)

EDITORIAL BRAND SAFETY & FORBIDDEN TOPICS:
1. ABSOLUTELY NO CORPORATE JARGON. Forbidden: "unlock potential", "digital transformation", "game changer", "holistic approach", "scaling your business", "new era of entrepreneurship", "revolutionizing the way", "leverage synergy", "maximize conversion".
2. STRICTLY FORBIDDEN TOPICS:
   - Religion and religious celebrations (churches, scriptures, holidays, rituals).
   - Sexuality, erotica, and adult entertainment.
   - Occultism, astrology, tarot, witchcraft, or supernatural folklore.
   - Gambling, sports betting, casinos, and lotteries.
   - Recreational intoxicants, entertainment violence, or vulgarity.
   NEUTRAL COMMERCIAL SEASONS ARE PERMITTED (e.g. Q4 retail prep, holiday website capacity, January planning), framed strictly around digital operations and customer experience.
3. FACT PRESERVATION: Never invent fake numbers, percentages, or false statistics.

DISCOVERY INSTRUCTIONS:
Propose between 3 and 5 distinct, high-quality, practical post ideas.
Make sure the ideas cover DIFFERENT topic clusters and diverse pillars (WEBSITE, MARKETING, SALES, AI, SMALL_BUSINESS, CUSTOMER_EXPERIENCE, LOCAL_BUSINESS).
Avoid duplicating angles from the recent history.

Return ONLY a valid JSON object matching this schema:
{
  "ideas": [
    {
      "title": "A compelling, conversational social post topic for business owners",
      "angle": "How the customer opportunity connects to a practical digital solution",
      "hook": "A concise question or observation that opens the post",
      "summary": "Short summary of the advice to share in social copy",
      "keyPoints": ["One concrete implication for an owner", "One practical next step"],
      "contentPillar": "WEBSITE | MARKETING | SALES | AI | SMALL_BUSINESS | CUSTOMER_EXPERIENCE | LOCAL_BUSINESS",
      "postType": "LIST | CHECKLIST | QUESTION | STAT_INSIGHT | MYTH | TIPS | COMPARISON | PROBLEM_SOLUTION | ENGAGEMENT",
      "engagementQuestion": "Simple question at the end encouraging readers to comment",
      "commercialRelevance": 85,
      "engagementPotential": 90,
      "relevanceScore": 85,
      "sourceUrl": "Source URL from the inspirations used",
      "sourceName": "Source name or title",
      "marketPhenomenon": "What observable trend or change is happening in the market or technology",
      "customerOpportunity": "The concrete pain point, risk, or opportunity for a small business owner",
      "clusterKey": "One exact cluster key from the approved taxonomy list above"
    }
  ]
}`;

          const userPayload = `RECENT TOPIC HISTORY (Do not duplicate these angles):\n${recentHistoryTopics || 'None yet'}\n\nDIVERSE INSPIRATIONS AVAILABLE THIS RUN:\n${inspirationsList}`;

          const { systemPrompt, userPrompt } = formatResearchPromptPayload(
            systemInstructions,
            userPayload,
          );

          try {
            const completion = await this.aiProvider.complete({
              role: 'researcher',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              temperature: 0.4,
              maxTokens: 2500,
              responseFormat: 'json',
            });
            aiInferenceSuccessful++;
            actualAiModel = completion.model || actualAiModel;

            await this.quotaManager.recordUsage(this.db, {
              provider: completion.provider,
              model: completion.model,
              role: 'researcher',
              inputTokens: completion.usage.promptTokens,
              outputTokens: completion.usage.completionTokens,
              success: true,
              durationMs: completion.durationMs,
            });

            // Fetch existing titles to check duplicates against existing content_ideas
            const existingIdeasRes = await this.db
              .prepare('SELECT title FROM content_ideas ORDER BY created_at DESC LIMIT 100')
              .all<{ title: string }>();
            const existingIdeaTitles = (existingIdeasRes.results || []).map((row) => row.title);

            const batchVal = validateBatchCandidateIdeasOutput(completion.content, {
              url: selectedCandidates[0]?.item.url,
              title: selectedCandidates[0]?.item.title,
            });

            await this.auditLogger.log({
              eventType: 'AI_RESEARCH_COMPLETED',
              entityType: 'research_run',
              entityId: runId,
              actor: 'ai',
              level: 'INFO',
              operation: 'Batch Inference Output',
              correlationId: runId,
              details: {
                contentSnippet: completion.content.slice(0, 1500),
                contentLength: completion.content.length,
                batchValid: batchVal.valid,
                batchErrors: batchVal.errors,
                batchCount: batchVal.data?.length ?? 0,
              },
            });

            if (!batchVal.valid || !batchVal.data) {
              aiInvalidResponses++;
            } else if (batchVal.data.length === 0) {
              noUsefulAngleCount++;
            } else {
              const proposedIdeas = batchVal.data;
              potentialAnglesDiscovered = proposedIdeas.length;

              for (const ideaData of proposedIdeas) {
                if (ideaData.usefulAngle === false) {
                  noUsefulAngleCount++;
                  continue;
                }

                // A cluster in cooldown does NOT make the topic worthless: it is retained as 'deferred'
                const clusterCooldown = TopicRegistry.isClusterInCooldown(ideaData.clusterKey, history);

                // Duplicate Detection Check against history and active angles
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
                    entityId: runId,
                    actor: 'ai',
                    details: { angle: ideaData.angle, title: ideaData.title },
                  });
                  continue;
                }

                // Check duplicate title against existing ideas
                if (TopicRegistry.isDuplicateAngle(ideaData.title, existingIdeaTitles)) {
                  rejectedDuplicateAngle++;
                  await this.auditLogger.log({
                    eventType: 'DUPLICATE_TITLE_REJECTED',
                    entityType: 'content_idea',
                    entityId: runId,
                    actor: 'ai',
                    details: { title: ideaData.title },
                  });
                  continue;
                }

                // Track title so sibling ideas in this same batch don't duplicate each other
                existingIdeaTitles.push(ideaData.title);

                const ideaId = crypto.randomUUID();
                const isDeferredByCooldown = clusterCooldown.inCooldown;
                const deferredUntilIso = isDeferredByCooldown
                  ? TopicRegistry.getClusterCooldownEnd(ideaData.clusterKey, history).toISOString()
                  : undefined;
                const pillar = ideaData.contentPillar;
                pillarBreakdown[pillar] = (pillarBreakdown[pillar] || 0) + 1;

                const initialStatus = isDeferredByCooldown ? 'deferred' : 'queued';
                const publishDate = isDeferredByCooldown
                  ? deferredUntilIso
                  : scheduling.suggestedDate;

                // Insert into content_ideas
                try {
                  await this.db
                    .prepare(
                      `INSERT INTO content_ideas (
                        id, title, description, short_description, content_angle, hook, category, content_pillar,
                        source_type, source_url, source_title, source_published_at, relevance_score,
                        engagement_potential, commercial_relevance, suggested_publish_date, priority, status,
                        cluster_key, market_phenomenon, customer_opportunity, created_at, updated_at
                      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'research', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
                      ideaData.sourceUrl || selectedCandidates[0]?.item.url || 'https://ai.northsoft.is',
                      ideaData.sourceName || selectedCandidates[0]?.item.title || 'NorthSoft Research',
                      ideaData.publishedAt || nowIso,
                      ideaData.relevanceScore,
                      ideaData.engagementPotential,
                      ideaData.commercialRelevance,
                      publishDate,
                      ideaData.commercialRelevance,
                      initialStatus,
                      ideaData.clusterKey,
                      ideaData.marketPhenomenon,
                      ideaData.customerOpportunity,
                      nowIso,
                      nowIso,
                    )
                    .run();
                } catch {
                  // Fallback for older schema
                  try {
                    await this.db
                      .prepare(
                        `INSERT INTO content_ideas (
                          id, title, description, short_description, content_angle, hook, category, content_pillar,
                          source_type, source_url, source_title, source_published_at, relevance_score,
                          engagement_potential, commercial_relevance, suggested_publish_date, priority, status, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'research', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
                        ideaData.sourceUrl || selectedCandidates[0]?.item.url || 'https://ai.northsoft.is',
                        ideaData.sourceName || selectedCandidates[0]?.item.title || 'NorthSoft Research',
                        ideaData.publishedAt || nowIso,
                        ideaData.relevanceScore,
                        ideaData.engagementPotential,
                        ideaData.commercialRelevance,
                        publishDate,
                        ideaData.commercialRelevance,
                        initialStatus,
                        nowIso,
                        nowIso,
                      )
                      .run();
                  } catch {
                    await this.db
                      .prepare(
                        `INSERT INTO content_ideas (id, title, description, category, source_type, priority, status, created_at, updated_at)
                         VALUES (?, ?, ?, ?, 'research', ?, ?, ?, ?)`,
                      )
                      .bind(
                        ideaId,
                        ideaData.title,
                        ideaData.summary,
                        pillar,
                        ideaData.relevanceScore,
                        initialStatus,
                        nowIso,
                        nowIso,
                      )
                      .run();
                  }
                }

                if (isDeferredByCooldown) {
                  rejectedRecentCooldown++;
                  ideasDeferred++;
                  deferralReasons.push(clusterCooldown.reason || 'cluster cooldown');
                } else {
                  ideasQueued++;
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

                  // Add to in-memory history so subsequent ideas respect cluster cooldown
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
                }

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
                    clusterKey: ideaData.clusterKey,
                    angle: ideaData.angle,
                    status: initialStatus,
                    suggestedDate: publishDate,
                    relevanceScore: ideaData.relevanceScore,
                    engagementPotential: ideaData.engagementPotential,
                  },
                });
              }
            }

            // Mark analyzed items in research_items
            for (const candidate of selectedCandidates) {
              const item = candidate.item;
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
                  // Ignore
                }
              } else {
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
              }
            }
          } catch (aiErr: unknown) {
            aiInferenceFailed++;
            const aiErrMsg = aiErr instanceof Error ? aiErr.message : 'AI completion failed';

            await this.quotaManager.recordUsage(this.db, {
              provider: this.aiProvider.name,
              model: actualAiModel,
              role: 'researcher',
              success: false,
              durationMs: Date.now() - aiStartTime,
              errorMessage: aiErrMsg,
            });
          }
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
        aiModelName: actualAiModel,
        aiInferenceRequests,
        aiInferenceSuccessful,
        aiInferenceFailed,
        fallbackExecutions,
        aiInvalidResponses,
        seedsConsidered,
        seedsSkippedCooldown,
        candidatesEvaluated,
        deferralReasons: Array.from(new Set(deferralReasons)).slice(0, 5),
        localEstimatedTokens: localEstTokens,
        cloudflareVerifiedUsage: cfVerifiedNeurons,
        usageSource,
        usageTimestamp,
      },
    });

    console.log(
      `[AI DISCOVERY METRICS]\n` +
        `AI provider: ${this.aiProvider.name}\n` +
        `Model: ${actualAiModel}\n` +
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
      aiModelName: actualAiModel,
      aiInferenceRequests,
      aiInferenceSuccessful,
      aiInferenceFailed,
      fallbackExecutions,
      aiInvalidResponses,
      seedsConsidered,
      seedsSkippedCooldown,
      candidatesEvaluated,
      deferralReasons: Array.from(new Set(deferralReasons)).slice(0, 5),
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
