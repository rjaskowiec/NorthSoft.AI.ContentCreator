const crypto = require('crypto');
const { execSync } = require('child_process');

const rawToken = 'my_test_token_1234567890_abcdef';
const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
const csrfSecret = 'csrf_secret_12345';
const sessionId = crypto.randomUUID();
const userId = 'd1c40509-5404-43fb-b9bb-d76ac260351c';
const expiresAt = '2026-10-01T00:00:00.000Z';
const now = new Date().toISOString();

const sql = `INSERT INTO admin_sessions (id, admin_user_id, token_hash, csrf_secret, expires_at, created_at, last_seen_at, revoked_at) VALUES ('${sessionId}', '${userId}', '${tokenHash}', '${csrfSecret}', '${expiresAt}', '${now}', '${now}', NULL);`;

execSync(`npx wrangler d1 execute northsoft-ai-contentcreator-prod --remote --command="${sql}"`, { stdio: 'inherit' });

console.log('Inserted active session token successfully!');
console.log(`Raw Token: ${rawToken}`);
