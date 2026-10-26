import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { db } from '../dist/db.js';

const url='http://127.0.0.1:3001';
let token='',projectId='',userId='';
async function call(path,method='GET',body){
 const response=await fetch(url+'/api/v1'+path,{
  method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const data=await response.json();
 if(!response.ok)throw Error(method+' '+path+': '+response.status+' '+JSON.stringify(data));
 return data.data;
}
try{
 const auth=await call('/auth/register','POST',{email:'production-'+randomUUID()+'@example.test',password:'secret-'+randomUUID(),displayName:'Production Smoke'});
 token=auth.accessToken;userId=auth.user.id;
 const p=await call('/projects','POST',{title:'Temporary film integration'});
 projectId=p.id;
 const text='ИНТ. ОФИС — УТРО\n\nСЕРГЕЙ\nДоброе утро!\n\nНАТ. ОЗЕРО — ДЕНЬ\nВода спокойная.';
 console.log('1/6 Preview complete screenplay, preserve author text');
 const preview=await call('/projects/'+projectId+'/production/import/preview','POST',{text});
 assert.equal(preview.scenes.length,2);
 assert.ok(preview.characters.includes('СЕРГЕЙ'));
 console.log('2/6 Commit screenplay to scenes and Yjs XML');
 const imported=await call('/projects/'+projectId+'/production/import/commit','POST',{title:'The original story',text,digest:preview.digest});
 assert.equal(imported.scenes.length,2);
 const state=await db.yDocState.findUnique({where:{documentName:'scene:'+imported.scenes[0].id}});
 assert.ok(state);
 const ydoc=new Y.Doc();Y.applyUpdate(ydoc,state.update);
 assert.ok(ydoc.getXmlFragment('screenplay').length>=4);
 assert.ok(ydoc.getXmlFragment('screenplay').toString().includes('Доброе утро!'));
 ydoc.destroy();
 console.log('3/6 Create shot suggestions, explicitly approve and retrieve film timeline');
 const first=imported.scenes[0].id;
 const drafted=await call('/scenes/'+first+'/production/shot-draft');
 assert.ok(drafted.shots.length>=2);
 const accepted=await call('/scenes/'+first+'/production/shots/approve','POST',{shots:drafted.shots});
 assert.equal(accepted.length,drafted.shots.length);
 const timeline=await call('/projects/'+projectId+'/production/timeline?scriptId='+imported.scriptId);
 assert.equal(timeline.scenes[0].shots.length,drafted.shots.length);
 console.log('3b/6 New wizard scene breakdown includes actual speakers, original actions and discovered locations');
 let board=await call('/projects/'+projectId+'/workflow/story?scriptId='+imported.scriptId);
 assert.equal(board.scenes.length,2);
 assert.equal(board.scenes[0].dialogues[0].speaker,'СЕРГЕЙ');
 assert.equal(board.scenes[0].dialogues[0].text,'Доброе утро!');
 assert.equal(board.scenes[1].actionDescription,'Вода спокойная.');
 assert.equal(board.scenes[0].shots.length,drafted.shots.length);
 const beforeOrder=board.scenes[0].shots.map(shot=>shot.id);
 const afterOrder=[...beforeOrder].reverse();
 await call('/scenes/'+first+'/workflow/shots/order','PUT',{shotIds:afterOrder});
 board=await call('/projects/'+projectId+'/workflow/story?scriptId='+imported.scriptId);
 assert.deepEqual(board.scenes[0].shots.map(shot=>shot.id),afterOrder,
  'Visual storyboard must reflect the exact confirmed frame sequence');

 const office=board.locations.find(location=>location.title==='ОФИС');
 const lake=board.locations.find(location=>location.title==='ОЗЕРО');
 assert.ok(office && lake,'Both locations should be discovered automatically');
 assert.equal(board.scenes[0].locationId,office.id);
 await call('/scenes/'+first+'/workflow/location','PUT',{locationId:lake.id});
 board=await call('/projects/'+projectId+'/workflow/story?scriptId='+imported.scriptId);
 assert.equal(board.scenes[0].locationId,lake.id);
 await call('/scenes/'+first+'/workflow/location','PUT',{locationId:office.id});
 console.log('4/6 Keep imported characters in graph');
 const characters=await call('/projects/'+projectId+'/production/characters');
 const character=characters.find(n=>n.title==='СЕРГЕЙ');
 assert.ok(character);
 console.log('4b/6 Verify AI capabilities and no fabricated image output');
 const caps=await call('/projects/'+projectId+'/production/ai-status');
 assert.equal(typeof caps.image.configured,'boolean');
 assert.equal(typeof caps.text.configured,'boolean');
 if(!caps.image.configured){
  const noAi=await fetch(url+'/api/v1/projects/'+projectId+'/production/shots/'+accepted[0].id+'/generate-image',{
   method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}',
  });
  assert.equal(noAi.status,503);
  const refused=await noAi.json();
  assert.equal(refused.error.code,'IMAGE_AI_NOT_CONFIGURED');
 }
 console.log('5/6 Attach private PNG reference to named character');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64');
 const uploaded=await fetch(url+'/api/v1/projects/'+projectId+'/production/nodes/'+character.id+'/media',{
  method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'image/png','x-file-name':'reference.png'},body:png,
 });
 const uploadPayload=await uploaded.json();
 assert.equal(uploaded.status,201,JSON.stringify(uploadPayload));
 const asset=uploadPayload.data;
 const media=await fetch(url+'/api/v1/media/'+asset.id+'/file',{headers:{Authorization:'Bearer '+token}});
 assert.equal(media.status,200);
 assert.equal(Buffer.from(await media.arrayBuffer()).length,png.length);
 console.log('6/6 Verify asset linked to correct character');
 const after=await call('/projects/'+projectId+'/production/characters');
 const updated=after.find(n=>n.id===character.id);
 assert.ok(updated.mediaLinks.some(link=>link.asset.id===asset.id));
 console.log('6b/6 Upload location photo, ensure correct location/media in visual story');
 const locationPhoto=await fetch(url+'/api/v1/projects/'+projectId+'/production/nodes/'+office.id+'/media',{
  method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'image/png','x-file-name':'office.png'},body:png,
 });
 const uploadedLocation=await locationPhoto.json();
 assert.equal(locationPhoto.status,201,JSON.stringify(uploadedLocation));
 const visual=await call('/projects/'+projectId+'/workflow/story?scriptId='+imported.scriptId);
 assert.ok(visual.locations.find(loc=>loc.id===office.id).media.some(m=>m.id===uploadedLocation.data.id));
 assert.ok(visual.characters.find(person=>person.id===character.id).media.some(m=>m.id===asset.id));

 console.log('PASS: script import, Yjs, shot approval, timeline, named character and private MinIO file.');
} finally{
 if(projectId){try{await db.project.delete({where:{id:projectId}});}catch(e){console.warn('Temporary project cleanup failed',String(e));}}
 if(userId){try{await db.user.delete({where:{id:userId}});}catch(e){console.warn('Temporary user cleanup failed',String(e));}}
 await db.$disconnect();
}
