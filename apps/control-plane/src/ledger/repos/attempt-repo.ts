import type { Pool, PoolClient } from '@runwayctrl/db';
import type { TenantContext } from '../context.js';
import type { AttemptRow } from './types.js';

export type CreateAttemptInput = {
  attemptId: string;
  actionKey: string;
  requestHash: string;
};

export type AttemptStatus = AttemptRow['status'];

export type SetAttemptStatusInput = {
  status: Exclude<AttemptStatus, 'IN_FLIGHT'>;
  endedAt?: Date;
  failureClass?: string;
  outcomeHash?: string;
  outcomePointer?: string;
  traceId?: string;
  toolHttpStatus?: number;
  latencyMs?: number;
};

const pickClient = (pool: Pool, client?: PoolClient): Pool | PoolClient => {
  return client ?? pool;
};

export class AttemptRepo {
  constructor(private readonly pool: Pool) {}

  async create(ctx: TenantContext, input: CreateAttemptInput, client?: PoolClient): Promise<AttemptRow> {
    const db = pickClient(this.pool, client);

    const res = await db.query<AttemptRow>(
      `
      insert into attempts (tenant_id, attempt_id, action_key, request_hash)
      values ($1, $2, $3, $4)
      returning tenant_id, attempt_id, action_key, status, request_hash, started_at, ended_at, failure_class, outcome_hash, outcome_pointer
      `,
      [ctx.tenantId, input.attemptId, input.actionKey, input.requestHash],
    );

    return res.rows[0]!;
  }

  async setStatus(
    ctx: TenantContext,
    attemptId: string,
    input: SetAttemptStatusInput,
    client?: PoolClient,
  ): Promise<AttemptRow> {
    const db = pickClient(this.pool, client);

    const endedAt = input.endedAt ?? new Date();
    const res = await db.query<AttemptRow>(
      `
      update attempts
      set
        status = $3,
        ended_at = $4,
        failure_class = $5,
        outcome_hash = $6,
        outcome_pointer = $7,
        trace_id = $8,
        tool_http_status = $9,
        latency_ms = $10
      where tenant_id = $1 and attempt_id = $2
      returning tenant_id, attempt_id, action_key, status, request_hash, started_at, ended_at, failure_class, outcome_hash, outcome_pointer
      `,
      [
        ctx.tenantId,
        attemptId,
        input.status,
        endedAt,
        input.failureClass ?? null,
        input.outcomeHash ?? null,
        input.outcomePointer ?? null,
        input.traceId ?? null,
        input.toolHttpStatus ?? null,
        input.latencyMs ?? null,
      ],
    );

    if (!res.rows[0]) {
      throw new Error(`Attempt not found: ${attemptId}`);
    }

    return res.rows[0];
  }

  async getLatestByActionKey(ctx: TenantContext, actionKey: string, client?: PoolClient): Promise<AttemptRow | null> {
    const db = pickClient(this.pool, client);
    const res = await db.query<AttemptRow>(
      `
      select tenant_id, attempt_id, action_key, status, request_hash, started_at, ended_at, failure_class, outcome_hash, outcome_pointer
      from attempts
      where tenant_id = $1 and action_key = $2
      order by started_at desc
      limit 1
      `,
      [ctx.tenantId, actionKey],
    );

    return res.rows[0] ?? null;
  }
}
