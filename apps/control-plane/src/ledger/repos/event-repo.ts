import type { Pool, PoolClient } from '@runwayctrl/db';
import type { TenantContext } from '../context.js';
import type { AttemptEventRow } from './types.js';

export type AppendEventInput = {
  attemptId: string;
  eventType: string;
  details?: Record<string, unknown>;
  ts?: Date;
};

const pickClient = (pool: Pool, client?: PoolClient): Pool | PoolClient => {
  return client ?? pool;
};

export class EventRepo {
  constructor(private readonly pool: Pool) {}

  async append(ctx: TenantContext, input: AppendEventInput, client?: PoolClient): Promise<void> {
    const db = pickClient(this.pool, client);
    await db.query(
      `
      insert into attempt_events (tenant_id, attempt_id, ts, event_type, details)
      values ($1, $2, $3, $4, $5::jsonb)
      `,
      [
        ctx.tenantId,
        input.attemptId,
        input.ts ?? new Date(),
        input.eventType,
        JSON.stringify(input.details ?? {}),
      ],
    );
  }

  async listByAttemptId(
    ctx: TenantContext,
    attemptId: string,
    client?: PoolClient,
  ): Promise<AttemptEventRow[]> {
    const db = pickClient(this.pool, client);
    const res = await db.query<AttemptEventRow>(
      `
      select tenant_id, event_id, attempt_id, ts, event_type, details
      from attempt_events
      where tenant_id = $1 and attempt_id = $2
      order by ts asc, event_id asc
      `,
      [ctx.tenantId, attemptId],
    );
    return res.rows;
  }
}
