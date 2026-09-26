const fs = require('fs');

const uiTs = fs.readFileSync('d:/Repo/Projekty Roberta/Infrastructure/NorthSoft.AI.ContentCreator/src/admin/ui.ts', 'utf8');

const lines = uiTs.split('\n');
const dashboardStartLine = lines.findIndex(l => l.includes('id="tab-dashboard"'));
const pipelineStartLine = lines.findIndex(l => l.includes('id="tab-pipeline"'));

let depth = 0;
for (let i = dashboardStartLine; i < pipelineStartLine; i++) {
  const line = lines[i];
  const opens = (line.match(/<div[\s>]/g) || []).length;
  const closes = (line.match(/<\/div>/g) || []).length;
  const diff = opens - closes;
  depth += diff;
  if (diff !== 0) {
    console.log(`Line ${(i + 1).toString().padStart(4)} | diff: ${(diff > 0 ? '+' : '') + diff} | depth: ${depth} | ${line.trim()}`);
  }
}
