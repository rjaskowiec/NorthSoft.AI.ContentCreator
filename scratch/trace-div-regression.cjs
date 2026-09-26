const { execSync } = require('child_process');

const commits = [
  '32c341b',
  '7313df8',
  '7b23835',
  'dedce32',
  '5bc30b6',
  'bf446b8',
  'f0ed93d',
  '62c3193',
  '868d302',
  'dfc272e',
  '6fa0d86'
];

console.log('--- Historical Net Open Depth for tab-dashboard ---');

for (const commit of commits) {
  try {
    const uiTs = execSync(`git show ${commit}:src/admin/ui.ts`, { encoding: 'utf8' });
    const lines = uiTs.split('\n');
    const dashboardStartLine = lines.findIndex(l => l.includes('id="tab-dashboard"'));
    const pipelineStartLine = lines.findIndex(l => l.includes('id="tab-pipeline"'));

    if (dashboardStartLine === -1 || pipelineStartLine === -1) {
      console.log(`Commit ${commit}: tab-dashboard or tab-pipeline not found`);
      continue;
    }

    let openDivs = 0;
    let closeDivs = 0;

    for (let i = dashboardStartLine; i < pipelineStartLine; i++) {
      const line = lines[i];
      const opens = (line.match(/<div[\s>]/g) || []).length;
      const closes = (line.match(/<\/div>/g) || []).length;
      openDivs += opens;
      closeDivs += closes;
    }

    const diff = openDivs - closeDivs;
    console.log(`Commit ${commit}: Net Depth = ${diff} (Opens: ${openDivs}, Closes: ${closeDivs}) ${diff === 1 ? '<--- BROKEN (MISSING </div>)' : '<--- BALANCED'}`);
  } catch (err) {
    console.log(`Commit ${commit}: error reading file`);
  }
}
