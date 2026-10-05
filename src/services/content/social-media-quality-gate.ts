/**
 * NorthSoft.AI.ContentCreator — Social Media Quality Gate
 *
 * A human-centric diagnostic guardrail that evaluates generated social media copy
 * across ten communication dimensions based on current research (Sprout Social 2025/2026,
 * Ogilvy, Heath & Heath).
 *
 * Designed to detect and reject:
 * - Paraphrase echoes (rephrasing the source sentence-by-sentence)
 * - Low information gain (failing to add concrete mechanisms, scenarios, or insights)
 * - Paragraph collapse (single undifferentiated walls of text)
 * - Empty engagement bait (generic tacked-on questions)
 * - Stacked generic AI marketing filler
 * - Generic openings ("You want to reach more customers...")
 * - Lack of concrete business situations
 *
 * Total weights sum to 100.
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
  /** Pass if score is acceptable, no critical warnings, no high warnings, and score >= quality floor (75) */
  pass: boolean;
  genericnessScore: number; // 0 (completely concrete/original) to 100 (heavily generic/AI template)
  dimensionScores?: Record<string, number>;
}

export interface SMQGContext {
  topicTitle?: string;
  referenceTexts?: string[];
  angle?: string;
  structure?: string;
}

// Common generic marketing clichés and AI filler phrases
export const GENERIC_AI_MARKETING_TROPES = [
  /\btake\s+(?:your\s+)?business\s+to\s+the\s+next\s+level\b/i,
  /\bunlock\s+(?:(?:your|the)\s+)?potential\b/i,
  /\bin\s+today's\s+(?:fast-paced|digital)\s+world\b/i,
  /\bbuild\s+a\s+stronger\s+online\s+presence\b/i,
  /\bstand\s+out\s+from\s+the\s+competition\b/i,
  /\breach\s+more\s+customers\b/i,
  /\bgrow\s+your\s+business\b/i,
  /\bready\s+to\s+take\s+the\s+next\s+step\b/i,
  /\bwe'?re\s+here\s+to\s+help\b/i,
  /\bseen,\s*remembered,?\s*(?:and|&)\s*trusted\b/i,
  /\blook\s+no\s+further\b/i,
  /\bsupercharge\s+(?:your)?\b/i,
  /\bgame.?changer\b/i,
  /\bdigital\s+transformation\b/i,
  /\bholistic\s+approach\b/i,
  /\bscaling\s+your\s+business\b/i,
  /\brevolutionizing\s+the\s+way\b/i,
  /\bleverage\s+synergy\b/i,
  /\bmaximize\s+(?:your\s+)?conversion\b/i,
  /\bcontact\s+us\s+today\s+to\s+unlock\b/i,
  /\bcutting-edge\b/i,
  /\bstrong\s+online\s+presence\s+is\s+essential\b/i,
  /\b(?:digital|online)\s+presence\s+(?:is|are)\s+(?:essential|critical|crucial|key|vital)\b/i,
  /\boptimized\s+for\s+(?:success|safety)\b/i,
  /\bdrive\s+results\b/i,
  /\bmake\s+an\s+impact\b/i,
  /\btransform\s+your\s+business\b/i,
  /\byour\s+business\s+deserves\b/i,
  /\bit'?s\s+more\s+than\s+just\b/i,
];

// Structural AI syntactic template patterns (syntactic formulas characteristic of AI output)
export const AI_TEMPLATE_SYNTAX_PATTERNS = [
  /\byou'?re\s+not\s+just\s+[^,.?!]+,?\s+you'?re\s+[^.?!]+/i,
  /\bit'?s\s+not\s+(?:just\s+)?about\s+[^,.?!]+,?\s+it'?s\s+(?:all\s+)?about\s+[^.?!]+/i,
  /\bdon'?t\s+just\s+[^,.?!]+[-—,]\s+[^.?!]+/i,
  /\b(?:isn'?t|is\s+not)\s+just\s+[^,.?!]+,?\s+it'?s\s+[^.?!]+/i,
  /\bthe\s+truth\s+is,?\s+/i,
  /\bhere'?s\s+the\s+thing:?\s+/i,
  /\bwhether\s+you'?re\s+[^,]+,\s+or\s+[^,]+,?\s+/i,
  /\bin\s+(?:today'?s|the)\s+(?:digital|fast-paced|modern)\s+(?:age|world|landscape)\b/i,
];

// Enterprise / Academic consulting abstraction jargon alien to small business owners
export const ENTERPRISE_CONSULTING_TERMS = [
  /\bconvince\s+stakeholders\b/i,
  /\btesting\s+causality\b/i,
  /\bcalculating\s+the\s+potential\s+return\s+on\s+investment\b/i,
  /\bcalculating\s+(?:the\s+)?ROI\b/i,
  /\bdefining\s+business\s+value\b/i,
  /\bstrategic\s+imperative\b/i,
  /\bparadigm\s+shift\b/i,
  /\bcore\s+competenc(?:y|ies)\b/i,
  /\bmake\s+a\s+compelling\s+case\s+for\b/i,
];

// Empty engagement bait questions
export const EMPTY_ENGAGEMENT_QUESTIONS = [
  /\bwhat'?s\s+(?:the\s+)?(?:one|1)\s+thing\s+you\s+(?:wish\s+you\s+could|would)\s+improve\b/i,
  /\bwhat\s+do\s+you\s+think(?:\s+about\s+[^?]+)?\??\s*$/i,
  /\bdo\s+you\s+agree\??\s*$/i,
  /\blet\s+(?:us|me)\s+know\s+in\s+the\s+comments\b/i,
  /\bdrop\s+a\s+comment\s+below\b/i,
  /\bwhat(?:'s|\s+are)\s+your\s+thoughts\b/i,
  /\bhow\s+about\s+you\??\s*$/i,
  /\bhow\s+do\s+you\s+handle\s+this\??\s*$/i,
  /\bwhat('s|\s+is)\s+your\s+biggest\s+challenge\s+with\b/i,
  /\bshare\s+your\s+thoughts\b/i,
];

// Generic opening patterns that signal AI filler
export const GENERIC_OPENING_PATTERNS = [
  /^you\s+want\s+to\s+reach\s+more\s+customers/i,
  /^in\s+today's\s+(?:digital|fast-paced)\s+world/i,
  /^in\s+the\s+(?:digital|modern)\s+age/i,
  /^as\s+a\s+business\s+owner,?\s+you\s+know/i,
  /^running\s+a\s+business\s+is\s+(?:hard|challenging|not\s+easy)/i,
  /^every\s+business\s+needs\s+a\s+website/i,
  /^having\s+a\s+(?:good\s+)?website\s+is\s+important/i,
  /^your\s+website\s+is\s+important\s+for\s+your\s+business/i,
  /^your\s+business\s+is\s+more\s+than\s+just/i,
  /^you'?re\s+not\s+just\s+/i,
  /^websites\s+are\s+important/i,
  /^a\s+professional\s+website\s+is\s+essential/i,
  /^businesses\s+need\s+to\b/i,
];

export class SocialMediaQualityGate {
  // Dimension weights — sum to 100
  private readonly weights: Record<string, number> = {
    Genericness: 10,
    Authenticity: 10,
    InformationGain: 14,
    Attention: 10,
    AudienceRelevance: 12,
    Specificity: 10,
    Value: 10,
    Credibility: 10,
    HumanVoice: 4,
    Readability: 5,
    CTAQuality: 5,
  };

  /**
   * Evaluates a generated post draft against the human-centric communication dimensions.
   */
  evaluate(
    draft: { title: string; body: string; callToAction?: string },
    context?: SMQGContext,
  ): SMQGResult {
    const warnings: SMQGWarning[] = [];
    const body = (draft.body || '').trim();
    const charCount = body.length;

    const add = (dim: string, sev: SMQGWarning['severity'], reason: string) => {
      warnings.push({ dimension: dim, severity: sev, reason });
    };

    const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
    const lineBreaks = (body.match(/\n/g) || []).length;

    // -------------------------------------------------------------------
    // 0. BASIC SANITY / LENGTH CHECKS (Readability)
    // -------------------------------------------------------------------
    if (charCount < 40) {
      add('Readability', 'critical', 'Post body is empty or too short to deliver any value.');
    } else if (charCount < 80) {
      add('Readability', 'high', 'Post body is too short to deliver meaningful value (under 80 characters).');
    } else if (charCount > 1600) {
      add('Readability', 'medium', 'Post body exceeds 1600 characters — consider tightening for social feed scannability.');
    }



    // -------------------------------------------------------------------
    // 1. GENERICNESS & AI TEMPLATE PATTERNS (Weight: 16)
    // -------------------------------------------------------------------
    let genericSignalsCount = 0;
    const aiTemplateMatches: string[] = [];
    for (const pat of AI_TEMPLATE_SYNTAX_PATTERNS) {
      if (pat.test(body)) {
        aiTemplateMatches.push(pat.source);
        genericSignalsCount += 2;
      }
    }

    const matchedTropes: string[] = [];
    for (const trope of GENERIC_AI_MARKETING_TROPES) {
      if (trope.test(body)) {
        matchedTropes.push(trope.source);
        genericSignalsCount += 1;
      }
    }

    // Abstract marketing keywords without operational anchoring
    const abstractMarketingWords = (body.toLowerCase().match(/\b(customer experience|business value|digital strategy|online presence|digital transformation|business growth|online visibility)\b/g) || []).length;
    if (abstractMarketingWords >= 2) {
      genericSignalsCount += 1;
    }

    // Concrete operational entities count (anchor against abstraction)
    const concreteEntityMatches = (body.toLowerCase().match(/\b(customer|booking|checkout|phone call|phone|contact form|invoice|appointment|website page|product page|google|email|mobile|screen|hours|price|prices|quote|menu|competitor|competitors|mechanic|plumber|shop|store|client|clients)\b/g) || []).length;

    // Compute genericness score: 0 (completely concrete/original) to 100 (heavily generic/AI template)
    let calculatedGenericnessScore = Math.min(100, Math.round(
      (genericSignalsCount * 25) +
      (abstractMarketingWords * 10) -
      (Math.min(concreteEntityMatches, 5) * 6)
    ));
    calculatedGenericnessScore = Math.max(0, calculatedGenericnessScore);

    if (aiTemplateMatches.length >= 1 && concreteEntityMatches < 3) {
      add('Genericness', 'critical', `Recognizable AI syntactic template detected without concrete operational grounding ("${aiTemplateMatches[0]}"). Social posts must lead with a relatable real-world situation.`);
    } else if (aiTemplateMatches.length >= 1) {
      add('Genericness', 'high', `Post relies on predictable AI template syntax ("${aiTemplateMatches[0]}"). Ground in specific customer actions instead.`);
    }

    if (matchedTropes.length >= 3) {
      add('Authenticity', 'critical', `Post contains heavily stacked generic AI marketing clichés (${matchedTropes.length} detected) that replace concrete substance.`);
    } else if (matchedTropes.length >= 2) {
      add('Authenticity', 'high', `Post contains multiple corporate jargon phrases or generic marketing clichés (${matchedTropes.length} detected).`);
    } else if (matchedTropes.length === 1) {
      add('Authenticity', 'medium', `Post contains a generic marketing cliché or corporate jargon phrase — consider rephrasing with specific language.`);
    }

    // -------------------------------------------------------------------
    // 2. AUDIENCE RELEVANCE & SMALL BUSINESS ORIENTATION (Weight: 12)
    // -------------------------------------------------------------------
    const enterpriseJargonMatches: string[] = [];
    for (const term of ENTERPRISE_CONSULTING_TERMS) {
      if (term.test(body)) {
        enterpriseJargonMatches.push(term.source);
      }
    }

    if (enterpriseJargonMatches.length >= 2) {
      add('AudienceRelevance', 'critical', `Enterprise / academic consulting language detected (${enterpriseJargonMatches.join(', ')}). Our audience is small business owners, not corporate stakeholders or consultants.`);
    } else if (enterpriseJargonMatches.length === 1) {
      add('AudienceRelevance', 'high', `Corporate stakeholder / consulting phrasing detected ("${enterpriseJargonMatches[0]}"). Address the direct daily friction of a small business owner.`);
    }

    // Check if post sounds like a consulting article summary rather than social media copy
    const isConsultingSummary =
      /\b(stakeholders?|calculating costs?|testing causality|defining business value|potential return on investment)\b/i.test(body) &&
      paragraphs.length <= 2;
    if (isConsultingSummary && enterpriseJargonMatches.length === 0) {
      add('AudienceRelevance', 'high', 'Post reads as a formal article summary / consulting methodology rather than conversational social copy for a business owner.');
    }

    // -------------------------------------------------------------------
    // 3. INFORMATION GAIN & PARAPHRASE DETECTION (Weight: 14)
    // -------------------------------------------------------------------
    const references = [
      context?.topicTitle,
      ...(context?.referenceTexts || []),
    ].filter((t): t is string => Boolean(t && t.trim().length > 0));

    if (references.length > 0 && body.length >= 80) {
      const extractSubstantiveWords = (text: string): string[] => {
        const stopWords = new Set([
          'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
          'from', 'it', 'this', 'that', 'these', 'those', 'you', 'your', 'we', 'our', 'they', 'their', 'i', 'me', 'my', 'can',
          'will', 'be', 'have', 'has', 'do', 'does', 'did', 'so', 'if', 'as', 'what', 'which', 'who', 'how', 'when', 'where',
        ]);
        const tokens = (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
          .filter((w) => w.length > 2 && !stopWords.has(w));
        return tokens;
      };

      const bodyWords = extractSubstantiveWords(body);
      const bodyWordSet = new Set(bodyWords);

      for (const ref of references) {
        const refWords = extractSubstantiveWords(ref);
        const refWordSet = new Set(refWords);

        if (refWordSet.size >= 8 && bodyWordSet.size >= 8) {
          let sharedCount = 0;
          for (const word of bodyWordSet) {
            if (refWordSet.has(word)) sharedCount++;
          }

          const sharedFromRefRatio = sharedCount / bodyWordSet.size;
          const novelWords = bodyWords.filter((w) => !refWordSet.has(w));

          // Check for 3-gram copy/paste echoes
          const cleanRef = ref.toLowerCase().replace(/[^\w\s]/g, ' ');
          const cleanBody = body.toLowerCase().replace(/[^\w\s]/g, ' ');
          const bodyNgrams: string[] = [];
          const bTokens = cleanBody.split(/\s+/).filter(Boolean);
          for (let i = 0; i < bTokens.length - 2; i++) {
            bodyNgrams.push(`${bTokens[i]} ${bTokens[i + 1]} ${bTokens[i + 2]}`);
          }

          let matchedNgrams = 0;
          for (const ng of bodyNgrams) {
            if (cleanRef.includes(ng)) matchedNgrams++;
          }
          const ngramEchoRatio = bodyNgrams.length > 0 ? matchedNgrams / bodyNgrams.length : 0;

          // Paraphrase failure detection
          if (sharedFromRefRatio >= 0.70 && (novelWords.length < 10 || ngramEchoRatio >= 0.35)) {
            if (sharedFromRefRatio >= 0.85 && novelWords.length < 6) {
              add('InformationGain', 'critical', 'Paraphrase failure: post echoes the source text almost verbatim without introducing original perspective or substance.');
            } else {
              add('InformationGain', 'high', 'Low information gain: post mostly restates the source notes without developing a concrete scenario or new business insight.');
            }
            break;
          }
        }
      }
    }

    // -------------------------------------------------------------------
    // 4. ATTENTION & HOOK (Weight: 10)
    // -------------------------------------------------------------------
    const firstSentence = (body.split(/[.!?\n]/)[0] || '').trim();
    let hasGenericOpening = false;
    for (const pattern of GENERIC_OPENING_PATTERNS) {
      if (pattern.test(firstSentence)) {
        hasGenericOpening = true;
        break;
      }
    }

    if (hasGenericOpening) {
      add('Attention', 'high', `Opening sentence is a generic marketing cliché ("${firstSentence.slice(0, 60)}...") — lead with a concrete observation, scene, or sharp contrast.`);
    } else {
      const opening = body.slice(0, 150);
      const hasHookSignal =
        /[?!]/.test(opening) ||
        /\b(when|if|imagine|picture|ever|most|many|one thing|the truth|turns out|here's|a customer|your website|simple beats|before|nobody|is your|let's cut through)\b/i.test(opening) ||
        /\b(customer|client|visitor|owner|shop|business)\b/i.test(opening) ||
        opening.split(/\s+/).length >= 8;
      if (!hasHookSignal && charCount >= 80) {
        add('Attention', 'medium', 'Opening fails to stop the scroll — consider an immediate recognizable situation or surprising observation.');
      }
    }

    // -------------------------------------------------------------------
    // 5. SPECIFICITY (Weight: 10)
    // -------------------------------------------------------------------
    const concreteDetails =
      /\d+/.test(body) || // any numbers
      /\b(website|email|shop|store|booking|order|invoice|review|reviews|listing|google|facebook|instagram|mobile|phone|click|form|checkout|speed|seconds|menu|pricing|hours|address|contact)\b/i.test(body);

    if (charCount >= 80 && !concreteDetails) {
      add('Specificity', 'medium', 'Post lacks concrete detail — numbers, named tools, or specific operational artifacts would make it believable.');
    }

    // -------------------------------------------------------------------
    // 6. VALUE & PRACTICAL INSIGHT (Weight: 10)
    // -------------------------------------------------------------------
    const valueSignals =
      /\b(check|review|update|try|test|add|remove|fix|change|improve|avoid|consider|make sure|ensure|set up|connect|use|enable|turn on|look at|ask|find out|see if|learn|starts with|difference between|rule of thumb|simple beats|rather than|help you|finding a tool)\b/i.test(body) ||
      /\b(tip|key|important|worth|helpful|useful|practical|simple|quick|step|approach|strategy|mechanism|reason|free)\b/i.test(body);

    const hasSubstantiveSentences = body.split(/[.!?]/).filter((s) => s.trim().length > 30).length >= 2;

    if (charCount >= 80 && (!valueSignals || !hasSubstantiveSentences)) {
      add('Value', 'medium', 'Post does not deliver a clear actionable takeaway, mechanism, or useful explanation for the business owner.');
    }

    // -------------------------------------------------------------------
    // 7. READABILITY & SOCIAL FORMATTING (Weight: 6)
    // -------------------------------------------------------------------
    // Hard block on paragraph collapse: a single solid block > 160 characters
    if (charCount > 160 && paragraphs.length <= 1 && lineBreaks === 0) {
      add('Readability', 'high', 'Paragraph collapse: post is formatted as a single monolithic block. Social copy must use short paragraphs (1-3 sentences) separated by blank lines.');
    } else if (charCount > 300 && paragraphs.length <= 1) {
      add('Readability', 'medium', 'Post lacks visual rhythm — break dense text into 2-4 short, readable chunks.');
    }

    // -------------------------------------------------------------------
    // 8. HUMAN VOICE / CONVERSATIONAL TONE (Weight: 6)
    // -------------------------------------------------------------------
    const hasContraction = /\b(it's|you're|they're|we're|don't|can't|won't|doesn't|isn't|I'm|that's|there's|what's|here's|who's|let's|they'll|you'll|we'll)\b/i.test(body);
    const sentences = body.split(/[.!?]/).filter((s) => s.trim().length > 0);
    const hasVariedRhythm = sentences.length >= 2 && sentences.some((s) => s.trim().split(/\s+/).length <= 8);

    if (charCount >= 80 && !(hasContraction || hasVariedRhythm)) {
      add('HumanVoice', 'low', 'Tone may sound overly formal or robotic — natural contractions and varied sentence pacing improve authentic human feel.');
    }

    // -------------------------------------------------------------------
    // 9. CREDIBILITY (Weight: 10)
    // -------------------------------------------------------------------
    const bodyPercentages = body.match(/\d+%/g) || [];
    const hasSourceIndicator = /\b(source|study|report|according to|survey|found that|published by|based on|cited by|per (?:the )?\w+)\b/i.test(body);
    const hasFabricatedStat =
      bodyPercentages.length > 0 &&
      !hasSourceIndicator &&
      /\d+%\s+(?:of\s+(?:businesses?|customers?|users?|owners?|shops?|companies?|people|consumers?))/i.test(body);

    if (hasFabricatedStat) {
      add('Credibility', 'critical', 'Post contains a percentage statistic with an unverified claim ("X% of businesses...") without citing a source — remove or attribute this claim.');
    }

    const hasResearchClaim = /\b(research shows|studies show|experts say|data shows|proven|it is proven)\b/i.test(body);
    if (hasResearchClaim && !hasSourceIndicator && !hasFabricatedStat) {
      add('Credibility', 'high', 'Post references research or expert opinion without citing a source — rephrase as an observation or attribute clearly.');
    }

    // -------------------------------------------------------------------
    // 10. CTA QUALITY & EMPTY ENGAGEMENT BAIT (Weight: 6)
    // -------------------------------------------------------------------
    let hasEmptyEngagementBait = false;
    for (const pattern of EMPTY_ENGAGEMENT_QUESTIONS) {
      if (pattern.test(body)) {
        hasEmptyEngagementBait = true;
        break;
      }
    }

    if (hasEmptyEngagementBait) {
      add('CTAQuality', 'high', 'Empty engagement bait detected: post ends with a generic, artificial question ("What is one thing you wish you could improve..."). Remove the question or replace with a natural scenario-specific discussion.');
    }

    // Urgent sales pressure
    const hasUrgentSalesPressure = /\b(?:act now[!.]*|limited time(?: only| offer)?|urgent(?:ly)?\s+(?:offer|deal|discount|consultation|call|inquiry|purchase)|don't miss out[!.]*|last chance[!.]*)\b/i.test(body) ||
      /\bbuy now[!.]*$/im.test(body);
    if (hasUrgentSalesPressure) {
      add('CTAQuality', 'high', 'Urgent sales pressure detected ("act now", "limited time"). Keep invitations contextual and low-pressure.');
    }

    // Brand Placement check
    const brandIdx = body.search(/NorthSoft/i);
    if (brandIdx !== -1 && brandIdx < 80 && charCount > 150) {
      add('CTAQuality', 'low', 'NorthSoft is introduced very early — placing the brand after delivering reader value reads more authentically.');
    }

    // -------------------------------------------------------------------
    // COMPUTE WEIGHTED SCORE & QUALITY FLOOR ENFORCEMENT
    // -------------------------------------------------------------------
    let score = 100;
    const dimensionScores: Record<string, number> = {};

    for (const [dim, weight] of Object.entries(this.weights)) {
      const dimWarnings = warnings.filter((w) => w.dimension === dim);
      if (dimWarnings.length > 0) {
        const hasCrit = dimWarnings.some((w) => w.severity === 'critical');
        const hasHigh = dimWarnings.some((w) => w.severity === 'high');
        const hasMed = dimWarnings.some((w) => w.severity === 'medium');

        let penaltyRatio = 0.30;
        if (hasCrit) penaltyRatio = 1.0;
        else if (hasHigh) penaltyRatio = 0.90;
        else if (hasMed) penaltyRatio = 0.55;

        // Additional deduction if multiple warnings exist in the dimension
        if (dimWarnings.length > 1 && !hasCrit) {
          penaltyRatio = Math.min(1.0, penaltyRatio + 0.15 * (dimWarnings.length - 1));
        }

        const penalty = Math.round(weight * penaltyRatio);
        score -= penalty;
        dimensionScores[dim] = weight - penalty;
      } else {
        dimensionScores[dim] = weight;
      }
    }

    score = Math.max(0, Math.min(100, score));

    const hasCritical = warnings.some((w) => w.severity === 'critical');
    const highWarningsCount = warnings.filter((w) => w.severity === 'high').length;

    // Strict Quality Floor for autonomous publishing:
    // - NO critical warnings
    // - NO high warnings (every high warning represents an unpublishable defect: AI template, paragraph collapse, consulting jargon, etc.)
    // - Minimum score >= 75
    // - Genericness score <= 40
    const pass = !hasCritical && highWarningsCount === 0 && score >= 75 && calculatedGenericnessScore <= 40;

    return {
      score,
      warnings,
      pass,
      genericnessScore: calculatedGenericnessScore,
      dimensionScores,
    };
  }
}
