/**
 * NorthSoft.AI.ContentCreator — Social Media Quality Gate
 *
 * A diagnostic guardrail that evaluates generated social media copy across
 * eight communication dimensions. Designed to flag genuinely problematic content
 * without penalising posts simply for lacking an emoji, a CTA, or a NorthSoft mention.
 *
 * Design principles:
 * - Only truly important failures block content (fabricated stats, policy violations, empty content).
 * - Communication quality is preferred over formatting compliance.
 * - Each dimension is evaluated with soft heuristics; no single narrow regex defines quality.
 * - Total weight sums to 100.
 */

export interface SMQGWarning {
  dimension: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  reason: string;
}

export interface SMQGResult {
  /** Score from 0 to 100 */
  score: number;
  warnings: SMQGWarning[];
  /** Pass if score is acceptable and no critical warnings exist */
  pass: boolean;
}

/**
 * Evaluates a generated social media post against key communication dimensions.
 * Returns a score and list of diagnostic warnings.
 */
export class SocialMediaQualityGate {
  // Dimension weights — must sum to 100
  private readonly weights: Record<string, number> = {
    Attention: 15,
    Specificity: 12,
    Value: 12,
    Credibility: 20,
    HumanVoice: 12,
    Readability: 10,
    Authenticity: 10,
    BrandPlacement: 9,
  };

  evaluate(draft: { title: string; body: string }): SMQGResult {
    const warnings: SMQGWarning[] = [];
    const body = draft.body || '';

    const add = (dim: string, sev: SMQGWarning['severity'], reason: string) => {
      warnings.push({ dimension: dim, severity: sev, reason });
    };

    // -------------------------------------------------------------------
    // 1. ATTENTION — Does the opening try to engage the reader?
    //    A broad check: any of several hook signals present in first 150 chars.
    //    NOT required to be a question — a strong statement works too.
    // -------------------------------------------------------------------
    const opening = body.slice(0, 150);
    const hasHookSignal =
      /[?!]/.test(opening) ||                                              // question or exclamation
      /\b(when|if|imagine|picture|ever|most|many|one thing|the truth|turns out)\b/i.test(opening) || // recognition/setup words
      /\b(customer|client|visitor|owner|shop|business)\b/i.test(opening) || // audience reference
      opening.split(/\s+/).length >= 8;                                   // at least 8 words (not empty)
    if (!hasHookSignal) {
      add('Attention', 'medium', 'Opening does not appear to engage the reader — consider a concrete observation or recognizable scenario.');
    }

    // -------------------------------------------------------------------
    // 2. SPECIFICITY — Does the post contain concrete detail?
    //    Numbers, named tools/services, specific actions, or concrete nouns.
    // -------------------------------------------------------------------
    const hasSpecifics =
      /\d+/.test(body) ||                                                  // any number
      /\b(website|email|shop|store|booking|order|invoice|review|listing|google|facebook|instagram|mobile|phone|click|form|checkout)\b/i.test(body);
    if (!hasSpecifics) {
      add('Specificity', 'medium', 'Post lacks concrete detail — numbers, named actions, or specific tools would strengthen credibility.');
    }

    // -------------------------------------------------------------------
    // 3. VALUE — Does the post deliver something useful?
    //    A broad set of signals: any practical verb, a tip, a why, a how.
    //    NOT required to use exactly "check" or "review".
    // -------------------------------------------------------------------
    const hasValueSignal =
      /\b(check|review|update|try|test|add|remove|fix|change|improve|avoid|consider|make sure|ensure|set up|connect|use|enable|turn on|look at|ask|contact|reach out|find out|see if|learn)\b/i.test(body) ||
      /\b(tip|trick|key|important|worth|helpful|useful|practical|simple|easy|quick|free|step|way|option|approach|strategy|idea)\b/i.test(body) ||
      body.split(/[.!?]/).filter((s) => s.trim().length > 30).length >= 2; // at least 2 substantive sentences
    if (!hasValueSignal) {
      add('Value', 'medium', 'Post may not deliver a clear actionable takeaway or useful insight.');
    }

    // -------------------------------------------------------------------
    // 4. CREDIBILITY — Critical: fabricated stats or unsupported numbers
    //    Numbers are fine. The issue is ONLY when they look like invented research
    //    (percentage/multiplier claim pattern without any source indicator).
    // -------------------------------------------------------------------
    const bodyPercentages = body.match(/\d+%/g) || [];
    // Source indicator: unambiguous citation phrases that confirm the claim has a named source.
    // "research", "shows that", "data", "statistics" are NOT sufficient — they appear in unsourced claims themselves.
    const hasSourceIndicator = /\b(source|study|report|according to|survey|found that|published by|based on|cited by|per (?:the )?\w+)\b/i.test(body);
    const hasFabricatedStatPattern =
      bodyPercentages.length > 0 &&
      !hasSourceIndicator &&
      /\d+%\s+(of\s+(businesses?|customers?|users?|owners?|shops?|companies?|people|consumers?))/i.test(body);

    if (hasFabricatedStatPattern) {
      add('Credibility', 'critical', 'Post contains a percentage statistic with an unverified claim ("X% of businesses...") without citing a source — remove or attribute this claim.');
    }

    // Warn (not block) about unsourced research/expert claims with any quantified measure
    const hasResearchClaim = /\b(research shows|studies show|experts say|data shows|proven|it is proven)\b/i.test(body);
    const hasUnsourcedClaimPattern =
      hasResearchClaim &&
      !hasSourceIndicator;
    if (hasUnsourcedClaimPattern && !hasFabricatedStatPattern) {
      add('Credibility', 'high', 'Post references research or expert opinion without a source — attribute or rephrase as an observation.');
    }

    // -------------------------------------------------------------------
    // 5. HUMAN VOICE — Does it sound like a person, not a marketing system?
    //    Contractions, varied sentences, active personal references.
    // -------------------------------------------------------------------
    const hasContraction = /\b(it's|you're|they're|we're|don't|can't|won't|doesn't|isn't|I'm|that's|there's|what's|here's|who's|let's)\b/i.test(body);
    const sentences = body.split(/[.!?]/).filter((s) => s.trim().length > 0);
    const hasVariation = sentences.length >= 2 && sentences.some((s) => s.trim().split(/\s+/).length <= 8);
    if (!(hasContraction || hasVariation)) {
      add('HumanVoice', 'low', 'Post may sound too formal — contractions and varied sentence rhythm improve conversational feel.');
    }

    // -------------------------------------------------------------------
    // 6. READABILITY — Is the post a reasonable length and scannable?
    // -------------------------------------------------------------------
    const charCount = body.length;
    if (charCount < 80) {
      add('Readability', 'high', 'Post body is too short to deliver meaningful value (under 80 characters).');
    } else if (charCount > 1500) {
      add('Readability', 'medium', 'Post body may be too long for social media (over 1500 characters) — consider trimming.');
    }

    // -------------------------------------------------------------------
    // 7. AUTHENTICITY — Does it avoid severe promotional spam patterns?
    //    We only flag genuinely egregious promotional language.
    //    A soft mention of NorthSoft is absolutely fine.
    // -------------------------------------------------------------------
    const jargonCount = [
      /\bunlock (your|the) potential\b/i,
      /\bgame.?changer\b/i,
      /\bdigital transformation\b/i,
      /\bholistic approach\b/i,
      /\bscaling your business\b/i,
      /\brevolutionizing the way\b/i,
      /\bleverage synergy\b/i,
      /\bmaximize (your )?conversion\b/i,
      /\bcontact us today to unlock\b/i,
      /\bcutting-edge (solutions|technology|digital)\b/i,
      /\bin today's digital world\b/i,
      /\bstrong online presence is essential\b/i,
      /\b(digital|online) presence (is|are) (essential|critical|crucial|key|vital)\b/i,
      /\boptimized for success\b/i,
    ].filter((r) => r.test(body)).length;

    if (jargonCount >= 2) {
      add('Authenticity', 'high', 'Post contains multiple corporate jargon phrases that reduce authenticity — rephrase in plain language.');
    } else if (jargonCount === 1) {
      add('Authenticity', 'low', 'Post contains a corporate jargon phrase — consider rephrasing.');
    }

    // Hard fail for severe promotional spam (multiple jargon + explicit sales pressure)
    const hasSevereSpam =
      jargonCount >= 3 ||
      (/\b(act now|limited time|urgent|don't miss out|last chance|buy now)\b/i.test(body) && jargonCount >= 1);
    if (hasSevereSpam) {
      add('Authenticity', 'critical', 'Post reads as promotional spam — rewrite in a helpful, conversational tone without sales pressure.');
    }

    // -------------------------------------------------------------------
    // 8. BRAND PLACEMENT — NorthSoft should appear after value, not before
    //    Only flag if NorthSoft appears very early (before any value delivery).
    //    NOT required to appear at all.
    // -------------------------------------------------------------------
    const brandIdx = body.search(/NorthSoft/i);
    if (brandIdx !== -1 && brandIdx < 80 && charCount > 150) {
      add('BrandPlacement', 'low', 'NorthSoft appears very early — placing the brand after delivering value typically reads better.');
    }

    // -------------------------------------------------------------------
    // Compute weighted score: subtract each dimension's weight if it has a warning
    // -------------------------------------------------------------------
    let score = 100;
    for (const [dim, weight] of Object.entries(this.weights)) {
      if (warnings.some((w) => w.dimension === dim)) {
        score -= weight;
      }
    }
    score = Math.max(0, Math.min(100, score));

    // Pass if: no critical warnings, score >= 55
    // (Lower threshold than typical to avoid blocking good posts with minor diagnostic warnings)
    const hasCritical = warnings.some((w) => w.severity === 'critical');
    const pass = !hasCritical && score >= 55;

    return { score, warnings, pass };
  }
}
