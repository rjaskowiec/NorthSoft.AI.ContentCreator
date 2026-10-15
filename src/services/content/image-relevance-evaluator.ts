/**
 * NorthSoft.AI.ContentCreator — Image Business Relevance & Visual Context Evaluator
 *
 * Evaluates candidate images on 3 distinct, independent pillars:
 * 1. Business & Topic Context: Does the image depict contemporary commercial/digital/business activities
 *    directly relevant to NorthSoft's scope (websites, online stores, booking, payment, small business operations, customer interactions)?
 * 2. Visual Context Integrity: Rejects military, historical campaigns, battlefields, nature reserves, wildlife,
 *    and random landscapes unless explicitly called for by the topic.
 * 3. Commercial Rights & Quality Floor: Legal rights do NOT imply business suitability. An image MUST pass both
 *    safety/context filters and a strict positive relevance threshold. If no candidate qualifies, return 0 imports (safe fallback).
 */

export interface CandidateImageMeta {
  title: string;
  sourceUrl?: string;
  originalPageUrl?: string;
  author?: string;
  category?: string;
  keywords?: string;
  tags?: string[];
  discoveryQuery?: string;
  description?: string;
}

export interface ImageRelevanceResult {
  qualified: boolean;
  score: number; // 0 - 100
  reasons: string[];
  disqualificationReason?: string;
  detectedContext: 'BUSINESS_TECH' | 'DISQUALIFIED_CONTEXT' | 'GENERIC_INSUFFICIENT';
}

// Strict visual contexts that have ZERO place in NorthSoft small business content
export const DISQUALIFIED_VISUAL_CONTEXTS = [
  // Military & Warfare
  {
    name: 'MILITARY',
    pattern: /\b(?:army|soldier|soldiers|military|war|warfare|battle|battlefield|infantry|regiment|armored|armor|troops|wwii|ww2|world war|air force|navy|missile|tank|weapon|combat|veteran memorial|staff ride|campaign lessons)\b/i,
    reason: 'Military, warfare, armed forces, or historic battlefield scene',
  },
  // Nature Reserves, Wilderness & Wildlife
  {
    name: 'WILDERNESS_NATURE_RESERVE',
    pattern: /\b(?:nature reserve|wildlife reserve|pawling nature|national park|forest reserve|conservancy land|wilderness|mountain peak|jungle|waterfall|wild animal|wildlife photography|safari|canyon|hiking trail)\b/i,
    reason: 'Unconnected nature reserve, wilderness landscape, or wildlife photography without business context',
  },
  // Memorials, Tombs, Cemeteries
  {
    name: 'MEMORIAL_CEMETERY',
    pattern: /\b(?:cemetery|graveyard|grave|tomb|monument memorial|battlefield memorial|funeral|mausoleum)\b/i,
    reason: 'Cemetery, graveyard, tomb, or war memorial scene',
  },
  // Outdated / Historical Archives
  {
    name: 'HISTORICAL_ARCHIVE',
    pattern: /\b(?:19th century|18th century|1940s|1930s|1920s|1950s|1960s|1970s|ancient ruins|medieval|vintage archive|black and white archive|historic photo)\b/i,
    reason: 'Historical archive or outdated era photography',
  },
  // Disconnected Personal Celebrations / Domestic
  {
    name: 'DISCONNECTED_DOMESTIC',
    pattern: /\b(?:wedding dress|bridal|baby shower|newborn baby|toddler playing|bedroom decor|recipe baking|cooking soup|puppy dog|kitten cat)\b/i,
    reason: 'Domestic, baby, wedding, or pet snapshot without commercial application',
  },
];

// Contemporary business, small enterprise, and digital operational signals
export const POSITIVE_BUSINESS_SIGNALS = [
  // Digital / Web / Tech
  /\b(?:website|landing page|mobile screen|smartphone|tablet|laptop|computer|screen|monitor|software|app|dashboard|ui|ux|analytics|code|programming|developer|browser|checkout|online store|ecommerce|e-commerce)\b/i,
  // Commercial / Small Business Operations
  /\b(?:small business|store|shop|retail|boutique|cafe|coffee shop|restaurant|salon|clinic|counter|cashier|pos|point of sale|terminal|payment|credit card|card reader|invoice|receipt)\b/i,
  // Appointments / Client Interaction
  /\b(?:appointment|booking|calendar|schedule|meeting|client|consulting|customer service|customer support|phone call|desk|workspace|office|teamwork|coworking)\b/i,
  // Trades & Local Enterprise
  /\b(?:workshop|mechanic|electrician|plumber|craftsman|warehouse|logistics|shipping|delivery|package|inventory)\b/i,
];

/**
 * Evaluates whether an image candidate is truly relevant to NorthSoft's business offerings and topic.
 */
export function evaluateImageRelevance(
  image: CandidateImageMeta,
  topicOrQuery: string,
): ImageRelevanceResult {
  const title = (image.title || '').trim();
  const keywords = (image.keywords || '').trim();
  const tags = (image.tags || []).join(' ');
  const desc = (image.description || '').trim();
  const query = (image.discoveryQuery || topicOrQuery || '').trim();

  const combinedMeta = `${title} ${keywords} ${tags} ${desc}`.toLowerCase();
  const reasons: string[] = [];

  // Step 1: Disqualification filters (Strict Brand & Context Integrity)
  for (const item of DISQUALIFIED_VISUAL_CONTEXTS) {
    if (item.pattern.test(combinedMeta)) {
      return {
        qualified: false,
        score: 0,
        reasons: [`Disqualified context [${item.name}]: ${item.reason}`],
        disqualificationReason: item.reason,
        detectedContext: 'DISQUALIFIED_CONTEXT',
      };
    }
  }

  // Step 2: Positive Business & Operational Verification
  let businessSignalScore = 0;
  for (const signal of POSITIVE_BUSINESS_SIGNALS) {
    if (signal.test(combinedMeta)) {
      businessSignalScore += 25;
    }
  }

  // Check specific semantic overlap between image metadata and search query/topic
  const queryWords = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !['and', 'the', 'for', 'with', 'your', 'about', 'from'].includes(w));

  let queryOverlapCount = 0;
  for (const word of queryWords) {
    if (combinedMeta.includes(word)) {
      queryOverlapCount++;
    }
  }

  // Require concrete grounds: either multiple positive business signals OR direct meaningful query overlap with at least one business signal
  const hasStrongBusinessAnchoring = businessSignalScore >= 50;
  const hasModerateBusinessWithQuery = businessSignalScore >= 25 && queryOverlapCount >= 1;

  if (!hasStrongBusinessAnchoring && !hasModerateBusinessWithQuery) {
    return {
      qualified: false,
      score: Math.min(30, businessSignalScore),
      reasons: [
        'Insufficient business context: image does not depict contemporary small business operations, digital interfaces, customers, or trade workspaces.',
      ],
      disqualificationReason: 'Lacks verifiable commercial/business operational context',
      detectedContext: 'GENERIC_INSUFFICIENT',
    };
  }

  const finalScore = Math.min(100, 40 + businessSignalScore + (queryOverlapCount * 15));
  reasons.push(
    `Verified business relevance: matches operational criteria with score ${finalScore} (business signals: ${businessSignalScore}, query overlap: ${queryOverlapCount}).`,
  );

  return {
    qualified: finalScore >= 60,
    score: finalScore,
    reasons,
    detectedContext: 'BUSINESS_TECH',
  };
}

/**
 * Filters a series of candidate images from an import run to eliminate session duplicates
 * and preserve visual variety.
 */
export function filterDiverseCandidates<T extends CandidateImageMeta>(
  candidates: T[],
  maxSeriesCount = 2,
): T[] {
  const result: T[] = [];
  const authorWorkCounts = new Map<string, number>();
  const titleStemCounts = new Map<string, number>();

  for (const cand of candidates) {
    // 1. Author session cap: max N images from the same creator in a single import
    const author = (cand.author || 'unknown').toLowerCase().trim();
    if (author !== 'unknown' && author !== 'openverse author') {
      const count = authorWorkCounts.get(author) || 0;
      if (count >= maxSeriesCount) continue;
    }

    // 2. Title stem / event series cap: e.g. "Tunisia Staff Ride..." or "Yoga Pawling..."
    const titleStem = (cand.title || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .slice(0, 4)
      .join(' ');

    if (titleStem.length > 5) {
      const stemCount = titleStemCounts.get(titleStem) || 0;
      if (stemCount >= maxSeriesCount) continue;
      titleStemCounts.set(titleStem, stemCount + 1);
    }

    if (author !== 'unknown' && author !== 'openverse author') {
      authorWorkCounts.set(author, (authorWorkCounts.get(author) || 0) + 1);
    }

    result.push(cand);
  }

  return result;
}

export interface ImageSemanticProfile {
  sceneSummary: string;
  subjects: string;
  action: string;
  objects: string;
  businessContext: string;
  emotionalTone: 'positive' | 'neutral' | 'problem-aware' | 'collaborative';
  visualMotif: string;
  targetCategory: string;
  keywords: string[];
  provenance: {
    source: 'ai_generated' | 'discovered' | 'manual';
    author?: string;
    license?: string;
    model?: string;
  };
}

export interface PostMatchCriteria {
  postTitle: string;
  category: string;
  postContent: string;
  emotionalIntent?: 'positive' | 'neutral' | 'problem-aware' | 'collaborative';
}

export interface PostImageMatchResult {
  qualified: boolean;
  score: number; // 0 - 100
  reasons: string[];
  disqualificationReason?: string;
  emotionalCongruence: 'EXCELLENT' | 'ACCEPTABLE' | 'CONTRADICTORY';
}

/**
 * Parses semantic profile from image notes or derives structured profile from metadata.
 * Does NOT invent fake details if unverified.
 */
export function extractOrDeriveSemanticProfile(
  imageMeta: {
    title: string;
    category: string;
    keywords?: string | null;
    description?: string | null;
    notes?: string | null;
    author?: string | null;
    license?: string | null;
    sourceType?: string | null;
  },
): ImageSemanticProfile {
  if (imageMeta.notes) {
    try {
      const parsed = JSON.parse(imageMeta.notes);
      if (parsed.semanticProfile) {
        return parsed.semanticProfile as ImageSemanticProfile;
      }
      if (parsed.sceneConcept) {
        const sc = parsed.sceneConcept;
        return {
          sceneSummary: sc.promptDescription || imageMeta.description || imageMeta.title,
          subjects: sc.relationship || 'Professional individual or team',
          action: sc.action || 'Engaging in business workflow',
          objects: sc.visualMotif || 'Modern digital devices and workspace materials',
          businessContext: sc.businessNeed || imageMeta.category,
          emotionalTone: (sc.emotionalTone as ImageSemanticProfile['emotionalTone']) || 'neutral',
          visualMotif: sc.visualMotif || 'Clean workspace',
          targetCategory: imageMeta.category,
          keywords: (imageMeta.keywords || '').split(/,\s*/).filter(Boolean),
          provenance: {
            source: 'ai_generated',
            author: imageMeta.author || 'NorthSoft',
            license: imageMeta.license || 'NorthSoft internal use',
            model: parsed.model || '@cf/black-forest-labs/flux-1-schnell',
          },
        };
      }
    } catch {
      // Notes is plain text or unparseable JSON
    }
  }

  // Derive conservative profile from available metadata without faking unseen details
  const title = imageMeta.title || '';
  const desc = imageMeta.description || '';
  const kw = (imageMeta.keywords || '').split(/,\s*/).filter(Boolean);
  const combined = `${title} ${desc} ${kw.join(' ')}`.toLowerCase();

  let emotionalTone: ImageSemanticProfile['emotionalTone'] = 'neutral';
  if (/\b(?:problem|struggle|frustrated|loss|drop|error|broken|difficult|challenge)\b/i.test(combined)) {
    emotionalTone = 'problem-aware';
  } else if (/\b(?:success|growth|thriving|celebrat|happy|delight|win|achievement)\b/i.test(combined)) {
    emotionalTone = 'positive';
  } else if (/\b(?:meeting|collaborat|team|together|consulting|discussion|partnership)\b/i.test(combined)) {
    emotionalTone = 'collaborative';
  }

  let visualMotif = 'General business environment';
  if (combined.includes('tablet') || combined.includes('counter') || combined.includes('pos')) {
    visualMotif = 'Tablet interaction';
  } else if (combined.includes('screen') || combined.includes('monitor') || combined.includes('tv')) {
    visualMotif = 'Team or workstation screen';
  } else if (combined.includes('laptop') || combined.includes('desk')) {
    visualMotif = 'Desk setup with laptop';
  } else if (combined.includes('phone') || combined.includes('mobile')) {
    visualMotif = 'Mobile smartphone interaction';
  }

  return {
    sceneSummary: desc || title,
    subjects: combined.includes('team') || combined.includes('group') || combined.includes('people') ? 'Group or team' : 'Professional',
    action: 'Business activity',
    objects: visualMotif,
    businessContext: imageMeta.category,
    emotionalTone,
    visualMotif,
    targetCategory: imageMeta.category,
    keywords: kw,
    provenance: {
      source: (imageMeta.sourceType?.toLowerCase() as 'discovered' | 'manual') || 'discovered',
      author: imageMeta.author || undefined,
      license: imageMeta.license || undefined,
    },
  };
}

/**
 * 6-Pillar Selective Post-to-Image Matching Algorithm
 * Evaluates semantic and emotional alignment between post draft and candidate image.
 * Returns match score (0-100), qualification status (score >= 65), and diagnostic reasons.
 */
export function evaluatePostImageMatch(
  imageMeta: {
    id: string;
    title: string;
    category: string;
    keywords?: string | null;
    description?: string | null;
    notes?: string | null;
    usageCount?: number;
    lastUsedAt?: string | null;
    visualRelevanceScore?: number;
  },
  post: PostMatchCriteria,
): PostImageMatchResult {
  const reasons: string[] = [];
  const profile = extractOrDeriveSemanticProfile({
    title: imageMeta.title,
    category: imageMeta.category,
    keywords: imageMeta.keywords,
    description: imageMeta.description,
    notes: imageMeta.notes,
  });

  const postText = `${post.postTitle} ${post.postContent}`.toLowerCase();
  const kwList = Array.isArray(profile.keywords) ? profile.keywords : [];
  const imageCorpus = `${profile.sceneSummary} ${profile.visualMotif} ${kwList.join(' ')} ${imageMeta.title} ${imageMeta.description || ''}`.toLowerCase();

  // 1. Pillar: Category alignment (max 30 pts)
  const postCat = post.category.toLowerCase().trim();
  const imgCat = imageMeta.category.toLowerCase().trim();
  let categoryScore: number;

  if (postCat === imgCat) {
    categoryScore = 30;
    reasons.push(`Exact category match (${imageMeta.category})`);
  } else if (postCat.includes(imgCat) || imgCat.includes(postCat)) {
    categoryScore = 18;
    reasons.push(`Partial category match (${imageMeta.category})`);
  } else {
    categoryScore = 0;
    reasons.push(`Cross-category candidate (${imageMeta.category})`);
  }

  // 2. Pillar: Topic & operational context fit (max 30 pts)
  const topicTokens = postText
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !['with', 'from', 'your', 'this', 'that', 'have', 'more', 'about'].includes(w));

  let matchedTokens = 0;
  for (const token of topicTokens) {
    if (imageCorpus.includes(token)) {
      matchedTokens++;
    }
  }

  let topicScore: number;
  if (matchedTokens >= 3) {
    topicScore = 30;
    reasons.push(`Strong topic vocabulary overlap (${matchedTokens} terms matched)`);
  } else if (matchedTokens >= 1) {
    topicScore = 15;
    reasons.push(`Moderate topic overlap (${matchedTokens} term(s) matched)`);
  } else {
    topicScore = 0;
    reasons.push('No direct vocabulary overlap');
  }

  // 3. Pillar: Emotional & tone congruence (max 20 pts)
  const expectedTone = post.emotionalIntent || 'neutral';
  const imgTone = profile.emotionalTone;
  let emotionScore: number;
  let emotionalCongruence: PostImageMatchResult['emotionalCongruence'];

  if (expectedTone === imgTone) {
    emotionScore = 20;
    emotionalCongruence = 'EXCELLENT';
    reasons.push(`Direct emotional resonance: ${expectedTone}`);
  } else if (
    (expectedTone === 'collaborative' && imgTone === 'positive') ||
    (expectedTone === 'positive' && imgTone === 'collaborative') ||
    imgTone === 'neutral' ||
    expectedTone === 'neutral'
  ) {
    emotionScore = 12;
    emotionalCongruence = 'ACCEPTABLE';
    reasons.push(`Compatible tone (${expectedTone} post vs ${imgTone} visual)`);
  } else {
    // 4. Pillar: Anti-contradiction check
    // e.g. problem-aware post (loss, drops, bugs) paired with celebratory/joyful image, or analytical post with cheerful party
    emotionalCongruence = 'CONTRADICTORY';
    emotionScore = -25;
    reasons.push(`Tone contradiction warning: post is ${expectedTone} but image expresses ${imgTone}`);
  }

  // 5. Pillar: Visual quality & relevance score (max 10 pts)
  const visualRelevance = imageMeta.visualRelevanceScore ?? 0.7;
  const qualityScore = Math.round(visualRelevance * 10);
  reasons.push(`Visual quality and relevance rating: ${qualityScore}/10`);

  // 6. Pillar: Recency and reuse factor (bonus or penalty, max 10 pts)
  let reuseScore = 10; // unused bonus
  if (imageMeta.usageCount && imageMeta.usageCount > 0) {
    if (imageMeta.lastUsedAt) {
      const lastUsedMs = new Date(imageMeta.lastUsedAt).getTime();
      const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
      if (Date.now() - lastUsedMs < ninetyDaysMs) {
        return {
          qualified: false,
          score: 0,
          reasons: ['Disqualified: Image was used within the last 90 days.'],
          disqualificationReason: '90-day reuse window policy violation',
          emotionalCongruence,
        };
      }
    }
    reuseScore = 5;
    reasons.push('Eligible for quarterly reuse');
  } else {
    reasons.push('Unused library asset bonus');
  }

  const rawTotal = categoryScore + topicScore + emotionScore + qualityScore + reuseScore;
  const finalScore = Math.max(0, Math.min(100, rawTotal));

  // Minimum threshold: 65/100, must have at least some category or topic grounding, and NO tone contradiction
  const hasGrounding = categoryScore > 0 || topicScore >= 15;
  const qualified = finalScore >= 65 && hasGrounding && emotionalCongruence !== 'CONTRADICTORY';

  return {
    qualified,
    score: finalScore,
    reasons,
    disqualificationReason: !qualified
      ? emotionalCongruence === 'CONTRADICTORY'
        ? `Contradictory visual tone (${expectedTone} post vs ${imgTone} visual)`
        : `Insufficient alignment score (${finalScore}/100, minimum 65 required)`
      : undefined,
    emotionalCongruence,
  };
}

