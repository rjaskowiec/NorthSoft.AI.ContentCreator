/**
 * NorthSoft.AI.ContentCreator — Taxonomy & Topic Relevance Unit Tests
 */

import { describe, expect, it } from 'vitest';
import {
  determineContentPillar,
  evaluateRelevance,
  isExcludedTopic,
} from '../../src/services/research/taxonomy';

describe('Content Taxonomy & Relevance Model', () => {
  describe('isExcludedTopic', () => {
    it('rejects celebrity gossip', () => {
      const res = isExcludedTopic('Latest celebrity news in Hollywood', 'Gossip about famous actors');
      expect(res.excluded).toBe(true);
    });

    it('rejects sports results', () => {
      const res = isExcludedTopic('Premier league football results', 'Scores from last night match');
      expect(res.excluded).toBe(true);
    });

    it('rejects political controversy', () => {
      const res = isExcludedTopic('Political controversy in parliament election', 'Debate between republican and democrat');
      expect(res.excluded).toBe(true);
    });

    it('allows business and website topics', () => {
      const res = isExcludedTopic('5 reasons your business website loses customers', 'How to optimize contact forms and website speed');
      expect(res.excluded).toBe(false);
    });
  });

  describe('determineContentPillar', () => {
    it('categorizes website topics under ONLINE_PRESENCE', () => {
      const pillar = determineContentPillar('Why small businesses need a website', 'Website trust and landing pages');
      expect(pillar).toBe('ONLINE_PRESENCE');
    });

    it('categorizes SEO and local search under MARKETING', () => {
      const pillar = determineContentPillar('3 simple ways a local business can get more customers from Google', 'Local SEO and Google Business Profile');
      expect(pillar).toBe('MARKETING');
    });

    it('categorizes AI automation under AI_AUTOMATION', () => {
      const pillar = determineContentPillar('What can a small business actually automate with AI today?', 'Practical AI use cases and customer service chatbots');
      expect(pillar).toBe('AI_AUTOMATION');
    });

    it('categorizes Icelandic local trends under LOCAL_BUSINESS', () => {
      const pillar = determineContentPillar('Digital adoption for Iceland tourism and local business', 'How local Icelandic service providers handle online bookings');
      expect(pillar).toBe('LOCAL_BUSINESS');
    });
  });

  describe('evaluateRelevance', () => {
    it('marks website optimization for small businesses as relevant', () => {
      const evalRes = evaluateRelevance(
        '5 reasons your business website loses customers',
        'Optimizing landing pages and mobile usability to boost conversion and inquiries',
      );
      expect(evalRes.passed).toBe(true);
      expect(evalRes.score).toBeGreaterThanOrEqual(55);
    });

    it('marks local SEO as relevant', () => {
      const evalRes = evaluateRelevance(
        'How to improve local SEO for small service business',
        'Getting higher rank on Google Search and local business maps',
      );
      expect(evalRes.passed).toBe(true);
    });

    it('marks AI automation as relevant', () => {
      const evalRes = evaluateRelevance(
        'How AI can automate customer support for local businesses',
        'Using automated response tools to handle repetitive customer inquiries',
      );
      expect(evalRes.passed).toBe(true);
    });

    it('marks celebrity news as irrelevant', () => {
      const evalRes = evaluateRelevance(
        'Latest celebrity news and Hollywood red carpet',
        'Fashion updates and gossip from award ceremony',
      );
      expect(evalRes.passed).toBe(false);
    });

    it('marks sports results as irrelevant', () => {
      const evalRes = evaluateRelevance(
        'Football results and championship scores',
        'Summary of weekend matches and player statistics',
      );
      expect(evalRes.passed).toBe(false);
    });

    it('marks political controversy as irrelevant', () => {
      const evalRes = evaluateRelevance(
        'Political controversy in parliament election debate',
        'Heated debate between candidates over policy issues',
      );
      expect(evalRes.passed).toBe(false);
    });
  });
});
