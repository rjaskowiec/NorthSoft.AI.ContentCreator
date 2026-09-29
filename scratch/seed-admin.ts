import { hashPassword } from '../src/core/auth/crypto';

async function seedAdmin() {
  const { hash, salt } = await hashPassword('admin123');
  
  console.log(`
Please run the following command to seed your admin user:

npx wrangler d1 execute DB --local --command "INSERT INTO admin_users (id, username, password_hash, password_salt, status, created_at, updated_at) VALUES ('admin_seeded', 'admin', '${hash}', '${salt}', 'active', datetime('now'), datetime('now'));"
  `);
}

seedAdmin().catch(console.error);
