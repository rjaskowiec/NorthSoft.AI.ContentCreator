import { chromium } from 'playwright';
import { renderAdminHtml } from '../src/admin/ui';

async function testLocalHtml() {
  console.log('=== TESTING LOCAL FIXED renderAdminHtml() IN PLAYWRIGHT ===');

  const html = renderAdminHtml();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.setContent(html, { waitUntil: 'domcontentloaded' });

  // Simulate dashboard visible state
  await page.evaluate(() => {
    const login = document.getElementById('login-screen');
    if (login) login.style.display = 'none';
    const dash = document.getElementById('dashboard-screen');
    if (dash) dash.style.display = 'flex';
  });

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
    console.log(`Testing Local HTML Tab: ${t.name} (${t.key})`);
    console.log(`==================================================`);

    await page.evaluate((key) => window.switchTab(key), t.key);

    const shotPath = `scratch/local-0${i + 2}-${t.key}.png`;
    await page.screenshot({ path: shotPath, fullPage: false });
    console.log(`Saved screenshot ${shotPath}`);

    const tabMetrics = await page.evaluate((id) => {
      const tabEl = document.getElementById(id);
      if (!tabEl) return { error: 'Tab element not found' };

      const style = window.getComputedStyle(tabEl);
      const rect = tabEl.getBoundingClientRect().toJSON();

      const ancestors = [];
      let parent = tabEl.parentElement;
      while (parent && parent !== document.body) {
        const ps = window.getComputedStyle(parent);
        ancestors.push({
          id: parent.id || '',
          className: parent.className || '',
          tagName: parent.tagName,
          display: ps.display,
          rect: parent.getBoundingClientRect().toJSON(),
        });
        parent = parent.parentElement;
      }

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + Math.min(rect.height / 2, 200);
      const topElement = document.elementFromPoint(centerX, centerY);

      return {
        tabId: id,
        display: style.display,
        rect,
        ancestors,
        topElementAtCenter: topElement ? { id: topElement.id, class: topElement.className, tag: topElement.tagName } : null,
      };
    }, t.tabId);

    console.log(`Tab Rect: x=${tabMetrics.rect.x}, y=${tabMetrics.rect.y}, w=${tabMetrics.rect.width}, h=${tabMetrics.rect.height}`);
    console.log(`Computed Display: ${tabMetrics.display}`);
    console.log(`Top Element at Center:`, tabMetrics.topElementAtCenter);

    console.log('--- Ancestor Chain ---');
    tabMetrics.ancestors.forEach((a, idx) => {
      console.log(`  [${idx}] <${a.tagName} id="${a.id}" class="${a.className}"> display:${a.display} rect:[x:${a.rect.x}, y:${a.rect.y}, w:${a.rect.width}, h:${a.rect.height}]`);
    });
  }

  await browser.close();
}

testLocalHtml().catch(err => {
  console.error('Local test error:', err);
  process.exit(1);
});
