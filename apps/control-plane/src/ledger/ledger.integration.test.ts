import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { createPool, withTx } from '@runwayctrl/db';
import { ActionRepo, AttemptRepo, EventRepo } from './index.js';
import { ensureTenant, truncateLedger } from './test/fixtures.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe('ledger repos (integration)', () => {
  if (!DATABASE_URL) {
    it('skips (DATABASE_URL not set)', () => {
      expect(true).toBe(true);
    });
    return;
  }

  const pool = createPool({ connectionString: DATABASE_URL, max: 4 });
  const actions = new ActionRepo(pool);
  const attempts = new AttemptRepo(pool);
  const events = new EventRepo(pool);

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateLedger(pool);
  });

  it('enforces tenant isolation (same action_key can exist for different tenants)', async () => {
    await ensureTenant(pool, { tenantId: 't1', name: 'Tenant 1' });
    await ensureTenant(pool, { tenantId: 't2', name: 'Tenant 2' });

    await actions.upsert(
      { tenantId: 't1' },
      { actionKey: 'ak_same', tool: 'toolA', action: 'doThing', requestHash: 'h1' },
    );
    await actions.upsert(
      { tenantId: 't2' },
      { actionKey: 'ak_same', tool: 'toolA', action: 'doThing', requestHash: 'h2' },
    );

    const t1Row = await actions.getByKey({ tenantId: 't1' }, 'ak_same');
    const t2Row = await actions.getByKey({ tenantId: 't2' }, 'ak_same');

    expect(t1Row?.request_hash).toBe('h1');
    expect(t2Row?.request_hash).toBe('h2');

    const wrongTenantRead = await actions.getByKey({ tenantId: 't1' }, 'does-not-exist');
    expect(wrongTenantRead).toBeNull();
  });

  it('is atomic: action + attempts are rolled back together on failure', async () => {
    await ensureTenant(pool, { tenantId: 't1', name: 'Tenant 1' });

    await expect(
      withTx(pool, async (client) => {
        await actions.upsert(
          { tenantId: 't1' },
          { actionKey: 'ak_atomic', tool: 'toolA', action: 'doThing', requestHash: 'h1' },
          client,
        );

        await attempts.create(
          { tenantId: 't1' },
          { attemptId: 'att1', actionKey: 'ak_atomic', requestHash: 'h1' },
          client,
        );

        // Force a failure (duplicate PK) so the tx must rollback.
        await attempts.create(
          { tenantId: 't1' },
          { attemptId: 'att1', actionKey: 'ak_atomic', requestHash: 'h1' },
          client,
        );
      }),
    ).rejects.toBeDefined();

    const action = await actions.getByKey({ tenantId: 't1' }, 'ak_atomic');
    expect(action).toBeNull();

    const rows = await pool.query('select count(*)::int as c from attempts where tenant_id = $1', [
      't1',
    ]);
    expect(rows.rows[0].c).toBe(0);
  });

  it('orders attempt events by (ts, event_id) for stable reads', async () => {
    await ensureTenant(pool, { tenantId: 't1', name: 'Tenant 1' });

    await actions.upsert(
      { tenantId: 't1' },
      { actionKey: 'ak_events', tool: 'toolA', action: 'doThing', requestHash: 'h1' },
    );
    await attempts.create(
      { tenantId: 't1' },
      { attemptId: 'att_events', actionKey: 'ak_events', requestHash: 'h1' },
    );

    const ts = new Date('2026-03-03T00:00:00.000Z');
    await events.append({ tenantId: 't1' }, { attemptId: 'att_events', eventType: 'E1', ts });
    await events.append({ tenantId: 't1' }, { attemptId: 'att_events', eventType: 'E2', ts });

    const rows = await events.listByAttemptId({ tenantId: 't1' }, 'att_events');
    expect(rows.map((r) => r.event_type)).toEqual(['E1', 'E2']);
  });
});
