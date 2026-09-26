/**
 * NorthSoft.AI.ContentCreator — AI Content Discovery Validator
 *
 * Validates AI research outputs against post-angle schemas before database persistence.
 */

import { determineContentPillar, type ContentPillar } from './taxonomy';

export interface CandidateIdeaPayload {
  title: string;
  angle: string;
  hook: string;
  summary: string;
  keyPoints: string[];
  contentPillar: ContentPillar;
  postType?: string;
  engagementQuestion: string;
  commercialRelevance: number; // 0 - 100
  engagementPotential: number; // 0 - 100
  relevanceScore: number; // 0 - 100
  sourceUrl: string;
  sourceName: string;
  publishedAt: string;
  usefulAngle?: boolean;
  noUsefulAngleReason?: string;
}

export interface CandidateTopicPayload {
  title: string;
  summary: string;
  sourceUrl: string;
  sourceName: string;
  publishedAt: string;
  relevanceScore: number;
  categories: string[];
  keyClaims: string[];
  whyRelevant: string;
  confidence: number;
}

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors?: string[];
}

/**
 * Parses and validates raw AI completion string into a CandidateIdeaPayload (post angle).
 */
export function validateCandidateIdeaOutput(
  rawAiOutput: string,
): ValidationResult<CandidateIdeaPayload> {
  if (!rawAiOutput || typeof rawAiOutput !== 'string') {
    return { valid: false, errors: ['AI output is empty or not a string'] };
  }

  let parsed: unknown;
  try {
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

  // Check if AI explicitly determined NO_USEFUL_ANGLE
  if (
    obj.usefulAngle === false ||
    obj.useful_angle === false ||
    obj.status === 'NO_USEFUL_ANGLE' ||
    obj.reason === 'NO_USEFUL_ANGLE' ||
    obj.usefulAngle === 'false'
  ) {
    return {
      valid: true,
      data: {
        title: '',
        angle: '',
        hook: '',
        summary: '',
        keyPoints: [],
        contentPillar: 'WEBSITE',
        engagementQuestion: '',
        commercialRelevance: 0,
        engagementPotential: 0,
        relevanceScore: 0,
        sourceUrl: '',
        sourceName: '',
        publishedAt: '',
        usefulAngle: false,
        noUsefulAngleReason: typeof obj.reason === 'string' ? obj.reason : 'NO_USEFUL_ANGLE',
      },
    };
  }

  const errors: string[] = [];

  // Title validation
  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  if (!title || title.length < 5 || title.length > 250) {
    errors.push('title must be a string between 5 and 250 characters');
  }

  // Angle validation
  const angle =
    typeof obj.angle === 'string'
      ? obj.angle.trim()
      : typeof obj.whyRelevant === 'string'
      ? obj.whyRelevant.trim()
      : title;

  // Hook validation
  const hook =
    typeof obj.hook === 'string'
      ? obj.hook.trim()
      : typeof obj.summary === 'string'
      ? obj.summary.substring(0, 150)
      : title;

  // Summary validation
  const summary =
    typeof obj.summary === 'string'
      ? obj.summary.trim()
      : typeof obj.description === 'string'
      ? (obj.description as string).trim()
      : hook;

  // Key points validation
  const keyPoints: string[] = [];
  const rawPoints = Array.isArray(obj.keyPoints)
    ? obj.keyPoints
    : Array.isArray(obj.key_points)
    ? obj.key_points
    : Array.isArray(obj.keyClaims)
    ? obj.keyClaims
    : [];

  for (const item of rawPoints) {
    if (typeof item === 'string' && item.trim()) {
      keyPoints.push(item.trim());
    }
  }

  // Content Pillar validation
  const pillarInput =
    typeof obj.contentPillar === 'string'
      ? obj.contentPillar
      : typeof obj.content_pillar === 'string'
      ? obj.content_pillar
      : typeof obj.category === 'string'
      ? obj.category
      : 'WEBSITE';

  const contentPillar = determineContentPillar(title, summary, [pillarInput]);

  // Post Type validation
  const postType =
    typeof obj.postType === 'string'
      ? obj.postType.trim()
      : typeof obj.post_type === 'string'
      ? obj.post_type.trim()
      : 'TIPS';

  // Engagement Question validation
  const engagementQuestion =
    typeof obj.engagementQuestion === 'string'
      ? obj.engagementQuestion.trim()
      : typeof obj.engagement_question === 'string'
      ? obj.engagement_question.trim()
      : 'What is your take on this?';

  // Scores
  const commercialRelevance =
    typeof obj.commercialRelevance === 'number'
      ? Math.max(0, Math.min(100, Math.round(obj.commercialRelevance)))
      : typeof obj.commercial_relevance === 'number'
      ? Math.max(0, Math.min(100, Math.round(obj.commercial_relevance)))
      : 80;

  const engagementPotential =
    typeof obj.engagementPotential === 'number'
      ? Math.max(0, Math.min(100, Math.round(obj.engagementPotential)))
      : typeof obj.engagement_potential === 'number'
      ? Math.max(0, Math.min(100, Math.round(obj.engagement_potential)))
      : 80;

  const relevanceScore =
    typeof obj.relevanceScore === 'number'
      ? Math.max(0, Math.min(100, Math.round(obj.relevanceScore)))
      : 75;

  // Source URL validation
  const sourceUrl =
    typeof obj.sourceUrl === 'string'
      ? obj.sourceUrl.trim()
      : typeof obj.source_url === 'string'
      ? obj.source_url.trim()
      : 'https://ai.northsoft.is';

  const sourceName =
    typeof obj.sourceName === 'string'
      ? obj.sourceName.trim()
      : typeof obj.source_name === 'string'
      ? obj.source_name.trim()
      : 'NorthSoft Research';

  const publishedAt =
    typeof obj.publishedAt === 'string' ? obj.publishedAt.trim() : new Date().toISOString();

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      title,
      angle,
      hook,
      summary,
      keyPoints,
      contentPillar,
      postType,
      engagementQuestion,
      commercialRelevance,
      engagementPotential,
      relevanceScore,
      sourceUrl,
      sourceName,
      publishedAt,
    },
  };
}

/**
 * Legacy wrapper for CandidateTopicPayload.
 */
export function validateCandidateTopicOutput(
  rawAiOutput: string,
): ValidationResult<CandidateTopicPayload> {
  const ideaRes = validateCandidateIdeaOutput(rawAiOutput);
  if (!ideaRes.valid || !ideaRes.data) {
    return { valid: false, errors: ideaRes.errors };
  }

  const idea = ideaRes.data;
  let categories = [idea.contentPillar];
  try {
    const parsed = JSON.parse(rawAiOutput);
    if (Array.isArray(parsed.categories) && parsed.categories.length > 0) {
      categories = parsed.categories.map((c: unknown) => String(c));
    }
  } catch {
    // Ignore fallback
  }

  return {
    valid: true,
    data: {
      title: idea.title,
      summary: idea.summary,
      sourceUrl: idea.sourceUrl,
      sourceName: idea.sourceName,
      publishedAt: idea.publishedAt,
      relevanceScore: idea.relevanceScore,
      categories,
      keyClaims: idea.keyPoints,
      whyRelevant: idea.angle,
      confidence: 0.9,
    },
  };
}
