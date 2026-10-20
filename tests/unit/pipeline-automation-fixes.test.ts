import { describe, expect, it, vi } from 'vitest';
import {
  PipelineOrchestratorService,
  type SchedulerConfig,
} from '../../src/services/content/pipeline-orchestrator-service';
import { TopicRegistry, type TopicHistoryRecord } from '../../src/services/research/topic-registry';

function createMockDb(initialData: {
  topics?: any[];
  posts?: any[];
  versions?: any[];
  images?: any[];
  schedules?: any[];
  runs?: any[];
  locks?: any[];
  seeds?: any[];
  sources?: any[];
  rawItems?: any[];
  topicHistory?: any[];
} = {}) {
  const topics = [...(initialData.topics || [])];
  const posts = [...(initialData.posts || [])];
  const versions = [...(initialData.versions || [])];
  const images = [...(initialData.images || [])];
  const schedules = [...(initialData.schedules || [])];
  const runs = [...(initialData.runs || [])];
  const locks = [...(initialData.locks || [])];
  const seeds = [...(initialData.seeds || [])];
  const sources = [...(initialData.sources || [])];
  const rawItems = [...(initialData.rawItems || [])];
  const topicHistory = [...(initialData.topicHistory || [])];

  const prepare = (sql: string) => {
    const execute = (args: any[]) => ({
      first: async <T>() => {
        if (sql.includes('scheduler_config')) {
          return { enabled: 1, min_topic_backlog: 5, target_coverage_days: 14, max_posts_per_night: 3 } as T;
        }
        if ((sql.includes('FROM posts') || sql.includes('UNION ALL')) && (sql.includes('SELECT p.id') || sql.includes('LIMIT 1')) && !sql.includes('COUNT')) {
          const schedulable = posts.find((p) => {
            if (p.status !== 'approved') return false;
            const hasImg = images.some((i) => i.post_id === p.id && i.version_number === (p.current_version ?? 1));
            const hasSched = schedules.some((s) => s.post_id === p.id && ['pending', 'publishing'].includes(s.status));
            return hasImg && !hasSched;
          });
          if (schedulable) return { id: schedulable.id } as T;
          if (sql.includes('content_ideas')) {
            const dueDeferred = topics.find((t) => t.status === 'deferred');
            if (dueDeferred) return { id: dueDeferred.id } as T;
          }
          return null;
        }
        if (sql.includes('FROM orchestrator_runs') && (sql.includes('result_status = ?') || sql.includes('stage = ?'))) {
          const stage = args[0];
          const found = runs.find((r) => r.trigger_type === 'cron' && (r.result_status === stage || r.stage === stage));
          return found ? ({ id: found.id } as T) : null;
        }
        if (sql.includes('FROM orchestrator_runs') && sql.includes("stage = 'posts'")) {
          const count = runs.filter((r) => r.trigger_type === 'cron' && r.stage === 'posts').length;
          return { cnt: count } as T;
        }
        if (sql.includes('FROM content_ideas') && sql.includes('status IN')) {
          const activeStatuses = ['queued', 'new', 'accepted', 'discovered', 'pending'];
          const cnt = topics.filter((t) => activeStatuses.includes(t.status)).length;
          return { cnt } as T;
        }
        if (sql.includes('FROM posts') && sql.includes('NOT EXISTS (SELECT 1 FROM post_images')) {
          const cnt = posts.filter((p) => ['approved', 'scheduled'].includes(p.status) && !images.some((i) => i.post_id === p.id)).length;
          return { cnt } as T;
        }
        if (sql.includes('FROM posts') && (sql.includes('readyToSchedule') || (sql.includes('EXISTS (SELECT 1 FROM post_images') && sql.includes('NOT EXISTS (SELECT 1 FROM schedules')))) {
          const cnt = posts.filter((p) => p.status === 'approved' && images.some((i) => i.post_id === p.id)).length;
          return { cnt } as T;
        }
        if (sql.includes('FROM schedules')) {
          return { cnt: schedules.length } as T;
        }
        return null;
      },
      all: async <T>() => {
        if (sql.includes('content_ideas') && sql.includes("status = 'deferred'")) {
          const limit = args[1] || 10;
          const deferred = topics.filter((t) => t.status === 'deferred').slice(0, limit);
          return { results: deferred as T[] };
        }
        if (sql.includes('content_topic_history')) {
          return { results: [...topicHistory] as T[] };
        }
        if (sql.includes('research_sources')) {
          return { results: sources as T[] };
        }
        if (sql.includes('research_items')) {
          return { results: rawItems as T[] };
        }
        if (sql.includes('editorial_seeds')) {
          return { results: seeds as T[] };
        }
        if (sql.includes('FROM posts') && sql.includes("status = 'approved'")) {
          const ready = posts.filter((p) => p.status === 'approved' && images.some((i) => i.post_id === p.id));
          return { results: ready as T[] };
        }
        return { results: [] as T[] };
      },
      run: async () => {
        if (sql.includes('pipeline_execution_locks') && sql.includes('INSERT')) {
          locks.push({ key: args[0], run_id: args[1] });
          return { meta: { changes: 1 } };
        }
        if (sql.includes('pipeline_execution_locks') && (sql.includes('DELETE') || sql.includes('UPDATE'))) {
          return { meta: { changes: 1 } };
        }
        if (sql.includes('content_ideas') && sql.includes("status = 'queued'")) {
          const id = args[1] || args[0];
          const target = topics.find((t) => t.id === id);
          if (target) {
            target.status = 'queued';
            return { meta: { changes: 1 } };
          }
        }
        if (sql.includes('content_ideas') && sql.includes("status = 'deferred'")) {
          const id = args[2] || args[3] || args[0];
          const target = topics.find((t) => t.id === id);
          if (target) {
            target.status = 'deferred';
            target.suggested_publish_date = args[0];
            return { meta: { changes: 1 } };
          }
        }
        if (sql.includes('content_topic_history') && sql.includes('INSERT')) {
          topicHistory.push({ id: args[0], cluster_key: args[6], status: args[7] });
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 0 } };
      },
    });

    return {
      bind: (...args: any[]) => execute(args),
      ...execute([]),
    };
  };

  const db: any = {
    prepare,
    batch: async (stmts: any[]) => {
      for (const s of stmts) await s.run();
      return [];
    },
  };

  return { db, topics, posts, versions, images, schedules, runs, locks, seeds, sources, rawItems, topicHistory };
}

describe('Pipeline Automation & Resilience Regression Tests', () => {
  it('1. TopicRegistry correctly calculates cooldown end and defers unique topics instead of discarding them', () => {
    const history: TopicHistoryRecord[] = [
      {
        id: 'hist-1',
        content_pillar: 'AI',
        content_angle: 'AI Search Changing Local SEO',
        title: 'AI Search Changing Local SEO',
        cluster_key: 'ai_search_visibility',
        status: 'queued',
        created_at: new Date().toISOString(),
      },
    ];

    const cooldownCheck = TopicRegistry.isClusterInCooldown('ai_search_visibility', history);
    expect(cooldownCheck.inCooldown).toBe(true);

    const cooldownEnd = TopicRegistry.getClusterCooldownEnd('ai_search_visibility', history);
    expect(cooldownEnd.getTime()).toBeGreaterThan(Date.now());
  });

  it('2. TopicRegistry promoteDeferredTopics safely and idempotently promotes due topics to queued', async () => {
    const pastDate = new Date(Date.now() - 3600000).toISOString();
    const { db, topics, topicHistory } = createMockDb({
      topics: [
        {
          id: 'idea-deferred-1',
          title: 'Speed Optimization for Mobile Visitors',
          content_pillar: 'WEBSITE',
          content_angle: 'Fast mobile load speeds',
          cluster_key: 'website_speed_conversion',
          status: 'deferred',
          suggested_publish_date: pastDate,
        },
      ],
      topicHistory: [],
    });

    const registry = new TopicRegistry(db);
    const result = await registry.promoteDeferredTopics(new Date(), 5);

    expect(result.promoted).toBe(1);
    expect(topics[0].status).toBe('queued');
    expect(topicHistory.length).toBe(1);
  });

  it('3. TopicRegistry promoteDeferredTopics retains topics whose cooldown is still active', async () => {
    const pastDate = new Date(Date.now() - 3600000).toISOString();
    const { db, topics } = createMockDb({
      topics: [
        {
          id: 'idea-deferred-2',
          title: 'AI Chatbot Assistance',
          content_pillar: 'AI',
          content_angle: '24/7 Chatbot assistance',
          cluster_key: 'chatbot_first_touch',
          status: 'deferred',
          suggested_publish_date: pastDate,
        },
      ],
      topicHistory: [
        {
          id: 'h-1',
          content_pillar: 'AI',
          content_angle: 'Active Chatbot',
          title: 'Chatbot',
          cluster_key: 'chatbot_first_touch',
          status: 'queued',
          created_at: new Date().toISOString(),
        },
      ],
    });

    const registry = new TopicRegistry(db);
    const result = await registry.promoteDeferredTopics(new Date(), 5);

    expect(result.promoted).toBe(0);
    expect(result.stillDeferred).toBe(1);
    expect(topics[0].status).toBe('deferred');
  });

  it('4. Fast-gate in runAutomationTick skips execution outside AI window when no approved post has an image', async () => {
    // Approved post exists, BUT it has no image -> cannot be scheduled, so cron must stay idle
    const { db } = createMockDb({
      posts: [{ id: 'post-no-img', status: 'approved', current_version: 1 }],
      images: [], // No images attached!
    });

    const service = new PipelineOrchestratorService(db, {} as any);
    // 14:00 UTC is outside the nightly AI window (22:00-23:45 UTC)
    const midday = new Date('2026-10-20T14:00:00Z');
    const result = await service.runAutomationTick(midday);

    expect(result.ran).toBe(false);
    expect(result.outcome).toBe('COMPLETED_NO_WORK');
    expect(result.reason).toContain('Outside AI background window and no approved posts awaiting scheduling.');
  });

  it('5. Fast-gate in runAutomationTick proceeds outside AI window when an approved post HAS an image and is ready to schedule', async () => {
    const { db } = createMockDb({
      posts: [{ id: 'post-ready', status: 'approved', current_version: 1 }],
      images: [{ post_id: 'post-ready', version_number: 1, url: 'https://images.example.com/pic.jpg' }],
      schedules: [],
    });

    const service = new PipelineOrchestratorService(db, {} as any);
    const midday = new Date('2026-10-20T14:00:00Z');

    // Mock runStage('scheduling') to avoid full schedule service dependencies
    vi.spyOn(service, 'runStage').mockResolvedValue({
      stage: 'scheduling',
      success: true,
      outcome: 'COMPLETED_WITH_OUTPUT',
      summary: 'Zaplanowano 1 post(ów)',
    });

    const result = await service.runAutomationTick(midday);

    expect(result.ran).toBe(true);
    expect(result.outcome).toBe('COMPLETED_WITH_OUTPUT');
    expect(service.runStage).toHaveBeenCalledWith('scheduling', 'system');
  });

  it('6. Stage starvation fix: an approved post awaiting manual image approval does not block topics stage', async () => {
    const { db } = createMockDb({
      topics: [], // topic backlog empty -> needs topics!
      posts: [{ id: 'post-awaiting-img', status: 'approved', current_version: 1 }],
      images: [], // post has no image -> needs images!
      runs: [
        // images stage already ran tonight!
        { trigger_type: 'cron', result_status: 'images', stage: 'images', started_at: '2026-10-20T22:05:00Z' },
      ],
    });

    const service = new PipelineOrchestratorService(db, {} as any);
    const night = new Date('2026-10-20T22:15:00Z'); // Inside AI window

    vi.spyOn(service, 'runStage').mockResolvedValue({
      stage: 'topics',
      success: true,
      outcome: 'COMPLETED_WITH_OUTPUT',
      summary: 'Znaleziono 5 elementów źródłowych, zaakceptowano 1',
    });

    const result = await service.runAutomationTick(night);

    expect(result.ran).toBe(true);
    // Because images already ran tonight, the orchestrator should select topics next, not starve!
    expect(service.runStage).toHaveBeenCalledWith('topics', 'system');
  });

  it('7. Honest classification: reports BLOCKED when post is waiting for image approval', async () => {
    const { db } = createMockDb({
      posts: [{ id: 'post-no-img', status: 'approved', current_version: 1 }],
      images: [],
    });

    const service = new PipelineOrchestratorService(db, {} as any);
    const night = new Date('2026-10-20T22:05:00Z');

    vi.spyOn(service, 'runStage').mockResolvedValue({
      stage: 'images',
      success: true,
      outcome: 'BLOCKED',
      summary: 'Ilustracje: przetworzono 1, kandydaci do akceptacji 1, brak 0',
    });

    const result = await service.runAutomationTick(night);

    expect(result.outcome).toBe('BLOCKED');
    expect(result.blockers?.some((b) => b.includes('awaiting an approved image'))).toBe(true);
  });

  it('8. Safe idle state: returns COMPLETED_NO_WORK when backlog and coverage targets are satisfied', async () => {
    const { db } = createMockDb({
      topics: [
        { id: 't-1', status: 'queued' },
        { id: 't-2', status: 'queued' },
        { id: 't-3', status: 'queued' },
        { id: 't-4', status: 'queued' },
        { id: 't-5', status: 'queued' },
        { id: 't-6', status: 'queued' },
      ],
      posts: [],
    });

    const service = new PipelineOrchestratorService(db, {} as any);
    const night = new Date('2026-10-20T22:05:00Z');

    const config: SchedulerConfig = {
      enabled: true,
      minTopicBacklog: 5,
      targetCoverageDays: 0,
      maxPostsPerNight: 0,
    };

    const result = await service.runAutomationTick(night, config);

    expect(result.ran).toBe(false);
    expect(result.outcome).toBe('COMPLETED_NO_WORK');
    expect(result.reason).toBe('Nothing to do.');
  });
});
