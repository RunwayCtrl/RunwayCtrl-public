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
});

export type Env = z.infer<typeof EnvSchema>;

export const loadEnv = (raw: NodeJS.ProcessEnv): Env => {
  return EnvSchema.parse(raw);
};
