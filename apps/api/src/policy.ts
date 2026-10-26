import { db } from './db.js';
import { HttpError, required } from './errors.js';
import type { ProjectRole } from './generated/prisma/enums.ts';

export async function membership(userId: string, projectId: string, write = false): Promise<ProjectRole> {
  const member = required(await db.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } }));
  if (write && member.role === 'VIEWER') throw new HttpError(403, 'FORBIDDEN', 'Editor role required');
  return member.role;
}
export async function scriptScope(scriptId: string): Promise<string> {
  return required(await db.script.findUnique({ where: { id: scriptId }, select: { projectId: true } })).projectId;
}
export async function sceneScope(sceneId: string): Promise<string> {
  const scene = required(await db.scene.findUnique({ where: { id: sceneId }, select: { script: { select: { projectId: true } } } }));
  return scene.script.projectId;
}
export async function nodeScope(nodeId: string): Promise<string> {
  return required(await db.node.findUnique({ where: { id: nodeId }, select: { projectId: true } })).projectId;
}
export async function edgeScope(edgeId: string): Promise<string> {
  return required(await db.edge.findUnique({ where: { id: edgeId }, select: { projectId: true } })).projectId;
}
