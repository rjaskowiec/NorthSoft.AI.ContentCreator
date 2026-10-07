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
    description:
      'Modernizing websites, page speed, mobile UX, landing pages, contact forms, trust, website vs social media.',
    keywords: [
      'website',
      'web',
      'landing page',
      'mobile',
      'speed',
      'ux',
      'form',
      'contact',
      'trust',
      'domain',
      'hosting',
    ],
  },
  MARKETING: {
    id: 'MARKETING',
    name: 'Marketing & Customer Acquisition',
    description:
      'Local SEO, Google Business Profile, Facebook/Instagram ads, reviews, lead generation, local marketing, conversion.',
    keywords: [
      'seo',
      'local seo',
      'marketing',
      'google business',
      'ads',
      'reviews',
      'reputation',
      'lead',
      'acquisition',
      'traffic',
      'social media',
    ],
  },
  SALES: {
    id: 'SALES',
    name: 'Sales & Conversion Process',
    description:
      'Lead follow-up, quote forms, customer contact, presenting services, conversion optimization, sales process mistakes.',
    keywords: [
      'sales',
      'conversion',
      'quote',
      'inquiry',
      'follow-up',
      'customer contact',
      'offer',
      'deal',
      'revenue',
    ],
  },
  AI: {
    id: 'AI',
    name: 'AI & Business Automation',
    description:
      'Practical AI in small business, customer support AI, content creation, data analysis, saving time, AI tools.',
    keywords: [
      'ai',
      'automation',
      'chatbot',
      'gpt',
      'llm',
      'time-saving',
      'customer support',
      'productivity',
      'ai tools',
    ],
  },
  SMALL_BUSINESS: {
    id: 'SMALL_BUSINESS',
    name: 'Small Business Productivity & Ops',
    description:
      'Work organization, productivity, workflow automation, daily entrepreneur challenges, time saving, common mistakes.',
    keywords: [
      'small business',
      'entrepreneur',
      'productivity',
      'efficiency',
      'workflow',
      'operations',
      'time',
      'management',
    ],
  },
  CUSTOMER_EXPERIENCE: {
    id: 'CUSTOMER_EXPERIENCE',
    name: 'Customer Experience & Trust',
    description:
      'First impression, response speed, ease of contact, reviews, customer trust, convenience.',
    keywords: [
      'customer experience',
      'trust',
      'first impression',
      'response time',
      'satisfaction',
      'convenience',
      'reputation',
    ],
  },
  LOCAL_BUSINESS: {
    id: 'LOCAL_BUSINESS',
    name: 'Local Business & Regional Context',
    description:
      'Icelandic market specific trends, local services, tourism, trade, seasonality, local customer behaviors.',
    keywords: [
      'iceland',
      'icelandic',
      'local business',
      'tourism',
      'restaurant',
      'tradesperson',
      'freelancer',
      'local service',
      'regional',
    ],
  },
};

/**
 * Controlled Topic Clusters for NorthSoft.
 * Prevents arbitrary string hallucination and groups subtopics into semantic families
 * for intelligent cross-topic fatigue and cooldown enforcement.
 */
export type TopicClusterFamily =
  | 'search_discovery'
  | 'website_performance_ux'
  | 'conversion_lead_capture'
  | 'ai_automation_workflows'
  | 'customer_trust_reputation'
  | 'small_biz_operations'
  | 'local_market_dynamics';

export type TopicClusterKey =
  | 'ai_search_visibility'
  | 'aeo_answer_engines'
  | 'local_seo_maps'
  | 'website_speed_conversion'
  | 'mobile_first_experience'
  | 'landing_page_clarity'
  | 'lead_response_time'
  | 'contact_form_friction'
  | 'pricing_service_transparency'
  | 'chatbot_first_touch'
  | 'internal_workflow_automation'
  | 'ai_content_overload'
  | 'reviews_social_proof'
  | 'brand_credibility_trust'
  | 'customer_communication_channels'
  | 'time_management_entrepreneur'
  | 'tech_stack_simplification'
  | 'local_competition_positioning'
  | 'seasonal_demand_shifts'
  | 'local_service_booking';

export interface TopicClusterInfo {
  id: TopicClusterKey;
  name: string;
  pillar: ContentPillar;
  family: TopicClusterFamily;
  description: string;
  keywords: string[];
}

export const TOPIC_CLUSTERS: Record<TopicClusterKey, TopicClusterInfo> = {
  ai_search_visibility: {
    id: 'ai_search_visibility',
    name: 'AI Search & Perplexity / ChatGPT Visibility',
    pillar: 'AI',
    family: 'search_discovery',
    description: 'How AI search engines cite and recommend local businesses.',
    keywords: [
      'chatgpt search',
      'perplexity',
      'ai search',
      'generative search',
      'ai discovery',
      'searchgpt',
    ],
  },
  aeo_answer_engines: {
    id: 'aeo_answer_engines',
    name: 'Answer Engine Optimization (AEO)',
    pillar: 'MARKETING',
    family: 'search_discovery',
    description: 'Structuring website answers and schema for AI voice and answer tools.',
    keywords: ['aeo', 'answer engine', 'structured data', 'faq', 'schema', 'knowledge graph'],
  },
  local_seo_maps: {
    id: 'local_seo_maps',
    name: 'Local SEO & Google Business Profile',
    pillar: 'MARKETING',
    family: 'search_discovery',
    description: 'Google Maps rankings, local pack, opening hours, local citations.',
    keywords: [
      'google maps',
      'local seo',
      'google business profile',
      'gbp',
      'local pack',
      'citations',
    ],
  },
  website_speed_conversion: {
    id: 'website_speed_conversion',
    name: 'Website Speed & Core Web Vitals',
    pillar: 'WEBSITE',
    family: 'website_performance_ux',
    description: 'Page speed, load times, image compression, mobile bounce rates.',
    keywords: [
      'page speed',
      'slow website',
      'core web vitals',
      'load time',
      'performance',
      'lighthouse',
    ],
  },
  mobile_first_experience: {
    id: 'mobile_first_experience',
    name: 'Mobile UX & Smartphone Navigation',
    pillar: 'WEBSITE',
    family: 'website_performance_ux',
    description: 'Mobile layout, responsive design, thumb navigation, mobile readability.',
    keywords: ['mobile', 'smartphone', 'responsive', 'touch', 'mobile-friendly', 'viewport'],
  },
  landing_page_clarity: {
    id: 'landing_page_clarity',
    name: 'Landing Page Value Proposition & Clarity',
    pillar: 'WEBSITE',
    family: 'website_performance_ux',
    description: 'Clear messaging above the fold, headlines, removing website clutter.',
    keywords: ['landing page', 'value proposition', 'headline', 'clarity', 'call to action', 'cta'],
  },
  lead_response_time: {
    id: 'lead_response_time',
    name: 'Speed to Lead & Follow-Up Time',
    pillar: 'SALES',
    family: 'conversion_lead_capture',
    description:
      'Response latency to web forms, automated SMS/email alerts, losing deals to competitors.',
    keywords: [
      'speed to lead',
      'response time',
      'quote reply',
      'inquiry delay',
      'follow up',
      'lead loss',
    ],
  },
  contact_form_friction: {
    id: 'contact_form_friction',
    name: 'Contact Form & Booking Friction',
    pillar: 'SALES',
    family: 'conversion_lead_capture',
    description:
      'Reducing unnecessary form fields, one-click contact paths, frictionless inquiries.',
    keywords: [
      'contact form',
      'form fields',
      'lead friction',
      'quote form',
      'abandonment',
      'form drop-off',
    ],
  },
  pricing_service_transparency: {
    id: 'pricing_service_transparency',
    name: 'Pricing & Service Transparency',
    pillar: 'SALES',
    family: 'conversion_lead_capture',
    description:
      'Publishing starter prices, transparent scope, overcoming customer fear of hidden costs.',
    keywords: [
      'pricing',
      'transparent pricing',
      'packages',
      'quote transparency',
      'hidden fees',
      'starting rate',
    ],
  },
  chatbot_first_touch: {
    id: 'chatbot_first_touch',
    name: '24/7 AI Chat & First Touch Lead Capture',
    pillar: 'AI',
    family: 'ai_automation_workflows',
    description: 'AI chatbots capturing client questions after hours and qualifying prospects.',
    keywords: [
      'chatbot',
      'ai chat',
      'after hours',
      'weekend leads',
      'lead qualification',
      'ai assistant',
    ],
  },
  internal_workflow_automation: {
    id: 'internal_workflow_automation',
    name: 'Internal Workflow & Spreadsheet Automation',
    pillar: 'SMALL_BUSINESS',
    family: 'ai_automation_workflows',
    description:
      'Connecting web forms to email/CRM, eliminating manual copy-pasting and spreadsheet busywork.',
    keywords: [
      'spreadsheet',
      'zapier',
      'manual data entry',
      'workflow automation',
      'repetitive work',
      'crm sync',
    ],
  },
  ai_content_overload: {
    id: 'ai_content_overload',
    name: 'Standing Out in the AI Content Flood',
    pillar: 'MARKETING',
    family: 'ai_automation_workflows',
    description: 'Authentic local authority vs generic AI-generated articles and social noise.',
    keywords: [
      'ai spam',
      'authentic content',
      'real expertise',
      'content overload',
      'original insights',
      'human touch',
    ],
  },
  reviews_social_proof: {
    id: 'reviews_social_proof',
    name: 'Customer Reviews & Social Proof',
    pillar: 'CUSTOMER_EXPERIENCE',
    family: 'customer_trust_reputation',
    description: 'Systematic review generation on Google, testimonials, building reputation.',
    keywords: [
      'reviews',
      'google reviews',
      'testimonials',
      'star rating',
      'social proof',
      'reputation',
    ],
  },
  brand_credibility_trust: {
    id: 'brand_credibility_trust',
    name: 'Website Credibility & Trust Signals',
    pillar: 'CUSTOMER_EXPERIENCE',
    family: 'customer_trust_reputation',
    description: 'Professional domain, secure SSL, contact details, photos, looking established.',
    keywords: [
      'trust signals',
      'credibility',
      'security',
      'professionalism',
      'brand image',
      'legitimacy',
    ],
  },
  customer_communication_channels: {
    id: 'customer_communication_channels',
    name: 'Modern Customer Communication Channels',
    pillar: 'CUSTOMER_EXPERIENCE',
    family: 'customer_trust_reputation',
    description: 'Meeting customer preferences: WhatsApp, SMS, web chat vs unanswered phone calls.',
    keywords: [
      'whatsapp',
      'sms',
      'communication channel',
      'messaging',
      'phone tag',
      'missed calls',
    ],
  },
  time_management_entrepreneur: {
    id: 'time_management_entrepreneur',
    name: 'Founder Bottleneck & Operations Freedom',
    pillar: 'SMALL_BUSINESS',
    family: 'small_biz_operations',
    description: 'Overwhelmed owner wearing all hats, delegating tech tasks, buying back time.',
    keywords: [
      'founder bottleneck',
      'time management',
      'wearing all hats',
      'owner overwhelm',
      'busywork',
      'delegation',
    ],
  },
  tech_stack_simplification: {
    id: 'tech_stack_simplification',
    name: 'Tech Stack Simplification',
    pillar: 'SMALL_BUSINESS',
    family: 'small_biz_operations',
    description: 'Too many disconnected subscriptions, simplifying digital tools for small teams.',
    keywords: [
      'tool sprawl',
      'software subscriptions',
      'app fatigue',
      'simple tech',
      'unified stack',
      'fragmentation',
    ],
  },
  local_competition_positioning: {
    id: 'local_competition_positioning',
    name: 'Local Business vs Aggregators & Big Platforms',
    pillar: 'LOCAL_BUSINESS',
    family: 'small_biz_operations',
    description:
      'Owning direct customer relationships instead of paying commissions to middleman platforms.',
    keywords: [
      'middleman',
      'platform fees',
      'direct booking',
      'local independence',
      'commissions',
      'direct sales',
    ],
  },
  seasonal_demand_shifts: {
    id: 'seasonal_demand_shifts',
    name: 'Seasonal Shifts & Local Tourism Dynamics',
    pillar: 'LOCAL_BUSINESS',
    family: 'local_market_dynamics',
    description: 'Preparing online presence for seasonal tourist waves or winter lulls in Iceland.',
    keywords: [
      'seasonality',
      'tourism',
      'winter season',
      'summer peak',
      'demand shift',
      'local trade',
    ],
  },
  local_service_booking: {
    id: 'local_service_booking',
    name: 'Frictionless Online Appointments & Booking',
    pillar: 'LOCAL_BUSINESS',
    family: 'local_market_dynamics',
    description: 'Self-serve booking for tradespeople, clinics, salons, reducing phone tag.',
    keywords: [
      'online booking',
      'appointments',
      'scheduling',
      'self-service',
      'calendar',
      'service booking',
    ],
  },
};

/**
 * Returns all clusters belonging to a given semantic family.
 */
export function getClustersInFamily(family: TopicClusterFamily): TopicClusterKey[] {
  return (Object.keys(TOPIC_CLUSTERS) as TopicClusterKey[]).filter(
    (key) => TOPIC_CLUSTERS[key].family === family,
  );
}

/**
 * Returns neighbor clusters that share the same family (excluding the given key).
 */
export function getNeighborClusters(clusterKey: TopicClusterKey): TopicClusterKey[] {
  const cluster = TOPIC_CLUSTERS[clusterKey];
  if (!cluster) return [];
  return (Object.keys(TOPIC_CLUSTERS) as TopicClusterKey[]).filter(
    (key) => key !== clusterKey && TOPIC_CLUSTERS[key].family === cluster.family,
  );
}

/**
 * Resolves a cluster key from arbitrary text, LLM output, or keyword signals.
 * Guarantees a valid, controlled TopicClusterKey return value.
 */
export function resolveClusterKey(
  suggestedKey?: string,
  pillarHint?: ContentPillar,
  contextText?: string,
): TopicClusterKey {
  const normKey = (suggestedKey || '').trim().toLowerCase().replace(/[-\s]/g, '_');

  // 1. Exact match
  if (normKey in TOPIC_CLUSTERS) {
    return normKey as TopicClusterKey;
  }

  // 2. Controlled Alias / Synonym mapping
  const ALIASES: Record<string, TopicClusterKey> = {
    ai_search: 'ai_search_visibility',
    searchgpt: 'ai_search_visibility',
    chatgpt_search: 'ai_search_visibility',
    perplexity: 'ai_search_visibility',
    aeo: 'aeo_answer_engines',
    answer_engine: 'aeo_answer_engines',
    answer_engine_optimization: 'aeo_answer_engines',
    local_seo: 'local_seo_maps',
    google_maps: 'local_seo_maps',
    google_business: 'local_seo_maps',
    page_speed: 'website_speed_conversion',
    speed: 'website_speed_conversion',
    core_web_vitals: 'website_speed_conversion',
    mobile: 'mobile_first_experience',
    mobile_ux: 'mobile_first_experience',
    landing_page: 'landing_page_clarity',
    conversion: 'landing_page_clarity',
    speed_to_lead: 'lead_response_time',
    follow_up: 'lead_response_time',
    lead_response: 'lead_response_time',
    forms: 'contact_form_friction',
    contact_forms: 'contact_form_friction',
    pricing: 'pricing_service_transparency',
    prices: 'pricing_service_transparency',
    chatbot: 'chatbot_first_touch',
    ai_chat: 'chatbot_first_touch',
    chatbots: 'chatbot_first_touch',
    automation: 'internal_workflow_automation',
    spreadsheets: 'internal_workflow_automation',
    workflow: 'internal_workflow_automation',
    ai_overload: 'ai_content_overload',
    reviews: 'reviews_social_proof',
    social_proof: 'reviews_social_proof',
    trust: 'brand_credibility_trust',
    credibility: 'brand_credibility_trust',
    whatsapp: 'customer_communication_channels',
    messaging: 'customer_communication_channels',
    entrepreneur: 'time_management_entrepreneur',
    delegation: 'time_management_entrepreneur',
    tech_stack: 'tech_stack_simplification',
    apps: 'tech_stack_simplification',
    competition: 'local_competition_positioning',
    aggregators: 'local_competition_positioning',
    seasonality: 'seasonal_demand_shifts',
    booking: 'local_service_booking',
    appointments: 'local_service_booking',
  };

  if (normKey in ALIASES) {
    return ALIASES[normKey]!;
  }

  // 3. Fallback: match keywords in context text
  const combined = `${normKey} ${contextText || ''}`.toLowerCase();
  for (const [key, info] of Object.entries(TOPIC_CLUSTERS) as [
    TopicClusterKey,
    TopicClusterInfo,
  ][]) {
    for (const kw of info.keywords) {
      if (combined.includes(kw)) {
        return key;
      }
    }
  }

  // 4. Default cluster per pillar
  const PILLAR_DEFAULTS: Record<ContentPillar, TopicClusterKey> = {
    WEBSITE: 'website_speed_conversion',
    MARKETING: 'local_seo_maps',
    SALES: 'lead_response_time',
    AI: 'ai_search_visibility',
    SMALL_BUSINESS: 'internal_workflow_automation',
    CUSTOMER_EXPERIENCE: 'reviews_social_proof',
    LOCAL_BUSINESS: 'local_competition_positioning',
  };

  return pillarHint
    ? PILLAR_DEFAULTS[pillarHint] || 'website_speed_conversion'
    : 'website_speed_conversion';
}

/**
 * Explicit exclusion list: Reject topics that are irrelevant, sensational, or risky for NorthSoft brand.
 */
const EXCLUDED_PATTERNS = [
  // Political & Controversial
  /\bpolitics\b/i,
  /\belection\b/i,
  /\bparliament\b/i,
  /\bdemocrat\b/i,
  /\brepublican\b/i,
  /\bwar\b/i,
  /\bconflict\b/i,
  // Entertainment & Sports
  /\bcelebrity\b/i,
  /\bgossip\b/i,
  /\bhollywood\b/i,
  /\bnetflix\b/i,
  /\bfootball\b/i,
  /\bsoccer\b/i,
  /\bbasketball\b/i,
  /\bpremier league\b/i,
  /\boscar\b/i,
  // Unsafe / Risky
  /\bmedical advice\b/i,
  /\bfinancial advice\b/i,
  /\bcrypto coin\b/i,
  /\bmemecoin\b/i,
  /\bget rich\b/i,
  /\bgambling\b/i,
  /\bcasino\b/i,
  // Pure sensationalism
  /\bshocking\b/i,
  /\bclickbait\b/i,
  /\brage\b/i,
  /\bscandal\b/i,
];

/**
 * Determines whether a topic matches explicit exclusion criteria.
 */
export function isExcludedTopic(
  title: string,
  summary: string,
): { excluded: boolean; reason?: string } {
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
export function determineContentPillar(
  title: string,
  summary: string,
  categories: string[] = [],
): ContentPillar {
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
  if (
    text.includes('quote') ||
    text.includes('pricing') ||
    text.includes('deal') ||
    text.includes('proposal') ||
    text.includes('follow-up')
  ) {
    return 'SALES';
  }

  // Check Marketing & Customer Acquisition
  if (
    text.includes('seo') ||
    text.includes('marketing') ||
    text.includes('google business') ||
    text.includes('lead') ||
    text.includes('ads') ||
    text.includes('social media')
  ) {
    return 'MARKETING';
  }

  // Check Websites & Landing Pages
  if (
    text.includes('website') ||
    text.includes('landing page') ||
    text.includes('online presence') ||
    text.includes('mobile') ||
    text.includes('ux') ||
    text.includes('form')
  ) {
    return 'WEBSITE';
  }

  // Check Customer Experience
  if (
    text.includes('customer experience') ||
    text.includes('first impression') ||
    text.includes('response time') ||
    text.includes('trust') ||
    text.includes('reputation')
  ) {
    return 'CUSTOMER_EXPERIENCE';
  }

  // Check Small Business Operations & Productivity
  if (
    text.includes('small business') ||
    text.includes('productivity') ||
    text.includes('efficiency') ||
    text.includes('workflow') ||
    text.includes('operations') ||
    text.includes('entrepreneur')
  ) {
    return 'SMALL_BUSINESS';
  }

  // Check Local Business / Services
  if (
    text.includes('local business') ||
    text.includes('tourism') ||
    text.includes('restaurant') ||
    text.includes('tradesperson') ||
    text.includes('local')
  ) {
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
export function evaluateRelevance(
  title: string,
  summary: string,
  categories: string[] = [],
): RelevanceScoreResult {
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
    'business',
    'customer',
    'website',
    'web',
    'online',
    'digital',
    'sales',
    'growth',
    'local',
    'service',
    'automation',
    'productivity',
    'seo',
    'google',
    'marketing',
    'lead',
    'conversion',
    'ai',
    'ux',
    'ui',
    'tool',
    'search',
    'traffic',
    'design',
  ];
  const matchedSignals = businessSignals.filter((sig) => {
    if (sig === 'ai') return /\bai\b/i.test(text);
    if (sig === 'ui') return /\bui\b/i.test(text);
    if (sig === 'ux') return /\bux\b/i.test(text);
    return text.includes(sig);
  });
  score += Math.min(30, matchedSignals.length * 6);

  // Pillar specific bonuses
  if (
    pillar === 'WEBSITE' ||
    pillar === 'MARKETING' ||
    pillar === 'AI' ||
    pillar === 'CUSTOMER_EXPERIENCE'
  ) {
    score += 10;
  }

  // Penalties for overly deep compiler/kernel technical articles without business application
  if (
    text.includes('compiler') ||
    text.includes('assembly') ||
    text.includes('kernel') ||
    text.includes('garbage collection')
  ) {
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
