import type { Pool, PoolClient } from '@runwayctrl/db';
import type { TenantContext } from '../context.js';
import type { LeaseRow } from './types.js';

export type AcquireLeaseInput = {
  resourceKey: string;
  holderId: string;
  expiresAt: Date;
};

export type RenewLeaseInput = {
  resourceKey: string;
  holderId: string;
  expiresAt: Date;
};

const pickClient = (pool: Pool, client?: PoolClient): Pool | PoolClient => {
  return client ?? pool;
};

export class LeaseRepo {
  constructor(private readonly pool: Pool) {}

  async acquire(
    ctx: TenantContext,
    input: AcquireLeaseInput,
    client?: PoolClient,
  ): Promise<LeaseRow> {
    const db = pickClient(this.pool, client);
    const res = await db.query<LeaseRow>(
      `
      insert into leases (tenant_id, resource_key, holder_id, expires_at)
      values ($1, $2, $3, $4)
      on conflict (tenant_id, resource_key)
      do update set
        holder_id = excluded.holder_id,
        acquired_at = now(),
        expires_at = excluded.expires_at
      where leases.expires_at <= now()
      returning tenant_id, resource_key, holder_id, acquired_at, expires_at
      `,
      [ctx.tenantId, input.resourceKey, input.holderId, input.expiresAt],
    );

    if (!res.rows[0]) {
      throw new Error('Lease is currently held and not expired');
    }

    return res.rows[0];
  }

  async renew(ctx: TenantContext, input: RenewLeaseInput, client?: PoolClient): Promise<LeaseRow> {
    const db = pickClient(this.pool, client);
    const res = await db.query<LeaseRow>(
      `
      update leases
      set expires_at = $4
      where tenant_id = $1 and resource_key = $2 and holder_id = $3
      returning tenant_id, resource_key, holder_id, acquired_at, expires_at
      `,
      [ctx.tenantId, input.resourceKey, input.holderId, input.expiresAt],
    );
    if (!res.rows[0]) {
      throw new Error('Lease not found or holder mismatch');
    }
    return res.rows[0];
  }

  async get(
    ctx: TenantContext,
    resourceKey: string,
    client?: PoolClient,
  ): Promise<LeaseRow | null> {
    const db = pickClient(this.pool, client);
    const res = await db.query<LeaseRow>(
      `
      select tenant_id, resource_key, holder_id, acquired_at, expires_at
      from leases
      where tenant_id = $1 and resource_key = $2
      `,
      [ctx.tenantId, resourceKey],
    );
    return res.rows[0] ?? null;
  }
}
