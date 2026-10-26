import { Server } from '@hocuspocus/server';
import { Database } from '@hocuspocus/extension-database';
import { db } from './db.js';
import { env } from './env.js';
import { readAccessToken } from './auth.js';
import { membership, sceneScope } from './policy.js';
import { HttpError } from './errors.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function collabProject(documentName: string): Promise<string> {
  const match = /^(scene|graph):(.+)$/.exec(documentName);
  if (!match || !uuid.test(match[2])) throw new HttpError(400, 'INVALID_DOC', 'Unknown document name');
  if (match[1] === 'scene') return sceneScope(match[2]);
  const project = await db.project.findUnique({ where: { id: match[2] }, select: { id: true } });
  if (!project) throw new HttpError(404, 'NOT_FOUND', 'Project not found');
  return project.id;
}

export function createCollabServer() {
  return new Server({
    port: env.WS_PORT,
    address: env.HOST,
    debounce: 1000,
    maxDebounce: 5000,
    async onAuthenticate({ documentName, token, connectionConfig }) {
      const userId = await readAccessToken(token);
      const projectId = await collabProject(documentName);
      const role = await membership(userId, projectId);
      connectionConfig.readOnly = role === 'VIEWER';
      return { userId, projectId, role };
    },
    extensions: [new Database({
      async fetch({ documentName }) {
        const projectId = await collabProject(documentName);
        const state = await db.yDocState.findUnique({ where: { documentName } });
        if (state && state.projectId !== projectId) throw new Error('Document scope mismatch');
        return state ? Buffer.from(state.update) : null;
      },
      async store({ documentName, state }) {
        const projectId = await collabProject(documentName);
        await db.yDocState.upsert({
          where: { documentName },
          create: { documentName, projectId, update: Uint8Array.from(state) },
          update: { update: Uint8Array.from(state) },
        });
      },
    })],
  });
}
