/**
 * NorthSoft.AI.ContentCreator — Static Content Validator
 *
 * Runs deterministic checks on post drafts BEFORE AI Quality Review to save AI Neurons
 * and catch structural errors, clickbait patterns, or length violations early.
 */

import type { PostDraft } from './writer-service';

export interface StaticValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export const FORBIDDEN_CLICKBAIT_PATTERNS = [
  /\bexciting news\b/i,
  /\bgame changer\b/i,
  /\byou won't believe\b/i,
  /\brevolutionary!\b/i,
  /\bdon't miss out\b/i,
  /\bact now!\b/i,
  /\bclick here\b/i,
];

export const PLACEHOLDER_PATTERNS = [
  /lorem ipsum/i,
  /\[insert /i,
  /\[link\]/i,
  /\[your /i,
  /TODO:/i,
];

export class StaticValidator {
  /**
   * Evaluates deterministic validation rules against a generated post draft.
   */
  validate(draft: PostDraft): StaticValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Non-empty title and body
    if (!draft.title || !draft.title.trim()) {
      errors.push('Post title is empty.');
    }

    if (!draft.body || !draft.body.trim()) {
      errors.push('Post body text is empty.');
    }

    const bodyLength = draft.body ? draft.body.length : 0;

    // 2. Length Bounds Check (Facebook target: 400 - 1,200 chars; absolute: 100 - 2000)
    if (bodyLength < 100) {
      errors.push(`Post body is too short (${bodyLength} characters; minimum is 100).`);
    } else if (bodyLength < 400) {
      warnings.push(
        `Post body is under recommended target length (${bodyLength} chars; recommended 400-1,200).`,
      );
    }

    if (bodyLength > 2000) {
      errors.push(
        `Post body exceeds maximum allowed length (${bodyLength} characters; maximum is 2000).`,
      );
    } else if (bodyLength > 1200) {
      warnings.push(
        `Post body exceeds recommended target length (${bodyLength} chars; recommended 400-1,200).`,
      );
    }

    // 3. Hashtags limit (Maximum 3 hashtags)
    if (draft.hashtags && draft.hashtags.length > 3) {
      errors.push(`Too many hashtags (${draft.hashtags.length}; maximum allowed is 3).`);
    }

    // 4. Prohibited Clickbait / Hype Words
    for (const pattern of FORBIDDEN_CLICKBAIT_PATTERNS) {
      if (pattern.test(draft.body) || pattern.test(draft.title)) {
        errors.push(`Post contains prohibited clickbait/hype phrase matching ${pattern}.`);
      }
    }

    // 5. Placeholder Text Detection
    for (const placeholder of PLACEHOLDER_PATTERNS) {
      if (placeholder.test(draft.body) || placeholder.test(draft.title)) {
        errors.push(`Post contains unfinished placeholder text matching ${placeholder}.`);
      }
    }

    // 6. Source Grounding Requirement
    if (!draft.sourceIds || draft.sourceIds.length === 0) {
      errors.push('Post draft is missing associated research source references.');
    }

    // 7. Duplicate Sentences Check
    const sentences = draft.body
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 15);
    const uniqueSentences = new Set(sentences);
    if (sentences.length - uniqueSentences.size > 0) {
      errors.push('Post body contains repeated duplicate sentences.');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
