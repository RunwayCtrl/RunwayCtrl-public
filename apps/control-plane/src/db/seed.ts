import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { loadEnv } from '../lib/env.js';

const main = async (): Promise<void> => {
  const env = loadEnv(process.env);
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for seeding');
  }

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    // Phase 0 seed is intentionally minimal: it validates connectivity.
    // Phase 1 adds real tenant/api_key seeding once the ledger schema exists.
    await pool.query('select 1 as ok');

    // A tiny canary write that is safe to keep and doesn't pre-empt Phase 1 schema decisions.
    await pool.query(
      `create table if not exists seed_canary (
         id text primary key,
         created_at timestamptz not null default now()
       );`,
    );

    const id = `seed_${randomBytes(6).toString('hex')}`;
    await pool.query('insert into seed_canary(id) values ($1) on conflict (id) do nothing', [id]);

    console.warn(
      '[seed] Phase 0 seed completed (connectivity + canary table). Phase 1 will add dev tenant + API key seeding.',
    );
  } finally {
    await pool.end();
  }
};

await main();
