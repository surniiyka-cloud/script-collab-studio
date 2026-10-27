import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from './db.js';
import { HttpError, required } from './errors.js';

const uuid=z.uuid();
const role=z.enum(['EDITOR','VIEWER']);
type MemberRow = {userId:string;role:'OWNER'|'EDITOR'|'VIEWER';joinedAt:Date;user:{displayName:string;email:string}};
function present(member:MemberRow){
 return {userId:member.userId,role:member.role,joinedAt:member.joinedAt,
  displayName:member.user.displayName,email:member.user.email};
}
async function assertOwner(req:FastifyRequest,projectId:string,
 membership:(req:FastifyRequest,projectId:string)=>Promise<unknown>){
 const who=await membership(req,projectId);
 if(who!=='OWNER')throw new HttpError(403,'OWNER_REQUIRED','Только владелец управляет доступом.');
}
export function registerProjectTeamRoutes(app:FastifyInstance,
 membership:(req:FastifyRequest,projectId:string)=>Promise<unknown>){
 app.get('/api/v1/projects/:projectId/members',async req=>{
  const {projectId}=z.object({projectId:uuid}).parse(req.params);
  await membership(req,projectId);
  const members=await db.projectMember.findMany({where:{projectId},
   include:{user:{select:{displayName:true,email:true}}},orderBy:{joinedAt:'asc'}});
  return {data:members.map(present)};
 });
 app.post('/api/v1/projects/:projectId/members',async req=>{
  const {projectId}=z.object({projectId:uuid}).parse(req.params);
  await assertOwner(req,projectId,membership);
  const input=z.object({email:z.email().trim().toLowerCase(),role}).parse(req.body);
  const user=await db.user.findUnique({where:{email:input.email},select:{id:true}});
  if(!user)throw new HttpError(404,'USER_NOT_REGISTERED',
   'Пользователь с такой почтой ещё не зарегистрирован. Попросите его создать аккаунт.');
  const current=await db.projectMember.findUnique({where:{projectId_userId:{projectId,userId:user.id}}});
  if(current)throw new HttpError(409,'ALREADY_MEMBER','Этот пользователь уже участвует в проекте.');
  const member=await db.projectMember.create({data:{projectId,userId:user.id,role:input.role},
   include:{user:{select:{displayName:true,email:true}}}});
  return {data:present(member)};
 });
 app.patch('/api/v1/projects/:projectId/members/:userId',async req=>{
  const {projectId,userId}=z.object({projectId:uuid,userId:uuid}).parse(req.params);
  await assertOwner(req,projectId,membership);
  const {role:newRole}=z.object({role}).parse(req.body);
  const existing=required(await db.projectMember.findUnique({where:{projectId_userId:{projectId,userId}}}));
  if(existing.role==='OWNER')throw new HttpError(403,'OWNER_IMMUTABLE','Роль владельца нельзя изменить.');
  const member=await db.projectMember.update({where:{projectId_userId:{projectId,userId}},
   data:{role:newRole},include:{user:{select:{displayName:true,email:true}}}});
  return {data:present(member)};
 });
 app.delete('/api/v1/projects/:projectId/members/:userId',async req=>{
  const {projectId,userId}=z.object({projectId:uuid,userId:uuid}).parse(req.params);
  await assertOwner(req,projectId,membership);
  const existing=required(await db.projectMember.findUnique({where:{projectId_userId:{projectId,userId}}}));
  if(existing.role==='OWNER')throw new HttpError(403,'OWNER_IMMUTABLE','Владельца нельзя удалить из проекта.');
  await db.projectMember.delete({where:{projectId_userId:{projectId,userId}}});
  return {data:{removed:true}};
 });
}
