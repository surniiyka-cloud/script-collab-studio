import fastify from 'fastify';
import { z, ZodError } from 'zod';
import { db } from './db.js';
import { env } from './env.js';
import { hashPassword, issueAccessToken, readAccessToken, verifyPassword } from './auth.js';
import { createsCycle } from './graph.js';
import { HttpError, required } from './errors.js';
import { edgeScope, membership, nodeScope, sceneScope, scriptScope } from './policy.js';
import { FixedWindowLimiter } from './security.js';
import { registerProductionRoutes } from './production-routes.js';

const id = z.uuid();
const params = z.object({ projectId: id });
const single = (name: string) => z.object({ [name]: id });
const title = z.string().trim().min(1).max(200);
const email = z.email().transform(s => s.toLowerCase());
const credentials = z.object({ email, password: z.string().min(10).max(128) });
const nodeKind = z.enum(['SCENE', 'SHOT', 'LOCATION', 'CHARACTER', 'AUDIO']);
const edgeKind = z.enum(['SEQUENCE', 'DEPENDENCY', 'ALTERNATIVE']);
const shotType = z.enum(['WIDE', 'MEDIUM', 'CLOSE_UP', 'EXTREME_CLOSE_UP', 'OTS', 'POV', 'INSERT', 'OTHER']);

type Request = { headers: { authorization?: string }; params: unknown; body?: unknown };
function parseParams(req: Request, name: string) {
  return single(name).parse(req.params)[name] as string;
}
async function actor(req: Request) {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) throw new HttpError(401, 'UNAUTHORIZED', 'Bearer token required');
  try { return await readAccessToken(header.slice(7)); }
  catch { throw new HttpError(401, 'UNAUTHORIZED', 'Invalid or expired token'); }
}
function asData<T>(value: T) { return { data: value }; }
async function role(req: Request, projectId: string, write = false) {
  return membership(await actor(req), projectId, write);
}
async function scoped(req: Request, idValue: string, lookup: (id: string) => Promise<string>, write = false) {
  const projectId = await lookup(idValue);
  await role(req, projectId, write);
  return projectId;
}

export function makeApp() {
  const app = fastify({ logger: true, bodyLimit: 1024 * 1024 });
  const loginLimiter = new FixedWindowLimiter(12, 60_000);
  const registerLimiter = new FixedWindowLimiter(6, 60_000);
  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (origin === env.CORS_ORIGIN) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Vary', 'Origin');
      reply.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      reply.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    }
    if (req.method === 'OPTIONS') { reply.status(204).send(); return reply; }
    // req.ip uses the socket address: never accept untrusted X-Forwarded-For.
    const path = req.url.split('?', 1)[0];
    const limiter = req.method === 'POST'
      ? path === '/api/v1/auth/login' ? loginLimiter
      : path === '/api/v1/auth/register' ? registerLimiter : undefined
      : undefined;
    if (limiter) {
      const decision = limiter.check(req.ip);
      if (!decision.allowed) {
        return reply.header('Retry-After', String(decision.retryAfterSeconds))
          .status(429).send({ error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' }, requestId: req.id });
      }
    }
  });
  app.setErrorHandler((error, req, reply) => {
    const e = error as Error & { code?: string };
    let status = 500;
    let code = 'INTERNAL_ERROR';
    if (e instanceof HttpError) { status = e.status; code = e.code; }
    else if (e instanceof ZodError) { status = 400; code = 'VALIDATION_ERROR'; }
    else if (e.code === 'P2002' || e.code === 'P2034') { status = 409; code = 'CONFLICT'; }
    else if (e.code === 'P2025') { status = 404; code = 'NOT_FOUND'; }
    if (status >= 500) req.log.error({ err: error }, 'Unhandled API error');
    reply.status(status).send({ error: { code, message: status === 500 ? 'Server error' : e.message }, requestId: req.id });
  });
  app.get('/health/live', async () => asData({ status: 'ok' }));
  app.get('/health/ready', async () => { await db.$queryRaw`SELECT 1`; return asData({ status: 'ready' }); });

  app.post('/api/v1/auth/register', async req => {
    const data = credentials.extend({ displayName: title }).parse(req.body);
    const user = await db.user.create({ data: { email: data.email, displayName: data.displayName, passwordHash: await hashPassword(data.password) }, select: { id: true, email: true, displayName: true } });
    return asData({ user, accessToken: await issueAccessToken(user.id) });
  });
  app.post('/api/v1/auth/login', async req => {
    const data = credentials.parse(req.body);
    const user = await db.user.findUnique({ where: { email: data.email } });
    if (!user || !(await verifyPassword(user.passwordHash, data.password))) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    return asData({ user: { id: user.id, email: user.email, displayName: user.displayName }, accessToken: await issueAccessToken(user.id) });
  });
  app.get('/api/v1/auth/me', async req => asData(required(await db.user.findUnique({ where: { id: await actor(req) }, select: { id: true, email: true, displayName: true } }))));

  app.get('/api/v1/projects', async req => {
    const userId = await actor(req);
    return asData(await db.project.findMany({ where: { members: { some: { userId } } }, orderBy: { updatedAt: 'desc' }, take: 100 }));
  });
  app.post('/api/v1/projects', async req => {
    const userId = await actor(req);
    const data = z.object({ title, description: z.string().max(1000).optional() }).parse(req.body);
    const project = await db.project.create({ data: { ...data, ownerId: userId, members: { create: { userId, role: 'OWNER' } } } });
    return asData(project);
  });
  app.get('/api/v1/projects/:projectId', async req => {
    const projectId = parseParams(req, 'projectId');
    await role(req, projectId);
    return asData(required(await db.project.findUnique({ where: { id: projectId } })));
  });
  app.patch('/api/v1/projects/:projectId', async req => {
    const projectId = parseParams(req, 'projectId');
    if ((await role(req, projectId)) !== 'OWNER') throw new HttpError(403, 'FORBIDDEN', 'Owner role required');
    const data = z.object({ title: title.optional(), description: z.string().max(1000).nullable().optional() }).parse(req.body);
    return asData(await db.project.update({ where: { id: projectId }, data }));
  });
  app.delete('/api/v1/projects/:projectId', async req => {
    const projectId = parseParams(req, 'projectId');
    if ((await role(req, projectId)) !== 'OWNER') throw new HttpError(403, 'FORBIDDEN', 'Owner role required');
    await db.project.delete({ where: { id: projectId } });
    return asData({ deleted: true });
  });
  app.get('/api/v1/projects/:projectId/scripts', async req => {
    const projectId = parseParams(req, 'projectId');
    await role(req, projectId);
    return asData(await db.script.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } }));
  });
  app.post('/api/v1/projects/:projectId/scripts', async req => {
    const projectId = parseParams(req, 'projectId');
    await role(req, projectId, true);
    const data = z.object({ title }).parse(req.body);
    return asData(await db.script.create({ data: { projectId, ...data, acts: { create: { title: 'Акт 1', sortKey: '000000000001' } } }, include: { acts: true } }));
  });
  app.get('/api/v1/scripts/:scriptId', async req => {
    const scriptId = parseParams(req, 'scriptId');
    await scoped(req, scriptId, scriptScope);
    return asData(required(await db.script.findUnique({ where: { id: scriptId }, include: { acts: true } })));
  });
  app.patch('/api/v1/scripts/:scriptId', async req => {
    const scriptId = parseParams(req, 'scriptId');
    await scoped(req, scriptId, scriptScope, true);
    return asData(await db.script.update({ where: { id: scriptId }, data: z.object({ title }).parse(req.body) }));
  });
  app.delete('/api/v1/scripts/:scriptId', async req => {
    const scriptId = parseParams(req, 'scriptId');
    await scoped(req, scriptId, scriptScope, true);
    const sceneIds = (await db.scene.findMany({ where: { scriptId }, select: { id: true } })).map(s => s.id);
    await db.$transaction(async tx => {
      await tx.yDocState.deleteMany({ where: { documentName: { in: sceneIds.map(id => `scene:${id}`) } } });
      await tx.node.deleteMany({ where: { sceneId: { in: sceneIds } } });
      await tx.script.delete({ where: { id: scriptId } });
    });
    return asData({ deleted: true });
  });
  app.get('/api/v1/scripts/:scriptId/acts', async req => {
    const scriptId = parseParams(req, 'scriptId');
    await scoped(req, scriptId, scriptScope);
    return asData(await db.act.findMany({ where: { scriptId }, orderBy: { sortKey: 'asc' } }));
  });
  app.post('/api/v1/scripts/:scriptId/acts', async req => {
    const scriptId = parseParams(req, 'scriptId');
    await scoped(req, scriptId, scriptScope, true);
    const data = z.object({ title }).parse(req.body);
    const acts = await db.act.findMany({ where: { scriptId }, orderBy: { sortKey: 'desc' }, take: 1 });
    const sortKey = String(Number(acts[0]?.sortKey ?? '0') + 1).padStart(12, '0');
    return asData(await db.act.create({ data: { ...data, scriptId, sortKey } }));
  });
  app.get('/api/v1/scripts/:scriptId/scenes', async req => {
    const scriptId = parseParams(req, 'scriptId');
    await scoped(req, scriptId, scriptScope);
    return asData(await db.scene.findMany({ where: { scriptId }, orderBy: [{ act: { sortKey: 'asc' } }, { sortKey: 'asc' }] }));
  });
  app.post('/api/v1/scripts/:scriptId/scenes', async req => {
    const scriptId = parseParams(req, 'scriptId');
    const projectId = await scoped(req, scriptId, scriptScope, true);
    const input = z.object({ title, synopsis: z.string().max(2000).optional(), actId: id.optional() }).parse(req.body);
    const act = input.actId ? await db.act.findUnique({ where: { id: input.actId } }) : await db.act.findFirst({ where: { scriptId }, orderBy: { sortKey: 'asc' } });
    if (!act || act.scriptId !== scriptId) throw new HttpError(400, 'BAD_ACT', 'Act must belong to script');
    const scene = await db.$transaction(async tx => {
      const last = await tx.scene.findFirst({ where: { actId: act.id }, orderBy: { sortKey: 'desc' }, select: { sortKey: true } });
      const sortKey = String(Number(last?.sortKey ?? '0') + 1).padStart(12, '0');
      const scene = await tx.scene.create({ data: { scriptId, actId: act.id, title: input.title, synopsis: input.synopsis, sortKey } });
      await tx.node.create({ data: { projectId, sceneId: scene.id, kind: 'SCENE', title: scene.title } });
      return scene;
    });
    return asData(scene);
  });
  app.get('/api/v1/scenes/:sceneId', async req => {
    const sceneId = parseParams(req, 'sceneId');
    await scoped(req, sceneId, sceneScope);
    return asData(required(await db.scene.findUnique({ where: { id: sceneId } })));
  });
  app.patch('/api/v1/scenes/:sceneId', async req => {
    const sceneId = parseParams(req, 'sceneId');
    await scoped(req, sceneId, sceneScope, true);
    const data = z.object({ title: title.optional(), synopsis: z.string().max(2000).nullable().optional() }).parse(req.body);
    const scene = await db.$transaction(async tx => {
      const updated = await tx.scene.update({ where: { id: sceneId }, data });
      if (data.title) await tx.node.updateMany({ where: { sceneId, kind: 'SCENE' }, data: { title: data.title } });
      return updated;
    });
    return asData(scene);
  });
  app.delete('/api/v1/scenes/:sceneId', async req => {
    const sceneId = parseParams(req, 'sceneId');
    await scoped(req, sceneId, sceneScope, true);
    await db.$transaction(async tx => {
      await tx.yDocState.deleteMany({ where: { documentName: `scene:${sceneId}` } });
      await tx.node.deleteMany({ where: { sceneId } });
      await tx.scene.delete({ where: { id: sceneId } });
    });
    return asData({ deleted: true });
  });
  app.get('/api/v1/projects/:projectId/graph', async req => {
    const projectId = parseParams(req, 'projectId');
    await role(req, projectId);
    const [nodes, edges] = await Promise.all([db.node.findMany({ where: { projectId } }), db.edge.findMany({ where: { projectId } })]);
    return asData({ nodes, edges });
  });
  app.post('/api/v1/projects/:projectId/nodes', async req => {
    const projectId = parseParams(req, 'projectId');
    await role(req, projectId, true);
    const body = z.object({ kind: nodeKind, sceneId: id.optional(), title, description: z.string().max(5000).optional(), shotType: shotType.optional(), durationMs: z.number().int().positive().max(3600000).optional() }).parse(req.body);
    if ((body.kind === 'SCENE' || body.kind === 'SHOT') && !body.sceneId) throw new HttpError(400, 'SCENE_REQUIRED', 'Scene link required');
    if (body.sceneId && (await sceneScope(body.sceneId)) !== projectId) throw new HttpError(400, 'CROSS_PROJECT', 'Scene belongs to another project');
    if (body.kind === 'SCENE' && await db.node.findFirst({ where: { kind: 'SCENE', sceneId: body.sceneId } })) throw new HttpError(409, 'DUPLICATE_SCENE_NODE', 'Scene already has a node');
    return asData(await db.node.create({ data: { projectId, ...body } }));
  });
  app.patch('/api/v1/nodes/:nodeId', async req => {
    const nodeId = parseParams(req, 'nodeId');
    await scoped(req, nodeId, nodeScope, true);
    const data = z.object({ title: title.optional(), description: z.string().max(5000).nullable().optional(), positionX: z.number().finite().optional(), positionY: z.number().finite().optional(), shotType: shotType.nullable().optional(), durationMs: z.number().int().positive().nullable().optional() }).parse(req.body);
    return asData(await db.node.update({ where: { id: nodeId }, data }));
  });
  app.delete('/api/v1/nodes/:nodeId', async req => {
    const nodeId = parseParams(req, 'nodeId');
    await scoped(req, nodeId, nodeScope, true);
    const node = required(await db.node.findUnique({ where: { id: nodeId } }));
    if (node.kind === 'SCENE') throw new HttpError(409, 'SCENE_NODE', 'Delete scene via scene endpoint');
    await db.node.delete({ where: { id: nodeId } });
    return asData({ deleted: true });
  });
  app.post('/api/v1/projects/:projectId/edges', async req => {
    const projectId = parseParams(req, 'projectId');
    await role(req, projectId, true);
    const body = z.object({ sourceNodeId: id, targetNodeId: id, kind: edgeKind, label: z.string().max(200).optional() }).parse(req.body);
    if (body.sourceNodeId === body.targetNodeId) throw new HttpError(400, 'SELF_LINK', 'Self links are not allowed');
    const endpoints = await db.node.findMany({ where: { id: { in: [body.sourceNodeId, body.targetNodeId] }, projectId } });
    if (endpoints.length !== 2) throw new HttpError(400, 'CROSS_PROJECT', 'Both nodes must belong to project');
    // SERIALIZABLE avoids write skew when two users connect reciprocal sequence edges simultaneously.
    return asData(await db.$transaction(async tx => {
      if (body.kind === 'SEQUENCE') {
        const seq = await tx.edge.findMany({ where: { projectId, kind: 'SEQUENCE' }, select: { sourceNodeId: true, targetNodeId: true } });
        if (createsCycle(seq, body.sourceNodeId, body.targetNodeId)) throw new HttpError(409, 'SEQUENCE_CYCLE', 'Sequence would create a cycle');
      }
      return tx.edge.create({ data: { projectId, ...body } });
    }, { isolationLevel: 'Serializable' }));
  });
  app.patch('/api/v1/edges/:edgeId', async req => {
    const edgeId = parseParams(req, 'edgeId');
    await scoped(req, edgeId, edgeScope, true);
    // Edge endpoint/type changes require full validation; only a label is mutable here.
    const data = z.object({ label: z.string().max(200).nullable() }).parse(req.body);
    return asData(await db.edge.update({ where: { id: edgeId }, data }));
  });
  app.delete('/api/v1/edges/:edgeId', async req => {
    const edgeId = parseParams(req, 'edgeId');
    await scoped(req, edgeId, edgeScope, true);
    await db.edge.delete({ where: { id: edgeId } });
    return asData({ deleted: true });
  });
  registerProductionRoutes(app,role);
  return app;
}
