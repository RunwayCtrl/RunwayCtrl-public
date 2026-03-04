import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';

import { hash } from '@node-rs/argon2';
import { createPool } from '@runwayctrl/db';

import { buildApp } from './server.js';
import { truncateLedger } from './ledger/test/fixtures.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe('control-plane HTTP (integration)', () => {
  describe('request-id + error envelope', () => {
    const app = buildApp({ host: '127.0.0.1', port: 0, ipRateLimitRpm: 10_000 });

    afterAll(async () => {
      await app.close();
    });

    it('adds X-Request-Id to successful responses', async () => {
      const res = await app.inject({ method: 'GET', url: '/healthz' });
      expect(res.statusCode).toBe(200);

      const requestId = res.headers['x-request-id'];
      expect(typeof requestId).toBe('string');
      expect((requestId as string).length).toBeGreaterThan(8);

      expect(res.json()).toEqual({ ok: true });
    });

    it('echoes a safe incoming X-Request-Id', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/healthz',
        headers: {
          'x-request-id': 'client_req_12345678',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['x-request-id']).toBe('client_req_12345678');
    });

    it('returns standard envelope for 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/does-not-exist',
        headers: {
          'x-request-id': 'client_req_abcdefghi',
        },
      });

      expect(res.statusCode).toBe(404);
      expect(res.headers['x-request-id']).toBe('client_req_abcdefghi');
      expect(res.json()).toEqual({
        request_id: 'client_req_abcdefghi',
        error_code: 'NOT_FOUND',
        message: 'Not found',
      });
    });

    it('returns standard envelope for /readyz when DB is missing', async () => {
      const res = await app.inject({ method: 'GET', url: '/readyz' });

      expect(res.statusCode).toBe(500);
      const body = res.json();
      expect(body).toMatchObject({
        error_code: 'INTERNAL_ERROR',
        message: 'DATABASE_URL not configured',
      });
      expect(typeof body.request_id).toBe('string');
      expect(body.request_id).toBe(res.headers['x-request-id']);
    });
  });

  describe('auth (Bearer <api_key_id>.<secret>)', () => {
    if (!DATABASE_URL) {
      it('skips (DATABASE_URL not set)', () => {
        expect(true).toBe(true);
      });
      return;
    }

    const setupPool = createPool({ connectionString: DATABASE_URL, max: 2 });

    const app = buildApp({
      host: '127.0.0.1',
      port: 0,
      databaseUrl: DATABASE_URL,
      ipRateLimitRpm: 10_000,
      tenantRateLimitRpm: 10_000,
      verifiedSecretCacheTtlMs: 30_000,
    });

    beforeAll(async () => {
      // no-op; app is used via inject
    });

    afterAll(async () => {
      await app.close();
      await setupPool.end();
    });

    beforeEach(async () => {
      await truncateLedger(setupPool);

      const tenantId = 'tenant_test';
      await setupPool.query(
        `insert into tenants (id, name) values ($1, $2) on conflict (id) do update set name = excluded.name`,
        [tenantId, 'test'],
      );

      const apiKeyId = 'key_test';
      const secret = 'secret_test_123';
      const keyHash = await hash(secret);

      await setupPool.query(
        `
        insert into api_keys (api_key_id, tenant_id, label, key_hash)
        values ($1, $2, $3, $4)
        `,
        [apiKeyId, tenantId, 'test-key', keyHash],
      );
    });

    it('returns tenant_id for valid API key', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/whoami',
        headers: {
          authorization: 'Bearer key_test.secret_test_123',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        tenant_id: 'tenant_test',
      });
    });

    it('rejects invalid API key secret', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/whoami',
        headers: {
          authorization: 'Bearer key_test.wrong_secret',
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({
        error_code: 'AUTH_ERROR',
      });
    });

    it('applies tenant rate limit after auth', async () => {
      const limitedApp = buildApp({
        host: '127.0.0.1',
        port: 0,
        databaseUrl: DATABASE_URL,
        ipRateLimitRpm: 10_000,
        tenantRateLimitRpm: 1,
      });

      try {
        const first = await limitedApp.inject({
          method: 'GET',
          url: '/v1/whoami',
          headers: {
            authorization: 'Bearer key_test.secret_test_123',
          },
        });
        expect(first.statusCode).toBe(200);

        const second = await limitedApp.inject({
          method: 'GET',
          url: '/v1/whoami',
          headers: {
            authorization: 'Bearer key_test.secret_test_123',
          },
        });
        expect(second.statusCode).toBe(429);
        expect(second.json()).toMatchObject({
          error_code: 'RATE_LIMITED',
          message: 'Tenant rate limit exceeded',
        });
      } finally {
        await limitedApp.close();
      }
    });
  });
});
