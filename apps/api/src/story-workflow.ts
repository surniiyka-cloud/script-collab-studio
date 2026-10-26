import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from './db.js';
import { HttpError, required } from './errors.js';
import { readBlocks } from './production-routes.js';
import type { Block } from './screenplay-import.js';
const uuid=z.uuid();
const text=z.string().trim().min(1).max(200);

export function locationFromHeading(heading:string):string|null {
 const source=heading.trim();
 const prefix=/^(?:INT\/EXT|EXT\/INT|ИНТ\/НАТ|НАТ\/ИНТ|INT|EXT|ИНТ|НАТ|НАТУРА|ИНТЕРЬЕР)\.?\s+/iu;
 if(!prefix.test(source))return null;
 const result=source.replace(prefix,'').split(/\s+[—–-]\s+/u)[0].trim().replace(/[.:]$/,'');
 return result?result.slice(0,200):null;
}
function mediaLinks(node:{mediaLinks:Array<{asset:{id:string;kind:string;filename:string;mimeType:string;sizeBytes:bigint}}>}) {
 return node.mediaLinks.map(item=>({id:item.asset.id,kind:item.asset.kind,
  filename:item.asset.filename,mimeType:item.asset.mimeType,sizeBytes:String(item.asset.sizeBytes)}));
}
function workflowMeta(metadata:unknown):{locationId?:string;order?:number}{
 if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))return {};
 const value=(metadata as {workflow?:unknown}).workflow;
 if(!value||typeof value!=='object'||Array.isArray(value))return {};
 return value as {locationId?:string;order?:number};
}
function shotOrder(metadata:unknown) {
 if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))return Number.MAX_SAFE_INTEGER;
 const value=(metadata as {production?:unknown}).production;
 if(!value||typeof value!=='object'||Array.isArray(value))return Number.MAX_SAFE_INTEGER;
 const order=(value as {order?:unknown}).order;
 return typeof order==='number'?order:Number.MAX_SAFE_INTEGER;
}
function analyse(blocks:Block[]) {
 const dialogue:Array<{speaker:string;text:string;sourceLine:number}>=[];
 const actions:string[]=[];
 const characters=new Set<string>();
 let speaker:string|null=null;
 for(const block of blocks){
  const value=block.text.trim();
  if(block.kind==='character'){
   speaker=value.replace(/\s*\([^)]*\)\s*$/,'').trim();
   if(speaker)characters.add(speaker);
  }else if(block.kind==='dialogue'&&speaker&&value){
   dialogue.push({speaker,text:value,sourceLine:block.sourceLine});
  }else if(block.kind==='action'&&value){
   actions.push(value);
   speaker=null;
  }else if(block.kind==='heading'||block.kind==='transition')speaker=null;
 }
 return {dialogue,characters:[...characters],actions:actions.slice(0,30)};
}
export function registerStoryWorkflowRoutes(app:FastifyInstance,access:(req:FastifyRequest,id:string,write?:boolean)=>Promise<unknown>){
 app.get('/api/v1/projects/:projectId/workflow/story',async req=>{
  const {projectId}=z.object({projectId:uuid}).parse(req.params);
  await access(req,projectId);
  const {scriptId}=z.object({scriptId:uuid}).parse(req.query);
  const script=required(await db.script.findUnique({where:{id:scriptId},select:{id:true,projectId:true,title:true}}));
  if(script.projectId!==projectId)throw new HttpError(404,'NOT_FOUND','Script not found in project');
  const scenes=await db.scene.findMany({where:{scriptId},orderBy:[{act:{sortKey:'asc'}},{sortKey:'asc'}]});
  const allNodes=await db.node.findMany({
   where:{projectId},include:{mediaLinks:{include:{asset:true}}},orderBy:{createdAt:'asc'},
  });
  const yDocs=await db.yDocState.findMany({where:{projectId,documentName:{in:scenes.map(s=>'scene:'+s.id)}}});
  const byName=new Map(yDocs.map(doc=>[doc.documentName,doc.update]));
  const sceneItems=scenes.map((scene,index)=>{
   const state=byName.get('scene:'+scene.id);
   const blocks=state?readBlocks(state):[];
   const extracted=analyse(blocks);
   const sceneNode=allNodes.find(n=>n.kind==='SCENE'&&n.sceneId===scene.id);
   const shots=allNodes.filter(n=>n.kind==='SHOT'&&n.sceneId===scene.id)
     .sort((a,b)=>shotOrder(a.metadata)-shotOrder(b.metadata))
     .map(n=>({id:n.id,title:n.title,description:n.description,
       shotType:n.shotType,durationMs:n.durationMs??3500,media:mediaLinks(n)}));
   return {id:scene.id,index:index+1,title:scene.title,synopsis:scene.synopsis,
     locationId:workflowMeta(sceneNode?.metadata).locationId??null,
     suggestedLocation:locationFromHeading(scene.title),blocks,
     actionDescription:extracted.actions.join('\n').slice(0,3500),
     dialogues:extracted.dialogue,characters:extracted.characters,shots};
  });
  const byKind=(kind:'CHARACTER'|'LOCATION')=>allNodes.filter(n=>n.kind===kind)
   .map(n=>({id:n.id,title:n.title,description:n.description,media:mediaLinks(n)}));
  return {data:{script,scenes:sceneItems,characters:byKind('CHARACTER'),locations:byKind('LOCATION')}};
 });
 app.post('/api/v1/projects/:projectId/workflow/locations',async req=>{
  const {projectId}=z.object({projectId:uuid}).parse(req.params);
  await access(req,projectId,true);
  const input=z.object({title:text,description:z.string().max(5000).optional()}).parse(req.body);
  const existing=await db.node.findFirst({where:{projectId,kind:'LOCATION',title:{equals:input.title,mode:'insensitive'}}});
  if(existing)return {data:existing};
  return {data:await db.node.create({data:{projectId,kind:'LOCATION',title:input.title,description:input.description}})};
 });
 app.put('/api/v1/scenes/:sceneId/workflow/shots/order',async req=>{
  const {sceneId}=z.object({sceneId:uuid}).parse(req.params);
  const {shotIds}=z.object({shotIds:z.array(uuid).min(1).max(100)}).parse(req.body);
  const scene=required(await db.scene.findUnique({where:{id:sceneId},include:{script:true}}));
  await access(req,scene.script.projectId,true);
  const nodes=await db.node.findMany({where:{sceneId,kind:'SHOT',projectId:scene.script.projectId}});
  const original=new Set(nodes.map(n=>n.id));
  if(original.size!==shotIds.length||new Set(shotIds).size!==shotIds.length||
   shotIds.some(id=>!original.has(id)))
   throw new HttpError(400,'SHOT_ORDER_INVALID','Передайте все и только кадры этой сцены.');
  const byId=new Map(nodes.map(node=>[node.id,node]));
  await db.$transaction(shotIds.map((id,index)=>{
   const node=byId.get(id)!;
   const raw=(node.metadata&&typeof node.metadata==='object'&&!Array.isArray(node.metadata))
    ?node.metadata as Record<string,unknown>:{};
   const prod=(raw.production&&typeof raw.production==='object'&&!Array.isArray(raw.production))
    ?raw.production as Record<string,unknown>:{};
   return db.node.update({where:{id},data:{metadata:{...raw,production:{...prod,order:index}}}});
  }));
  return {data:{sceneId,shotIds}};
 });
 app.put('/api/v1/scenes/:sceneId/workflow/location',async req=>{
  const {sceneId}=z.object({sceneId:uuid}).parse(req.params);
  const {locationId}=z.object({locationId:uuid.nullable()}).parse(req.body);
  const scene=required(await db.scene.findUnique({where:{id:sceneId},include:{script:true}}));
  await access(req,scene.script.projectId,true);
  if(locationId){
   const target=await db.node.findFirst({where:{id:locationId,projectId:scene.script.projectId,kind:'LOCATION'}});
   if(!target)throw new HttpError(404,'LOCATION_NOT_FOUND','Локация не относится к проекту');
  }
  const node=required(await db.node.findFirst({where:{sceneId,kind:'SCENE',projectId:scene.script.projectId}}));
  const prev=(node.metadata&&typeof node.metadata==='object'&&!Array.isArray(node.metadata))?node.metadata as Record<string,unknown>:{};
  const wf=(prev.workflow&&typeof prev.workflow==='object'&&!Array.isArray(prev.workflow))?prev.workflow as Record<string,unknown>:{};
  await db.node.update({where:{id:node.id},data:{metadata:{...prev,workflow:{...wf,locationId}}}});
  return {data:{sceneId,locationId}};
 });
}
