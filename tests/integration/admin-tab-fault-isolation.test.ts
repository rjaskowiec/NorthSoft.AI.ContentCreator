import { describe, expect, it } from 'vitest';
import { app } from '../../src/index';

describe('Admin UI Navigation & Tab Fault Isolation Regression Tests', () => {
  it('serves admin UI HTML containing safe async switchTab and safe string utilities', async () => {
    const res = await app.request('/admin');
    expect(res.status).toBe(200);
    const html = await res.text();

    // 1. Verify switchTab is async
    expect(html).toContain('async function switchTab');

    // 2. Verify safe string utility functions exist
    expect(html).toContain('function safeStr');
    expect(html).toContain('function safeUpper');
    expect(html).toContain('function safeLower');

    // 3. Verify all loaders are awaited in switchTab
    expect(html).toContain('await loadResearchData()');
    expect(html).toContain('await loadPipelineData()');
    expect(html).toContain('await loadContentData()');
    expect(html).toContain('await loadSchedulesData()');
    expect(html).toContain('await loadPublicationsData()');
    expect(html).toContain('await loadAuditData()');
    expect(html).toContain('await loadSecurityData()');
  });

  it('safely renders non-string API payloads (numeric IDs, null status) without TypeError', async () => {
    const res = await app.request('/admin');
    const html = await res.text();

    const scriptStart = html.indexOf('<script>');
    const scriptEnd = html.indexOf('</script>', scriptStart);
    const js = html.substring(scriptStart + 8, scriptEnd);

    // Simulated API payloads with non-string values
    const malformedPayloads = {
      history: [
        {
          started_at: new Date().toISOString(),
          finished_at: new Date().toISOString(),
          trigger_type: 999, // numeric trigger
          status: null, // null status
          result_status: false,
          neurons_used: 113,
          topics_discovered: 5,
          post_id: 123456789, // numeric post_id
        },
      ],
      topics: [
        {
          title: 404,
          description: null,
          category: undefined,
          priority: '100',
          status: null,
          created_at: 123456,
        },
      ],
      events: [
        {
          id: 777,
          eventType: 101,
          status: null,
          level: null,
          actor: 42,
          entityType: null,
          entityId: 9999,
          timestamp: null,
          details: { error: 500, stage: null },
        },
      ],
      posts: [
        {
          id: 123,
          title: null,
          latest_body: 99,
          status: null,
          current_version: '2',
          quality_score: null,
          quality_decision: null,
          created_at: null,
        },
      ],
    };

    const vm = await import('vm');

    interface MockElement {
      id: string;
      style: Record<string, string>;
      classList: { add: (cls: string) => void; remove: (cls: string) => void };
      textContent: string;
      innerHTML: string;
      addEventListener: (evt: string, fn: () => void) => void;
      dataset: Record<string, string>;
    }

    const elements: Record<string, MockElement> = {};

    function getMockEl(id: string): MockElement {
      if (!elements[id]) {
        elements[id] = {
          id,
          style: {},
          classList: { add: () => {}, remove: () => {} },
          textContent: '',
          innerHTML: '',
          addEventListener: () => {},
          dataset: {},
        };
      }
      return elements[id];
    }

    elements['login-screen'] = getMockEl('login-screen');
    elements['login-screen'].style.display = 'flex';
    elements['dashboard-screen'] = getMockEl('dashboard-screen');
    elements['dashboard-screen'].style.display = 'none';

    const sandbox = {
      window: {
        location: { hash: '', search: '', pathname: '/admin' },
        history: { pushState: () => {} },
        addEventListener: () => {},
        document: {
          readyState: 'complete',
          addEventListener: () => {},
          getElementById: (id: string) => getMockEl(id),
          querySelectorAll: () => [getMockEl('mock1')],
        },
        switchTab: undefined as unknown as (tabName: string) => Promise<void>,
      },
      document: {
        readyState: 'complete',
        addEventListener: () => {},
        getElementById: (id: string) => getMockEl(id),
        querySelectorAll: () => [getMockEl('mock1')],
      },
      fetch: async (url: string) => {
        if (url.includes('/session')) {
          return { ok: true, json: async () => ({ authenticated: true, user: { username: 'admin' } }) };
        }
        return { ok: true, status: 200, json: async () => malformedPayloads };
      },
      console: {
        log: () => {},
        error: (...args: unknown[]) => {
          for (const arg of args) {
            if (arg instanceof TypeError || (typeof arg === 'string' && arg.includes('TypeError'))) {
              throw arg;
            }
          }
        },
        warn: () => {},
      },
      URLSearchParams,
      Date,
      Math,
      setTimeout,
      clearTimeout,
      String,
      Number,
      Boolean,
      Array,
      Object,
      Set,
      encodeURIComponent,
      decodeURIComponent,
    };

    const context = vm.createContext(sandbox);
    vm.runInContext(js, context);

    // Verify switchTab can cycle through all tabs with malformed non-string payload data without throwing
    const tabs = ['dashboard', 'pipeline', 'content', 'research', 'schedules', 'publications', 'manual-publisher', 'audit', 'security'];
    for (const tab of tabs) {
      await sandbox.window.switchTab(tab);
    }

    // Dashboard screen MUST remain visible (display: flex)
    expect(elements['dashboard-screen'].style.display).toBe('flex');
    expect(elements['login-screen'].style.display).toBe('none');
  });

  it('handles sub-resource 500 API errors gracefully without hiding dashboard or showing login screen', async () => {
    const res = await app.request('/admin');
    const html = await res.text();

    const scriptStart = html.indexOf('<script>');
    const scriptEnd = html.indexOf('</script>', scriptStart);
    const js = html.substring(scriptStart + 8, scriptEnd);

    const vm = await import('vm');

    interface MockElement {
      id: string;
      style: Record<string, string>;
      classList: { add: (cls: string) => void; remove: (cls: string) => void };
      textContent: string;
      innerHTML: string;
      addEventListener: (evt: string, fn: () => void) => void;
      dataset: Record<string, string>;
    }

    const elements: Record<string, MockElement> = {};

    function getMockEl(id: string): MockElement {
      if (!elements[id]) {
        elements[id] = {
          id,
          style: {},
          classList: { add: () => {}, remove: () => {} },
          textContent: '',
          innerHTML: '',
          addEventListener: () => {},
          dataset: {},
        };
      }
      return elements[id];
    }

    elements['login-screen'] = getMockEl('login-screen');
    elements['login-screen'].style.display = 'flex';
    elements['dashboard-screen'] = getMockEl('dashboard-screen');
    elements['dashboard-screen'].style.display = 'none';

    const sandbox = {
      window: {
        location: { hash: '', search: '', pathname: '/admin' },
        history: { pushState: () => {} },
        addEventListener: () => {},
        document: {
          readyState: 'complete',
          addEventListener: () => {},
          getElementById: (id: string) => getMockEl(id),
          querySelectorAll: () => [getMockEl('mock1')],
        },
        switchTab: undefined as unknown as (tabName: string) => Promise<void>,
      },
      document: {
        readyState: 'complete',
        addEventListener: () => {},
        getElementById: (id: string) => getMockEl(id),
        querySelectorAll: () => [getMockEl('mock1')],
      },
      fetch: async (url: string) => {
        if (url.includes('/session')) {
          return { ok: true, json: async () => ({ authenticated: true, user: { username: 'admin' } }) };
        }
        // Sub-resource endpoints return 500 Internal Server Error
        return { ok: false, status: 500, statusText: 'Internal Server Error', json: async () => ({ error: 'Server Error' }) };
      },
      console: { log: () => {}, error: () => {}, warn: () => {} },
      URLSearchParams,
      Date,
      Math,
      setTimeout,
      clearTimeout,
      String,
      Number,
      Boolean,
      Array,
      Object,
      Set,
      encodeURIComponent,
      decodeURIComponent,
    };

    const context = vm.createContext(sandbox);
    vm.runInContext(js, context);

    // Initial session load
    await sandbox.window.switchTab('dashboard');
    expect(elements['dashboard-screen'].style.display).toBe('flex');
    expect(elements['login-screen'].style.display).toBe('none');

    // Click Research tab (API returns 500)
    await sandbox.window.switchTab('research');
    expect(elements['dashboard-screen'].style.display).toBe('flex'); // Dashboard MUST NOT be hidden
    expect(elements['login-screen'].style.display).toBe('none'); // Login screen MUST NOT be shown

    // Click Content tab (API returns 500)
    await sandbox.window.switchTab('content');
    expect(elements['dashboard-screen'].style.display).toBe('flex');

    // Click Pipeline tab (API returns 500)
    await sandbox.window.switchTab('pipeline');
    expect(elements['dashboard-screen'].style.display).toBe('flex');
  });
});
