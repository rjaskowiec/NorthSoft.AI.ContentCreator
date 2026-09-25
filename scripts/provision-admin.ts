/**
 * NorthSoft.AI.ContentCreator — Admin Provisioning Tool
 *
 * Command line utility to provision initial administrator accounts
 * without committing default credentials to source code or D1 migrations.
 *
 * Usage:
 *   npx tsx scripts/provision-admin.ts --username <username> --password <password> [--output-sql]
 */

import { generateSalt, hashPassword } from '../src/core/auth/crypto';

async function main() {
  const args = process.argv.slice(2);
  let username = '';
  let password = '';
  let outputSqlOnly = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--username' && args[i + 1]) {
      username = args[i + 1];
      i++;
    } else if (args[i] === '--password' && args[i + 1]) {
      password = args[i + 1];
      i++;
    } else if (args[i] === '--output-sql') {
      outputSqlOnly = true;
    }
  }

  if (!username || !password) {
    console.error('Error: Both --username and --password arguments are required.');
    console.error('Usage: npx tsx scripts/provision-admin.ts --username <username> --password <password>');
    process.exit(1);
  }

  if (password.length < 12) {
    console.error('Error: Password must be at least 12 characters long for security.');
    process.exit(1);
  }

  const userId = crypto.randomUUID();
  const salt = generateSalt(16);
  const hash = await hashPassword(password, salt, 60000);
  const nowIso = new Date().toISOString();

  const sql = `INSERT INTO admin_users (id, username, password_hash, password_salt, status, created_at, updated_at) VALUES ('${userId}', '${username}', '${hash}', '${salt}', 'active', '${nowIso}', '${nowIso}');`;

  if (outputSqlOnly) {
    console.log(sql);
  } else {
    console.log('\n===========================================================');
    console.log(' NorthSoft AI — Secure Admin Provisioning SQL');
    console.log('===========================================================');
    console.log(`Username: ${username}`);
    console.log(`User ID:  ${userId}`);
    console.log('-----------------------------------------------------------');
    console.log('SQL Statement to execute on target D1 database:\n');
    console.log(sql);
    console.log('-----------------------------------------------------------');
    console.log('To execute on local database:');
    console.log(`npx wrangler d1 execute DB --local --command="${sql}"\n`);
    console.log('To execute on remote staging database:');
    console.log(`npx wrangler d1 execute northsoft-ai-contentcreator-staging --remote --command="${sql}"\n`);
    console.log('To execute on remote production database:');
    console.log(`npx wrangler d1 execute northsoft-ai-contentcreator-prod --remote --command="${sql}"`);
    console.log('===========================================================\n');
  }
}

main().catch((err) => {
  console.error('Provisioning failed:', err);
  process.exit(1);
});
