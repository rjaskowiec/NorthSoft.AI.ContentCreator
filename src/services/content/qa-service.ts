/**
 * NorthSoft.AI.ContentCreator — Independent QA / Fact Checker Service
 *
 * Performs independent, adversarial AI quality review of generated post drafts against
 * original research evidence. A single inference never approves its own output.
 */

import type { IAIProvider } from '../../ai/provider';
import { formatResearchPromptPayload } from '../../core/security/prompt-injection';
import { QuotaManager } from '../ai/quota-manager';
import type { PostDraft, ResearchSourceItem } from './writer-service';

export interface QAReviewResult {
  verdict: 'PASS' | 'FAIL';
  score: number; // 0 to 100
  factualIssues: string[];
  unsupportedClaims: string[];
  policyConcerns: string[];
  styleIssues: string[];
  requiredChanges: string[];
  reasoning: string;
}

export class QualityReviewerService {
  private quotaManager: QuotaManager;

  constructor(
    private db: D1Database,
    private aiProvider: IAIProvider,
  ) {
    this.quotaManager = new QuotaManager();
  }

  /**
   * Evaluates a generated post draft against original source evidence.
   */
  async reviewDraft(
    draft: PostDraft,
    sources: ResearchSourceItem[],
  ): Promise<{ review?: QAReviewResult; deferred?: boolean; error?: string }> {
    // 1. Check AI Neuron quota before executing QA call (estimated 1500 tokens/neurons)
    const capacity = await this.quotaManager.checkCapacity(
      this.db,
      this.aiProvider.name,
      'default',
      { estimatedNeuronCost: 1500 },
    );

    if (!capacity.allowed) {
      return {
        deferred: true,
        error: capacity.reason || 'Deferred due to AI neuron quota limit.',
      };
    }

    const systemPrompt = `You are an Independent Senior Technical Fact Checker and QA Reviewer for NorthSoft AI.
Your sole role is to CRITICALLY and ADVERSARIALLY evaluate a generated post draft against the provided ground-truth research sources.

Review Directives:
1. Ground Truth & Factuality: Check every assertion, number, statistic, date, and technical claim in the draft against the source text.
2. Hallucinations & Unsupported Claims: Flag any claim that is NOT explicitly supported by the source text as an unsupported claim.
3. Overclaiming & Clickbait: Flag exaggerated promises, hyperbole, clickbait phrasing, or misleading assertions.
4. Tone & Style: Verify that the tone is professional, technical, clear, and unhyped.
5. Verdict: Assign "FAIL" if there are any factual inaccuracies, hallucinated statistics, or unsupported major claims. Otherwise assign "PASS".

Return ONLY a valid JSON object matching this schema:
{
  "verdict": "PASS" | "FAIL",
  "score": integer 0-100 quality rating,
  "factualIssues": ["Issue 1"],
  "unsupportedClaims": ["Claim 1"],
  "policyConcerns": ["Concern 1"],
  "styleIssues": ["Style issue 1"],
  "requiredChanges": ["Change 1"],
  "reasoning": "Concise summary explaining the evaluation score and verdict"
}`;

    const reviewPayload =
      `POST DRAFT TO REVIEW:\nTitle: ${draft.title}\nBody: ${draft.body}\n` +
      `Extracted Claims:\n` +
      draft.claims.map((c) => `- ${c.text} [Sources: ${c.sourceIds.join(', ')}]`).join('\n') +
      `\n\nGROUND TRUTH RESEARCH SOURCES:\n` +
      sources
        .map((s) => `[ID: ${s.id}] Title: ${s.title}\nURL: ${s.url}\nSummary: ${s.summary}`)
        .join('\n---\n');

    const { systemPrompt: boundedSystem, userPrompt } = formatResearchPromptPayload(
      systemPrompt,
      reviewPayload,
    );

    try {
      const completion = await this.aiProvider.complete({
        role: 'qa',
        messages: [
          { role: 'system', content: boundedSystem },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        responseFormat: 'json',
      });

      // Record AI usage via QuotaManager
      await this.quotaManager.recordUsage(this.db, {
        provider: completion.provider,
        model: completion.model,
        role: 'qa',
        inputTokens: completion.usage.promptTokens,
        outputTokens: completion.usage.completionTokens,
        success: true,
        durationMs: completion.durationMs,
      });

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(completion.content) as Record<string, unknown>;
      } catch {
        return { error: 'QA Reviewer produced malformed JSON completion.' };
      }

      const rawVerdict = typeof parsed.verdict === 'string' ? parsed.verdict.toUpperCase() : 'FAIL';
      const verdict: 'PASS' | 'FAIL' = rawVerdict === 'PASS' ? 'PASS' : 'FAIL';
      const score =
        typeof parsed.score === 'number' ? Math.max(0, Math.min(100, parsed.score)) : 50;

      const review: QAReviewResult = {
        verdict,
        score,
        factualIssues: Array.isArray(parsed.factualIssues)
          ? (parsed.factualIssues as string[])
          : [],
        unsupportedClaims: Array.isArray(parsed.unsupportedClaims)
          ? (parsed.unsupportedClaims as string[])
          : [],
        policyConcerns: Array.isArray(parsed.policyConcerns)
          ? (parsed.policyConcerns as string[])
          : [],
        styleIssues: Array.isArray(parsed.styleIssues) ? (parsed.styleIssues as string[]) : [],
        requiredChanges: Array.isArray(parsed.requiredChanges)
          ? (parsed.requiredChanges as string[])
          : [],
        reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'QA Review completed.',
      };

      return { review };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { error: msg };
    }
  }
}
