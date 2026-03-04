import { randomBytes } from 'node:crypto';

import { hash } from '@node-rs/argon2';
import { createPool, withTx } from '@runwayctrl/db';

import { loadEnv } from '../lib/env.js';

type SeedResult =
  | {
      tenantId: string;
      tenantName: string;
      apiKeyId: string;
      created: true;
    }
  | {
      tenantId: string;
      tenantName: string;
      apiKeyId: string;
      created: false;
      reason: 'API_KEY_ALREADY_EXISTS';
    };

const generateId = (prefix: string): string => {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
};

const getDevPlaintextApiKeyFromEnv = (): string | undefined => {
  const raw = process.env.RUNWAYCTRL_DEV_API_KEY_PLAINTEXT;
  if (!raw) return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const seedDevTenantAndApiKey = async (): Promise<SeedResult> => {
  const env = loadEnv(process.env);
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for seeding');
  }

  const tenantName = process.env.RUNWAYCTRL_DEV_TENANT_NAME ?? 'dev';
  const apiKeyLabel = process.env.RUNWAYCTRL_DEV_API_KEY_LABEL ?? 'dev-key';

  const pool = createPool({ connectionString: env.DATABASE_URL, max: 4 });
  try {
    return await withTx(pool, async (client) => {
      // Idempotent by tenant name.
      const tenantRes = await client.query<{ id: string }>(
        `
        insert into tenants (id, name)
        values ($1, $2)
        on conflict (name) do update set name = excluded.name
        returning id
        `,
        [generateId('tenant'), tenantName],
      );

      const tenantId = tenantRes.rows[0]!.id;

      const existing = await client.query<{ api_key_id: string }>(
        `
        select api_key_id
        from api_keys
        where tenant_id = $1 and label = $2
        limit 1
        `,
        [tenantId, apiKeyLabel],
      );

      if (existing.rows[0]) {
        return {
          tenantId,
          tenantName,
          apiKeyId: existing.rows[0].api_key_id,
          created: false,
          reason: 'API_KEY_ALREADY_EXISTS',
        };
      }

      const plaintextApiKey = getDevPlaintextApiKeyFromEnv();
      if (!plaintextApiKey) {
        throw new Error(
          '[seed] RUNWAYCTRL_DEV_API_KEY_PLAINTEXT is required when creating a new dev API key. Generate one locally and re-run.',
        );
      }
      const apiKeyId = generateId('key');
      // @node-rs/argon2 defaults to Argon2id (best-practice default).
      const keyHash = await hash(plaintextApiKey);

      await client.query(
        `
        insert into api_keys (api_key_id, tenant_id, label, key_hash)
        values ($1, $2, $3, $4)
        `,
        [apiKeyId, tenantId, apiKeyLabel, keyHash],
      );

      return {
        tenantId,
        tenantName,
        apiKeyId,
        created: true,
      };
    });
  } finally {
    await pool.end();
  }
};

export const main = async (): Promise<void> => {
  const existingPlaintext = getDevPlaintextApiKeyFromEnv();
  const result = await seedDevTenantAndApiKey();

  if (!result.created) {
    console.warn(
      `[seed] Dev API key already exists for tenant name "${result.tenantName}" (tenant_id=${result.tenantId}).`,
    );
    console.warn(`  api_key_id=${result.apiKeyId}`);
    console.warn('[seed] Not regenerating (plaintext cannot be recovered).');
    console.warn(
      '[seed] To rotate, delete the existing API key row or change RUNWAYCTRL_DEV_API_KEY_LABEL and re-run.',
    );
    return;
  }

  console.warn('[seed] Created dev tenant + API key');
  console.warn(`  tenant_name=${result.tenantName}`);
  console.warn(`  tenant_id=${result.tenantId}`);
  console.warn(`  api_key_id=${result.apiKeyId}`);
  console.warn('');
  console.warn('[seed] Bearer token format: <api_key_id>.<api_key_secret>');
  console.warn('');
  console.warn('==================== IMPORTANT ====================');
  console.warn(
    'For security, the plaintext API key is not printed by this script (CodeQL policy).',
  );
  if (existingPlaintext) {
    console.warn('Plaintext API key was provided via RUNWAYCTRL_DEV_API_KEY_PLAINTEXT.');
    console.warn('Store it securely (do NOT commit/paste into logs/tickets).');
  } else {
    console.warn('No RUNWAYCTRL_DEV_API_KEY_PLAINTEXT was provided; no plaintext key was printed.');
    console.warn(
      'If a new key was required, the seed step will fail until RUNWAYCTRL_DEV_API_KEY_PLAINTEXT is provided.',
    );
  }
  console.warn('===================================================');
};
