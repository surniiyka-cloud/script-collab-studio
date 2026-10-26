// Development integration test for the actual Hocuspocus/Yjs protocol and PostgreSQL persistence.
// Run only against a disposable LOCAL database with Fastify (:3001) and Hocuspocus (:3002) running.
import { randomUUID } from 'node:crypto';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { db } from '../dist/db.js';

const api = 'http://127.0.0.1:3001';
const socket = 'ws://127.0.0.1:3002';
const unique = randomUUID().replace(/-/g, '').slice(0, 20);
const owned = [];
const clients = [];

function check(condition, message) {
  if (!condition) throw new Error(message);
}
async function waitFor(predicate, description, timeout = 16000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Timed out: ' + description);
}
async function request(method, path, payload, token) {
  const response = await fetch(api + path, {
    method,
    headers: {
      ...(payload ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: 'Bearer ' + token } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(method + ' ' + path + ' returned HTTP ' + response.status + ': ' + (body?.error?.code ?? 'unknown'));
  return body.data;
}

function join(sceneId, token, onAuthenticationFailed) {
  const document = new Y.Doc();
  const provider = new HocuspocusProvider({
    url: socket,
    name: 'scene:' + sceneId,
    token,
    document,
    WebSocketPolyfill: WebSocket,
    ...(onAuthenticationFailed ? { onAuthenticationFailed } : {}),
  });
  clients.push({ document, provider });
  return { document, provider };
}

try {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing production mode');
  check(typeof WebSocket !== 'undefined', 'Requires Node.js 22+ global WebSocket');
  const ready = await fetch(api + '/health/ready');
  check(ready.ok, 'Backend not ready: run local Fastify and Postgres first');

  const password = 'temp-' + randomUUID() + '-strong';
  const writer1 = await request('POST', '/api/v1/auth/register', {
    email: 'collab-a-' + unique + '@example.test', password, displayName: 'Collab A',
  });
  const writer2 = await request('POST', '/api/v1/auth/register', {
    email: 'collab-b-' + unique + '@example.test', password, displayName: 'Collab B',
  });
  owned.push(writer1.user.id, writer2.user.id);

  const project = await request('POST', '/api/v1/projects', { title: 'WS integration ' + unique }, writer1.accessToken);
  const script = await request('POST', '/api/v1/projects/' + project.id + '/scripts', { title: 'Integration screenplay' }, writer1.accessToken);
  const scene = await request('POST', '/api/v1/scripts/' + script.id + '/scenes', { title: 'Scene with shared dialogue' }, writer1.accessToken);

  // No invitations API in Stage 2; create the second test membership directly via Prisma.
  // This is test-fixture setup only; the production API remains the RBAC authority.
  await db.projectMember.create({ data: { projectId: project.id, userId: writer2.user.id, role: 'EDITOR' } });

  console.log('1/3 Two authorized clients synchronize the same scene');
  const a = join(scene.id, writer1.accessToken);
  const b = join(scene.id, writer2.accessToken);
  await waitFor(() => a.provider.synced && b.provider.synced, 'both Hocuspocus providers synced');
  a.document.getText('screenplay').insert(0, 'From A ' + unique);
  await waitFor(() => b.document.getText('screenplay').toString().includes('From A ' + unique), 'A update reached B');
  b.document.getText('screenplay').insert(0, 'From B ' + unique + ' | ');
  await waitFor(() => a.document.getText('screenplay').toString().includes('From B ' + unique), 'B update reached A');
  for (const doc of [a.document, b.document]) {
    const value = doc.getText('screenplay').toString();
    check(value.includes('From A ' + unique) && value.includes('From B ' + unique), 'Concurrent edits missing from one peer');
  }

  console.log('2/3 Server persists merged CRDT state to PostgreSQL');
  await waitFor(async () => {
    const state = await db.yDocState.findUnique({ where: { documentName: 'scene:' + scene.id } });
    if (!state) return false;
    const persisted = new Y.Doc();
    try {
      Y.applyUpdate(persisted, state.update);
      const value = persisted.getText('screenplay').toString();
      return value.includes('From A ' + unique) && value.includes('From B ' + unique);
    } finally {
      persisted.destroy();
    }
  }, 'durable Yjs state contains both edits', 20000);

  console.log('3/3 Fresh document connects and reads the merged state');
  const c = join(scene.id, writer1.accessToken);
  await waitFor(() => c.provider.synced, 'third client sync');
  await waitFor(() => {
    const value = c.document.getText('screenplay').toString();
    return value.includes('From A ' + unique) && value.includes('From B ' + unique);
  }, 'third client sees persisted screenplay');

  console.log('4/5 Deny unauthorized WebSocket access to the scene');
  const outsider = await request('POST', '/api/v1/auth/register', {
    email: 'collab-view-' + unique + '@example.test', password, displayName: 'Collab Viewer',
  });
  owned.push(outsider.user.id);

  let denial = '';
  const intruder = join(scene.id, outsider.accessToken, ({ reason }) => {
    denial = reason || 'Rejected';
  });
  await waitFor(() => denial.length > 0, 'unrelated account receives authenticationFailed from Hocuspocus');
  check(!intruder.provider.isAuthenticated && !intruder.provider.synced,
    'Unrelated user should never authenticate or sync this document');
  intruder.provider.destroy();
  intruder.document.destroy();
  const intruderIndex = clients.findIndex(item => item.provider === intruder.provider);
  if (intruderIndex >= 0) clients.splice(intruderIndex, 1);

  console.log('5/5 Viewer may receive changes but cannot write into the shared scene');
  await db.projectMember.create({
    data: { projectId: project.id, userId: outsider.user.id, role: 'VIEWER' },
  });
  const viewer = join(scene.id, outsider.accessToken);
  await waitFor(() => viewer.provider.synced, 'Viewer authorized for read-only sync');
  const before = a.document.getText('screenplay').toString();
  await waitFor(() => viewer.document.getText('screenplay').toString() === before,
    'Viewer received original screenplay');

  const protectedText = 'VIEWER_FORBIDDEN_' + unique;
  viewer.document.getText('screenplay').insert(0, protectedText);
  // A local Y.Doc can always be modified; the server must ignore its outgoing update.
  // Wait past the configured 1-second persistence debounce.
  await new Promise(resolve => setTimeout(resolve, 1800));
  check(!a.document.getText('screenplay').toString().includes(protectedText),
    'Viewer mutation propagated to the first authorized editor');
  check(!b.document.getText('screenplay').toString().includes(protectedText),
    'Viewer mutation propagated to the second authorized editor');
  const snapshot = await db.yDocState.findUnique({ where: { documentName: 'scene:' + scene.id } });
  check(snapshot, 'Yjs document was unexpectedly absent from the database');
  const persisted = new Y.Doc();
  try {
    Y.applyUpdate(persisted, snapshot.update);
    check(!persisted.getText('screenplay').toString().includes(protectedText),
      'Viewer mutation reached PostgreSQL');
  } finally {
    persisted.destroy();
  }
  // Viewer still receives legitimate writer edits after its rejected attempt.
  const liveEdit = 'ALLOWED_EDIT_' + unique;
  a.document.getText('screenplay').insert(0, liveEdit);
  await waitFor(() => viewer.document.getText('screenplay').toString().includes(liveEdit),
    'Viewer receives new edits from an authorized writer');

  console.log('PASS: Yjs two-editor sync, PostgreSQL persistence, denied unauthorized WS, and Viewer read-only.');
} finally {
  // Disconnect clients before deleting their project, so no late writes target deleted data.
  for (const { provider, document } of clients) {
    provider.destroy();
    document.destroy();
  }
  if (owned.length) {
    try {
      const projects = await db.project.findMany({
        where: { title: 'WS integration ' + unique, ownerId: owned[0] },
        select: { id: true },
      });
      if (projects.length) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        await db.project.deleteMany({ where: { id: { in: projects.map(p => p.id) } } });
      }
      await db.user.deleteMany({ where: { id: { in: owned } } });
    } catch (error) {
      console.warn('Test fixture cleanup failed; remove local test users manually:', error instanceof Error ? error.message : String(error));
    }
  }
  await db.$disconnect();
}
