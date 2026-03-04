import { randomBytes } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';

import { verify } from '@node-rs/argon2';
import { SpanStatusCode, metrics, trace } from '@opentelemetry/api';
import { createPool } from '@runwayctrl/db';
import { ZodError } from 'zod';

import type { RequestContext } from './ledger/context.js';
import { toValidationIssueSummaries } from './lib/validation.js';
import { pickRunwayctrlAttributes } from './otel/attributes.js';

type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTH_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'LEASE_DENIED'
  | 'RATE_LIMITED'
  | 'BUDGET_DENIED'
  | 'CIRCUIT_OPEN'
  | 'INTERNAL_ERROR';

type ErrorResponse = {
  request_id: string;
  error_code: ErrorCode;
  message: string;
  retry_after_ms?: number;
  details?: Record<string, unknown>;
};

class ApiError extends Error {
  constructor(
    readonly errorCode: ErrorCode,
    message: string,
    readonly httpStatus: number,
    readonly retryAfterMs?: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const newRequestId = (): string => {
  // Keep it simple and log-friendly. (We can switch to ULID later if desired.)
  return `req_${randomBytes(12).toString('hex')}`;
};

const sanitizeIncomingRequestId = (raw: unknown): string | undefined => {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (trimmed.length < 8 || trimmed.length > 128) return undefined;
  // Permit a conservative, log-friendly charset.
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return undefined;
  return trimmed;
};

const getRequestId = (request: FastifyRequest): string => {
  const id = (request as FastifyRequest & { requestId?: string }).requestId;
  if (typeof id === 'string' && id.length > 0) return id;
  return newRequestId();
};

const sendError = (reply: FastifyReply, requestId: string, err: ApiError): void => {
  const body: ErrorResponse = {
    request_id: requestId,
    error_code: err.errorCode,
    message: err.message,
    ...(typeof err.retryAfterMs === 'number' ? { retry_after_ms: err.retryAfterMs } : {}),
    ...(err.details ? { details: err.details } : {}),
  };

  reply.header('X-Request-Id', requestId);
  void reply.status(err.httpStatus).send(body);
};

const parseBearerToken = (raw: string | undefined): { apiKeyId: string; apiKeySecret: string } => {
  if (!raw) {
    throw new ApiError('AUTH_ERROR', 'Missing Authorization header', 401);
  }

  const m = /^Bearer\s+(.+)$/.exec(raw);
  if (!m) {
    throw new ApiError('AUTH_ERROR', 'Invalid Authorization header', 401);
  }
  const token = m[1]!.trim();
  // v0.1 format: <api_key_id>.<api_key_secret>
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) {
    throw new ApiError(
      'AUTH_ERROR',
      'Invalid API key format. Expected <api_key_id>.<api_key_secret>.',
      401,
    );
  }

  const apiKeyId = token.slice(0, dot);
  const apiKeySecret = token.slice(dot + 1);

  if (apiKeyId.length > 64 || apiKeySecret.length > 128) {
    throw new ApiError('AUTH_ERROR', 'Invalid API key format', 401);
  }

  return { apiKeyId, apiKeySecret };
};

const parseTraceparent = (raw: unknown): string | undefined => {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  // W3C traceparent: version-traceid-spanid-flags
  // Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
  const parts = value.split('-');
  if (parts.length !== 4) return undefined;
  const traceId = parts[1];
  if (!traceId || traceId.length !== 32) return undefined;
  if (!/^[0-9a-f]{32}$/.test(traceId)) return undefined;
  // all-zero trace id is invalid
  if (/^0{32}$/.test(traceId)) return undefined;
  return traceId;
};

type RateLimitState = {
  resetAtMs: number;
  count: number;
};

const createFixedWindowLimiter = (opts: { windowMs: number; max: number }) => {
  const buckets = new Map<string, RateLimitState>();
  return {
    check: (key: string): { ok: true } | { ok: false; retryAfterMs: number } => {
      const now = Date.now();
      const existing = buckets.get(key);
      if (!existing || existing.resetAtMs <= now) {
        buckets.set(key, { resetAtMs: now + opts.windowMs, count: 1 });
        return { ok: true };
      }

      if (existing.count >= opts.max) {
        const retryAfterMs = Math.max(0, existing.resetAtMs - now);
        return { ok: false, retryAfterMs };
      }
      existing.count += 1;
      return { ok: true };
    },
    // Best-effort cleanup to avoid unbounded growth in long-lived dev processes.
    cleanup: () => {
      const now = Date.now();
      for (const [k, v] of buckets) {
        if (v.resetAtMs <= now) buckets.delete(k);
      }
    },
  };
};

type VerifiedSecretCacheEntry = {
  expiresAtMs: number;
  // Bind cache entry to the current key_hash value to avoid accepting old secrets if key rotated.
  keyHash: string;
};

const makeCacheKey = (apiKeyId: string, apiKeySecret: string): string => {
  // Avoid keeping long secrets as map keys (still not a security boundary, but helps hygiene).
  // We only need a stable key within a process.
  const digest = Buffer.from(apiKeySecret).toString('base64url').slice(0, 16);
  return `${apiKeyId}:${digest}`;
};

export interface StartServerOptions {
  host: string;
  port: number;
  databaseUrl?: string;
  // Hardening defaults (Phase 2). Keep these configurable.
  bodyLimitBytes?: number;
  requestTimeoutMs?: number;
  ipRateLimitRpm?: number;
  tenantRateLimitRpm?: number;
  verifiedSecretCacheTtlMs?: number;
}

export interface StartedServer {
  close: () => Promise<void>;
}

export const buildApp = (options: StartServerOptions): FastifyInstance => {
  const app = Fastify({
    logger: false,
    bodyLimit: options.bodyLimitBytes ?? 1_048_576,
    requestTimeout: options.requestTimeoutMs ?? 30_000,
  });

  const otelTracer = trace.getTracer('runwayctrl.control-plane');
  const otelMeter = metrics.getMeter('runwayctrl.control-plane');
  const httpServerDuration = otelMeter.createHistogram('runwayctrl.http.server.duration', {
    unit: 's',
    description: 'HTTP server duration (seconds) per route/method/status (RunwayCtrl contract).',
  });

  // Fixed-window limiters. (v0.1: per-instance; Phase 6+ will add durable governor budgets.)
  const ipLimiter = createFixedWindowLimiter({
    windowMs: 60_000,
    max: Math.max(1, options.ipRateLimitRpm ?? 600),
  });
  const tenantLimiter = createFixedWindowLimiter({
    windowMs: 60_000,
    max: Math.max(1, options.tenantRateLimitRpm ?? 1200),
  });

  // Cache successful Argon2 verifications briefly to reduce CPU while keeping revocation immediate
  // (we still check revoked_at / key_hash via DB on every request).
  const verifiedSecretCache = new Map<string, VerifiedSecretCacheEntry>();
  const verifiedSecretCacheTtlMs = Math.max(0, options.verifiedSecretCacheTtlMs ?? 10_000);

  const pool = options.databaseUrl
    ? createPool({ connectionString: options.databaseUrl, max: 8 })
    : null;

  app.addHook('onRequest', async (request, reply) => {
    // High-resolution request timer for runwayctrl.http.server.duration.
    (request as FastifyRequest & { _runwayctrlStartTimeNs?: bigint })._runwayctrlStartTimeNs =
      process.hrtime.bigint();

    // Ensure X-Request-Id exists for every response.
    const incoming = sanitizeIncomingRequestId(request.headers['x-request-id']);
    const requestId = incoming ?? newRequestId();
    (request as FastifyRequest & { requestId: string }).requestId = requestId;

    const traceId = parseTraceparent(request.headers.traceparent);
    if (traceId) {
      (request as FastifyRequest & { traceId?: string }).traceId = traceId;
    }
    reply.header('X-Request-Id', requestId);

    // Basic IP rate limit (best-effort; per-instance).
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const key = `ip:${ip}`;
    const check = ipLimiter.check(key);
    if (!check.ok) {
      throw new ApiError('RATE_LIMITED', 'Rate limit exceeded', 429, check.retryAfterMs);
    }
  });

  app.addHook('onResponse', async (request, reply) => {
    // Contract metric: runwayctrl.http.server.duration (histogram, seconds)
    const start = (request as FastifyRequest & { _runwayctrlStartTimeNs?: bigint })
      ._runwayctrlStartTimeNs;
    if (typeof start === 'bigint') {
      const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
      const route = request.routeOptions?.url;
      httpServerDuration.record(durationSec, {
        'http.route': typeof route === 'string' && route.length > 0 ? route : 'unknown',
        'http.request.method': request.method,
        'http.response.status_code': reply.statusCode,
      });
    }

    // Best-effort cleanup once per response.
    ipLimiter.cleanup();
    tenantLimiter.cleanup();
    const now = Date.now();
    for (const [k, v] of verifiedSecretCache) {
      if (v.expiresAtMs <= now) verifiedSecretCache.delete(k);
    }
  });

  // Global error handler: always safe, always structured.
  app.setErrorHandler((err, request, reply) => {
    const requestId = getRequestId(request);
    if (err instanceof ApiError) {
      return sendError(reply, requestId, err);
    }

    if (err instanceof ZodError) {
      return sendError(
        reply,
        requestId,
        new ApiError('VALIDATION_ERROR', 'Validation error', 400, undefined, {
          issues: toValidationIssueSummaries(err),
        }),
      );
    }

    // Fastify validation errors (if we use schema validation later) should map to VALIDATION_ERROR.
    // Keep message safe.
    if (
      typeof err === 'object' &&
      err !== null &&
      'validation' in err &&
      (err as { validation?: unknown }).validation
    ) {
      return sendError(reply, requestId, new ApiError('VALIDATION_ERROR', 'Validation error', 400));
    }

    // Fallback: INTERNAL_ERROR (no stack traces to clients).
    return sendError(reply, requestId, new ApiError('INTERNAL_ERROR', 'Internal error', 500));
  });

  app.setNotFoundHandler((request, reply) => {
    const requestId = getRequestId(request);
    return sendError(reply, requestId, new ApiError('NOT_FOUND', 'Not found', 404));
  });

  // Health should stay cheap.
  app.get('/healthz', async () => {
    return { ok: true };
  });

  // Readiness checks dependencies (DB). Keep it fast and bounded.
  app.get('/readyz', async () => {
    if (!pool) {
      throw new ApiError('INTERNAL_ERROR', 'DATABASE_URL not configured', 500);
    }
    await pool.query('select 1 as ok');
    return { ok: true };
  });

  // Authenticated sanity endpoint (Phase 2): proves tenant context wiring.
  app.get('/v1/whoami', async (request) => {
    if (!pool) {
      throw new ApiError('INTERNAL_ERROR', 'DATABASE_URL not configured', 500);
    }

    const requestId = (request as FastifyRequest & { requestId?: string }).requestId;
    const traceId = (request as FastifyRequest & { traceId?: string }).traceId;

    return await otelTracer.startActiveSpan(
      'runwayctrl.auth.verify_api_key',
      {
        attributes: pickRunwayctrlAttributes({
          'runwayctrl.request_id': requestId,
        }),
      },
      async (span) => {
        try {
          const auth = parseBearerToken(request.headers.authorization);

          const res = await pool.query<{
            tenant_id: string;
            key_hash: string;
            revoked_at: Date | null;
          }>(
            `
            select tenant_id, key_hash, revoked_at
            from api_keys
            where api_key_id = $1
            limit 1
            `,
            [auth.apiKeyId],
          );

          const row = res.rows[0];
          if (!row) {
            throw new ApiError('AUTH_ERROR', 'Invalid API key', 401);
          }
          if (row.revoked_at) {
            throw new ApiError('AUTH_ERROR', 'API key revoked', 401);
          }

          span.setAttributes(
            pickRunwayctrlAttributes({
              'runwayctrl.tenant_id': row.tenant_id,
            }) ?? {},
          );

          // Reduce CPU by caching successful verifies briefly.
          const cacheKey = makeCacheKey(auth.apiKeyId, auth.apiKeySecret);
          const cached = verifiedSecretCache.get(cacheKey);
          const now = Date.now();
          if (!cached || cached.expiresAtMs <= now || cached.keyHash !== row.key_hash) {
            const ok = await verify(row.key_hash, auth.apiKeySecret);
            if (!ok) {
              throw new ApiError('AUTH_ERROR', 'Invalid API key', 401);
            }
            if (verifiedSecretCacheTtlMs > 0) {
              verifiedSecretCache.set(cacheKey, {
                expiresAtMs: now + verifiedSecretCacheTtlMs,
                keyHash: row.key_hash,
              });
            }
          }

          const ctx: RequestContext = {
            tenantId: row.tenant_id,
            requestId,
            traceId,
          };

          // Apply tenant limiter after auth (best-effort).
          const tenantCheck = tenantLimiter.check(`tenant:${ctx.tenantId}`);
          if (!tenantCheck.ok) {
            throw new ApiError(
              'RATE_LIMITED',
              'Tenant rate limit exceeded',
              429,
              tenantCheck.retryAfterMs,
            );
          }

          span.setStatus({ code: SpanStatusCode.OK });

          return {
            tenant_id: ctx.tenantId,
            request_id: ctx.requestId,
            trace_id: ctx.traceId,
          };
        } catch (e) {
          span.setStatus({ code: SpanStatusCode.ERROR });
          if (e instanceof Error) {
            span.recordException(e);
          }
          throw e;
        } finally {
          span.end();
        }
      },
    );
  });

  // Close DB pool when server closes.
  app.addHook('onClose', async () => {
    if (pool) await pool.end();
  });

  return app;
};

export const startServer = async (options: StartServerOptions): Promise<StartedServer> => {
  const app = buildApp(options);

  await app.listen({ host: options.host, port: options.port });

  return {
    close: async () => {
      await app.close();
    },
  };
};
