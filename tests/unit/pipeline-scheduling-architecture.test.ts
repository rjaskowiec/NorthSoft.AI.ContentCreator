import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  PipelineOrchestratorService,
} from '../../src/services/content/pipeline-orchestrator-service';
import {
  isWithinAiBackgroundWindow,
  getNextAiWindowStart,
  AI_BACKGROUND_WINDOW,
} from '../../src/core/ai-window-policy';

function createMockDb(initialData: {
  topics?: any[];
  posts?: any[];
  versions?: any[];
  images?: any[];
  schedules?: any[];
  runs?: any[];
  locks?: any[];
  topicHistory?: any[];
} = {}) {
  const topics = [...(initialData.topics || [])];
  const posts = [...(initialData.posts || [])];
  const versions = [...(initialData.versions || [])];
  const images = [...(initialData.images || [])];
  const schedules = [...(initialData.schedules || [])];
  const runs = [...(initialData.runs || [])];
  const locks = [...(initialData.locks || [])];
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
        if (sql.includes('FROM content_ideas') && sql.includes("status = 'deferred'")) {
          const cnt = topics.filter((t) => t.status === 'deferred').length;
          return { cnt } as T;
        }
        if (sql.includes('FROM posts') && sql.includes('NOT EXISTS (SELECT 1 FROM post_images')) {
          const cnt = posts.filter((p) => ['approved', 'scheduled'].includes(p.status) && !images.some((i) => i.post_id === p.id)).length;
          return { cnt } as T;
        }
        if (sql.includes('FROM posts') && (sql.includes('readyToSchedule') || (sql.includes('EXISTS (SELECT 1 FROM post_images') && sql.includes('NOT EXISTS (SELECT 1 FROM schedules')))) {
          const cnt = posts.filter((p) => {
            if (p.status !== 'approved') return false;
            const hasImg = images.some((i) => i.post_id === p.id && i.version_number === (p.current_version ?? 1));
            const hasSched = schedules.some((s) => s.post_id === p.id && ['pending', 'publishing'].includes(s.status));
            return hasImg && !hasSched;
          }).length;
          return { cnt } as T;
        }
        if (sql.includes('FROM schedules') && sql.includes('SELECT id FROM schedules WHERE post_id = ?')) {
          const postId = args[0];
          const sched = schedules.find((s) => s.post_id === postId);
          return sched ? ({ id: sched.id } as T) : null;
        }
        if (sql.includes('FROM schedules')) {
          return { cnt: schedules.length } as T;
        }
        if (sql.includes('FROM content_ideas WHERE id = ?')) {
          const id = args[0];
          const found = topics.find((t) => t.id === id);
          return found ? ({ ...found } as T) : null;
        }
        return null;
      },
      all: async <T>() => {
        if (sql.includes('content_ideas') && sql.includes("status = 'deferred'")) {
          const deferred = topics.filter((t) => t.status === 'deferred');
          return { results: deferred as T[] };
        }
        if (sql.includes('content_topic_history')) {
          return { results: [...topicHistory] as T[] };
        }
        if (sql.includes('FROM posts') && sql.includes("status = 'approved'")) {
          const ready = posts.filter((p) => {
            if (p.status !== 'approved') return false;
            const hasImg = images.some((i) => i.post_id === p.id && i.version_number === (p.current_version ?? 1));
            const hasSched = schedules.some((s) => s.post_id === p.id && ['pending', 'publishing'].includes(s.status));
            return hasImg && !hasSched;
          });
          return { results: ready as T[] };
        }
        return { results: [] as T[] };
      },
      run: async () => {
        if (sql.includes('pipeline_execution_locks') && sql.includes('INSERT')) {
          locks.push({ key: args[0], run_id: args[1], expires_at: args[4] });
          return { success: true };
        }
        if (sql.includes('pipeline_execution_locks') && sql.includes('DELETE')) {
          return { success: true };
        }
        if (sql.includes('content_ideas') && sql.includes("status = 'queued'")) {
          const id = args[1] || args[0];
          const t = topics.find((top) => top.id === id);
          if (t) t.status = 'queued';
          return { success: true };
        }
        if (sql.includes('schedules') && sql.includes('INSERT')) {
          schedules.push({ id: args[0], post_id: args[1], scheduled_at: args[2], status: 'pending' });
          return { success: true };
        }
        if (sql.includes('schedules') && sql.includes('UPDATE')) {
          const postId = args[4];
          const s = schedules.find((sched) => sched.post_id === postId);
          if (s) {
            s.scheduled_at = args[0];
            s.status = 'pending';
          }
          return { success: true };
        }
        return { success: true };
      },
    });

    return {
      bind: (...args: any[]) => execute(args),
      first: async <T>() => execute([]).first<T>(),
      all: async <T>() => execute([]).all<T>(),
      run: async () => execute([]).run(),
    };
  };

  const batch = async (statements: any[]) => {
    for (const stmt of statements) {
      await stmt.run();
    }
    return { success: true };
  };

  return {
    db: { prepare, batch } as any,
    topics,
    posts,
    versions,
    images,
    schedules,
    runs,
    locks,
  };
}

describe('AI Window Architecture & 24/7 Scheduling Regression Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // 1. W ciągu dnia można zaplanować zatwierdzony post, jeżeli wszystkie wymagane dane są już dostępne i nie jest potrzebne AI.
  it('1. Daytime deterministic scheduling: approved post with approved image is scheduled at midday without AI calls', async () => {
    const { db } = createMockDb({
      topics: [],
      posts: [{ id: 'post-midday-1', status: 'approved', current_version: 1 }],
      images: [{ post_id: 'post-midday-1', version_number: 1, url: 'https://cdn.example.com/ready.jpg' }],
      schedules: [],
    });

    const orchestrator = new PipelineOrchestratorService(db, {} as any);
    const midday = new Date('2026-10-20T13:30:00Z'); // Outside nightly AI window

    // Spy on runStage to monitor what stages execute
    const runStageSpy = vi.spyOn(orchestrator, 'runStage').mockImplementation(async (stage, _actor) => {
      if (stage === 'scheduling') {
        return {
          stage: 'scheduling',
          success: true,
          outcome: 'COMPLETED_WITH_OUTPUT',
          summary: 'Zaplanowano 1 post(ów)',
        };
      }
      throw new Error(`Unexpected stage called outside AI window: ${stage}`);
    });

    const result = await orchestrator.runAutomationTick(midday);

    expect(result.ran).toBe(true);
    expect(result.outcome).toBe('COMPLETED_WITH_OUTPUT');
    expect(result.deterministicOutcome).toBe('EXECUTED');
    expect(result.aiOutcome).toBe('AWAITING_WINDOW');
    expect(runStageSpy).toHaveBeenCalledWith('scheduling', 'system');
    expect(runStageSpy).not.toHaveBeenCalledWith('topics', expect.anything());
    expect(runStageSpy).not.toHaveBeenCalledWith('posts', expect.anything());
  });

  // 2. Brak zatwierdzonego obrazu blokuje wyłącznie zadania rzeczywiście od niego zależne, a nie cały pipeline.
  it('2. Missing image isolates block only to the image-dependent post; deferred topics are still promoted 24/7', async () => {
    const { db, topics } = createMockDb({
      topics: [
        {
          id: 'idea-deferred-1',
          title: 'AI SEO for Local Business',
          status: 'deferred',
          suggested_publish_date: '2026-10-20T08:00:00Z',
          cluster_key: 'ai_search_visibility',
        },
      ],
      posts: [{ id: 'post-no-image', status: 'approved', current_version: 1 }],
      images: [], // Missing image!
      schedules: [],
    });

    const orchestrator = new PipelineOrchestratorService(db, {} as any);
    const daytime = new Date('2026-10-20T11:00:00Z');

    const result = await orchestrator.runAutomationTick(daytime);

    // The deferred topic was successfully promoted!
    expect(result.ran).toBe(true);
    expect(result.outcome).toBe('COMPLETED_WITH_OUTPUT');
    expect(result.deterministicOutcome).toBe('EXECUTED');
    expect(result.reason).toContain('Przywrócono z odroczonych: 1');
    const promotedTopic = topics.find((t) => t.id === 'idea-deferred-1');
    expect(promotedTopic?.status).toBe('queued');
  });

  // 3. Poza nocnym oknem nie dochodzi do nowych wywołań AI.
  it('3. Zero AI calls outside nightly window: background tick performs strictly 0 AI stages', async () => {
    const { db } = createMockDb({
      topics: [{ id: 't1', status: 'queued' }],
      posts: [],
      images: [],
      schedules: [],
    });

    const orchestrator = new PipelineOrchestratorService(db, {} as any);
    const morning = new Date('2026-10-20T09:15:00Z');

    const runStageSpy = vi.spyOn(orchestrator, 'runStage');

    const result = await orchestrator.runAutomationTick(morning);

    expect(result.ran).toBe(false);
    expect(result.aiOutcome).toBe('AWAITING_WINDOW');
    expect(runStageSpy).not.toHaveBeenCalled();
  });

  // 4. W nocnym oknie etapy AI mogą działać zgodnie z istniejącymi limitami i regułami.
  it('4. Nightly window AI execution: runs eligible AI stage inside the 20:00–23:45 UTC window', async () => {
    const { db } = createMockDb({
      topics: [], // topic backlog empty -> needs topics
      posts: [],
      images: [],
      schedules: [],
      runs: [],
    });

    const orchestrator = new PipelineOrchestratorService(db, {} as any);
    const night = new Date('2026-10-20T21:30:00Z'); // Inside AI window (20:00–23:45 UTC)

    vi.spyOn(orchestrator, 'runStage').mockImplementation(async (stage) => {
      if (stage === 'topics') {
        return {
          stage: 'topics',
          success: true,
          outcome: 'COMPLETED_WITH_OUTPUT',
          summary: 'Znaleziono 5 źródeł, zaakceptowano 2',
        };
      }
      return { stage, success: true, summary: 'OK' };
    });

    const result = await orchestrator.runAutomationTick(night);

    expect(result.ran).toBe(true);
    expect(result.aiOutcome).toBe('EXECUTED');
    expect(result.outcome).toBe('COMPLETED_WITH_OUTPUT');
    expect(orchestrator.runStage).toHaveBeenCalledWith('topics', 'system');
  });

  // 5. Wyczerpanie limitu AI nie blokuje planowania gotowych postów ani innych operacji deterministycznych.
  it('5. AI quota exhaustion resilience: failed/quota-blocked AI stage does not abort scheduling of ready posts', async () => {
    const { db } = createMockDb({
      topics: [],
      posts: [{ id: 'post-ready-10', status: 'approved', current_version: 1 }],
      images: [{ post_id: 'post-ready-10', version_number: 1, url: 'https://cdn.example.com/pic.jpg' }],
      schedules: [],
      runs: [],
    });

    const orchestrator = new PipelineOrchestratorService(db, {} as any);
    const night = new Date('2026-10-20T22:00:00Z');

    // Simulate AI stage hitting quota/rate limit error
    vi.spyOn(orchestrator, 'runStage').mockImplementation(async (stage) => {
      if (stage === 'topics') {
        return {
          stage: 'topics',
          success: false,
          outcome: 'BLOCKED',
          summary: 'AI quota exhausted (Cloudflare Workers AI daily neuron ceiling).',
          error: 'AI_QUOTA_EXHAUSTED',
        };
      }
      if (stage === 'scheduling') {
        return {
          stage: 'scheduling',
          success: true,
          outcome: 'COMPLETED_WITH_OUTPUT',
          summary: 'Zaplanowano 1 post(ów)',
        };
      }
      return { stage, success: true, summary: 'OK' };
    });

    const result = await orchestrator.runAutomationTick(night);

    // AI is blocked by quota, BUT scheduling executed and overall tick succeeded with output!
    expect(result.ran).toBe(true);
    expect(result.aiOutcome).toBe('BLOCKED_QUOTA');
    expect(result.deterministicOutcome).toBe('EXECUTED');
    expect(result.outcome).toBe('COMPLETED_WITH_OUTPUT');
    expect(result.blockers?.some((b) => b.includes('AI stage blocked'))).toBe(true);
    expect(orchestrator.runStage).toHaveBeenCalledWith('scheduling', 'system');
  });

  // 6. Nieudane zadanie AI można bezpiecznie ponowić w kolejnym dozwolonym oknie.
  it('6. Safe retry in next window: deferred AI stage leaves clean state for subsequent window execution', async () => {
    const { db, topics } = createMockDb({
      topics: [{ id: 'topic-candidate-1', title: 'Automation Guide', status: 'queued' }],
      posts: [],
      images: [],
      schedules: [],
      runs: [],
    });

    const orchestrator = new PipelineOrchestratorService(db, {} as any);
    const window1 = new Date('2026-10-20T22:00:00Z');

    // In window 1, AI generation is deferred due to temporary rate limit
    vi.spyOn(orchestrator, 'runStage').mockResolvedValueOnce({
      stage: 'posts',
      success: false,
      outcome: 'BLOCKED',
      summary: 'Temporary AI rate limit (HTTP 429), deferred for retry',
      error: 'AI_RATE_LIMIT',
    });

    const tick1 = await orchestrator.runAutomationTick(window1);
    expect(tick1.aiOutcome).toBe('BLOCKED_QUOTA');
    expect(topics[0].status).toBe('queued'); // Topic remains queued, not discarded

    // In window 2 (e.g. next tick or next night), AI succeeds
    vi.spyOn(orchestrator, 'runStage').mockResolvedValueOnce({
      stage: 'posts',
      success: true,
      outcome: 'COMPLETED_WITH_OUTPUT',
      summary: 'Wygenerowano post: "Automation Guide"',
    });

    const window2 = new Date('2026-10-20T22:15:00Z');
    const tick2 = await orchestrator.runAutomationTick(window2);
    expect(tick2.aiOutcome).toBe('EXECUTED');
    expect(tick2.outcome).toBe('COMPLETED_WITH_OUTPUT');
  });

  // 7. Wielokrotne uruchomienie schedulera nie tworzy zduplikowanych harmonogramów.
  it('7. Idempotent scheduling: multiple consecutive scheduler runs never produce duplicate schedules', async () => {
    const { db, schedules } = createMockDb({
      topics: [],
      posts: [{ id: 'post-singleton', status: 'approved', current_version: 1 }],
      images: [{ post_id: 'post-singleton', version_number: 1, url: 'https://cdn.example.com/single.jpg' }],
      schedules: [],
    });

    const orchestrator = new PipelineOrchestratorService(db, {} as any);

    // Call runSchedulingStage twice consecutively
    const run1 = await orchestrator.runSchedulingStage('system');
    expect(run1.scheduledCount).toBe(1);
    expect(schedules.length).toBe(1);

    // Second run: post already has a pending schedule, so ready list is 0
    const run2 = await orchestrator.runSchedulingStage('system');
    expect(run2.scheduledCount).toBe(0);
    expect(schedules.length).toBe(1); // No duplicates!
  });

  // 8. Zmiana dnia, północ i strefa czasowa nie powodują pominięcia lub nieuprawnionego uruchomienia zadań.
  it('8. Timezone and midnight transitions: 23:45 boundary and midnight reset cleanly disable AI calls', () => {
    // 23:44 UTC: inside window
    expect(isWithinAiBackgroundWindow(new Date('2026-10-20T23:44:00Z'))).toBe(true);

    // 23:45 UTC: last minute of window
    expect(isWithinAiBackgroundWindow(new Date('2026-10-20T23:45:00Z'))).toBe(true);

    // 23:46 UTC: window closed
    expect(isWithinAiBackgroundWindow(new Date('2026-10-20T23:46:00Z'))).toBe(false);

    // 00:00 UTC (midnight / neuron reset moment): strictly outside window
    expect(isWithinAiBackgroundWindow(new Date('2026-10-21T00:00:00Z'))).toBe(false);

    // 00:01 UTC: strictly outside window
    expect(isWithinAiBackgroundWindow(new Date('2026-10-21T00:01:00Z'))).toBe(false);

    // Next window start calculation from 00:05 UTC points correctly to 20:00 UTC of that day
    const nextStart = getNextAiWindowStart(new Date('2026-10-21T00:05:00Z'));
    expect(nextStart.getUTCHours()).toBe(AI_BACKGROUND_WINDOW.START_HOUR_UTC);
    expect(nextStart.getUTCMinutes()).toBe(AI_BACKGROUND_WINDOW.START_MINUTE_UTC);
    expect(nextStart.getUTCDate()).toBe(21);
  });

  // 9. Wszystkie dotychczasowe zabezpieczenia, limity, zatwierdzenia i kontrole jakości nadal działają.
  it('9. Security and Quality Integrity: posts without approved image are never scheduled', async () => {
    const { db, schedules } = createMockDb({
      topics: [],
      posts: [{ id: 'post-unapproved-image', status: 'approved', current_version: 1 }],
      images: [], // No approved image attached!
      schedules: [],
    });

    const orchestrator = new PipelineOrchestratorService(db, {} as any);
    const result = await orchestrator.runSchedulingStage('system');

    expect(result.scheduledCount).toBe(0);
    expect(result.skippedWithoutImage).toBe(1);
    expect(schedules.length).toBe(0);
  });
});
