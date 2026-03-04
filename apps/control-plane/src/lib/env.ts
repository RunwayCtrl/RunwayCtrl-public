import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

// Load .env.local first (dev convention), then .env as fallback.
// These files are gitignored; CI provides env vars explicitly.
const envPaths = ['.env.local', '.env', '../../.env.local', '../../.env'] as const;
for (const path of envPaths) {
  dotenvConfig({ path, quiet: true });
}

const EnvSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  API_HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().optional(),

  // OpenTelemetry (Phase 2)
  // Default behavior: enabled in dev if an exporter endpoint is provided, disabled in tests.
  RUNWAYCTRL_OTEL_ENABLED: z
    .preprocess((v) => {
      if (v === undefined) return undefined;
      if (typeof v === 'string') return v.trim();
      return v;
    }, z.union([z.literal('true'), z.literal('false')]).optional())
    .transform((v) => {
      if (v === undefined) return undefined;
      return v === 'true';
    }),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().optional(),
  DEPLOYMENT_ENVIRONMENT: z.string().optional(),
  CLOUD_REGION: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export const loadEnv = (raw: NodeJS.ProcessEnv): Env => {
  return EnvSchema.parse(raw);
};
