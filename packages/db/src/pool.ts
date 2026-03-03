import { Pool } from 'pg';

export type CreatePoolOptions = {
  connectionString: string;
  // Keep it tiny for now; we can tune as we add real traffic.
  max?: number;
};

export const createPool = (options: CreatePoolOptions): Pool => {
  return new Pool({
    connectionString: options.connectionString,
    max: options.max,
  });
};
