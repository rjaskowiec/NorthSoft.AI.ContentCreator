/**
 * NorthSoft.AI.ContentCreator — Content Quality Gate Service
 *
 * Evaluates semantic quality, substantive value, list item substance, empty advice filler detection,
 * topic alignment, and CTA quality BEFORE post persistence to D1 or publication.
 *
 * Prevents "AI Content Fillers" (empty advice, tautological 3-step lists like "Buy/Prepare/Eat",
 * generic clichés, topic mismatch, or slapped-on auto-suffix CTAs).
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
];

// Generic slapped-on uncontextualized CTAs
export const GENERIC_SLAPPED_ON_CTAS = [
  /^(?:what\s+do\s+you\s+think\??\s*)?follow\s+(?:us\s+)?for\s+more(?:\s+tips)?!?$/i,
  /^(?:what\s+do\s+you\s+think\??\s*)?like\s+and\s+subscribe(?:\s+for\s+more)?!?$/i,
  /^follow\s+for\s+more[!.]*$/i,
];

export class ContentQualityGate {
  /**
   * Evaluates semantic content quality & substantive value of a draft.
   */
  evaluate(draft: PostDraft, topicTitle?: string): ContentQualityGateResult {
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

    // 4. CTA Quality Check
    const lastLine = lines.length > 0 ? lines[lines.length - 1]! : '';
    for (const ctaPattern of GENERIC_SLAPPED_ON_CTAS) {
      if (ctaPattern.test(lastLine)) {
        ctaQuality = false;
        reasons.push('CTA quality failure: post ends with a generic, uncontextualized CTA suffix.');
        break;
      }
    }

    // 5. Substantive Value Check
    if (!listItemSubstance || !noEmptyAdvice) {
      substantiveValue = false;
    }

    // Calculate quality score (0 to 100)
    let score = 100;
    if (!listItemSubstance) score -= 30;
    if (!noEmptyAdvice) score -= 30;
    if (!logicalCoherence) score -= 25;
    if (!topicAlignment) score -= 25;
    if (!ctaQuality) score -= 15;
    if (!substantiveValue) score -= 20;

    score = Math.max(0, Math.min(100, score));

    const passed =
      substantiveValue &&
      logicalCoherence &&
      topicAlignment &&
      listItemSubstance &&
      noEmptyAdvice &&
      ctaQuality &&
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
      reasons,
    };
  }
}
