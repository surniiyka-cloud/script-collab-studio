import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from './db.js';
import { HttpError, required } from './errors.js';
import { getStoredMediaBytes } from './production-media.js';
import { FixedWindowLimiter } from './security.js';

const uuid=z.uuid();
const jobs=new FixedWindowLimiter(1,10*60_000);
async function ffmpeg(args:string[]) {
 return new Promise<void>((resolve,reject)=>{
  let output='',settled=false;
  const child=spawn('ffmpeg',args,{stdio:['ignore','ignore','pipe']});
  const stop=setTimeout(()=>child.kill('SIGKILL'),120_000);
  function done(error?:Error){
   if(settled)return;settled=true;clearTimeout(stop);
   if(error)reject(error);else resolve();
  }
  child.stderr.on('data',buffer=>{output=(output+String(buffer)).slice(-3000);});
  child.on('error',err=>done(new HttpError(503,'FFMPEG_UNAVAILABLE','Установите FFmpeg в Codespaces: '+err.message)));
  child.on('close',code=>done(code===0?undefined:new HttpError(502,'RENDER_FAILED','Ошибка FFmpeg: '+output.slice(-500))));
 });
}
export function registerProductionRenderRoutes(
 app:FastifyInstance,
 access:(req:FastifyRequest,projectId:string,write?:boolean)=>Promise<unknown>,
){
 app.post('/api/v1/projects/:projectId/production/render',async(req,reply)=>{
  const {projectId}=z.object({projectId:uuid}).parse(req.params);
  await access(req,projectId,true);
  const {scriptId}=z.object({scriptId:uuid}).parse(req.body);
  const script=required(await db.script.findUnique({where:{id:scriptId}}));
  if(script.projectId!==projectId)throw new HttpError(404,'NOT_FOUND','Сценарий не входит в проект.');
  const scenes=await db.scene.findMany({where:{scriptId},orderBy:[{act:{sortKey:'asc'}},{sortKey:'asc'}]});
  const nodes=await db.node.findMany({where:{projectId,kind:'SHOT',sceneId:{in:scenes.map(s=>s.id)}},
   orderBy:{createdAt:'asc'},include:{mediaLinks:{include:{asset:true}}}});
  const ordered=scenes.flatMap(scene=>nodes.filter(node=>node.sceneId===scene.id));
  if(!ordered.length)throw new HttpError(409,'NOTHING_TO_RENDER','Сначала утвердите кадры.');
  const seconds=ordered.reduce((sum,shot)=>sum+(shot.durationMs??3500),0)/1000;
  if(ordered.length>25||seconds>150)throw new HttpError(400,'RENDER_TOO_LARGE','В одном экспорте до 25 кадров или 150 секунд.');
  for(const shot of ordered){
   if(!shot.mediaLinks.some(link=>link.asset.kind==='IMAGE'))
    throw new HttpError(409,'IMAGE_REQUIRED','Для MP4 загрузите изображение к каждому кадру. Не хватает: '+shot.title);
  }
  const decision=jobs.check(req.ip);
  if(!decision.allowed)throw new HttpError(429,'RENDER_LIMIT','Попробуйте собрать видео немного позже.');
  const work=await mkdtemp(join(tmpdir(),'studio-render-'));
  try{
   const clips:string[]=[];
   for(let i=0;i<ordered.length;i++){
    const shot=ordered[i],files=shot.mediaLinks.map(link=>link.asset);
    const image=files.find(asset=>asset.kind==='IMAGE')!;
    const audio=files.find(asset=>asset.kind==='AUDIO');
    const imagePath=join(work,'still-'+i+(image.mimeType==='image/png'?'.png':image.mimeType==='image/webp'?'.webp':'.jpg'));
    const audioPath=audio?join(work,'audio-'+i+(audio.mimeType.includes('wav')?'.wav':'.mp3')):'';
    const clipPath=join(work,'clip-'+String(i).padStart(3,'0')+'.mp4');
    await writeFile(imagePath,await getStoredMediaBytes(image.objectKey));
    if(audio)await writeFile(audioPath,await getStoredMediaBytes(audio.objectKey));
    const args=['-hide_banner','-loglevel','error','-y','-loop','1','-framerate','24','-i',imagePath];
    if(audio)args.push('-i',audioPath);
    else args.push('-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=44100');
    args.push('-map','0:v:0','-map','1:a:0',
     '-vf','scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p',
     '-c:v','libx264','-preset','veryfast','-crf','25','-r','24',
     '-c:a','aac','-b:a','128k','-ar','44100','-ac','2',
     '-af','apad','-t',String(Math.max(.5,Math.min(60,(shot.durationMs??3500)/1000))),
     '-movflags','+faststart',clipPath);
    await ffmpeg(args);clips.push(clipPath);
   }
   const listing=join(work,'sequence.txt');
   await writeFile(listing,clips.map(path=>"file '"+path.replaceAll("'","")+"'").join('\n')+'\n');
   const output=join(work,'animatic.mp4');
   await ffmpeg(['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',listing,'-c','copy','-movflags','+faststart',output]);
   const mp4=await readFile(output);
   if(mp4.length>100*1024*1024)throw new HttpError(413,'VIDEO_TOO_LARGE','Итоговый файл слишком большой.');
   reply.header('Cache-Control','no-store');
   reply.header('Content-Disposition','attachment; filename="script-collab-animatic.mp4"');
   return reply.type('video/mp4').send(mp4);
  }finally{await rm(work,{recursive:true,force:true});}
 });
}
