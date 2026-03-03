import type { Pool, PoolClient } from '@runwayctrl/db';
import type { TenantContext } from '../context.js';
import type { ActionRow } from './types.js';

export type ActionUpsertInput = {
  actionKey: string;
  tool: string;
  action: string;
  resourceKey?: string;
  requestHash: string;
};

const pickClient = (pool: Pool, client?: PoolClient): Pool | PoolClient => {
  return client ?? pool;
};

export class ActionRepo {
  constructor(private readonly pool: Pool) {}

  async upsert(ctx: TenantContext, input: ActionUpsertInput, client?: PoolClient): Promise<ActionRow> {
    const db = pickClient(this.pool, client);

    const inserted = await db.query<ActionRow>(
      `
      insert into actions (tenant_id, action_key, tool, action, resource_key, request_hash)
      values ($1, $2, $3, $4, $5, $6)
      on conflict (tenant_id, action_key)
      do update set
        tool = excluded.tool,
        action = excluded.action,
        resource_key = excluded.resource_key,
        request_hash = excluded.request_hash
      returning tenant_id, action_key, tool, action, resource_key, request_hash, created_at
      `,
      [ctx.tenantId, input.actionKey, input.tool, input.action, input.resourceKey ?? null, input.requestHash],
    );

    return inserted.rows[0]!;
  }

  async getByKey(ctx: TenantContext, actionKey: string, client?: PoolClient): Promise<ActionRow | null> {
    const db = pickClient(this.pool, client);
    const res = await db.query<ActionRow>(
      `
      select tenant_id, action_key, tool, action, resource_key, request_hash, created_at
      from actions
      where tenant_id = $1 and action_key = $2
      `,
      [ctx.tenantId, actionKey],
    );
    return res.rows[0] ?? null;
  }
}
