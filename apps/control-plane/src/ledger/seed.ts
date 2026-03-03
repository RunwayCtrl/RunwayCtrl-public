import { randomBytes } from 'node:crypto';

import { hash } from '@node-rs/argon2';
import { createPool, withTx } from '@runwayctrl/db';

import { loadEnv } from '../lib/env.js';

type SeedResult =
  | {
      tenantId: string;
      tenantName: string;
      apiKeyLabel: string;
      created: true;
      plaintextApiKey: string;
      apiKeyId: string;
    }
  | {
      tenantId: string;
      tenantName: string;
      apiKeyLabel: string;
      created: false;
      reason: 'API_KEY_ALREADY_EXISTS';
    };

const generateId = (prefix: string): string => {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
};

const generatePlaintextApiKey = (): string => {
  // recognizability + copy/paste friendliness
  return `rwc_${randomBytes(24).toString('base64url')}`;
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
        where tenant_id = $1 and label = $2 and revoked_at is null
        limit 1
        `,
        [tenantId, apiKeyLabel],
      );

      if (existing.rows[0]) {
        return {
          tenantId,
          tenantName,
          apiKeyLabel,
          created: false,
          reason: 'API_KEY_ALREADY_EXISTS',
        };
      }

      const plaintextApiKey = generatePlaintextApiKey();
      const apiKeyId = generateId('key');
      // @node-rs/argon2 defaults to Argon2id (best-practice default).
      const keyHash = await hash(plaintextApiKey);

      const insertRes = await client.query<{ api_key_id: string }>(
        `
        insert into api_keys (api_key_id, tenant_id, label, key_hash)
        values ($1, $2, $3, $4)
        returning api_key_id
        `,
        [apiKeyId, tenantId, apiKeyLabel, keyHash],
      );

      return {
        tenantId,
        tenantName,
        apiKeyLabel,
        created: true,
        plaintextApiKey,
        apiKeyId: insertRes.rows[0]!.api_key_id,
      };
    });
  } finally {
    await pool.end();
  }
};

export const main = async (): Promise<void> => {
  const result = await seedDevTenantAndApiKey();

  if (!result.created) {
    console.warn(
      `[seed] Dev API key already exists for tenant name "${result.tenantName}" (tenant_id=${result.tenantId}) and label "${result.apiKeyLabel}".`,
    );
    console.warn('[seed] Not regenerating (plaintext cannot be recovered).');
    console.warn(
      '[seed] To rotate, revoke/delete the row or change RUNWAYCTRL_DEV_API_KEY_LABEL and re-run.',
    );
    return;
  }

  console.warn('[seed] Created dev tenant + API key');
  console.warn(`  tenant_name=${result.tenantName}`);
  console.warn(`  tenant_id=${result.tenantId}`);
  console.warn(`  api_key_label=${result.apiKeyLabel}`);
  console.warn(`  api_key_id=${result.apiKeyId}`);
  console.warn('');
  console.warn('==================== IMPORTANT ====================');
  console.warn('This API key will be shown ONCE. Store it securely.');
  console.warn('Do NOT commit it. Do NOT paste it into tickets/logs.');
  console.warn('===================================================');
  console.warn(result.plaintextApiKey);
  console.warn('===================================================');
};
