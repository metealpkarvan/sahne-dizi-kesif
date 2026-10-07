import pg from 'pg';
import { attachDatabasePool } from '@vercel/functions';

// DATE is a calendar day, not a timestamp. pg's default local-midnight Date
// parser shifts that day when serialized in UTC (for example in Istanbul).
// Keep DATE values as YYYY-MM-DD; timestamp/timestamptz parsers stay unchanged.
pg.types.setTypeParser(1082, 'text', value => value);

// A single pool per warm Node function; never create a connection per request.
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 10000,
});
attachDatabasePool(pool);
pool.on('error', () => console.error('Postgres idle connection error'));

export const query = (text, values = []) => pool.query(text, values);
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
