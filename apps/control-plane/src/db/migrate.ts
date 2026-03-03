import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';
import { loadEnv } from '../lib/env.js';

type MigrationRow = {
  name: string;
  sha256: string;
  applied_at: Date;
};

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

const sha256 = (content: string): string => {
  return createHash('sha256').update(content, 'utf8').digest('hex');
};

const ensureMigrationsTable = async (pool: Pool): Promise<void> => {
  await pool.query(`
    create table if not exists schema_migrations (
      name text primary key,
      sha256 text not null,
      applied_at timestamptz not null default now()
    );
  `);
};

const main = async (): Promise<void> => {
  const env = loadEnv(process.env);
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for migrations');
  }

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    await ensureMigrationsTable(pool);

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

    const applied = await pool.query<MigrationRow>(
      'select name, sha256, applied_at from schema_migrations',
    );
    const appliedByName = new Map(applied.rows.map((r) => [r.name, r]));

    for (const file of files) {
      const fullPath = join(MIGRATIONS_DIR, file);
      const sql = await readFile(fullPath, 'utf8');
      const digest = sha256(sql);

      const already = appliedByName.get(file);
      if (already) {
        if (already.sha256 !== digest) {
          throw new Error(
            `Migration checksum mismatch for ${file}. ` +
              'Refusing to run because this implies history was rewritten.',
          );
        }
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into schema_migrations(name, sha256) values ($1, $2)', [
          file,
          digest,
        ]);
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        throw err;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
};

await main();
