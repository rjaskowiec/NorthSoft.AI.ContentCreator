/**
 * NorthSoft.AI.ContentCreator — Content Taxonomy & Pillar Management
 *
 * Defines NorthSoft's content pillars, target small-business audience scope,
 * relevance evaluation rules, and explicit exclusion patterns.
 */

export type ContentPillar =
  | 'WEB_TECHNOLOGY'
  | 'ONLINE_PRESENCE'
  | 'MARKETING'
  | 'SMALL_BUSINESS'
  | 'AI_AUTOMATION'
  | 'LOCAL_BUSINESS';

export interface ContentPillarInfo {
  id: ContentPillar;
  name: string;
  description: string;
  keywords: string[];
}

export const CONTENT_PILLARS: Record<ContentPillar, ContentPillarInfo> = {
  WEB_TECHNOLOGY: {
    id: 'WEB_TECHNOLOGY',
    name: 'Web & Technology',
    description: 'Web development, website performance, mobile design, cybersecurity, APIs, and useful digital tools for modern businesses.',
    keywords: ['website', 'web', 'cybersecurity', 'ux', 'ui', 'performance', 'mobile', 'api', 'cloud', 'security', 'software', 'tool', 'hosting', 'domain'],
  },
  ONLINE_PRESENCE: {
    id: 'ONLINE_PRESENCE',
    name: 'Websites & Online Presence',
    description: 'Why businesses need websites, landing pages, trust & credibility, mobile usability, domain strategy, and online reputation.',
    keywords: ['website', 'online presence', 'landing page', 'credibility', 'conversion', 'contact form', 'call to action', 'mobile-first', 'trust', 'customer experience'],
  },
  MARKETING: {
    id: 'MARKETING',
    name: 'Marketing & Customer Acquisition',
    description: 'Local SEO, Google Business Profile, search visibility, customer acquisition, lead generation, reviews, and reputation management.',
    keywords: ['seo', 'local seo', 'google business', 'marketing', 'customer acquisition', 'lead generation', 'reviews', 'reputation', 'search', 'visibility', 'traffic'],
  },
  SMALL_BUSINESS: {
    id: 'SMALL_BUSINESS',
    name: 'Small Business & Productivity',
    description: 'Operational efficiency, workflow automation, digital transformation, reducing repetitive tasks, and small business productivity.',
    keywords: ['small business', 'local business', 'productivity', 'efficiency', 'process', 'workflow', 'automation', 'entrepreneur', 'operations', 'time-saving'],
  },
  AI_AUTOMATION: {
    id: 'AI_AUTOMATION',
    name: 'AI & Business Automation',
    description: 'Practical business AI use cases, customer service AI, document processing, intelligent workflow automation, and AI productivity.',
    keywords: ['ai', 'artificial intelligence', 'automation', 'chatbots', 'customer service ai', 'workflow', 'document processing', 'ai tools', 'business ai'],
  },
  LOCAL_BUSINESS: {
    id: 'LOCAL_BUSINESS',
    name: 'Local Business & Regional Context',
    description: 'Insights relevant to local service providers, tourism, restaurants, tradespeople, freelancers, and regional customer trends.',
    keywords: ['local business', 'iceland', 'icelandic', 'tourism', 'restaurant', 'tradesperson', 'freelancer', 'retailer', 'local search', 'service business'],
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
 * Evaluates the ContentPillar for a given title, summary, and categories.
 */
export function determineContentPillar(title: string, summary: string, categories: string[] = []): ContentPillar {
  const text = `${title} ${summary} ${categories.join(' ')}`.toLowerCase();

  // Check Iceland context
  if (text.includes('iceland') || text.includes('icelandic')) {
    return 'LOCAL_BUSINESS';
  }

  // Check AI & Automation
  if (text.includes('ai') || text.includes('artificial intelligence') || text.includes('chatbot') || text.includes('gpt')) {
    return 'AI_AUTOMATION';
  }

  // Check Marketing & Customer Acquisition
  if (text.includes('seo') || text.includes('marketing') || text.includes('acquisition') || text.includes('google business') || text.includes('lead') || text.includes('customers')) {
    return 'MARKETING';
  }

  // Check Websites & Online Presence
  if (text.includes('website') || text.includes('landing page') || text.includes('online presence') || text.includes('credibility') || text.includes('conversion')) {
    return 'ONLINE_PRESENCE';
  }

  // Check Small Business Operations
  if (text.includes('small business') || text.includes('productivity') || text.includes('efficiency') || text.includes('workflow') || text.includes('operations')) {
    return 'SMALL_BUSINESS';
  }

  // Check Local Business / Tourism / Regional Service
  if (text.includes('local business') || text.includes('tourism') || text.includes('restaurant') || text.includes('tradesperson') || text.includes('regional')) {
    return 'LOCAL_BUSINESS';
  }

  // Default to Web & Technology
  return 'WEB_TECHNOLOGY';
}

export interface RelevanceScoreResult {
  score: number; // 0 - 100
  passed: boolean;
  pillar: ContentPillar;
  reason: string;
}

/**
 * Evaluates relevance to NorthSoft's small-business digital audience.
 */
export function evaluateRelevance(title: string, summary: string, categories: string[] = []): RelevanceScoreResult {
  const exclusion = isExcludedTopic(title, summary);
  if (exclusion.excluded) {
    return {
      score: 0,
      passed: false,
      pillar: 'WEB_TECHNOLOGY',
      reason: exclusion.reason || 'Excluded topic category',
    };
  }

  const pillar = determineContentPillar(title, summary, categories);
  const text = `${title} ${summary}`.toLowerCase();

  let score = 50; // Baseline score

  // Positive signals
  const businessSignals = ['business', 'customer', 'website', 'online', 'sales', 'growth', 'local', 'service', 'automation', 'productivity', 'seo', 'google'];
  const matchedSignals = businessSignals.filter(sig => text.includes(sig));
  score += Math.min(30, matchedSignals.length * 6);

  // Pillar specific bonuses
  if (pillar === 'ONLINE_PRESENCE' || pillar === 'MARKETING' || pillar === 'AI_AUTOMATION') {
    score += 10;
  }

  // Penalties for overly deep compiler/kernel technical articles without business application
  if (text.includes('compiler') || text.includes('assembly') || text.includes('kernel') || text.includes('garbage collection')) {
    score -= 30;
  }

  score = Math.max(0, Math.min(100, score));
  const passed = score >= 55;

  return {
    score,
    passed,
    pillar,
    reason: passed
      ? `Relevant to NorthSoft small-business target audience (${pillar})`
      : `Score ${score} below NorthSoft relevance threshold of 55`,
  };
}
