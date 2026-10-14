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
