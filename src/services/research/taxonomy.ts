/**
 * NorthSoft.AI.ContentCreator — Content Taxonomy & Pillar Management
 *
 * Defines NorthSoft's content pillars, target small-business audience scope,
 * relevance evaluation rules, and explicit exclusion patterns.
 */

export type ContentPillar =
  | 'WEBSITE'
  | 'MARKETING'
  | 'SALES'
  | 'AI'
  | 'SMALL_BUSINESS'
  | 'CUSTOMER_EXPERIENCE'
  | 'LOCAL_BUSINESS';

export interface ContentPillarInfo {
  id: ContentPillar;
  name: string;
  description: string;
  keywords: string[];
}

export const CONTENT_PILLARS: Record<ContentPillar, ContentPillarInfo> = {
  WEBSITE: {
    id: 'WEBSITE',
    name: 'Websites & Landing Pages',
    description: 'Modernizing websites, page speed, mobile UX, landing pages, contact forms, trust, website vs social media.',
    keywords: ['website', 'web', 'landing page', 'mobile', 'speed', 'ux', 'form', 'contact', 'trust', 'domain', 'hosting'],
  },
  MARKETING: {
    id: 'MARKETING',
    name: 'Marketing & Customer Acquisition',
    description: 'Local SEO, Google Business Profile, Facebook/Instagram ads, reviews, lead generation, local marketing, conversion.',
    keywords: ['seo', 'local seo', 'marketing', 'google business', 'ads', 'reviews', 'reputation', 'lead', 'acquisition', 'traffic', 'social media'],
  },
  SALES: {
    id: 'SALES',
    name: 'Sales & Conversion Process',
    description: 'Lead follow-up, quote forms, customer contact, presenting services, conversion optimization, sales process mistakes.',
    keywords: ['sales', 'conversion', 'quote', 'inquiry', 'follow-up', 'customer contact', 'offer', 'deal', 'revenue'],
  },
  AI: {
    id: 'AI',
    name: 'AI & Business Automation',
    description: 'Practical AI in small business, customer support AI, content creation, data analysis, saving time, AI tools.',
    keywords: ['ai', 'automation', 'chatbot', 'gpt', 'llm', 'time-saving', 'customer support', 'productivity', 'ai tools'],
  },
  SMALL_BUSINESS: {
    id: 'SMALL_BUSINESS',
    name: 'Small Business Productivity & Ops',
    description: 'Work organization, productivity, workflow automation, daily entrepreneur challenges, time saving, common mistakes.',
    keywords: ['small business', 'entrepreneur', 'productivity', 'efficiency', 'workflow', 'operations', 'time', 'management'],
  },
  CUSTOMER_EXPERIENCE: {
    id: 'CUSTOMER_EXPERIENCE',
    name: 'Customer Experience & Trust',
    description: 'First impression, response speed, ease of contact, reviews, customer trust, convenience.',
    keywords: ['customer experience', 'trust', 'first impression', 'response time', 'satisfaction', 'convenience', 'reputation'],
  },
  LOCAL_BUSINESS: {
    id: 'LOCAL_BUSINESS',
    name: 'Local Business & Regional Context',
    description: 'Icelandic market specific trends, local services, tourism, trade, seasonality, local customer behaviors.',
    keywords: ['iceland', 'icelandic', 'local business', 'tourism', 'restaurant', 'tradesperson', 'freelancer', 'local service', 'regional'],
  },
};

/**
 * Explicit exclusion list: Reject topics that are irrelevant, sensational, or risky for NorthSoft brand.
 */
const EXCLUDED_PATTERNS = [
  // Political & Controversial
  /\bpolitics\b/i, /\belection\b/i, /\bparliament\b/i, /\bdemocrat\b/i, /\brepublican\b/i, /\bwar\b/i, /\bconflict\b/i,
  // Entertainment & Sports
  /\bcelebrity\b/i, /\bgossip\b/i, /\bhollywood\b/i, /\bnetflix\b/i, /\bfootball\b/i, /\bsoccer\b/i, /\bbasketball\b/i, /\bpremier league\b/i, /\boscar\b/i,
  // Unsafe / Risky
  /\bmedical advice\b/i, /\bfinancial advice\b/i, /\bcrypto coin\b/i, /\bmemecoin\b/i, /\bget rich\b/i, /\bgambling\b/i, /\bcasino\b/i,
  // Pure sensationalism
  /\bshocking\b/i, /\bclickbait\b/i, /\brage\b/i, /\bscandal\b/i,
];

/**
 * Determines whether a topic matches explicit exclusion criteria.
 */
export function isExcludedTopic(title: string, summary: string): { excluded: boolean; reason?: string } {
  const combinedText = `${title} ${summary}`;

  for (const pattern of EXCLUDED_PATTERNS) {
    if (pattern.test(combinedText)) {
      return {
        excluded: true,
        reason: `Matched exclusion pattern: ${pattern.toString()}`,
      };
    }
  }

  return { excluded: false };
}

/**
 * Determines the ContentPillar for a given title, summary, and categories.
 */
export function determineContentPillar(title: string, summary: string, categories: string[] = []): ContentPillar {
  const text = `${title} ${summary} ${categories.join(' ')}`.toLowerCase();

  // Check Iceland context
  if (text.includes('iceland') || text.includes('icelandic')) {
    return 'LOCAL_BUSINESS';
  }

  // Check AI & Automation
  if (/\b(ai|artificial intelligence|chatbot|chatbots|gpt|llm|llms|genai|copilot)\b/i.test(text)) {
    return 'AI';
  }

  // Check Sales
  if (text.includes('quote') || text.includes('pricing') || text.includes('deal') || text.includes('proposal') || text.includes('follow-up')) {
    return 'SALES';
  }

  // Check Marketing & Customer Acquisition
  if (text.includes('seo') || text.includes('marketing') || text.includes('google business') || text.includes('lead') || text.includes('ads') || text.includes('social media')) {
    return 'MARKETING';
  }

  // Check Websites & Landing Pages
  if (text.includes('website') || text.includes('landing page') || text.includes('online presence') || text.includes('mobile') || text.includes('ux') || text.includes('form')) {
    return 'WEBSITE';
  }

  // Check Customer Experience
  if (text.includes('customer experience') || text.includes('first impression') || text.includes('response time') || text.includes('trust') || text.includes('reputation')) {
    return 'CUSTOMER_EXPERIENCE';
  }

  // Check Small Business Operations & Productivity
  if (text.includes('small business') || text.includes('productivity') || text.includes('efficiency') || text.includes('workflow') || text.includes('operations') || text.includes('entrepreneur')) {
    return 'SMALL_BUSINESS';
  }

  // Check Local Business / Services
  if (text.includes('local business') || text.includes('tourism') || text.includes('restaurant') || text.includes('tradesperson') || text.includes('local')) {
    return 'LOCAL_BUSINESS';
  }

  // Default to WEBSITE
  return 'WEBSITE';
}

export interface RelevanceScoreResult {
  score: number; // 0 - 100
  passed: boolean;
  pillar: ContentPillar;
  reason: string;
}

/**
 * Evaluates relevance and basic quality for small-business digital audience.
 */
export function evaluateRelevance(title: string, summary: string, categories: string[] = []): RelevanceScoreResult {
  const exclusion = isExcludedTopic(title, summary);
  if (exclusion.excluded) {
    return {
      score: 0,
      passed: false,
      pillar: 'WEBSITE',
      reason: exclusion.reason || 'Excluded topic category',
    };
  }

  const pillar = determineContentPillar(title, summary, categories);
  const text = `${title} ${summary}`.toLowerCase();

  let score = 50; // Baseline score

  // Positive signals relating to NorthSoft audience
  const businessSignals = [
    'business', 'customer', 'website', 'web', 'online', 'digital', 'sales', 'growth',
    'local', 'service', 'automation', 'productivity', 'seo', 'google', 'marketing',
    'lead', 'conversion', 'ai', 'ux', 'ui', 'tool', 'search', 'traffic', 'design',
  ];
  const matchedSignals = businessSignals.filter(sig => {
    if (sig === 'ai') return /\bai\b/i.test(text);
    if (sig === 'ui') return /\bui\b/i.test(text);
    if (sig === 'ux') return /\bux\b/i.test(text);
    return text.includes(sig);
  });
  score += Math.min(30, matchedSignals.length * 6);

  // Pillar specific bonuses
  if (pillar === 'WEBSITE' || pillar === 'MARKETING' || pillar === 'AI' || pillar === 'CUSTOMER_EXPERIENCE') {
    score += 10;
  }

  // Penalties for overly deep compiler/kernel technical articles without business application
  if (text.includes('compiler') || text.includes('assembly') || text.includes('kernel') || text.includes('garbage collection')) {
    score -= 30;
  }

  score = Math.max(0, Math.min(100, score));
  const passed = score >= 25; // Inclusive baseline tolerance for simple small-business inspiration

  return {
    score,
    passed,
    pillar,
    reason: passed
      ? `Relevant to NorthSoft target audience (${pillar})`
      : `Score ${score} below baseline relevance threshold of 25`,
  };
}

export interface DiversityScoreParams {
  sourceUsefulness: number; // 0-100
  businessRelevance: number; // 0-100
  engagementPotential: number; // 0-100
  commercialRelevance: number; // 0-100
  freshnessDays: number;
  isDuplicateAngle: boolean;
  recentPillarCount: number; // Number of recent publications in this pillar
  practicalValue?: number;
  simplicity?: number;
  topicNovelty?: number;
  sourceRelevance?: number;
  recentTopicPenalty?: number;
}

/**
 * Calculates holistic Content Score evaluating usefulness, simplicity, practical value,
 * engagement, commercial relevance, freshness, angle novelty, and rotation penalties.
 */
export function calculateContentScore(params: DiversityScoreParams): number {
  let score = 0;
  const practicalValue = params.practicalValue ?? 80;
  const simplicity = params.simplicity ?? 85;
  const topicNovelty = params.topicNovelty ?? 80;
  const sourceRelevance = params.sourceRelevance ?? 75;

  score += practicalValue * 0.25;
  score += simplicity * 0.2;
  score += params.engagementPotential * 0.2;
  score += params.commercialRelevance * 0.15;
  score += topicNovelty * 0.1;
  score += sourceRelevance * 0.1;

  // Freshness bonus
  if (params.freshnessDays <= 2) score += 10;
  else if (params.freshnessDays <= 7) score += 5;

  // Diversity bonus / Recent pillar penalty
  if (params.recentPillarCount === 0) {
    score += 15; // Diversity bonus for underrepresented pillars
  } else {
    score -= Math.min(30, params.recentPillarCount * 10);
  }

  // Topic rotation penalty
  if (params.recentTopicPenalty) {
    score -= Math.min(40, params.recentTopicPenalty);
  }

  // Duplicate angle penalty
  if (params.isDuplicateAngle) {
    score -= 50;
  }

  return Math.max(0, Math.round(score));
}

export interface SelectableCandidate<T> {
  item: T;
  pillar: ContentPillar;
  score: number;
}

export const MAX_AI_RESEARCH_CANDIDATES_PER_RUN = 25;
export const MAX_CANDIDATES_PER_PILLAR = 5;

/**
 * Multi-pillar diversity selection: Selects candidates up to maxTotal
 * while enforcing maxPerPillar constraint to avoid single-pillar domination.
 */
export function selectDiverseCandidates<T>(
  candidates: SelectableCandidate<T>[],
  maxTotal = MAX_AI_RESEARCH_CANDIDATES_PER_RUN,
  maxPerPillar = MAX_CANDIDATES_PER_PILLAR,
): SelectableCandidate<T>[] {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const pillarCounts: Record<string, number> = {};
  const selected: SelectableCandidate<T>[] = [];

  for (const candidate of sorted) {
    if (selected.length >= maxTotal) {
      break;
    }

    const currentCount = pillarCounts[candidate.pillar] || 0;
    if (currentCount < maxPerPillar) {
      selected.push(candidate);
      pillarCounts[candidate.pillar] = currentCount + 1;
    }
  }

  return selected;
}
