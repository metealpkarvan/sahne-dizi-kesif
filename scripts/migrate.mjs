import { readFile } from 'node:fs/promises';
import { getMigrations } from 'better-auth/db/migration';
import { auth } from '../server/auth.js';
import { pool, transaction } from '../server/db.js';

if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET || !process.env.BETTER_AUTH_URL) {
  throw new Error('DATABASE_URL, BETTER_AUTH_SECRET and BETTER_AUTH_URL must be configured.');
}
try {
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
  const sql = await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8');
  await transaction(client => client.query(sql));
  console.log('Better Auth and Sahne community schemas are ready.');
} catch (error) {
  console.error('Migration failed:', error.code || error.name);
  process.exitCode = 1;
} finally {
  await pool.end();
}
