import { randomInt, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { env } from './env.js';
import { db } from './db.js';
import { HttpError, required } from './errors.js';
import { attachGeneratedStill } from './production-media.js';
import { FixedWindowLimiter } from './security.js';

const uuid=z.uuid();
const throttle=new FixedWindowLimiter(2,10*60_000);
const body=z.object({ prompt:z.string().trim().min(5).max(700).optional() });

type ProviderStatus={configured:boolean;reachable:boolean;label:string;message:string};
function providerStatus(configured:boolean,reachable:boolean,label:string,message:string):ProviderStatus {
 return {configured,reachable,label,message};
}
async function ping(url:string,path:string):Promise<boolean>{
 try{const response=await fetch(url.replace(/\/$/,'')+path,{signal:AbortSignal.timeout(1500)});
  return response.ok;
 }catch{return false;}
}
function localBase(url:string){return url.endsWith('/')?url.slice(0,-1):url;}
async function ollamaModelReady():Promise<boolean>{
 if(!env.OLLAMA_URL||!env.OLLAMA_MODEL)return false;
 try{
  const response=await fetch(localBase(env.OLLAMA_URL)+'/api/tags',{signal:AbortSignal.timeout(2500)});
  if(!response.ok)return false;
  const payload=await response.json() as {models?:Array<{name?:string;model?:string}>};
  return (payload.models??[]).some(model=>model.name===env.OLLAMA_MODEL||model.model===env.OLLAMA_MODEL);
 }catch{return false;}
}
async function comfyCheckpointReady():Promise<boolean>{
 if(!env.COMFYUI_URL||!env.COMFYUI_CHECKPOINT)return false;
 try{
  const response=await fetch(localBase(env.COMFYUI_URL)+'/object_info/CheckpointLoaderSimple',
   {signal:AbortSignal.timeout(3000)});
  if(!response.ok)return false;
  const payload=await response.json() as {
   CheckpointLoaderSimple?:{input?:{required?:{ckpt_name?:[string[]]}}}
  };
  return payload.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0]?.includes(env.COMFYUI_CHECKPOINT)??false;
 }catch{return false;}
}

/**
 * A fixed workflow avoids executing arbitrary user-supplied ComfyUI graphs.
 * Requires an installed compatible checkpoint in local ComfyUI.
 * This baseline does not use reference-image conditioning: visual identity is NOT locked yet.
 */
function workflow(description:string,checkpoint:string){
 return {
  '4':{class_type:'CheckpointLoaderSimple',inputs:{ckpt_name:checkpoint}},
  '6':{class_type:'CLIPTextEncode',inputs:{clip:['4',1],text:
   'Cinematic storyboard still, professional film composition, consistent lighting, 16:9 widescreen, '+description}},
  '7':{class_type:'CLIPTextEncode',inputs:{clip:['4',1],text:'watermark, text, logo, blurry, low quality, deformed'}},
  '5':{class_type:'EmptyLatentImage',inputs:{width:768,height:432,batch_size:1}},
  '3':{class_type:'KSampler',inputs:{model:['4',0],positive:['6',0],negative:['7',0],
    latent_image:['5',0],seed:randomInt(0,2**32),steps:20,cfg:6,sampler_name:'euler',scheduler:'normal',denoise:1}},
  '8':{class_type:'VAEDecode',inputs:{samples:['3',0],vae:['4',2]}},
  '9':{class_type:'SaveImage',inputs:{images:['8',0],filename_prefix:'script_collab_storyboard'}},
 };
}
type QueueResponse={prompt_id?:string;error?:string};
type ImageFile={filename?:string;subfolder?:string;type?:string};
type HistoryEntry={outputs?:Record<string,{images?:ImageFile[]}>;status?:{status_str?:string}};
async function generatePng(prompt:string):Promise<Buffer>{
 const base=localBase(env.COMFYUI_URL!);
 let queued:Response;
 try{
  queued=await fetch(base+'/prompt',{method:'POST',signal:AbortSignal.timeout(12000),
   headers:{'Content-Type':'application/json'},body:JSON.stringify({
     client_id:randomUUID(),prompt:workflow(prompt,env.COMFYUI_CHECKPOINT!),
   })});
 }catch{throw new HttpError(503,'COMFYUI_OFFLINE','ComfyUI не отвечает на localhost. Запустите движок и проверьте модель.');}
 if(!queued.ok)throw new HttpError(502,'COMFYUI_WORKFLOW','ComfyUI отклонил workflow. Проверьте имя checkpoint и установленные стандартные узлы.');
 const submitted=await queued.json() as QueueResponse;
 const jobId=uuid.safeParse(submitted.prompt_id);
 if(!jobId.success)throw new HttpError(502,'COMFYUI_QUEUE','ComfyUI не подтвердил постановку изображения в очередь.');
 const until=Date.now()+110000;
 while(Date.now()<until){
  await new Promise<void>(resolve=>setTimeout(resolve,2000));
  let history:Response;
  try{history=await fetch(base+'/history/'+jobId.data,{signal:AbortSignal.timeout(4000)});}
  catch{continue;}
  if(!history.ok)continue;
  const payload=await history.json() as Record<string,HistoryEntry>;
  const entry=payload[jobId.data];
  if(!entry)continue;
  if(entry.status?.status_str==='error')throw new HttpError(502,'COMFYUI_RENDER_ERROR','ComfyUI сообщил об ошибке рендера.');
  const image=Object.values(entry.outputs??{}).flatMap(item=>item.images??[]).find(item=>item.type==='output');
  if(!image?.filename)continue;
  const url=new URL(base+'/view');
  url.searchParams.set('filename',image.filename);
  url.searchParams.set('subfolder',image.subfolder??'');
  url.searchParams.set('type','output');
  const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new HttpError(502,'COMFYUI_RESULT','ComfyUI не вернул изображение.');
  if(Number(response.headers.get('content-length')??0)>8*1024*1024)
   throw new HttpError(502,'COMFYUI_RESULT_TOO_LARGE','Сгенерированное изображение слишком большое.');
  const imageBuffer=Buffer.from(await response.arrayBuffer());
  if(imageBuffer.length>8*1024*1024)throw new HttpError(502,'COMFYUI_RESULT_TOO_LARGE','Сгенерированное изображение слишком большое.');
  return imageBuffer;
 }
 throw new HttpError(504,'COMFYUI_TIMEOUT','Рендер не завершился за 110 секунд. Проверьте очередь ComfyUI.');
}

export function registerImageGenerationRoutes(
 app:FastifyInstance,
 access:(req:FastifyRequest,projectId:string,write?:boolean)=>Promise<unknown>,
){
 app.get('/api/v1/projects/:projectId/production/ai-status',async req=>{
  const {projectId}=z.object({projectId:uuid}).parse(req.params);
  await access(req,projectId);
  const textConfigured=Boolean(env.OLLAMA_URL&&env.OLLAMA_MODEL);
  const imageConfigured=Boolean(env.COMFYUI_URL&&env.COMFYUI_CHECKPOINT);
  const [textOnline,imageOnline,textAvailable,imageAvailable]=await Promise.all([
   textConfigured?ping(env.OLLAMA_URL!,'/api/tags'):false,
   imageConfigured?ping(env.COMFYUI_URL!,'/system_stats'):false,
   textConfigured?ollamaModelReady():false,
   imageConfigured?comfyCheckpointReady():false,
  ]);
  return {data:{
   text:providerStatus(textConfigured,textAvailable,'Ollama',
     !textConfigured?'Не настроен: текстовый ИИ отключён.':
     textAvailable?'Модель найдена и готова к запросу.':textOnline?'Движок работает, но выбранная модель не найдена.':'Движок не отвечает.'),
   image:providerStatus(imageConfigured,imageAvailable,'ComfyUI',
     !imageConfigured?'Не настроен: генерация изображений отключена.':
     imageAvailable?'Checkpoint найден и доступен.':imageOnline?'Движок работает, но выбранный checkpoint не найден.':'Движок не отвечает.'),
  }};
 });
 app.post('/api/v1/projects/:projectId/production/shots/:shotId/generate-image',async req=>{
  const {projectId,shotId}=z.object({projectId:uuid,shotId:uuid}).parse(req.params);
  await access(req,projectId,true);
  const {prompt}=body.parse(req.body);
  if(!env.COMFYUI_URL||!env.COMFYUI_CHECKPOINT)
   throw new HttpError(503,'IMAGE_AI_NOT_CONFIGURED','Генерация изображений не настроена. Нужны COMFYUI_URL и COMFYUI_CHECKPOINT.');
  const shot=required(await db.node.findUnique({where:{id:shotId}}));
  if(shot.projectId!==projectId||shot.kind!=='SHOT')
   throw new HttpError(404,'SHOT_NOT_FOUND','Не найден утверждённый кадр проекта.');
  const input=(prompt||shot.description||'').trim();
  if(input.length<5)throw new HttpError(400,'SHOT_DESCRIPTION_REQUIRED','У кадра нет описания для генерации.');
  const allowed=throttle.check(req.ip);
  if(!allowed.allowed)throw new HttpError(429,'IMAGE_AI_RATE_LIMIT','Не более 2 генераций за 10 минут. Подождите.');
  const png=await generatePng(input);
  const asset=await attachGeneratedStill(projectId,shotId,png,'ai-frame-'+Date.now()+'.png');
  return {data:{asset,note:'Изображение создано ComfyUI и прикреплено к кадру. Сценарий не изменён. Референсы персонажей пока НЕ участвуют в генерации.'}};
 });
}
