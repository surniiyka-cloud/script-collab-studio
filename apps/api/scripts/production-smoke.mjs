import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { db } from '../dist/db.js';

const url='http://127.0.0.1:3001';
let token='',projectId='',userId='',collaboratorId='';
async function call(path,method='GET',body){
 const response=await fetch(url+'/api/v1'+path,{
  method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const data=await response.json();
 if(!response.ok)throw Error(method+' '+path+': '+response.status+' '+JSON.stringify(data));
 return data.data;
}
async function otherCall(accessToken,path,method='GET',body){
 const response=await fetch(url+'/api/v1'+path,{
  method,headers:{Authorization:'Bearer '+accessToken,...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const result=await response.json();
 return {status:response.status,...result};
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

 console.log('7/7 Chapter screenplay import: film worlds, actor speech and preserved source');
 const chapters=[
   'ПРОЛОГ. РЫБАЛКА',
   ...['НАЗАД В БУДУЩЕЕ','ИВАН ВАСИЛЬЕВИЧ','МАТРИЦА','ТЕРМИНАТОР',
    'ТРИ БОГАТЫРЯ','БРЕМЕНСКИЕ МУЗЫКАНТЫ','ВИННИ-ПУХ','ЧЕБУРАШКА',
    'НУ ПОГОДИ','ПРОСТОКВАШИНО','БРАТ 2','ОСОБЕННОСТИ РЫБАЛКИ']
     .map((name,i)=>String(i+1).padStart(2,'0')+'. '+name),
   'ЭПИЛОГ. БАЙКАЛ',
 ];
 const fullText=['МИССИЯ 52','ПО ТУ СТОРОНУ ЭКРАНА',''];
 chapters.forEach((chapter,i)=>{
  fullText.push(chapter);
  fullText.push(i===0?'00:00–00:50 · Тихий берег. Раннее утро':'00:50–01:32 · Площадь');
  fullText.push('Герой оглядывается вокруг.');
  fullText.push(i===0?'ВАДИМ ГЕОРГИЕВИЧ: Доброе утро.':'СА: Красота...');
  fullText.push('ПЕРЕХОД: следующий эпизод.');
 });
 const chapterText=fullText.join('\n');
 const chapterPreview=await call('/projects/'+projectId+'/production/import/preview','POST',{text:chapterText});
 assert.equal(chapterPreview.scenes.length,14);
 assert.equal(chapterPreview.scenes[0].timecode,'00:00–00:50');
 assert.equal(chapterPreview.scenes[0].locationHint,'Тихий берег');
 assert.ok(chapterPreview.characters.includes('ВАДИМ ГЕОРГИЕВИЧ'));
 const importedFilm=await call('/projects/'+projectId+'/production/import/commit','POST',{
  title:'Multi-chapter regression',text:chapterText,digest:chapterPreview.digest,
 });
 const storedSource=await db.yDocState.findUnique({
  where:{documentName:'script:'+importedFilm.scriptId+':source'},
 });
 assert.ok(storedSource,'Complete document is stored beyond the scene splits');
 const original=new Y.Doc();Y.applyUpdate(original,storedSource.update);
 assert.equal(original.getXmlFragment('source').toString().replace(/<[^>]*>/g,''),chapterText);
 original.destroy();
 const film=await call('/projects/'+projectId+'/workflow/story?scriptId='+importedFilm.scriptId);
 assert.equal(film.scenes.length,14);
 assert.equal(film.scenes[0].timecode,'00:00–00:50');
 assert.equal(film.scenes[0].suggestedLocation,'Тихий берег');
 assert.equal(film.scenes[0].dialogues[0].speaker,'ВАДИМ ГЕОРГИЕВИЧ');
 assert.equal(film.scenes[0].dialogues[0].text,'Доброе утро.');
 assert.ok(film.locations.some(location=>location.title==='Тихий берег'));
 console.log('8/8 Project collaboration: registered users, roles, visibility, revocation and owner deletion');
 const friendEmail='friend-'+randomUUID()+'@example.test';
 const friend=await call('/auth/register','POST',{
  email:friendEmail,password:'secret-'+randomUUID(),displayName:'Second collaborator',
 });
 collaboratorId=friend.user.id;
 const guestToken=friend.accessToken;
 const members=await call('/projects/'+projectId+'/members');
 assert.equal(members.length,1);
 assert.equal(members[0].role,'OWNER');
 const unattached=await otherCall(guestToken,'/projects/'+projectId);
 assert.notEqual(unattached.status,200,'Uninvited account must not read project');
 const unknown=await otherCall(guestToken,'/projects/'+projectId+'/members','POST',{email:friendEmail,role:'EDITOR'});
 assert.notEqual(unknown.status,200,'Uninvited user cannot add members');
 const invite=await call('/projects/'+projectId+'/members','POST',{email:friendEmail,role:'VIEWER'});
 assert.equal(invite.role,'VIEWER');
 assert.equal(invite.email,friendEmail);
 const viewerProjects=await otherCall(guestToken,'/projects');
 assert.ok(viewerProjects.data.some(project=>project.id===projectId),'Shared project appears in collaborator projects');
 const viewerRead=await otherCall(guestToken,'/projects/'+projectId+'/workflow/story?scriptId='+imported.scriptId);
 assert.equal(viewerRead.status,200);
 const viewerWrite=await otherCall(guestToken,'/projects/'+projectId+'/workflow/locations','POST',{title:'Not allowed'});
 assert.equal(viewerWrite.status,403,'Viewer cannot change project');
 const viewerDelete=await otherCall(guestToken,'/projects/'+projectId,'DELETE');
 assert.equal(viewerDelete.status,403,'Viewer cannot delete project');
 const promote=await call('/projects/'+projectId+'/members/'+collaboratorId,'PATCH',{role:'EDITOR'});
 assert.equal(promote.role,'EDITOR');
 const editorWrite=await otherCall(guestToken,'/projects/'+projectId+'/workflow/locations','POST',{title:'Test collaborative location'});
 assert.equal(editorWrite.status,200,'Editor can change project');
 const editorInvite=await otherCall(guestToken,'/projects/'+projectId+'/members','POST',{email:friendEmail,role:'VIEWER'});
 assert.equal(editorInvite.status,403,'Editor cannot invite someone else');
 const editorDelete=await otherCall(guestToken,'/projects/'+projectId,'DELETE');
 assert.equal(editorDelete.status,403,'Editor cannot delete project');
 await call('/projects/'+projectId+'/members/'+collaboratorId,'DELETE');
 const removedProject=await otherCall(guestToken,'/projects/'+projectId);
 assert.notEqual(removedProject.status,200,'Removed member loses access');
 const deleteFixture=await call('/projects','POST',{title:'Delete me securely'});
 const deleted=await call('/projects/'+deleteFixture.id,'DELETE');
 assert.equal(deleted.deleted,true);
 assert.ok(['completed','pending'].includes(deleted.storageCleanup));
 assert.equal(await db.project.findUnique({where:{id:deleteFixture.id}}),null);

 console.log('PASS: script import, Yjs, shot approval, timeline, named character and private S3 files, chapter parsing and lossless original.');
} finally{
 if(projectId){try{await db.project.delete({where:{id:projectId}});}catch(e){console.warn('Temporary project cleanup failed',String(e));}}
 if(collaboratorId){try{await db.user.delete({where:{id:collaboratorId}});}catch(e){console.warn('Collaborator cleanup failed',String(e));}}
 if(userId){try{await db.user.delete({where:{id:userId}});}catch(e){console.warn('Temporary user cleanup failed',String(e));}}
 await db.$disconnect();
}
