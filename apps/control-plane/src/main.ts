import { loadEnv } from './lib/env.js';
import { initOtel } from './otel/index.js';
import { startServer } from './server.js';

const env = loadEnv(process.env);

const otel = await initOtel(env);

const { close } = await startServer({
  host: env.API_HOST,
  port: env.API_PORT,
  databaseUrl: env.DATABASE_URL,
});

const shutdown = async (signal: string) => {
  try {
    console.warn(`[control-plane] received ${signal}, shutting down...`);
    await close();
    if (otel) await otel.shutdown();
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
