import { describe, expect, it } from 'vitest';
import {
  extractBaseName,
  isLikelyRandomOrHashed,
  segmentFileNameWords,
  toTitleCase,
  extractMetadataHeuristically,
  extractImageMetadataWithAI,
} from '../../src/services/content/image-metadata-extractor';
import { MockAIProvider } from '../../src/ai/mock-provider';

describe('Image Metadata Extractor Unit Tests', () => {
  describe('extractBaseName', () => {
    it('cleans extensions, directories, and query parameters', () => {
      expect(extractBaseName('welcome-to-my-business.jpg')).toBe('welcome-to-my-business');
      expect(extractBaseName('C:\\Users\\photos\\woman_in_business.png')).toBe('woman_in_business');
      expect(extractBaseName('/var/www/uploads/woman.in.business.jpeg')).toBe('woman.in.business');
      expect(extractBaseName('https://example.com/media/womaninbusiness.webp?token=123#view')).toBe('womaninbusiness');
    });
  });

  describe('isLikelyRandomOrHashed', () => {
    it('detects random strings and hash IDs', () => {
      expect(isLikelyRandomOrHashed('849fdnbjkcd8o739asdjda')).toBe(true);
      expect(isLikelyRandomOrHashed('WhatsApp-fashii738yhsa8d89')).toBe(true);
      expect(isLikelyRandomOrHashed('IMG_20261005_120934')).toBe(true);
      expect(isLikelyRandomOrHashed('photo-1542744094-3a31725283a0')).toBe(true);
      expect(isLikelyRandomOrHashed('329f61c2-a2e2-4e47-896d-8258485a4b25')).toBe(true);
      expect(isLikelyRandomOrHashed('')).toBe(true);
    });

    it('recognizes meaningful human names', () => {
      expect(isLikelyRandomOrHashed('welcome-to-my-business')).toBe(false);
      expect(isLikelyRandomOrHashed('woman_in_business')).toBe(false);
      expect(isLikelyRandomOrHashed('woman-in_business')).toBe(false);
      expect(isLikelyRandomOrHashed('womaninbusiness')).toBe(false);
      expect(isLikelyRandomOrHashed('woman.in.business')).toBe(false);
      expect(isLikelyRandomOrHashed('cloud-data-security-team')).toBe(false);
      expect(isLikelyRandomOrHashed('AI_Automation_Workflow')).toBe(false);
    });
  });

  describe('segmentFileNameWords and toTitleCase', () => {
    it('handles various separation formats (dash, underscore, dot, camelCase, mixed)', () => {
      expect(segmentFileNameWords('welcome-to-my-business')).toEqual(['welcome', 'to', 'my', 'business']);
      expect(segmentFileNameWords('woman_in_business')).toEqual(['woman', 'in', 'business']);
      expect(segmentFileNameWords('woman-in_business')).toEqual(['woman', 'in', 'business']);
      expect(segmentFileNameWords('woman.in.business')).toEqual(['woman', 'in', 'business']);
      expect(segmentFileNameWords('WomanInBusiness')).toEqual(['Woman', 'In', 'Business']);
      expect(segmentFileNameWords('womaninbusiness')).toEqual(['womaninbusiness']);
    });

    it('formats title case correctly', () => {
      expect(toTitleCase(['welcome', 'to', 'my', 'business'])).toBe('Welcome to My Business');
      expect(toTitleCase(['woman', 'in', 'business'])).toBe('Woman in Business');
    });
  });

  describe('extractMetadataHeuristically', () => {
    it('extracts high fidelity metadata from welcome-to-my-business.jpg', () => {
      const result = extractMetadataHeuristically('welcome-to-my-business.jpg', 'Websites & Landing Pages');
      expect(result.source).toBe('heuristic');
      expect(result.title).toBe('Welcome to My Business');
      expect(result.keywords).toContain('welcome');
      expect(result.keywords).toContain('business');
      expect(result.description).toBe('Photo with: welcome to my business');
    });

    it('extracts metadata from woman_in_business.png', () => {
      const result = extractMetadataHeuristically('woman_in_business.png', 'Marketing & Customer Acquisition');
      expect(result.source).toBe('heuristic');
      expect(result.title).toBe('Woman in Business');
      expect(result.keywords).toContain('woman');
      expect(result.keywords).toContain('business');
    });

    it('falls back to category defaults when filename is random hash', () => {
      const result = extractMetadataHeuristically('849fdnbjkcd8o739asdjda.jpg', 'AI & Business Automation');
      expect(result.source).toBe('category_fallback');
      expect(result.title).toBe('AI and Business Automation');
      expect(result.keywords).toContain('AI');
      expect(result.keywords).toContain('business automation');
      expect(result.description).toContain('AI technology');
    });

    it('falls back to category defaults for WhatsApp random export names', () => {
      const result = extractMetadataHeuristically('WhatsApp-fashii738yhsa8d89.png', 'Websites & Landing Pages');
      expect(result.source).toBe('category_fallback');
      expect(result.title).toBe('Modern Website and Landing Page');
      expect(result.keywords).toContain('landing page');
    });
  });

  describe('extractImageMetadataWithAI', () => {
    it('uses AI provider when available for natural language reasoning', async () => {
      const mockAi = new MockAIProvider();
      mockAi.setMockResponse(
        'welcome-to-my-business',
        JSON.stringify({
          title: 'Welcome to My Business',
          keywords: 'welcome, business, store, greeting, customer',
          description: 'Inviting storefront concept representing welcome to my business',
          isRandom: false,
        }),
      );

      const result = await extractImageMetadataWithAI(
        { filename: 'welcome-to-my-business.jpg', category: 'General' },
        mockAi,
      );

      expect(result.source).toBe('ai');
      expect(result.title).toBe('Welcome to My Business');
      expect(result.keywords).toContain('welcome');
      expect(result.description).toContain('welcome to my business');
    });

    it('detects random strings and returns category suggestions even without AI call', async () => {
      const mockAi = new MockAIProvider();
      const result = await extractImageMetadataWithAI(
        { filename: '849fdnbjkcd8o739asdjda.jpg', category: 'AI & Business Automation' },
        mockAi,
      );

      expect(result.source).toBe('category_fallback');
      expect(result.title).toBe('AI and Business Automation');
      expect(result.keywords).toContain('AI');
      expect(result.keywords).toContain('business automation');
    });
  });
});
