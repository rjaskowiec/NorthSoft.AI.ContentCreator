import { describe, expect, it } from 'vitest';
import { TopicRegistry, type TopicHistoryRecord } from '../../src/services/research/topic-registry';
import { calculateContentScore } from '../../src/services/research/taxonomy';

describe('TopicRegistry & Content Queue Management', () => {
  it('detects duplicate content angles using similarity scoring', () => {
    const existingAngles = [
      'Show small business owners 5 ways to use AI for customer support',
      'Why mobile page speed matters for local SEO',
    ];

    const duplicateAngle = 'Show small business owners 5 ways to use AI for customer support';
    const differentAngle = 'How small businesses can use AI to automate daily invoice processing';

    expect(TopicRegistry.isDuplicateAngle(duplicateAngle, existingAngles)).toBe(true);
    expect(TopicRegistry.isDuplicateAngle(differentAngle, existingAngles)).toBe(false);
  });

  it('queues 10 ideas from the same pillar instead of discarding them', () => {
    const history: TopicHistoryRecord[] = [];
    const mockDb = {} as D1Database;
    const registry = new TopicRegistry(mockDb);

    const baseDate = new Date('2026-10-01T09:00:00Z');
    const scheduledDates: string[] = [];

    const distinctAngles = [
      'Automating customer invoice reminders with AI',
      'AI tools for quick email drafting',
      'Using AI to analyze customer satisfaction reviews',
      'Generating social media post ideas with AI',
      'AI chatbots for answering weekend client questions',
      'Translating website content for foreign clients using AI',
      'AI tools for organizing daily meeting notes',
      'Automating lead qualification with simple AI tools',
      'AI assisted proposal writing for service providers',
      'Analyzing seasonal sales patterns with AI insights',
    ];

    // 10 AI ideas with distinct angles
    for (let i = 0; i < 10; i++) {
      const angle = distinctAngles[i]!;
      const result = registry.calculateSuggestedPublishDate('AI', angle, history, baseDate);

      expect(result.isDuplicateAngle).toBe(false);

      history.push({
        id: `idea-${i + 1}`,
        content_pillar: 'AI',
        content_angle: angle,
        title: `AI Topic #${i + 1}`,
        status: 'queued',
        suggested_publish_date: result.suggestedDate,
        created_at: baseDate.toISOString(),
      });

      scheduledDates.push(result.suggestedDate);
    }

    // All 10 ideas must be accepted & queued (not discarded)
    expect(history).toHaveLength(10);
    // Scheduled dates must be assigned to future days
    expect(new Set(scheduledDates).size).toBeGreaterThanOrEqual(5);
  });

  it('assigns later suggested_publish_date when a similar topic was recently published', () => {
    const mockDb = {} as D1Database;
    const registry = new TopicRegistry(mockDb);

    const baseDate = new Date('2026-10-01T09:00:00Z');
    const history: TopicHistoryRecord[] = [
      {
        id: 'hist-1',
        content_pillar: 'AI',
        content_angle: '5 ways small businesses can use AI for customer support',
        title: 'AI in customer support',
        status: 'published',
        suggested_publish_date: '2026-10-01T09:00:00Z',
        created_at: '2026-10-01T09:00:00Z',
      },
    ];

    // Near identical angle within cooldown
    const nearDuplicateAngle = '5 ways small businesses can use AI for customer support';
    const result = registry.calculateSuggestedPublishDate(
      'AI',
      nearDuplicateAngle,
      history,
      baseDate,
    );

    expect(result.cooldownApplied).toBe(true);
    // Suggested publish date should be pushed out significantly by cooldown (at least +7 days)
    const suggestedTime = new Date(result.suggestedDate).getTime();
    expect(suggestedTime).toBeGreaterThanOrEqual(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  });

  it('accepts a different angle for the same main topic/pillar without broad pillar blocking', () => {
    const mockDb = {} as D1Database;
    const registry = new TopicRegistry(mockDb);

    const baseDate = new Date('2026-10-01T09:00:00Z');
    const history: TopicHistoryRecord[] = [
      {
        id: 'hist-1',
        content_pillar: 'AI',
        content_angle: '5 ways to use AI for customer support',
        title: 'AI Customer Support',
        status: 'published',
        suggested_publish_date: '2026-10-01T09:00:00Z',
        created_at: '2026-10-01T09:00:00Z',
      },
    ];

    // Completely different angle on AI
    const differentAngle = 'How AI can automatically summarize client quote requests';
    const result = registry.calculateSuggestedPublishDate('AI', differentAngle, history, baseDate);

    expect(result.isDuplicateAngle).toBe(false);
    expect(result.cooldownApplied).toBe(false);
  });

  it('calculates holistic Content Score with diversity bonus and recent pillar penalty', () => {
    const highDiversityScore = calculateContentScore({
      sourceUsefulness: 85,
      businessRelevance: 90,
      engagementPotential: 88,
      commercialRelevance: 92,
      freshnessDays: 1,
      isDuplicateAngle: false,
      recentPillarCount: 0, // Underrepresented pillar gets bonus
    });

    const recentPillarPenaltyScore = calculateContentScore({
      sourceUsefulness: 85,
      businessRelevance: 90,
      engagementPotential: 88,
      commercialRelevance: 92,
      freshnessDays: 1,
      isDuplicateAngle: false,
      recentPillarCount: 3, // Overrepresented pillar gets penalty
    });

    expect(highDiversityScore).toBeGreaterThan(recentPillarPenaltyScore);
  });

  describe('Topic Cluster Memory & Fatigue (isClusterInCooldown)', () => {
    const baseDate = new Date('2026-10-01T12:00:00Z');

    it('enforces direct cluster cooldown (21 days) on identical clusters', () => {
      const history: TopicHistoryRecord[] = [
        {
          id: 'hist-1',
          content_pillar: 'AI',
          content_angle: 'AI Search visibility for local business',
          title: 'How AI Search impacts discovery',
          cluster_key: 'ai_search_visibility',
          status: 'published',
          created_at: new Date(baseDate.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
        },
      ];

      const res = TopicRegistry.isClusterInCooldown('ai_search_visibility', history, baseDate);
      expect(res.inCooldown).toBe(true);
      expect(res.conflictingCluster).toBe('ai_search_visibility');
      expect(res.reason).toContain('21-day cooldown active');
    });

    it('enforces family fatigue window (12 days) on neighbor clusters like AEO and AI search', () => {
      const history: TopicHistoryRecord[] = [
        {
          id: 'hist-1',
          content_pillar: 'AI',
          content_angle: 'AI Search visibility for local business',
          title: 'How AI Search impacts discovery',
          cluster_key: 'ai_search_visibility', // Family: search_discovery
          status: 'published',
          created_at: new Date(baseDate.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days ago
        },
      ];

      // Propose AEO (also in search_discovery family)
      const res = TopicRegistry.isClusterInCooldown('aeo_answer_engines', history, baseDate);
      expect(res.inCooldown).toBe(true);
      expect(res.conflictingCluster).toBe('ai_search_visibility');
      expect(res.reason).toContain('search_discovery');
    });

    it('allows distinct clusters from other families even when search_discovery is in cooldown', () => {
      const history: TopicHistoryRecord[] = [
        {
          id: 'hist-1',
          content_pillar: 'AI',
          content_angle: 'AI Search visibility for local business',
          title: 'How AI Search impacts discovery',
          cluster_key: 'ai_search_visibility',
          status: 'published',
          created_at: new Date(baseDate.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ];

      // Propose website speed (Family: website_performance_ux)
      const res = TopicRegistry.isClusterInCooldown('website_speed_conversion', history, baseDate);
      expect(res.inCooldown).toBe(false);
    });
  });
});
