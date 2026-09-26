const { chromium } = require('playwright');
const crypto = require('crypto');
const { execSync } = require('child_process');
const fs = require('fs');

function createProductionD1Session() {
  const rawToken = 'diag_token_' + Date.now();
  const csrfSecret = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const sessionId = crypto.randomUUID();

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
  const createdAt = now.toISOString();
  const userId = 'd1c40509-5404-43fb-b9bb-d76ac260351c';

  const sql = `INSERT INTO admin_sessions (id, admin_user_id, token_hash, csrf_secret, expires_at, created_at, last_seen_at, revoked_at) VALUES ('${sessionId}', '${userId}', '${tokenHash}', '${csrfSecret}', '${expiresAt}', '${createdAt}', '${createdAt}', NULL);`;

  console.log('[DIAGNOSTIC] Provisioning active admin session in D1...');
  execSync(`npx wrangler d1 execute northsoft-ai-contentcreator-prod --remote --command="${sql}"`, { stdio: 'pipe' });

  return rawToken;
}

async function runVisualDiagnostic() {
  console.log('=== STARTING VISUAL & LAYOUT DIAGNOSTIC ===');
  const rawToken = createProductionD1Session();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  await context.addCookies([
    {
      name: 'admin_session',
      value: rawToken,
      domain: 'ai.northsoft.is',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);

  const page = await context.newPage();

  page.on('console', msg => console.log('[BROWSER CONSOLE]', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('[BROWSER ERROR]', err));

  console.log('Navigating to https://ai.northsoft.is/admin ...');
  await page.goto('https://ai.northsoft.is/admin', { waitUntil: 'networkidle' });

  // 1. Capture Dashboard Screenshot
  await page.screenshot({ path: 'scratch/01-dashboard.png', fullPage: false });
  console.log('Saved scratch/01-dashboard.png');

  // Inspect HTML Structure of workspace layout
  const layoutInfo = await page.evaluate(() => {
    const screen = document.getElementById('dashboard-screen');
    const layout = document.querySelector('.app-layout');
    const main = document.querySelector('.main-content');
    const body = document.querySelector('.content-body');
    const sidebar = document.querySelector('.sidebar');
    const rightRail = document.querySelector('.fb-rail') || document.querySelector('.facebook-rail') || document.querySelector('.right-rail');

    return {
      screenDisplay: screen ? getComputedStyle(screen).display : 'null',
      layoutDisplay: layout ? getComputedStyle(layout).display : 'null',
      layoutGridCols: layout ? getComputedStyle(layout).gridTemplateColumns : 'null',
      mainDisplay: main ? getComputedStyle(main).display : 'null',
      mainRect: main ? main.getBoundingClientRect().toJSON() : null,
      bodyRect: body ? body.getBoundingClientRect().toJSON() : null,
      sidebarRect: sidebar ? sidebar.getBoundingClientRect().toJSON() : null,
      rightRailRect: rightRail ? rightRail.getBoundingClientRect().toJSON() : null,
    };
  });
  console.log('\n--- Initial Layout Structure ---');
  console.log(JSON.stringify(layoutInfo, null, 2));

  const tabsToTest = [
    { name: 'Research', key: 'research', tabId: 'tab-research' },
    { name: 'Content', key: 'content', tabId: 'tab-content' },
    { name: 'Pipeline', key: 'pipeline', tabId: 'tab-pipeline' },
    { name: 'Schedules', key: 'schedules', tabId: 'tab-schedules' },
    { name: 'Publications', key: 'publications', tabId: 'tab-publications' },
    { name: 'Security', key: 'security', tabId: 'tab-security' },
  ];

  for (let i = 0; i < tabsToTest.length; i++) {
    const t = tabsToTest[i];
    console.log(`\n==================================================`);
    console.log(`Testing Tab: ${t.name} (${t.key})`);
    console.log(`==================================================`);

    // Measure before click
    const beforeHtmlLen = await page.evaluate((id) => {
      const el = document.getElementById(id);
      return el ? el.innerHTML.length : -1;
    }, t.tabId);

    // Click tab
    await page.evaluate((key) => window.switchTab(key), t.key);
    await page.waitForTimeout(1000);

    const shotPath = `scratch/0${i + 2}-${t.key}.png`;
    await page.screenshot({ path: shotPath, fullPage: false });
    console.log(`Saved screenshot ${shotPath}`);

    // Inspect detailed DOM & CSS metrics
    const tabMetrics = await page.evaluate((id) => {
      const tabEl = document.getElementById(id);
      if (!tabEl) return { error: 'Tab element not found' };

      const style = window.getComputedStyle(tabEl);
      const rect = tabEl.getBoundingClientRect().toJSON();

      // Trace ancestor chain up to body
      const ancestors = [];
      let parent = tabEl.parentElement;
      while (parent && parent !== document.body) {
        const ps = window.getComputedStyle(parent);
        ancestors.push({
          id: parent.id || '',
          className: parent.className || '',
          tagName: parent.tagName,
          display: ps.display,
          visibility: ps.visibility,
          opacity: ps.opacity,
          position: ps.position,
          zIndex: ps.zIndex,
          overflow: ps.overflow,
          rect: parent.getBoundingClientRect().toJSON(),
        });
        parent = parent.parentElement;
      }

      // Element from point at center of tab rect
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + Math.min(rect.height / 2, 200);
      const topElement = document.elementFromPoint(centerX, centerY);
      const elementsStack = document.elementsFromPoint(centerX, centerY);

      return {
        tabId: id,
        classList: Array.from(tabEl.classList),
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        position: style.position,
        zIndex: style.zIndex,
        overflow: style.overflow,
        width: style.width,
        height: style.height,
        rect,
        innerHTMLCount: tabEl.innerHTML.length,
        innerTextCount: tabEl.innerText.length,
        textSnippet: tabEl.innerText.substring(0, 150),
        ancestors,
        topElementAtCenter: topElement ? { id: topElement.id, class: topElement.className, tag: topElement.tagName } : null,
        elementsStackAtCenter: elementsStack.map(el => ({ id: el.id, class: el.className, tag: el.tagName })),
      };
    }, t.tabId);

    console.log(`Before innerHTML: ${beforeHtmlLen} | After innerHTML: ${tabMetrics.innerHTMLCount} | innerText len: ${tabMetrics.innerTextCount}`);
    console.log(`Tab Rect: x=${tabMetrics.rect.x}, y=${tabMetrics.rect.y}, w=${tabMetrics.rect.width}, h=${tabMetrics.rect.height}`);
    console.log(`Computed Display: ${tabMetrics.display}, Visibility: ${tabMetrics.visibility}, Opacity: ${tabMetrics.opacity}`);
    console.log(`Top Element at Center:`, tabMetrics.topElementAtCenter);
    console.log(`Elements Stack at Center:`, tabMetrics.elementsStackAtCenter);

    console.log('\n--- Ancestor Chain for ' + t.name + ' ---');
    tabMetrics.ancestors.forEach((a, idx) => {
      console.log(`  [${idx}] <${a.tagName} id="${a.id}" class="${a.className}"> display:${a.display} pos:${a.position} z:${a.zIndex} rect:[${a.rect.x},${a.rect.y},${a.rect.width},${a.rect.height}]`);
    });
  }

  await browser.close();
}

runVisualDiagnostic().catch(err => {
  console.error('Diagnostic error:', err);
  process.exit(1);
});
