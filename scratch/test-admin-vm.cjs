const fs = require('fs');
const html = fs.readFileSync('admin.html', 'utf8');

// Extract first script block (our admin inline script)
const scriptStart = html.indexOf('<script>');
const scriptEnd = html.indexOf('</script>', scriptStart);
const js = html.substring(scriptStart + 8, scriptEnd);

console.log('Extracted JS length:', js.length);

const elements = {};
function createMockEl(id) {
  return {
    id,
    style: {},
    classList: {
      add: (c) => console.log(`[DOM] ${id}.classList.add('${c}')`),
      remove: (c) => console.log(`[DOM] ${id}.classList.remove('${c}')`),
      contains: () => false
    },
    addEventListener: () => {},
    dataset: {}
  };
}

const mockDoc = {
  readyState: 'complete',
  addEventListener: (evt, fn) => console.log(`[DOC] addEventListener('${evt}')`),
  getElementById: (id) => {
    if (!elements[id]) elements[id] = createMockEl(id);
    return elements[id];
  },
  querySelectorAll: (selector) => {
    console.log(`[DOC] querySelectorAll('${selector}')`);
    return [createMockEl('mock1'), createMockEl('mock2')];
  }
};

const mockWindow = {
  location: { hash: '#pipeline', search: '', pathname: '/admin' },
  history: { pushState: (a, b, url) => console.log(`[WINDOW] pushState -> ${url}`) },
  addEventListener: (evt, fn) => console.log(`[WINDOW] addEventListener('${evt}')`),
  document: mockDoc
};

const vm = require('vm');
const sandbox = {
  window: mockWindow,
  document: mockDoc,
  fetch: async (url) => {
    console.log(`[FETCH] ${url}`);
    if (url.includes('/session')) {
      return { ok: true, json: async () => ({ authenticated: true, user: { username: 'admin' }, csrfToken: 'tok123' }) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, posts: [], history: [], events: [], topics: [], sources: [], runs: [] }) };
  },
  console: console,
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

const context = vm.createContext(sandbox);

try {
  vm.runInContext(js, context);
  console.log('[SUCCESS] JS evaluated with 0 syntax errors!');

  console.log('\n--- TESTING switchTab("research") ---');
  sandbox.switchTab('research');

  console.log('\n--- TESTING switchTab("pipeline") ---');
  sandbox.switchTab('pipeline');

  console.log('\n--- TESTING switchTab("content") ---');
  sandbox.switchTab('content');

} catch(e) {
  console.error('[ERROR] VM Execution Error:', e);
}
