/**
 * NorthSoft.AI.ContentCreator — Editorial Policy & Brand Safety Standards
 *
 * Implements deterministic policy enforcement for brand safety across all content generation
 * stages (Topic Discovery, Research, Writer Drafts, CTAs, Hashtags, and Image Queries).
 *
 * PROHIBITED TOPICS & CONTEXTS:
 * 1. Religion & Religious Practices (religious holidays, rituals, doctrines, prayers, religious figures/symbols)
 * 2. Sexuality & Erotica (erotic, sexual, adult content, suggestive references)
 * 3. Occultism & Supernatural (witchcraft, magic, horoscopes, astrology, divination, spirits, occult symbols)
 * 4. Gambling & Betting (casinos, sports betting, lotteries, gambling promotions)
 * 5. Other Inappropriate Content (recreational drugs, glorification of intoxicants, entertainment violence, extreme vulgarity)
 *
 * NEUTRAL BUSINESS CONTEXTS PERMITTED:
 * - Purely commercial, operational, or consumer trends (e.g. Q4 retail demand, December shipping readiness,
 *   Black Friday traffic surges, January business planning, seasonal tourist booking spikes)
 *   WITHOUT religious, spiritual, or ideological celebration framing.
 */

export interface EditorialPolicyResult {
  passed: boolean;
  categoryViolations: string[];
  reasons: string[];
}

/**
 * Prohibited regex patterns organized by brand safety editorial category.
 * Carefully constructed to detect prohibited subjects while avoiding false positives
 * on legitimate commercial/seasonal topics (e.g. "December rush", "Black Friday sale", "January planning").
 */
export const EDITORIAL_PROHIBITED_CATEGORIES = {
  // 1. Religion and Religious Practices
  RELIGION: [
    /\b(?:christianity|christian|catholic|protestant|evangelical|orthodox|bible|biblical|scripture)\b/i,
    /\b(?:islam|islamic|muslim|quran|koran|mosque|ramadan|eid|allah|prophet muhammad)\b/i,
    /\b(?:judaism|jewish|torah|synagogue|hanukkah|chanukah|passover|yom kippur|rabbi)\b/i,
    /\b(?:hinduism|hindu|vedas|shiva|vishnu|krishna|diwali|puja)\b/i,
    /\b(?:buddhism|buddhist|dharma|sangha|monk|monastery)\b/i,
    /\b(?:church|mass|sermon|liturgy|eucharist|baptism|sacrament|pope|priest|pastor|clergyman)\b/i,
    /\b(?:prayer|praying|pray to|worship|worshipping|divine grace|salvation|resurrection)\b/i,
    /\b(?:christmas|nativity|santa claus|jesus christ|jesus|easter sunday|easter bunny|good friday|ash wednesday|lent)\b/i,
    /\b(?:gospel|holy spirit|holy ghost|sacred scripture|deity|god'?s will)\b/i,
    /#(?:christmas|easter|hanukkah|ramadan|eid|bible|christian|muslim|jewish|faith|prayer)\b/i,
  ],

  // 2. Sexuality and Erotica
  SEXUALITY: [
    /\b(?:porn|pornography|erotic|erotica|sensual|sex|sexual|sexuality|intercourse)\b/i,
    /\b(?:fetish|fetishes|nsfw|onlyfans|escort service|stripper|strip club|erotic massage)\b/i,
    /\b(?:libido|aphrodisiac|lingerie model|intimate toys|adult entertainment)\b/i,
    /#(?:nsfw|onlyfans|erotic|sexy|adultcontent)\b/i,
  ],

  // 3. Occultism and Supernatural
  OCCULTISM: [
    /\b(?:occult|occultism|witchcraft|sorcery|black magic|white magic|voodoo|wicca|wiccan|coven)\b/i,
    /\b(?:horoscope|horoscopes|astrology|astrological|zodiac sign|natal chart|tarot|tarot card|tarot cards)\b/i,
    /\b(?:divination|fortune telling|palm reading|clairvoyant|psychic reading|seance|séance|mediumship)\b/i,
    /\b(?:demonic|demonology|summoning spirits|astral projection|supernatural ritual|haunted ritual|curse|hex)\b/i,
    /#(?:astrology|horoscope|tarot|witchcraft|occult|zodiac)\b/i,
  ],

  // 4. Gambling and Betting
  GAMBLING: [
    /\b(?:casino|casinos|slot machine|slot machines|roulette|blackjack|baccarat|poker room)\b/i,
    /\b(?:sports betting|sportsbook|bookmaker|betting odds|place a bet|wagering|wager)\b/i,
    /\b(?:lottery|lotteries|lotto|scratchcard|scratchcards|jackpot prize|sweepstakes)\b/i,
    /\b(?:online gambling|crypto casino|free spins bonus|deposit bonus)\b/i,
    /#(?:casino|gambling|sportsbetting|betting|slots|poker)\b/i,
  ],

  // 5. Inappropriate Areas (Recreational Drugs, Glorified Intoxicants, Violence for Entertainment)
  INAPPROPRIATE: [
    /\b(?:cannabis|marijuana|weed|thc|cbd edibles|recreational drugs|cocaine|heroin|meth|psychedelics|lsd|shrooms|magic mushrooms)\b/i,
    /\b(?:get high|getting baked|getting drunk|party drugs|intoxication as recreation)\b/i,
    /\b(?:extreme violence|gore|snuff|glorifying violence|bloodbath)\b/i,
    /\b(?:fuck|fucking|bitch|asshole|motherfucker|cunt)\b/i,
  ],
};

/**
 * Validates any text snippet, post draft, topic idea, or query against NorthSoft's editorial brand safety policy.
 */
export function checkEditorialBrandSafety(input: {
  title?: string;
  body?: string;
  angle?: string;
  summary?: string;
  hook?: string;
  cta?: string;
  hashtags?: string[];
  imageQuery?: string;
}): EditorialPolicyResult {
  const pieces: string[] = [
    input.title || '',
    input.body || '',
    input.angle || '',
    input.summary || '',
    input.hook || '',
    input.cta || '',
    input.imageQuery || '',
    ...(input.hashtags || []),
  ];

  const fullText = pieces.filter(Boolean).join('\n');
  const reasons: string[] = [];
  const categoryViolations: string[] = [];

  for (const [category, patterns] of Object.entries(EDITORIAL_PROHIBITED_CATEGORIES)) {
    for (const pattern of patterns) {
      if (pattern.test(fullText)) {
        categoryViolations.push(category);
        reasons.push(
          `Content violates NorthSoft editorial brand safety policy [${category}]: matched prohibited pattern (${pattern.source}).`,
        );
        break; // One violation per category is enough
      }
    }
  }

  return {
    passed: reasons.length === 0,
    categoryViolations,
    reasons,
  };
}
