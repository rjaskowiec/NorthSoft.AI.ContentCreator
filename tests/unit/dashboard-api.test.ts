/**
 * Unit Tests — Dashboard API & Operational Summary Truthfulness
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dashboardRouter } from '../../src/api/admin/dashboard';
import { Hono } from 'hono';

class MockD1Statement {
  constructor(private sql: string, private bindings: any[] = [], private mockData: any = {}) {}

  bind(...args: any[]) {
    this.bindings = args;
    return this;
  }

  async first<T = any>(): Promise<T | null> {
    if (this.sql.includes('SELECT (SELECT COUNT(*) FROM content_ideas')) {
      return {
        ideas: 5,
        drafts: 2,
        awaitingQa: 1,
        approved: 4,
        scheduled: 2,
        published: 10,
        blocked: 0,
      } as unknown as T;
    }

    if (this.sql.includes('FROM schedules s')) {
      if (this.mockData.emptySchedules) return null;
      return {
        id: 'sched-123',
        post_id: 'post-123',
        scheduled_at: this.mockData.scheduledAt || '2026-10-02T10:00:00.000Z',
        post_title: 'Is Your Email Marketing Reaching Its Full Potential?',
      } as unknown as T;
    }

    if (this.sql.includes('status = \'pending\'')) {
      if (this.mockData.emptySchedules) return { cnt: 0 } as unknown as T;
      return { cnt: 2 } as unknown as T;
    }

    if (this.sql.includes('status = \'published\'')) {
      return { published_at: '2026-10-01T16:55:00.000Z' } as unknown as T;
    }

    if (this.sql.includes('status = \'failed\'')) {
      return { cnt: 0 } as unknown as T;
    }

    if (this.sql.includes('FROM orchestrator_runs')) {
      return null;
    }

    return null;
  }

  async all<T = any>(): Promise<{ results: T[] }> {
    return { results: [] };
  }

  async run() {
    return { meta: { changes: 0 } };
  }
}

class MockD1Database {
  public mockData: any = {};
  prepare(sql: string) {
    return new MockD1Statement(sql, [], this.mockData);
  }
}

describe('Dashboard Router — Operational Truthfulness', () => {
  let app: Hono<any>;
  let mockDb: MockD1Database;

  const mockEnv = {
    DB: null as any,
    ENVIRONMENT: 'production',
    FACEBOOK_PUBLISH_ENABLED: 'true',
    FACEBOOK_PAGE_ID: '107455558114139',
    FACEBOOK_ACCESS_TOKEN: 'EAAG...mock',
  };

  beforeEach(() => {
    mockDb = new MockD1Database();
    mockEnv.DB = mockDb;
    app = new Hono();
    app.route('/api/admin', dashboardRouter);
  });

  it('should return operational truth with REAL next publication time (10:00 UTC, not hardcoded 08:00)', async () => {
    mockDb.mockData.scheduledAt = '2026-10-02T10:00:00.000Z';
    const res = await app.request('/api/admin/dashboard', {}, mockEnv);

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.nextPublication.scheduledAt).toBe('2026-10-02T10:00:00.000Z');
    expect(body.nextPublication.postTitle).toContain('Email Marketing');
    expect(body.nextPublication.isOverdue).toBe(false);
    expect(body.nextPublication.remainingCount).toBe(2);
    expect(body.automation.status).toBe('Active');
  });

  it('should flag next publication as overdue when scheduled_at is in the past', async () => {
    mockDb.mockData.scheduledAt = '2026-09-30T10:00:00.000Z';
    const res = await app.request('/api/admin/dashboard', {}, mockEnv);

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.nextPublication.isOverdue).toBe(true);
    expect(body.attentionItems.length).toBeGreaterThan(0);
    expect(body.attentionItems.some((i: any) => i.title.includes('Overdue Publication Pending'))).toBe(true);
  });

  it('should return null nextPublication when scheduled queue is empty without fake fallback', async () => {
    mockDb.mockData.emptySchedules = true;
    const res = await app.request('/api/admin/dashboard', {}, mockEnv);

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.nextPublication.scheduledAt).toBeNull();
    expect(body.nextPublication.postTitle).toBeNull();
    expect(body.nextPublication.remainingCount).toBe(0);
  });
});
