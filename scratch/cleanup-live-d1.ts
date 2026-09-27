import { execSync } from 'child_process';

async function main() {
  console.log('🧹 Executing Production D1 Cleanup & Orphan Record Audit...');

  const databaseName = 'northsoft-ai-contentcreator-prod';

  // 1. Delete test records created during testing
  const cleanupSql = `
    DELETE FROM post_versions WHERE post_id IN (SELECT id FROM posts WHERE title LIKE '%live-test%' OR id LIKE '%live-test%');
    DELETE FROM posts WHERE title LIKE '%live-test%' OR id LIKE '%live-test%';
    DELETE FROM content_topic_history WHERE idea_id IN (SELECT id FROM content_ideas WHERE title LIKE '%live-test%' OR id LIKE '%live-test%');
    DELETE FROM content_ideas WHERE title LIKE '%live-test%' OR id LIKE '%live-test%';
  `;

  console.log('Executing cleanup query...');
  const cleanupOutput = execSync(
    `npx wrangler d1 execute ${databaseName} --remote --command "${cleanupSql.replace(/\n/g, ' ')}" --json`,
    { encoding: 'utf-8' }
  );
  console.log('Cleanup result:', cleanupOutput.trim());

  // 2. Perform Orphan Record Audit across 8 key tables
  const orphanAuditQueries = [
    { name: 'Orphan post_versions', sql: 'SELECT count(*) as count FROM post_versions pv LEFT JOIN posts p ON pv.post_id = p.id WHERE p.id IS NULL' },
    { name: 'Orphan publications', sql: 'SELECT count(*) as count FROM publications pub LEFT JOIN posts p ON pub.post_id = p.id WHERE p.id IS NULL' },
    { name: 'Orphan schedules', sql: 'SELECT count(*) as count FROM schedules s LEFT JOIN posts p ON s.post_id = p.id WHERE p.id IS NULL' },
    { name: 'Orphan quality_checks', sql: 'SELECT count(*) as count FROM quality_checks q LEFT JOIN posts p ON q.post_id = p.id WHERE p.id IS NULL' },
    { name: 'Orphan post_sources', sql: 'SELECT count(*) as count FROM post_sources ps LEFT JOIN posts p ON ps.post_id = p.id WHERE p.id IS NULL' },
    { name: 'Orphan content_topic_history', sql: 'SELECT count(*) as count FROM content_topic_history cth LEFT JOIN content_ideas c ON cth.idea_id = c.id WHERE c.id IS NULL' },
    { name: 'Incomplete posts without post_versions content', sql: 'SELECT count(*) as count FROM posts p LEFT JOIN post_versions pv ON p.id = pv.post_id WHERE pv.id IS NULL' },
  ];

  console.log('\n--- Production D1 Orphan Record Audit Results ---');
  for (const query of orphanAuditQueries) {
    const output = execSync(
      `npx wrangler d1 execute ${databaseName} --remote --command "${query.sql}" --json`,
      { encoding: 'utf-8' }
    );
    const parsed = JSON.parse(output);
    const count = parsed[0]?.results?.[0]?.count ?? -1;
    console.log(`[AUDIT] ${query.name}: ${count} orphan records found.`);
  }

  // 3. Count total records in primary content tables
  const tables = ['content_ideas', 'posts', 'post_versions', 'publications', 'schedules', 'quality_checks', 'post_sources', 'content_topic_history'];
  console.log('\n--- Table Record Counts ---');
  for (const table of tables) {
    const output = execSync(
      `npx wrangler d1 execute ${databaseName} --remote --command "SELECT count(*) as count FROM ${table}" --json`,
      { encoding: 'utf-8' }
    );
    const parsed = JSON.parse(output);
    const count = parsed[0]?.results?.[0]?.count ?? -1;
    console.log(`[COUNT] ${table}: ${count} rows`);
  }

  console.log('\n✓ Cleanup and Audit Completed Successfully.');
}

main().catch((err) => {
  console.error('Error during cleanup:', err);
  process.exit(1);
});
