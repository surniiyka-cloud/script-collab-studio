import 'dotenv/config';
import { z } from 'zod';

const Env = z.object({
  DATABASE_URL: z.string().startsWith('postgresql://'),
  JWT_SECRET: z.string().min(32),
  PORT: z.coerce.number().int().positive().default(3001),
  WS_PORT: z.coerce.number().int().positive().default(3002),
  HOST: z.string().default('0.0.0.0'),
  OLLAMA_URL: z.string().url().refine(value => {
    const target = new URL(value);
    return ['localhost','127.0.0.1'].includes(target.hostname)
      && ['http:','https:'].includes(target.protocol)
      && !target.username && !target.password && (target.pathname === '/' || !target.pathname);
  }).optional(),
  OLLAMA_MODEL: z.string().min(1).max(100).optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET: z.string().regex(/^[a-z0-9-]{3,63}$/).default('studio-media'),
  CORS_ORIGIN: z.string().url().default('http://localhost:5173'),
});
export const env = Env.parse(process.env);
