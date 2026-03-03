import type { Pool, PoolClient } from '@runwayctrl/db';

import type { TenantContext } from '../context.js';
import type { ActionRepo } from '../repos/action-repo.js';
import type { AttemptRepo } from '../repos/attempt-repo.js';
import type { EventRepo } from '../repos/event-repo.js';

const pickClient = (pool: Pool, client?: PoolClient): Pool | PoolClient => {
  return client ?? pool;
};

export const truncateLedger = async (pool: Pool): Promise<void> => {
  await pool.query(
    'truncate table attempt_events, attempts, leases, actions, api_keys, tenants restart identity cascade',
  );
};

export const ensureTenant = async (
  pool: Pool,
  input: { tenantId: string; name: string },
  client?: PoolClient,
): Promise<void> => {
  const db = pickClient(pool, client);
  await db.query(
    `
    insert into tenants (id, name)
    values ($1, $2)
    on conflict (id) do update set name = excluded.name
    `,
    [input.tenantId, input.name],
  );
};

export const createAction = async (
  repo: ActionRepo,
  ctx: TenantContext,
  input: {
    actionKey: string;
    tool: string;
    action: string;
    requestHash: string;
    resourceKey?: string;
  },
  client?: PoolClient,
): Promise<void> => {
  await repo.upsert(ctx, input, client);
};

export const createAttempt = async (
  repo: AttemptRepo,
  ctx: TenantContext,
  input: { attemptId: string; actionKey: string; requestHash: string },
  client?: PoolClient,
): Promise<void> => {
  await repo.create(ctx, input, client);
};

export const appendEvent = async (
  repo: EventRepo,
  ctx: TenantContext,
  input: { attemptId: string; eventType: string; ts?: Date; details?: Record<string, unknown> },
  client?: PoolClient,
): Promise<void> => {
  await repo.append(ctx, input, client);
};
