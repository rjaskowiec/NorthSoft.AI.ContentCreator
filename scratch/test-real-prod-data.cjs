const fs = require('fs');
const html = fs.readFileSync('admin.html', 'utf8');

const scriptStart = html.indexOf('<script>');
const scriptEnd = html.indexOf('</script>', scriptStart);
const js = html.substring(scriptStart + 8, scriptEnd);

// Let's create realistic database response objects from D1 migrations and API schemas:
const mockResponses = {
  '/api/auth/session': { authenticated: true, user: { username: 'rjaskowiec' }, csrfToken: 'test-csrf' },
  '/api/admin/dashboard': {
    systemStatus: { environment: 'production', worker: 'Healthy', database: 'Connected', aiProvider: 'Cloudflare Workers AI' },
    pipeline: { discoveredTopics: 5, drafts: 2, underReview: 1, approved: 1, scheduled: 0, published: 10, rejected: 0 },
    aiUsage: {
      cloudflareVerifiedUsage: { status: 'VERIFIED', actualNeurons: 113, actualRequests: 5, period: 'Today (UTC)', source: 'Cloudflare GraphQL API', lastUpdated: new Date().toISOString() },
      applicationSafetyGuard: { todayRequests: 5, dailyLimit: 300, status: 'FREE_CAPACITY_AVAILABLE' },
      internalDiagnostics: { estimatedTokensToday: 120 }
    },
    lastRun: { started_at: new Date().toISOString(), trigger_type: 'cron', status: 'completed', result_status: 'SUCCESS', neurons_used: 113 },
    recentActivity: [
      { id: '1', eventType: 'POST_GENERATED', status: 'COMPLETED', actor: 'system', entityType: 'post', entityId: 'p123', timestamp: new Date().toISOString(), details: { title: 'Test Post' } }
    ]
  },
  '/api/admin/pipeline/scheduler': {
    config: { enabled: true, frequency: 'daily', publicationTime: '09:00', timezone: 'UTC', discoveryEnabled: true, generationEnabled: true, evaluationEnabled: true, publishingEnabled: true }
  },
  '/api/admin/pipeline/history': {
    history: [
      { started_at: new Date().toISOString(), finished_at: new Date().toISOString(), trigger_type: 'manual', status: 'completed', result_status: 'SUCCESS', neurons_used: 113, topics_discovered: 5, topics_selected: 1, post_id: 'post-123456789' },
      { started_at: new Date().toISOString(), finished_at: null, trigger_type: 'cron', status: 'running', result_status: null, neurons_used: null }
    ]
  },
  '/api/admin/content/posts': {
    posts: [
      { id: 'p1', title: 'Sample Post Title', latest_body: 'Sample body text for preview...', status: 'approved', current_version: 1, quality_score: 95, quality_decision: 'PASS', created_at: new Date().toISOString() }
    ]
  },
  '/api/admin/research': {
    stats: { totalSources: 4, enabledSources: 4, totalTopicsDiscovered: 12, lastRunAt: new Date().toISOString() },
    runs: [
      { started_at: new Date().toISOString(), trigger_type: 'cron', status: 'completed', items_discovered: 10, items_normalized: 8, rejected_irrelevant: 1, rejected_low_quality: 1, duplicates_found: 1, topics_created: 5, pillar_breakdown: JSON.stringify({ ARCHITECTURE: 2, AI: 3 }) }
    ],
    topics: [
      { title: 'AI Scaling in Cloudflare Workers', description: 'Exploring AI models', category: 'AI', priority: 85, status: 'approved', created_at: new Date().toISOString() }
    ],
    sources: [
      { name: 'Cloudflare Blog', category: 'rss', url: 'https://blog.cloudflare.com/rss', enabled: 1, last_checked_at: new Date().toISOString() }
    ]
  },
  '/api/admin/schedules': {
    schedules: [
      { post_title: 'Scheduled Post', scheduled_at: new Date().toISOString(), status: 'scheduled', current_version: 1, quality_score: 90, quality_decision: 'PASS', created_at: new Date().toISOString() }
    ]
  },
  '/api/admin/publications': {
    configStatus: { state: 'READY', pageIdConfigured: true, tokenConfigured: true, apiVersion: 'v26.0', publishEnabled: true },
    publications: [
      { id: 'pub1', postId: 'p1', postTitle: 'Test Pub', postBody: 'Body text...', provider: 'facebook', qualityGateStatus: 'PASS', status: 'published', facebookPostId: '123456789_987654321', publishedAt: new Date().toISOString() }
    ]
  },
  '/api/admin/audit?page=1&pageSize=25&category=all&search=': {
    stats: { totalEvents: 10, errorCount: 0, warningCount: 0, aiOperations: 2 },
    pagination: { page: 1, pageSize: 25, totalPages: 1, totalCount: 10 },
    events: [
      { id: 'ev1', eventType: 'AUTH_LOGIN_SUCCESS', level: 'INFO', status: 'COMPLETED', actor: 'admin', entityType: 'admin_user', entityId: 'u1', timestamp: new Date().toISOString(), details: { username: 'rjaskowiec' } }
    ]
  },
  '/api/admin/facebook/page-posts?limit=5': {
    configured: true,
    pageInfo: { name: 'NorthSoft', id: '123456' },
    posts: [
      { id: 'fb_post_1', createdTime: new Date().toISOString(), message: 'Hello Facebook Page!', permalinkUrl: 'https://facebook.com/1' }
    ],
    paging: { hasMore: false }
  }
};

const elements = {};
function createMockEl(id) {
  return {
    id,
    style: {},
    classList: {
      add: (c) => {},
      remove: (c) => {},
      contains: () => false
    },
    addEventListener: () => {},
    dataset: {}
  };
}

const mockDoc = {
  readyState: 'complete',
  addEventListener: () => {},
  getElementById: (id) => {
    if (!elements[id]) elements[id] = createMockEl(id);
    return elements[id];
  },
  querySelectorAll: (selector) => {
    return [createMockEl('mock1')];
  }
};

const sandbox = {
  window: {
    location: { hash: '', search: '', pathname: '/admin' },
    history: { pushState: () => {} },
    addEventListener: () => {},
    document: mockDoc
  },
  document: mockDoc,
  fetch: async (url) => {
    const key = Object.keys(mockResponses).find(k => url.startsWith(k));
    const data = mockResponses[key] || { ok: true };
    return { ok: true, status: 200, json: async () => data };
  },
  console: {
    log: (...a) => console.log('[LOG]', ...a),
    error: (...a) => console.error('[ERR]', ...a),
    warn: (...a) => console.warn('[WARN]', ...a)
  },
  URLSearchParams: URLSearchParams,
  Date: Date,
  Math: Math,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  String: String,
  Number: Number,
  Boolean: Boolean,
  Array: Array,
  Object: Object,
  Set: Set,
  encodeURIComponent: encodeURIComponent,
  decodeURIComponent: decodeURIComponent
};

const vm = require('vm');
const context = vm.createContext(sandbox);

try {
  vm.runInContext(js, context);
  console.log('[OK] Loaded script without errors.');

  const tabs = ['dashboard', 'pipeline', 'content', 'research', 'schedules', 'publications', 'manual-publisher', 'audit', 'security'];
  for (const t of tabs) {
    console.log(`\nTesting switchTab('${t}')...`);
    sandbox.switchTab(t);
  }
  console.log('\n[ALL TABS TESTED SUCCESSFULLY]');
} catch(e) {
  console.error('[CRITICAL RUNTIME EXCEPTION]', e);
}
