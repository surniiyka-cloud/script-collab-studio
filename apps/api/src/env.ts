import 'dotenv/config';
import { z } from 'zod';

const Env = z.object({
  DATABASE_URL: z.string().startsWith('postgresql://'),
  JWT_SECRET: z.string().min(32),
  PORT: z.coerce.number().int().positive().default(3001),
  WS_PORT: z.coerce.number().int().positive().default(3002),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().url().default('http://localhost:5173'),
});
export const env = Env.parse(process.env);
