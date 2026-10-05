/**
 * NorthSoft.AI.ContentCreator — Content Quality Gate Service
 *
 * Evaluates semantic quality, substantive value, list item substance, empty advice filler detection,
 * topic alignment, paragraph structure, and CTA quality BEFORE post persistence to D1 or publication.
 *
 * Prevents "AI Content Fillers" (empty advice, tautological 3-step lists like "Buy/Prepare/Eat",
 * generic clichés, topic mismatch, paraphrase echoes, or slapped-on auto-suffix CTAs).
 */

import type { PostDraft } from './writer-service';

export interface ContentQualityGateResult {
  passed: boolean;
  score: number; // 0 to 100
  substantiveValue: boolean;
  logicalCoherence: boolean;
  topicAlignment: boolean;
  listItemSubstance: boolean;
  noEmptyAdvice: boolean;
  ctaQuality: boolean;
  communicationQuality?: boolean;
  reasons: string[];
}

// Known generic filler clichés that provide zero actionable value if unelaborated
export const GENERIC_FILLER_CLICHES = [
  /\bwork\s+harder\b/i,
  /\bplan\s+better\b/i,
  /\buse\s+technology\b/i,
  /\bfocus\s+on\s+(?:your\s+)?customers?\b/i,
  /\bkeep\s+improving\b/i,
  /\bstay\s+ahead\s+of\s+(?:the\s+)?competition\b/i,
  /\bwork\s+smarter,?\s+not\s+harder\b/i,
  /\bfocus\s+on\s+your\s+goals\b/i,
  /\bbe\s+consistent\b/i,
  /\bknow\s+your\s+audience\b/i,
  /\bhave\s+a?\s+good\s+strategy\b/i,
  /\bhave\s+a?\s+good\s+design\b/i,
  /\bbe\s+mobile\s+friendly\b/i,
  /\buse\s+seo\b/i,
  /\bbe\s+fast\b/i,
  /\bhave\s+good\s+content\b/i,
  /\bbuy\s+[a-z]+\b/i,
  /\bprepare\s+[a-z]+\b/i,
  /\beat\s+[a-z]+\b/i,
  /\btake\s+(?:your\s+)?business\s+to\s+the\s+next\s+level\b/i,
  /\bunlock\s+(?:your|the)\s+potential\b/i,
  /\bin\s+today's\s+(?:fast-paced|digital)\s+world\b/i,
  /\bbuild\s+a\s+stronger\s+online\s+presence\b/i,
  /\bstand\s+out\s+from\s+the\s+competition\b/i,
  /\breach\s+more\s+customers\b/i,
  /\bgrow\s+your\s+business\b/i,
  /\bready\s+to\s+take\s+the\s+next\s+step\b/i,
  /\bwe'?re\s+here\s+to\s+help\b/i,
  /\bseen,\s*remembered,?\s*(?:and|&)\s*trusted\b/i,
];

// Recognizable AI syntactic templates that signal AI voice
export const CQ_AI_TEMPLATE_PATTERNS = [
  /\byou'?re\s+not\s+just\s+[^,.?!]+,?\s+you'?re\s+[^.?!]+/i,
  /\bit'?s\s+not\s+(?:just\s+)?about\s+[^,.?!]+,?\s+it'?s\s+(?:all\s+)?about\s+[^.?!]+/i,
  /\bdon'?t\s+just\s+[^,.?!]+[-—,]\s+[^.?!]+/i,
  /\b(?:isn'?t|is\s+not)\s+just\s+[^,.?!]+,?\s+it'?s\s+[^.?!]+/i,
];

// Consulting / enterprise abstractions alien to small business social copy
export const CQ_CONSULTING_ABSTRACTIONS = [
  /\bconvince\s+stakeholders\b/i,
  /\btesting\s+causality\b/i,
  /\bcalculating\s+(?:the\s+)?(?:potential\s+)?return\s+on\s+investment\b/i,
  /\bdefining\s+business\s+value\b/i,
];

// Generic slapped-on uncontextualized CTAs and empty bait
export const GENERIC_SLAPPED_ON_CTAS = [
  /^(?:what\s+do\s+you\s+think\??\s*)?follow\s+(?:us\s+)?for\s+more(?:\s+tips)?!?$/i,
  /^(?:what\s+do\s+you\s+think\??\s*)?like\s+and\s+subscribe(?:\s+for\s+more)?!?$/i,
  /^follow\s+for\s+more[!.]*$/i,
  /\bwhat'?s\s+(?:the\s+)?(?:one|1)\s+thing\s+you\s+(?:wish\s+you\s+could|would)\s+improve\b/i,
];

export class ContentQualityGate {
  /**
   * Evaluates semantic content quality & substantive value of a draft.
   */
  evaluate(
    draft: PostDraft,
    topicTitle?: string,
    referenceTexts: string[] = [],
  ): ContentQualityGateResult {
    const reasons: string[] = [];
    const body = (draft.body || '').trim();
    const title = (draft.title || '').trim();

    let substantiveValue = true;
    let logicalCoherence = true;
    let topicAlignment = true;
    let listItemSubstance = true;
    let noEmptyAdvice = true;
    let ctaQuality = true;

    // 1. List Item Substance & Duplicate Check
    const lines = body.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    const listLines = lines.filter(
      (l) => /^[\u2022\u25cf\u25cb\u25a0\u2013\u2014\-*+]\s+/.test(l) || /^\d+[.)]\s+/.test(l),
    );

    if (listLines.length > 0) {
      let trivialItemCount = 0;
      const normalizedItems: string[] = [];

      for (const line of listLines) {
        // Strip bullet marker / number prefix
        const content = line.replace(/^([\u2022\u25cf\u25cb\u25a0\u2013\u2014\-*+]|\d+[.)])\s+/, '').trim();
        normalizedItems.push(content.toLowerCase().replace(/[^a-z0-9\s]/g, ''));
        const words = content.split(/\s+/).filter((w) => w.length > 0);

        // Check if item is less than 4 words and lacks colon / em-dash / detail explanation
        if (words.length <= 4 && !content.includes(':') && !content.includes('—') && !content.includes('-')) {
          trivialItemCount++;
        }

        // Check tautological verb + noun patterns (e.g. "Buy herring", "Prepare herring", "Eat herring")
        if (/^(buy|prepare|eat|make|do|use|get)\s+[a-z]+[.!]?$/i.test(content)) {
          trivialItemCount++;
        }
      }

      // Check for duplicate or repeated list items
      const uniqueItems = new Set(normalizedItems);
      if (normalizedItems.length - uniqueItems.size >= 1) {
        logicalCoherence = false;
        reasons.push('List contains duplicate or repeated items.');
      }

      // If more than half or at least 2 items are trivial headlines
      if (trivialItemCount >= Math.min(2, Math.ceil(listLines.length / 2))) {
        listItemSubstance = false;
        reasons.push(
          'List items lack substantive explanation or practical guidance (contains trivial short items or tautological steps).',
        );
      }
    }

    // 2. Empty Advice / Generic Clichés Density Check
    let clichéMatches = 0;
    for (const pattern of GENERIC_FILLER_CLICHES) {
      if (pattern.test(body)) {
        clichéMatches++;
      }
    }

    // If body contains 3 or more generic clichés OR contains clichés as primary list items
    if (clichéMatches >= 3 || (clichéMatches >= 2 && listLines.length >= 3 && !listItemSubstance)) {
      noEmptyAdvice = false;
      reasons.push('Post consists predominantly of generic filler clichés without actionable guidance.');
    }

    // 3. Topic Alignment & Coverage Check
    const effectiveTopic = (topicTitle || title).toLowerCase();
    if (effectiveTopic.includes('seo') || effectiveTopic.includes('search engine')) {
      const lowerBody = body.toLowerCase();
      if (
        (lowerBody.includes('social media') || lowerBody.includes('instagram') || lowerBody.includes('reels') || lowerBody.includes('hashtags')) &&
        !lowerBody.includes('seo') &&
        !lowerBody.includes('search') &&
        !lowerBody.includes('google')
      ) {
        topicAlignment = false;
        reasons.push('Topic alignment failure: title/topic is about SEO, but body content focuses on social media.');
      }
    }

    // 4. Paraphrase / Reference Echo Detection
    const stopWords = new Set([
      'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
      'from', 'it', 'this', 'that', 'these', 'those', 'you', 'your', 'we', 'our', 'they', 'their', 'i', 'me', 'my', 'can',
      'will', 'be', 'have', 'has', 'do', 'does', 'did', 'so', 'if', 'as', 'what', 'which', 'who', 'how', 'when', 'where',
    ]);
    const bodyWords = (body.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => !stopWords.has(w));
    const bodyWordSet = new Set(bodyWords);
    const bodyLength = body.replace(/\s+/g, ' ').trim().length;

    const repeatsReference = [topicTitle, ...referenceTexts].some((reference) => {
      const normalizedReference = (reference || '').replace(/\s+/g, ' ').trim();
      const referenceWords = (normalizedReference.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => !stopWords.has(w));
      const referenceWordSet = new Set(referenceWords);

      if (normalizedReference.length < 50 || referenceWordSet.size < 6 || bodyWordSet.size < 6) {
        return false;
      }

      let sharedWords = 0;
      for (const word of referenceWordSet) {
        if (bodyWordSet.has(word)) sharedWords++;
      }

      const referenceCoverage = sharedWords / referenceWordSet.size;
      const bodyCoverage = sharedWords / bodyWordSet.size;
      const lengthRatio = bodyLength / normalizedReference.length;

      // 1. Literal repetition
      if (referenceCoverage >= 0.85 && bodyCoverage >= 0.85 && lengthRatio >= 0.65 && lengthRatio <= 1.5) {
        return true;
      }

      // 2. Paraphrase with appended engagement question (substantive core is 100% recycled from reference)
      const novelSubstantiveWords = bodyWords.filter((w) => !referenceWordSet.has(w));
      if (bodyCoverage >= 0.65 && novelSubstantiveWords.length < 8 && clichéMatches >= 1) {
        return true;
      }

      return false;
    });

    if (repeatsReference) {
      substantiveValue = false;
      reasons.push('Post mostly repeats the topic or source summary without adding useful information.');
    }

    // 5. CTA Quality Check
    const lastLine = lines.length > 0 ? lines[lines.length - 1]! : '';
    for (const ctaPattern of GENERIC_SLAPPED_ON_CTAS) {
      if (ctaPattern.test(lastLine) || ctaPattern.test(body)) {
        ctaQuality = false;
        reasons.push('CTA quality failure: post ends with a generic, uncontextualized CTA suffix or empty engagement bait.');
        break;
      }
    }

    // 6. Communication Quality & AI Voice Check
    let communicationQuality = true;
    for (const pat of CQ_AI_TEMPLATE_PATTERNS) {
      if (pat.test(body)) {
        communicationQuality = false;
        reasons.push(`AI template pattern detected ("${pat.source}"). Avoid predictable AI phrasing.`);
        break;
      }
    }

    for (const term of CQ_CONSULTING_ABSTRACTIONS) {
      if (term.test(body)) {
        communicationQuality = false;
        reasons.push(`Enterprise consulting abstraction detected ("${term.source}"). Copy must speak to small business reality, not stakeholders.`);
        break;
      }
    }

    // 7. Substantive Value Check
    if (!listItemSubstance || !noEmptyAdvice) {
      substantiveValue = false;
    }

    // Calculate quality score (0 to 100)
    let score = 100;
    if (!listItemSubstance) score -= 30;
    if (!noEmptyAdvice) score -= 30;
    if (!logicalCoherence) score -= 25;
    if (!topicAlignment) score -= 25;
    if (!ctaQuality) score -= 20;
    if (!substantiveValue) score -= 25;
    if (!communicationQuality) score -= 35;

    score = Math.max(0, Math.min(100, score));

    const passed =
      substantiveValue &&
      logicalCoherence &&
      topicAlignment &&
      listItemSubstance &&
      noEmptyAdvice &&
      ctaQuality &&
      communicationQuality &&
      score >= 60;

    return {
      passed,
      score,
      substantiveValue,
      logicalCoherence,
      topicAlignment,
      listItemSubstance,
      noEmptyAdvice,
      ctaQuality,
      communicationQuality,
      reasons,
    };
  }
}
