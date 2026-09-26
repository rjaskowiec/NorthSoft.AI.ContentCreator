const fs = require('fs');

const uiTs = fs.readFileSync('d:/Repo/Projekty Roberta/Infrastructure/NorthSoft.AI.ContentCreator/src/admin/ui.ts', 'utf8');

const tabIds = ['tab-dashboard', 'tab-pipeline', 'tab-content', 'tab-research', 'tab-schedules', 'tab-publications', 'tab-manual-publisher', 'tab-audit', 'tab-security'];

for (const tabId of tabIds) {
  const idx = uiTs.indexOf(`id="${tabId}"`);
  console.log(`Tab ${tabId} found at character index: ${idx}`);
}
