import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

import type { Env } from '../lib/env.js';

export type OtelHandle = {
  shutdown: () => Promise<void>;
};

const parseHeaders = (raw: string | undefined): Record<string, string> | undefined => {
  if (!raw) return undefined;
  // Expected format: "k1=v1,k2=v2" per OTEL_EXPORTER_OTLP_HEADERS.
  const out: Record<string, string> = {};
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const k = trimmed.slice(0, idx).trim();
    const v = trimmed.slice(idx + 1).trim();
    if (!k || !v) continue;
    out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

const shouldEnableOtel = (env: Env): boolean => {
  // Hard-disable in tests.
  if (process.env.VITEST) return false;
  if (process.env.NODE_ENV === 'test') return false;

  if (env.RUNWAYCTRL_OTEL_ENABLED !== undefined) return env.RUNWAYCTRL_OTEL_ENABLED;

  // If the user configured an exporter endpoint, assume they want telemetry.
  return typeof env.OTEL_EXPORTER_OTLP_ENDPOINT === 'string' && env.OTEL_EXPORTER_OTLP_ENDPOINT.length > 0;
};

export const initOtel = async (env: Env): Promise<OtelHandle | null> => {
  if (!shouldEnableOtel(env)) return null;

  // Keep diagnostics quiet by default.
  if (process.env.OTEL_DIAGNOSTIC_LOG_LEVEL === 'DEBUG') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  const serviceName = env.OTEL_SERVICE_NAME ?? process.env.OTEL_SERVICE_NAME ?? 'runwayctrl-api';
  const serviceVersion =
    process.env.RUNWAYCTRL_SERVICE_VERSION ?? process.env.npm_package_version ?? '0.0.0';
  const deploymentEnvironment =
    env.DEPLOYMENT_ENVIRONMENT ?? process.env.DEPLOYMENT_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development';

  const resource = new Resource({
    [SEMRESATTRS_SERVICE_NAME]: serviceName,
    [SEMRESATTRS_SERVICE_VERSION]: serviceVersion,
    'deployment.environment': deploymentEnvironment,
    ...(env.CLOUD_REGION ? { 'cloud.region': env.CLOUD_REGION } : {}),
  });

  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';
  const headers = parseHeaders(env.OTEL_EXPORTER_OTLP_HEADERS);

  const traceExporter = new OTLPTraceExporter({
    url: `${endpoint.replace(/\/$/, '')}/v1/traces`,
    headers,
  });

  const metricExporter = new OTLPMetricExporter({
    url: `${endpoint.replace(/\/$/, '')}/v1/metrics`,
    headers,
  });

  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 10_000,
  });

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Keep noise down until we explicitly add db/query spans.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  await sdk.start();

  return {
    shutdown: async () => {
      await sdk.shutdown();
    },
  };
};
