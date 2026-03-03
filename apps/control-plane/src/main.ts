import { loadEnv } from './lib/env.js';
import { startServer } from './server.js';

const env = loadEnv(process.env);

const { close } = await startServer({
  host: env.API_HOST,
  port: env.API_PORT,
});

const shutdown = async (signal: string) => {
  try {
    console.warn(`[control-plane] received ${signal}, shutting down...`);
    await close();
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
