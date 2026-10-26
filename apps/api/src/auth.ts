import { SignJWT, jwtVerify } from 'jose';
import { hash, verify } from 'argon2';
import { env } from './env.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);
export const hashPassword = (password: string) => hash(password, { type: 2 });
export const verifyPassword = (digest: string, password: string) => verify(digest, password);
export async function issueAccessToken(userId: string) {
  return new SignJWT({ scope: 'studio' }).setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId).setIssuedAt().setExpirationTime('15m').sign(secret);
}
export async function readAccessToken(token: string) {
  const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
  if (payload.scope !== 'studio' || !payload.sub) throw new Error('Invalid token scope');
  return payload.sub;
}
