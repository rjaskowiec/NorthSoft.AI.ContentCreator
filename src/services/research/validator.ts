/**
 * NorthSoft.AI.ContentCreator — AI Response Validator
 *
 * Validates AI research outputs against strict domain schemas before database persistence.
 * Prevents invalid, malformed, or unsafe AI data from polluting D1.
 */

export interface CandidateTopicPayload {
  title: string;
  summary: string;
  sourceUrl: string;
  sourceName: string;
  publishedAt: string;
  relevanceScore: number; // 0 - 100
  categories: string[];
  keyClaims: string[];
  whyRelevant: string;
  confidence: number; // 0.0 - 1.0
}

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors?: string[];
}

/**
 * Parses and validates raw AI completion string into a CandidateTopicPayload.
 */
export function validateCandidateTopicOutput(
  rawAiOutput: string,
): ValidationResult<CandidateTopicPayload> {
  if (!rawAiOutput || typeof rawAiOutput !== 'string') {
    return { valid: false, errors: ['AI output is empty or not a string'] };
  }

  let parsed: unknown;
  try {
    // Attempt to extract JSON if wrapped in markdown code blocks
    let cleanedJson = rawAiOutput.trim();
    if (cleanedJson.startsWith('```')) {
      cleanedJson = cleanedJson
        .replace(/^```(json)?\n?/, '')
        .replace(/\n?```$/, '')
        .trim();
    }
    parsed = JSON.parse(cleanedJson);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown JSON parse error';
    return { valid: false, errors: [`Failed to parse AI output as JSON: ${msg}`] };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, errors: ['AI output JSON must be a valid object'] };
  }

  const obj = parsed as Record<string, unknown>;
  const errors: string[] = [];

  // Title validation
  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  if (!title || title.length < 5 || title.length > 250) {
    errors.push('title must be a string between 5 and 250 characters');
  }

  // Summary validation
  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
  if (!summary || summary.length < 10) {
    errors.push('summary must be a non-empty string with at least 10 characters');
  }

  // Source URL validation
  const sourceUrl = typeof obj.sourceUrl === 'string' ? obj.sourceUrl.trim() : '';
  if (!sourceUrl) {
    errors.push('sourceUrl is required');
  } else {
    try {
      new URL(sourceUrl);
    } catch {
      errors.push('sourceUrl must be a valid URL string');
    }
  }

  // Source Name validation
  const sourceName = typeof obj.sourceName === 'string' ? obj.sourceName.trim() : 'Unknown Source';

  // Published At date validation
  const publishedAt =
    typeof obj.publishedAt === 'string' ? obj.publishedAt.trim() : new Date().toISOString();

  // Relevance Score validation (0 to 100)
  let relevanceScore = typeof obj.relevanceScore === 'number' ? Math.round(obj.relevanceScore) : 50;
  if (isNaN(relevanceScore) || relevanceScore < 0 || relevanceScore > 100) {
    relevanceScore = 50;
  }

  // Categories validation
  const categories: string[] = [];
  if (Array.isArray(obj.categories)) {
    for (const item of obj.categories) {
      if (typeof item === 'string' && item.trim()) {
        categories.push(item.trim());
      }
    }
  }
  if (categories.length === 0) {
    categories.push('General');
  }

  // Key Claims validation
  const keyClaims: string[] = [];
  if (Array.isArray(obj.keyClaims)) {
    for (const item of obj.keyClaims) {
      if (typeof item === 'string' && item.trim()) {
        keyClaims.push(item.trim());
      }
    }
  }

  // Why Relevant validation
  const whyRelevant =
    typeof obj.whyRelevant === 'string'
      ? obj.whyRelevant.trim()
      : 'Discovered by research pipeline';

  // Confidence validation (0.0 to 1.0)
  let confidence = typeof obj.confidence === 'number' ? obj.confidence : 0.8;
  if (isNaN(confidence) || confidence < 0 || confidence > 1) {
    confidence = 0.8;
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      title,
      summary,
      sourceUrl,
      sourceName,
      publishedAt,
      relevanceScore,
      categories,
      keyClaims,
      whyRelevant,
      confidence,
    },
  };
}
