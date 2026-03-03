import Fastify from 'fastify';

export interface StartServerOptions {
  host: string;
  port: number;
}

export interface StartedServer {
  close: () => Promise<void>;
}

export const startServer = async (options: StartServerOptions): Promise<StartedServer> => {
  const app = Fastify({
    logger: false,
  });

  app.get('/healthz', async () => {
    return { ok: true };
  });

  await app.listen({ host: options.host, port: options.port });

  return {
    close: async () => {
      await app.close();
    },
  };
};
