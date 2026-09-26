const fs = require('fs');

const uiTs = fs.readFileSync('d:/Repo/Projekty Roberta/Infrastructure/NorthSoft.AI.ContentCreator/src/admin/ui.ts', 'utf8');

const lines = uiTs.split('\n');
const dashboardStartLine = lines.findIndex(l => l.includes('id="tab-dashboard"'));
const pipelineStartLine = lines.findIndex(l => l.includes('id="tab-pipeline"'));

console.log(`tab-dashboard starts at line ${dashboardStartLine + 1}`);
console.log(`tab-pipeline starts at line ${pipelineStartLine + 1}`);

let openDivs = 0;
let closeDivs = 0;

for (let i = dashboardStartLine; i < pipelineStartLine; i++) {
  const line = lines[i];
  const opens = (line.match(/<div[\s>]/g) || []).length;
  const closes = (line.match(/<\/div>/g) || []).length;
  openDivs += opens;
  closeDivs += closes;
}

console.log(`Between tab-dashboard and tab-pipeline:`);
console.log(`Open <div...> tags:  ${openDivs}`);
console.log(`Closing </div> tags: ${closeDivs}`);
console.log(`Net open depth:       ${openDivs - closeDivs}`);
