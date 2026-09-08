import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

export const environment = {
  server: { port: Number(process.env.SERVER_PORT) || 3001 },
  db: { url: process.env.DB_URL || 'mongodb://localhost:27017/mobbs-delivery' },
};
