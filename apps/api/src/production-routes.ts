import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import * as Y from 'yjs';
import { db } from './db.js';
import { HttpError, required } from './errors.js';
import { parseScreenplay, suggestShots } from './screenplay-import.js';
import type { Block, Shot } from './screenplay-import.js';

const uuid=z.uuid();
const scriptBody=z.object({ title:z.string().trim().min(1).max(200),text:z.string().min(1).max(400000),digest:z.string().regex(/^[0-9a-f]{64}$/) });
const approvedShot=z.object({
 title:z.string().trim().min(1).max(200),description:z.string().trim().min(1).max(700),
 shotType:z.enum(['WIDE','MEDIUM','CLOSE_UP','OTHER']),durationMs:z.number().int().min(500).max(60000),
 sourceLine:z.number().int().positive().nullable(),soundCue:z.string().max(250),musicCue:z.string().max(250),
});
function stateFromBlocks(blocks:Block[]):Uint8Array{
 const doc=new Y.Doc();
 const fragment=doc.getXmlFragment('screenplay');
 doc.transact(()=>{
  for(const block of blocks){
   const el=new Y.XmlElement('screenplayBlock');
   el.setAttribute('kind',block.kind);
   const text=new Y.XmlText();
   if(block.text)text.insert(0,block.text);
   el.insert(0,[text]);fragment.insert(fragment.length,[el]);
  }
 });
 const update=Y.encodeStateAsUpdate(doc);doc.destroy();
 return update;
}
function readBlocks(state:Uint8Array):Block[]{
 const doc=new Y.Doc();
 try{
  Y.applyUpdate(doc,state);
  const fragment=doc.getXmlFragment('screenplay');
  return fragment.toArray().flatMap((item,index)=>{
   if(!(item instanceof Y.XmlElement))return [];
   const raw=item.toArray().map(t=>t instanceof Y.XmlText?t.toDelta().map(d=>String(d.insert)).join(''):'').join('');
   const kind=item.getAttribute('kind');
   const allowed=['heading','action','character','dialogue','parenthetical','transition'];
   return [{kind:(allowed.includes(kind)?kind:'action') as Block['kind'],text:raw,sourceLine:index+1}];
  });
 }finally{doc.destroy();}
}
async function getScene(sceneId:string,projectId?:string){
 const scene=required(await db.scene.findUnique({where:{id:sceneId},include:{script:true}}));
 if(projectId && scene.script.projectId!==projectId)throw new HttpError(404,'NOT_FOUND','Scene is not in project');
 return scene;
}
export function registerProductionRoutes(
 app:FastifyInstance,
 access:(req:FastifyRequest,projectId:string,write?:boolean)=>Promise<unknown>,
){
 app.post('/api/v1/projects/:projectId/production/import/preview',async req=>{
  const {projectId}=z.object({projectId:uuid}).parse(req.params);
  await access(req,projectId);
  const {text}=z.object({text:z.string().min(1).max(400000)}).parse(req.body);
  return {data:parseScreenplay(text)};
 });
 app.post('/api/v1/projects/:projectId/production/import/commit',async req=>{
  const {projectId}=z.object({projectId:uuid}).parse(req.params);
  await access(req,projectId,true);
  const input=scriptBody.parse(req.body);
  let preview:ReturnType<typeof parseScreenplay>;
  try{preview=parseScreenplay(input.text);}catch(e){throw new HttpError(400,'IMPORT_INVALID',e instanceof Error?e.message:'Import invalid');}
  if(preview.digest!==input.digest)throw new HttpError(409,'PREVIEW_STALE','Preview text changed, review again');
  const created=await db.$transaction(async tx=>{
   const script=await tx.script.create({
    data:{title:input.title,projectId,acts:{create:{title:'Акт 1',sortKey:'000000000001'}}},
    include:{acts:true},
   });
   const actId=script.acts[0].id;
   const scenes=[];
   for(let i=0;i<preview.scenes.length;i++){
    const sceneInput=preview.scenes[i];
    const scene=await tx.scene.create({data:{
     scriptId:script.id,actId,title:sceneInput.title,sortKey:String(i+1).padStart(12,'0'),
    }});
    await tx.node.create({data:{projectId,sceneId:scene.id,title:scene.title,kind:'SCENE'}});
    await tx.yDocState.create({data:{documentName:'scene:'+scene.id,projectId,update:stateFromBlocks(sceneInput.blocks)}});
    scenes.push({id:scene.id,title:scene.title});
   }
   // Characters are suggestions until the user reviews/matches identity; no fake references.
   const existing=await tx.node.findMany({where:{projectId,kind:'CHARACTER'},select:{title:true}});
   const used=new Set(existing.map(item=>item.title.toLocaleUpperCase('ru-RU')));
   for(const name of preview.characters){
    if(used.has(name.toLocaleUpperCase('ru-RU')))continue;
    await tx.node.create({data:{projectId,kind:'CHARACTER',title:name,description:'Персонаж из импорта сценария'}});
    used.add(name.toLocaleUpperCase('ru-RU'));
   }
   return {scriptId:script.id,scenes,characters:preview.characters};
  },{timeout:60000});
  return {data:created};
 });
 app.get('/api/v1/projects/:projectId/production/characters',async req=>{
  const {projectId}=z.object({projectId:uuid}).parse(req.params);
  await access(req,projectId);
  const characters=await db.node.findMany({where:{projectId,kind:'CHARACTER'},orderBy:{title:'asc'}});
  return {data:characters};
 });
 app.post('/api/v1/projects/:projectId/production/characters',async req=>{
  const {projectId}=z.object({projectId:uuid}).parse(req.params);
  await access(req,projectId,true);
  const body=z.object({name:z.string().trim().min(1).max(200),description:z.string().max(5000).optional()}).parse(req.body);
  return {data:await db.node.create({data:{projectId,kind:'CHARACTER',title:body.name,description:body.description}})};
 });
 app.get('/api/v1/scenes/:sceneId/production/shot-draft',async req=>{
  const {sceneId}=z.object({sceneId:uuid}).parse(req.params);
  const scene=await getScene(sceneId);
  await access(req,scene.script.projectId);
  const state=await db.yDocState.findUnique({where:{documentName:'scene:'+sceneId}});
  const blocks=state?readBlocks(state.update):[];
  return {data:{sceneId,shots:suggestShots(blocks),source:'deterministic',note:'Черновые планы — предложения для утверждения; сценарий не изменяется.'}};
 });
 app.get('/api/v1/scenes/:sceneId/production/shots',async req=>{
  const {sceneId}=z.object({sceneId:uuid}).parse(req.params);
  const scene=await getScene(sceneId);await access(req,scene.script.projectId);
  const nodes=await db.node.findMany({where:{projectId:scene.script.projectId,sceneId,kind:'SHOT'},orderBy:{createdAt:'asc'},include:{mediaLinks:{include:{asset:true}}}});
  return {data:nodes.map(node=>({...node,mediaLinks:node.mediaLinks.map(link=>({...link,asset:{...link.asset,sizeBytes:String(link.asset.sizeBytes)}}))}))};
 });
 app.post('/api/v1/scenes/:sceneId/production/shots/approve',async req=>{
  const {sceneId}=z.object({sceneId:uuid}).parse(req.params);
  const scene=await getScene(sceneId);await access(req,scene.script.projectId,true);
  const input=z.object({shots:z.array(approvedShot).min(1).max(20)}).parse(req.body);
  const count=await db.node.count({where:{sceneId,kind:'SHOT'}});
  if(count+input.shots.length>100)throw new HttpError(409,'SHOT_LIMIT','Scene has too many shots');
  const nodes=await db.$transaction(Promise.all(input.shots.map((shot,i)=>db.node.create({data:{
   projectId:scene.script.projectId,sceneId,kind:'SHOT',title:shot.title,description:shot.description,
   shotType:shot.shotType,durationMs:shot.durationMs,positionX:(count+i)*300,positionY:0,
   metadata:{production:{sourceLine:shot.sourceLine,soundCue:shot.soundCue,musicCue:shot.musicCue,status:'approved'}},
  }}))));
  return {data:nodes};
 });
 app.get('/api/v1/projects/:projectId/production/timeline',async req=>{
  const {projectId}=z.object({projectId:uuid}).parse(req.params);
  await access(req,projectId);
  const scriptId=z.object({scriptId:uuid}).parse(req.query).scriptId;
  const script=required(await db.script.findUnique({where:{id:scriptId},select:{id:true,projectId:true,title:true}}));
  if(script.projectId!==projectId)throw new HttpError(404,'NOT_FOUND','Script does not belong to project');
  const scenes=await db.scene.findMany({where:{scriptId},orderBy:[{act:{sortKey:'asc'}},{sortKey:'asc'}]});
  const shots=await db.node.findMany({where:{projectId,sceneId:{in:scenes.map(s=>s.id)},kind:'SHOT'},orderBy:{createdAt:'asc'}});
  return {data:{script,scenes:scenes.map(scene=>({
   id:scene.id,title:scene.title,
   shots:shots.filter(shot=>shot.sceneId===scene.id).map(shot=>({
    id:shot.id,title:shot.title,description:shot.description,shotType:shot.shotType,
    durationMs:shot.durationMs??3500,metadata:shot.metadata,
   })),
  }))}};
 });
}
