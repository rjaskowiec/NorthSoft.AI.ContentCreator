import type { IAIProvider } from '../../ai/provider';

export interface ImageMetadataExtractionInput {
  filename?: string;
  url?: string;
  category?: string;
}

export interface ExtractedImageMetadata {
  title: string;
  keywords: string;
  description: string;
  category?: string;
  source: 'heuristic' | 'ai' | 'category_fallback';
}

const CATEGORY_DEFAULTS: Record<string, { title: string; keywords: string; description: string }> = {
  'AI & Business Automation': {
    title: 'AI and Business Automation',
    keywords: 'AI, artificial intelligence, business automation, machine learning, technology, innovation',
    description: 'Visual representation of AI technology, intelligent automation and modern business workflow',
  },
  'Websites & Landing Pages': {
    title: 'Modern Website and Landing Page',
    keywords: 'website, landing page, web design, responsive design, conversion, web development',
    description: 'Clean visual concept of responsive web development, modern digital interface and user experience',
  },
  'Marketing & Customer Acquisition': {
    title: 'Digital Marketing and Customer Acquisition',
    keywords: 'digital marketing, customer acquisition, growth, strategy, lead generation, branding',
    description: 'Visual concept of multi-channel digital marketing campaigns and online customer acquisition',
  },
  'Sales & Conversion Process': {
    title: 'Sales and Conversion Optimization',
    keywords: 'sales, conversion, business growth, deal closing, sales funnel, revenue',
    description: 'Visual representation of business sales performance, conversion funnels and deal closing',
  },
  'Small Business Productivity & Ops': {
    title: 'Small Business Productivity and Operations',
    keywords: 'productivity, small business, operations, workflow, efficiency, teamwork',
    description: 'Visual concept of daily business operations, team productivity and streamlined management',
  },
  'Customer Experience & Trust': {
    title: 'Customer Experience and Trust',
    keywords: 'customer experience, trust, client support, satisfaction, loyalty, partnership',
    description: 'Visual theme representing positive customer relationships, brand trust and client support',
  },
  'Local Business & Regional Context': {
    title: 'Local Business and Regional Community',
    keywords: 'local business, community, regional service, storefront, neighborhood, local commerce',
    description: 'Visual scene representing local small business engagement, local commerce and community presence',
  },
  'General': {
    title: 'Business and Digital Technology',
    keywords: 'business, technology, modern workplace, strategy, professional',
    description: 'High-quality professional business and digital technology concept photo',
  },
};

export function getCategoryFallback(category: string): { title: string; keywords: string; description: string } {
  return (
    CATEGORY_DEFAULTS[category] ||
    CATEGORY_DEFAULTS['General'] || {
      title: 'Business and Digital Technology',
      keywords: 'business, technology, modern workplace',
      description: 'Professional visual illustration',
    }
  );
}

/**
 * Normalizes input category to recognized category keys or returns 'General'.
 */
export function normalizeCategory(category?: string): string {
  if (!category) return 'General';
  const trimmed = category.trim();
  for (const catKey of Object.keys(CATEGORY_DEFAULTS)) {
    if (catKey.toLowerCase() === trimmed.toLowerCase()) {
      return catKey;
    }
  }
  return trimmed || 'General';
}

/**
 * Strips directory paths, file extensions, and hashes/query params from a filename or URL.
 */
export function extractBaseName(input: string): string {
  if (!input) return '';
  let str = input.trim();

  // If URL, take pathname
  try {
    if (/^https?:\/\//i.test(str)) {
      const parsed = new URL(str);
      str = parsed.pathname;
    }
  } catch {
    // Keep str as is
  }

  // Remove leading directories (both Windows and Unix)
  str = str.replace(/^.*[\\/]/, '');

  // Strip query/hashes if any
  str = str.replace(/[?#].*$/, '');

  // Strip file extension
  str = str.replace(/\.(jpe?g|png|webp|gif|svg|avif|bmp|tiff?)$/i, '');

  return str.trim();
}

/**
 * Checks if a string looks like random characters / hashes / machine generated names.
 * Examples of random/meaningless names:
 * - "849fdnbjkcd8o739asdjda"
 * - "WhatsApp-fashii738yhsa8d89"
 * - "IMG_20261005_120934"
 * - "photo-1542744094-3a31725283a0"
 * - "329f61c2-a2e2-4e47-896d-8258485a4b25"
 * - "d1c40509"
 */
export function isLikelyRandomOrHashed(name: string): boolean {
  if (!name || name.trim().length === 0) return true;
  const clean = name.trim();

  // Standard UUID format
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) {
    return true;
  }

  // Common camera / phone / export prefixes
  if (/^(IMG|DSC|PEXELS|UNSPLASH|PHOTO|PIC|IMAGE|SCREENSHOT|SNAPSHOT|WHATSAPP)[_-]?[0-9a-zA-Z_-]+$/i.test(clean)) {
    // Exception: If after WhatsApp or IMG there is a clear meaningful phrase like "WhatsApp-Team-Meeting-2026"
    const parts = clean.split(/[_-]+/);
    const nonPrefixParts = parts.filter(p => !/^(IMG|DSC|PEXELS|UNSPLASH|PHOTO|PIC|IMAGE|SCREENSHOT|SNAPSHOT|WHATSAPP|[0-9]+)$/i.test(p));
    if (nonPrefixParts.length === 0) return true;
    // Check if remaining parts look like hashes
    if (nonPrefixParts.every(p => isRandomToken(p))) return true;
  }

  // Pure hex or base64 strings with high number of digits/entropy
  if (isRandomToken(clean)) {
    return true;
  }

  // Check tokens split by separators
  const tokens = clean.split(/[-_.+\s]+/);
  if (tokens.length === 1 && tokens[0] && isRandomToken(tokens[0])) {
    return true;
  }

  // If any token is overwhelmingly random garbage (e.g. WhatsApp-fashii738yhsa8d89)
  const nonPrefixTokens = tokens.filter(t => !/^(whatsapp|img|dsc|photo|pic|screenshot)$/i.test(t));
  if (nonPrefixTokens.length > 0 && nonPrefixTokens.every(t => isRandomToken(t))) {
    return true;
  }

  return false;
}

/**
 * Checks if an individual token is random (e.g. hex, long sequence of consonants/digits).
 */
function isRandomToken(token: string): boolean {
  if (!token) return true;
  const t = token.toLowerCase();

  // Hexadecimal strings >= 10 chars
  if (/^[0-9a-f]{10,}$/i.test(t)) return true;

  // Mixed digits and letters with high digit count (>30% digits) and length >= 8
  const digits = (t.match(/[0-9]/g) || []).length;
  if (t.length >= 8 && digits >= 3 && digits / t.length > 0.25) return true;

  // Very low vowel count in alphabetic token of length >= 7 (consonant mash, e.g. "fdnbjkcd", "fashii738yhsa")
  const letters = t.replace(/[^a-z]/g, '');
  if (letters.length >= 7) {
    const vowels = (letters.match(/[aeiouy]/g) || []).length;
    if (vowels / letters.length < 0.18) return true; // unlikely to be real English word
  }

  return false;
}

/**
 * Splits camelCase, PascalCase, kebab-case, snake_case, dot.case into individual clean words.
 */
export function segmentFileNameWords(raw: string): string[] {
  if (!raw) return [];

  // Remove common random prefix/suffixes like (1), _1, -scaled, -min, -large, -copy
  let text = raw.replace(/\((?:[0-9]+)\)$/g, '');
  text = text.replace(/[-_](?:scaled|min|thumb|large|small|copy|preview|[0-9]+)$/i, '');

  // Separate transitions from lowercase to uppercase: womanInBusiness -> woman In Business
  text = text.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  // Separate transitions from acronyms to word: AIDevelopment -> AI Development
  text = text.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

  // Replace separators (_, -, ., +, %, etc.) with spaces
  text = text.replace(/[-_.+%,/]+/g, ' ');

  // Clean non-alphanumeric except spaces
  text = text.replace(/[^a-zA-Z0-9\s]/g, ' ');

  const words = text
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 0);

  // Filter out standalone random hash tokens from words
  const validWords = words.filter(w => !isRandomToken(w));
  return validWords;
}

/**
 * Capitalizes words into Title Case.
 */
export function toTitleCase(words: string[]): string {
  if (!words || words.length === 0) return '';
  return words
    .map(w => {
      const lower = w.toLowerCase();
      if (['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'from', 'by', 'with', 'in', 'of'].includes(lower)) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ')
    .replace(/^([a-z])/, (match) => match.toUpperCase());
}

/**
 * Heuristically extracts metadata from a filename or falls back to category defaults.
 */
export function extractMetadataHeuristically(
  filenameOrUrl: string,
  category?: string,
): ExtractedImageMetadata {
  const normCat = normalizeCategory(category);
  const base = extractBaseName(filenameOrUrl);

  if (!base || isLikelyRandomOrHashed(base)) {
    const fallback = getCategoryFallback(normCat);
    return {
      title: fallback.title,
      keywords: fallback.keywords,
      description: fallback.description,
      category: normCat,
      source: 'category_fallback',
    };
  }

  const words = segmentFileNameWords(base);

  // If after segmentation we have fewer than 1 meaningful word or only numbers/hashes
  const meaningfulWords = words.filter(w => !/^[0-9]+$/.test(w) && w.length >= 2);
  if (meaningfulWords.length === 0) {
    const fallback = getCategoryFallback(normCat);
    return {
      title: fallback.title,
      keywords: fallback.keywords,
      description: fallback.description,
      category: normCat,
      source: 'category_fallback',
    };
  }

  const title = toTitleCase(meaningfulWords);

  // Create keywords list: individual words + related category keywords
  const keywordSet = new Set<string>();
  for (const w of meaningfulWords) {
    if (w.length >= 2) keywordSet.add(w.toLowerCase());
  }

  // Enrich with category keywords if relevant
  const catDefaults = getCategoryFallback(normCat);
  const catKeywords = catDefaults.keywords.split(',').map(k => k.trim().toLowerCase());
  for (const ck of catKeywords.slice(0, 3)) {
    keywordSet.add(ck);
  }

  const keywords = Array.from(keywordSet).join(', ');
  const description = `Photo with: ${meaningfulWords.map(w => w.toLowerCase()).join(' ')}`;

  return {
    title,
    keywords,
    description,
    category: normCat,
    source: 'heuristic',
  };
}

/**
 * Extracts and enhances image metadata using Cloudflare Workers AI with fallback to robust heuristics.
 */
export async function extractImageMetadataWithAI(
  input: ImageMetadataExtractionInput,
  aiProvider?: IAIProvider,
): Promise<ExtractedImageMetadata> {
  const normCat = normalizeCategory(input.category);
  const baseName = extractBaseName(input.filename || input.url || '');

  // 1. Fast path for empty or blatantly random hashes
  if (!baseName || isLikelyRandomOrHashed(baseName)) {
    const fallback = getCategoryFallback(normCat);
    return {
      title: fallback.title,
      keywords: fallback.keywords,
      description: fallback.description,
      category: normCat,
      source: 'category_fallback',
    };
  }

  // 2. If AI Provider is available, ask the AI to logically inspect and structure the filename
  if (aiProvider) {
    try {
      const prompt = `Analyze this image filename: "${baseName}" within category "${normCat}".
Instructions:
1. Determine if the filename contains meaningful human words (e.g. "welcome-to-my-business.jpg", "woman_in_business.png", "womaninbusiness.jpeg", "cloud-data-security.webp") or if it is random/machine-generated/hash-like (e.g. "849fdnbjkcd8o739asdjda", "WhatsApp-fashii738yhsa8d89", "IMG_9283749823").
2. If it is random, hashed, or meaningless, do NOT invent words from random syllables. Return a professional title, keywords, and description relevant to the category "${normCat}".
3. If it contains meaningful words (even if combined like "womaninbusiness" or separated by dots/dashes/underscores), extract the full natural meaning.
   - title: Natural Title Case (e.g. "Welcome to My Business", "Woman in Business")
   - keywords: Comma-separated relevant keywords (e.g. "welcome, business, office, greeting")
   - description: Natural semantic description (e.g. "Photo representing welcome to my business")
4. Return strictly JSON with keys: "title", "keywords", "description", "isRandom": true/false.`;

      const response = await aiProvider.complete({
        messages: [
          {
            role: 'system',
            content: 'You are an intelligent image indexing metadata analyzer. Output only valid JSON.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        role: 'researcher',
        responseFormat: 'json',
      });

      const parsed = parseAiMetadataJson(response.content);
      if (parsed && parsed.title && parsed.keywords && parsed.description) {
        return {
          title: parsed.title.trim(),
          keywords: parsed.keywords.trim(),
          description: parsed.description.trim(),
          category: normCat,
          source: 'ai',
        };
      }
    } catch (err) {
      console.warn('[ImageMetadataService] AI extraction failed or timed out, falling back to heuristics:', err);
    }
  }

  // 3. Robust heuristic fallback
  return extractMetadataHeuristically(baseName, normCat);
}

function parseAiMetadataJson(raw: string): { title?: string; keywords?: string; description?: string } | null {
  try {
    const clean = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}
