import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
 ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, Clapperboard, FileImage, Film,
 ImagePlus, Layers, MapPin, Plus, Quote, RefreshCw, Save, Upload, Users, X,
} from 'lucide-react';
import { api, isUnauthorized } from '../api';
import type {
 ImportBlock, ImportPreview, Project, Script, ShotDraft, WorkflowMedia, WorkflowScene,
 WorkflowStory, WorkflowSubject,
} from '../api';
import { useAuth } from '../auth';
import { DashboardFrame, UserIndicator } from '../components/Chrome';
import './story-wizard.css';

const steps=[
 {title:'Сценарий',sub:'Разбор истории',icon:BookOpen},
 {title:'Персонажи',sub:'Кто в кадре',icon:Users},
 {title:'Локации',sub:'Где происходит',icon:MapPin},
 {title:'Кадры',sub:'Режиссура сцен',icon:Clapperboard},
 {title:'Карта истории',sub:'Всё по порядку',icon:Layers},
] as const;
type Stage=0|1|2|3|4;
type Line={speaker:string;text:string};
function dialogues(blocks:ImportBlock[]):Line[]{
 const found:Line[]=[];let speaker='';
 for(const block of blocks){
  const t=block.text.trim();
  if(block.kind==='character')speaker=t;
  else if(block.kind==='dialogue'&&speaker&&t)found.push({speaker,text:t});
  else if(block.kind==='action'||block.kind==='heading'||block.kind==='transition')speaker='';
 }
 return found;
}
function failure(err:unknown):string{return err instanceof Error?err.message:'Операция завершилась с ошибкой.';}
function MediaPreview({media,token,large=false}:{media:WorkflowMedia;token:string;large?:boolean}){
 const [url,setUrl]=useState<string|null>(null);
 useEffect(()=>{
  let mounted=true;let temp:string|null=null;
  void api.mediaBlob(token,media.id).then(blob=>{
   if(!mounted)return;temp=URL.createObjectURL(blob);setUrl(temp);
  }).catch(()=>{if(mounted)setUrl(null);});
  return ()=>{mounted=false;if(temp)URL.revokeObjectURL(temp);};
 },[media.id,token]);
 if(media.kind!=='IMAGE')return <span className="wizard-media-audio">♪ {media.filename}</span>;
 return <div className={'wizard-media '+(large?'wizard-media-large':'')}>
  {url?<img alt={media.filename} src={url} loading="lazy"/>:<FileImage size={19}/>}
 </div>;
}
function ImageGallery({media,token,large=false}:{media:WorkflowMedia[];token:string;large?:boolean}){
 const pictures=media.filter(m=>m.kind==='IMAGE');
 return pictures.length?<div className="wizard-image-gallery">
  {pictures.map(m=><MediaPreview key={m.id} media={m} token={token} large={large}/>)}
 </div>:<div className="wizard-empty-image"><ImagePlus size={24}/><span>Фото не добавлено</span></div>;
}
type PendingFile={id:string;file:File;url:string;target:string};
function BulkPhotos({title,subjects,token,projectId,onUploaded}:{
 title:string;subjects:WorkflowSubject[];token:string;projectId:string;onUploaded:()=>Promise<void>;
}){
 const [pending,setPending]=useState<PendingFile[]>([]);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 useEffect(()=>()=>{for(const item of pending)URL.revokeObjectURL(item.url);},[]); // URLs are also revoked individually at removal
 function pick(event:ChangeEvent<HTMLInputElement>){
  const files=Array.from(event.target.files??[]).filter(f=>['image/jpeg','image/png','image/webp'].includes(f.type)&&f.size<=8*1024*1024);
  const invalid=(event.target.files?.length??0)-files.length;
  if(invalid)setNotice(invalid+' файл(ов) пропущено: принимаются JPG, PNG и WebP до 8 МБ.');
  setPending(before=>[...before,...files.map(file=>({
   id:crypto.randomUUID(),file,url:URL.createObjectURL(file),target:subjects.length===1?subjects[0].id:'',
  }))]);
  event.target.value='';
 }
 async function upload(){
  if(!pending.length)return;
  if(pending.some(p=>!p.target)){setNotice('Присвой имя каждому изображению перед сохранением.');return;}
  setBusy(true);setNotice('Загружаем фотографии…');
  let done=0;
  const remaining:PendingFile[]=[];
  for(const item of pending){
   try{await api.uploadMedia(token,projectId,item.target,item.file);done++;URL.revokeObjectURL(item.url);}
   catch{remaining.push(item);}
  }
  setPending(remaining);setBusy(false);
  setNotice(remaining.length?'Загружено '+done+'. Ошибка у '+remaining.length+' файла(ов): их можно повторить.':'Сохранено изображений: '+done+'.');
  await onUploaded();
 }
 function remove(id:string){setPending(before=>before.filter(item=>{
  if(item.id===id){URL.revokeObjectURL(item.url);return false;}return true;
 }));}
 return <section className="wizard-bulk">
  <div className="wizard-inline-heading"><h3>{title}</h3><span>Можно выбрать все фотографии одновременно</span></div>
  <label className="wizard-drop-area"><Upload size={26}/><strong>Выбрать несколько изображений</strong>
   <small>После загрузки назначь каждому фото персонажа или локацию</small>
   <input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={pick} disabled={busy}/>
  </label>
  {!!pending.length&&<><div className="wizard-pending-grid">
   {pending.map(file=><article className="wizard-pending-card" key={file.id}>
     <img src={file.url} alt={file.file.name}/>
     <div><small title={file.file.name}>{file.file.name}</small>
      <select aria-label={'Кому принадлежит '+file.file.name} disabled={busy} value={file.target} onChange={e=>setPending(list=>list.map(p=>p.id===file.id?{...p,target:e.target.value}:p))}>
       <option value="">Выбрать имя…</option>
       {subjects.map(subject=><option key={subject.id} value={subject.id}>{subject.title}</option>)}
      </select>
     </div>
     <button type="button" aria-label="Удалить фото из очереди" disabled={busy} onClick={()=>remove(file.id)}><X size={17}/></button>
   </article>)}
  </div>
  <button className="wizard-primary" disabled={busy||pending.some(p=>!p.target)} onClick={()=>void upload()}>
   <Check size={18}/>{busy?'Загружаем…':'Сохранить назначенные фото ('+pending.length+')'}
  </button></>}
  {notice&&<p role="status" className="wizard-helper">{notice}</p>}
 </section>;
}
function StageTitle({index,title,description}:{index:number;title:string;description:string}){
 return <header className="wizard-stage-title"><span>ШАГ {String(index).padStart(2,'0')} / 05</span>
  <h2>{title}</h2><p>{description}</p></header>;
}
export function StoryWizardScreen(){
 const {projectId}=useParams<{projectId:string}>();
 const {token,sessionExpired}=useAuth();
 const [project,setProject]=useState<Project|null>(null);
 const [scripts,setScripts]=useState<Script[]>([]);
 const [scriptId,setScriptId]=useState<string>('');
 const [story,setStory]=useState<WorkflowStory|null>(null);
 const [step,setStep]=useState<Stage>(0);
 const [source,setSource]=useState('');
 const [importTitle,setImportTitle]=useState('Новый сценарий');
 const [preview,setPreview]=useState<ImportPreview|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [revision,setRevision]=useState(0);
 const [newCast,setNewCast]=useState('');
 const [newLocation,setNewLocation]=useState('');
 const [sceneId,setSceneId]=useState('');
 const [draft,setDraft]=useState<ShotDraft[]>([]);

 const refresh=useCallback(async()=>{setRevision(value=>value+1);},[]);
 useEffect(()=>{
  if(!projectId||!token)return;
  const abort=new AbortController();setLoading(true);
  void Promise.all([api.project(token,projectId,abort.signal),api.scripts(token,projectId,abort.signal)])
   .then(([p,list])=>{if(abort.signal.aborted)return;setProject(p);setScripts(list);
     setScriptId(current=>list.some(item=>item.id===current)?current:list[0]?.id??'');})
   .catch(e=>{if(abort.signal.aborted)return;if(isUnauthorized(e))sessionExpired();else setError(failure(e));})
   .finally(()=>{if(!abort.signal.aborted)setLoading(false);});
  return ()=>abort.abort();
 },[projectId,token,revision,sessionExpired]);
 useEffect(()=>{
  if(!projectId||!token||!scriptId){setStory(null);return;}
  const controller=new AbortController();
  void api.workflowStory(token,projectId,scriptId).then(value=>{
   if(controller.signal.aborted)return;
   setStory(value);
   setSceneId(old=>value.scenes.some(scene=>scene.id===old)?old:value.scenes[0]?.id??'');
  }).catch(e=>{if(!controller.signal.aborted)setError(failure(e));});
  return ()=>controller.abort();
 },[projectId,token,scriptId,revision]);
 const currentScene=story?.scenes.find(s=>s.id===sceneId);
 const index=story?.scenes.findIndex(s=>s.id===sceneId)??-1;
 const newDetected=useMemo(()=>{
  const known=new Set((story?.locations??[]).map(loc=>loc.title.trim().toLowerCase()));
  return [...new Set((story?.scenes??[]).map(s=>s.suggestedLocation).filter((n):n is string=>!!n))]
   .filter(name=>!known.has(name.toLowerCase()));
 },[story]);
 async function act(task:()=>Promise<void>,success?:string){
  setBusy(true);setError('');setNotice('');
  try{await task();if(success)setNotice(success);}
  catch(e){if(isUnauthorized(e))sessionExpired();else setError(failure(e));}
  finally{setBusy(false);}
 }
 const next=()=>{setError('');setNotice('');setStep(Math.min(4,step+1) as Stage);};
 const back=()=>{setError('');setNotice('');setStep(Math.max(0,step-1) as Stage);};
 async function readFile(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];if(!file)return;
  await act(async()=>{
   const {readScreenplayFile}=await import('../file-import');
   const loaded=await readScreenplayFile(file);
   if(!loaded.text.trim()||loaded.text.length>400000)throw Error('Нет текста или более 400 000 символов.');
   setSource(loaded.text);setImportTitle(file.name.replace(/\.[^.]+$/,'').slice(0,200));setPreview(null);
   setNotice(loaded.warning??'Файл прочитан. Проверь исходный текст и нажми «Разобрать».');
  });
  e.target.value='';
 }
 async function parse(){if(!token||!projectId)return;await act(async()=>{setPreview(await api.previewImport(token,projectId,source));});}
 async function commit(){
  if(!token||!projectId||!preview)return;
  await act(async()=>{
   const created=await api.commitImport(token,projectId,{title:importTitle.trim(),text:source,digest:preview.digest});
   setScriptId(created.scriptId);setPreview(null);setSource('');await refresh();setStep(1);
  },'Сценарий сохранён. Теперь назначь персонажам референсы.');
 }
 async function addSubject(kind:'CHARACTER'|'LOCATION',title:string){
  if(!token||!projectId||!title.trim())return;
  await act(async()=>{
   if(kind==='CHARACTER'){await api.createCharacter(token,projectId,title.trim());setNewCast('');}
   else {await api.createLocation(token,projectId,title.trim());setNewLocation('');}
   await refresh();
  });
 }
 async function createSuggested(){
  if(!token||!projectId||!story)return;
  await act(async()=>{
   const updated=new Map(story.locations.map(l=>[l.title.toLowerCase(),l.id]));
   for(const name of newDetected){
    const created=await api.createLocation(token,projectId,name);
    updated.set(name.toLowerCase(),created.id);
   }
   for(const scene of story.scenes){
    const location=scene.suggestedLocation&&updated.get(scene.suggestedLocation.toLowerCase());
    if(location&&!scene.locationId)await api.assignSceneLocation(token,scene.id,location);
   }
   await refresh();
  },'Локации определены и связаны со сценами.');
 }
 async function assignLocation(id:string,location:string){
  if(!token)return;
  await act(async()=>{await api.assignSceneLocation(token,id,location||null);await refresh();});
 }
 async function plan(){
  if(!token||!sceneId)return;
  await act(async()=>{const result=await api.shotDraft(token,sceneId);setDraft(result.shots);},
   'Это предложения кадров на основании исходного текста. Проверь их перед сохранением.');
 }
 async function approve(){
  if(!token||!sceneId||!draft.length)return;
  await act(async()=>{await api.approveShots(token,sceneId,draft);setDraft([]);await refresh();},
   'Кадры сохранены для выбранной сцены.');
 }
 async function updateShot(id:string,title:string,description:string){
  if(!token)return;
  await act(async()=>{await api.updateNode(token,id,{title,description});await refresh();},'Кадр обновлён.');
 }
 async function uploadShot(id:string,file:File){
  if(!token||!projectId)return;
  await act(async()=>{await api.uploadMedia(token,projectId,id,file);await refresh();},'Изображение кадра сохранено.');
 }
 function moveScene(delta:number){
  if(!story||index<0)return;
  const target=story.scenes[index+delta];
  if(target){setSceneId(target.id);setDraft([]);setError('');}
 }
 return <DashboardFrame>
  <header className="wizard-topbar">
   <Link to="/projects" className="wizard-back-link"><ArrowLeft size={17}/> Все проекты</Link>
   <div className="wizard-logo"><Clapperboard size={18}/><strong>STORY / STUDIO</strong><span>из сценария в визуальную историю</span></div>
   <UserIndicator/>
  </header>
  <main className="wizard-app">
   <section className="wizard-head">
    <div><span className="wizard-eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</span>
     <h1>{project?.title??'Открываем проект…'}</h1>
     <p>Пять последовательных шагов. Авторский сценарий остаётся неизменным.</p></div>
    {!!scripts.length&&<label className="wizard-script-select">ТЕКУЩИЙ СЦЕНАРИЙ <span><BookOpen size={16}/>
     <select value={scriptId} onChange={e=>{setScriptId(e.target.value);setDraft([]);setError('');}}>
      {scripts.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}
     </select><ChevronDown size={15}/></span></label>}
   </section>
   <nav className="wizard-steps" aria-label="Этапы создания истории">
    {steps.map((stage,i)=>{const Icon=stage.icon;return <button key={stage.title} type="button"
     className={'wizard-step '+(step===i?'active ':'')+(step>i?'done':'')}
     disabled={loading||(i>0&&!scriptId)} onClick={()=>{setStep(i as Stage);setError('');setNotice('');}}>
     <span className="wizard-step-icon">{step>i?<Check size={18}/>:<Icon size={19}/>}</span>
     <span className="wizard-step-titles"><strong>{stage.title}</strong><small>{stage.sub}</small></span>
     <span className="wizard-step-number">{String(i+1).padStart(2,'0')}</span>
    </button>;})}
   </nav>
   {error&&<div className="wizard-alert" role="alert">{error}</div>}
   {notice&&<div className="wizard-success" role="status"><Check size={16}/>{notice}</div>}
   {loading?<div className="wizard-loading">Загружаем проект…</div>:!project?<div className="wizard-alert">Проект недоступен.</div>:<>
    {step===0&&<section className="wizard-workspace">
     <StageTitle index={1} title="Загрузи историю" description="Загрузи готовый сценарий. Система выделит сцены, говорящих персонажей, реплики, описания действий и предполагаемые локации. Ничего не переписывается."/>
     <div className="wizard-two-col">
      <div className="wizard-card">
       <label className="wizard-drop-area"><Upload size={29}/><strong>Загрузить полный сценарий</strong>
        <small>TXT · Fountain · Markdown · DOCX · PDF с текстом</small>
        <input type="file" accept=".txt,.fountain,.md,.docx,.pdf" onChange={e=>void readFile(e)}/></label>
       <label className="wizard-field">Название<input value={importTitle} maxLength={200} onChange={e=>setImportTitle(e.target.value)}/></label>
       <label className="wizard-field">Текст сценария<textarea value={source} rows={12}
        placeholder="ИНТ. ОФИС — УТРО&#10;&#10;СЕРГЕЙ&#10;Доброе утро…" onChange={e=>{setSource(e.target.value);setPreview(null);}}/></label>
       <div className="wizard-action-line"><span>{source.length.toLocaleString('ru-RU')} / 400 000 символов</span>
        <button className="wizard-primary" disabled={busy||!source.trim()||source.length>400000}
         onClick={()=>void parse()}>Разобрать сценарий <ArrowRight size={17}/></button></div>
      </div>
      <div className="wizard-card wizard-analysis">
       <h3><Layers size={18}/> Результат разбора</h3>
       {!preview?<div className="wizard-analysis-empty"><BookOpen size={39}/><strong>Сначала загрузи сценарий</strong>
        <p>Здесь появятся сцены, диалоги и места действия — для проверки перед сохранением.</p></div>:
       <><div className="wizard-counters"><span><b>{preview.scenes.length}</b> сцен</span>
         <span><b>{preview.characters.length}</b> персонажей</span></div>
        {preview.warnings.map((w,i)=><p key={i} className="wizard-warning">{w}</p>)}
        <div className="wizard-outline-list">{preview.scenes.map((scene,i)=><article key={i}>
         <small>СЦЕНА {String(i+1).padStart(2,'0')} · строка {scene.sourceLineStart}</small>
         <strong>{scene.title}</strong>
         <p>{scene.blocks.filter(b=>b.kind==='action'&&b.text.trim()).slice(0,2).map(b=>b.text).join(' ').slice(0,240)||'Описание места отсутствует в сценарии'}</p>
         {dialogues(scene.blocks).slice(0,3).map((line,j)=><div key={j} className="wizard-dialogue-mini"><b>{line.speaker}</b> {line.text}</div>)}
        </article>)}</div>
        <button className="wizard-primary wizard-full" disabled={busy||!importTitle.trim()}
         onClick={()=>void commit()}>Подтвердить разбор и перейти к персонажам <ArrowRight size={18}/></button>
       </>}
      </div>
     </div>
     {story&&<p className="wizard-helper">В проекте уже есть сценарий «{story.script.title}» и {story.scenes.length} сцен. Можно перейти к следующему шагу, не загружая сценарий повторно.</p>}
    </section>}
    {step===1&&<section className="wizard-workspace">
     <StageTitle index={2} title="Кто играет в истории?" description="Персонажи определены по репликам. Загрузи сразу все фотографии, а затем внутри сайта присвой каждому изображению имя. Можно прикреплять несколько референсов к одному герою."/>
     <div className="wizard-statline"><span><Users size={17}/> Найдено персонажей: <b>{story?.characters.length??0}</b></span>
      <span>Если имя не распознано — добавь его ниже</span></div>
     <div className="wizard-subject-grid">{story?.characters.map(person=><article key={person.id} className="wizard-subject">
      <div className="wizard-subject-header"><Users size={18}/><strong>{person.title}</strong><small>{person.media.filter(m=>m.kind==='IMAGE').length} фото</small></div>
      <ImageGallery media={person.media} token={token!}/>
     </article>)}</div>
     <div className="wizard-add-row"><input value={newCast} maxLength={200} placeholder="Имя персонажа, которого нет в списке" onChange={e=>setNewCast(e.target.value)}/>
      <button className="wizard-light" disabled={busy||!newCast.trim()} onClick={()=>void addSubject('CHARACTER',newCast)}><Plus size={17}/> Добавить героя</button></div>
     <BulkPhotos key={'character-'+projectId} title="Фотографии персонажей" subjects={story?.characters??[]}
      token={token!} projectId={projectId!} onUploaded={refresh}/>
     <NavButtons back={back} next={next} nextLabel="Далее: локации" busy={busy}/>
    </section>}
    {step===2&&<section className="wizard-workspace">
     <StageTitle index={3} title="Где происходит действие?" description="Сайт предлагает локации по заголовкам и описанию сценария. Добавь референсы интерьеров и мест, а затем проверь, какая локация привязана к каждой сцене."/>
     {!!newDetected.length&&<div className="wizard-suggestion"><MapPin size={18}/>
      <span>Найдены названия, которых ещё нет в библиотеке: <b>{newDetected.join(', ')}</b></span>
      <button className="wizard-light" disabled={busy} onClick={()=>void createSuggested()}>Создать и привязать</button></div>}
     <div className="wizard-subject-grid">{story?.locations.map(loc=><article key={loc.id} className="wizard-subject">
      <div className="wizard-subject-header"><MapPin size={18}/><strong>{loc.title}</strong><small>{loc.media.filter(m=>m.kind==='IMAGE').length} фото</small></div>
      <ImageGallery media={loc.media} token={token!}/>
      {loc.description&&<p>{loc.description}</p>}
     </article>)}</div>
     <div className="wizard-add-row"><input value={newLocation} maxLength={200} placeholder="Название новой локации" onChange={e=>setNewLocation(e.target.value)}/>
      <button className="wizard-light" disabled={busy||!newLocation.trim()} onClick={()=>void addSubject('LOCATION',newLocation)}><Plus size={17}/> Добавить место</button></div>
     <BulkPhotos key={'location-'+projectId} title="Фотографии локаций" subjects={story?.locations??[]}
      token={token!} projectId={projectId!} onUploaded={refresh}/>
     <div className="wizard-card wizard-location-mapping">
      <h3>Привязка локаций к сценам</h3>
      {story?.scenes.map(scene=><div key={scene.id} className="wizard-location-row">
       <div><small>СЦЕНА {String(scene.index).padStart(2,'0')}</small><strong>{scene.title}</strong>
        <p>{scene.actionDescription.slice(0,180)||'Описание отсутствует в оригинальном тексте'}</p></div>
       <select value={scene.locationId??''} disabled={busy} aria-label={'Локация сцены '+scene.title} onChange={e=>void assignLocation(scene.id,e.target.value)}>
        <option value="">Не определена</option>
        {story.locations.map(loc=><option key={loc.id} value={loc.id}>{loc.title}</option>)}
       </select>
      </div>)}
     </div>
     <NavButtons back={back} next={next} nextLabel="Далее: кадры" busy={busy}/>
    </section>}
    {step===3&&<section className="wizard-workspace">
     <StageTitle index={4} title="Создаём сцены покадрово" description="Выбери конкретную сцену, продумай планы и добавь свои кадры. Их порядок сохраняется; реплики и действия видны рядом с визуальным материалом."/>
     {!story?.scenes.length?<div className="wizard-card">Сначала загрузи сценарий.</div>:<>
      <div className="wizard-scene-picker">{story.scenes.map(scene=><button key={scene.id}
       className={scene.id===sceneId?'selected':''} onClick={()=>{setSceneId(scene.id);setDraft([]);}}>
       <small>{String(scene.index).padStart(2,'0')}</small><span>{scene.title}</span>
       <b>{scene.shots.length} кадров</b></button>)}</div>
      {currentScene&&<div className="wizard-scene-layout">
       <aside className="wizard-scene-context"><span className="wizard-eyebrow">СЦЕНА {String(currentScene.index).padStart(2,'0')}</span>
        <h3>{currentScene.title}</h3>
        <span className="wizard-context-label"><MapPin size={14}/> Место действия</span>
        <strong>{story.locations.find(l=>l.id===currentScene.locationId)?.title??currentScene.suggestedLocation??'Не определено'}</strong>
        <span className="wizard-context-label"><Users size={14}/> Персонажи</span>
        <p>{currentScene.characters.join(', ')||'Не распознаны'}</p>
        <span className="wizard-context-label"><BookOpen size={14}/> Действие</span>
        <p>{currentScene.actionDescription||'В исходном сценарии нет отдельного описания действия.'}</p>
        <span className="wizard-context-label"><Quote size={14}/> Реплики</span>
        <div className="wizard-context-dialogues">{currentScene.dialogues.map((line,i)=><div key={i}>
          <strong>{line.speaker}</strong><p>{line.text}</p></div>)}
          {!currentScene.dialogues.length&&<p>Диалоги не обнаружены.</p>}
        </div>
       </aside>
       <div className="wizard-scene-shots">
        <div className="wizard-inline-heading"><h3>Кадры этой сцены</h3>
         <button className="wizard-light" disabled={busy} onClick={()=>void plan()}><RefreshCw size={15}/> Предложить планы по тексту</button></div>
        {!!currentScene.shots.length&&<div className="wizard-shot-grid">{currentScene.shots.map((shot,i)=><ShotCard key={shot.id} shot={shot} token={token!}
         number={i+1} onFile={file=>uploadShot(shot.id,file)} onSave={(title,desc)=>updateShot(shot.id,title,desc)} busy={busy}/>)}</div>}
        {!currentScene.shots.length&&!draft.length&&<div className="wizard-shots-blank"><Clapperboard size={34}/>
         <strong>Раскадровки пока нет</strong><p>Нажми «Предложить планы по тексту» или добавь первый кадр вручную.</p></div>}
        <div className="wizard-shot-drafts">
         {!!draft.length&&<div className="wizard-draft-list"><h4>Новые кадры — подготовка</h4>{draft.map((shot,i)=><div key={i} className="wizard-draft-row">
           <span>{String(i+1).padStart(2,'0')}</span>
           <div><input maxLength={200} aria-label="Название кадра" value={shot.title} onChange={e=>setDraft(items=>items.map((s,j)=>j===i?{...s,title:e.target.value}:s))}/>
            <textarea maxLength={700} value={shot.description} aria-label="Описание кадра" onChange={e=>setDraft(items=>items.map((s,j)=>j===i?{...s,description:e.target.value}:s))}/>
            <select value={shot.shotType} aria-label="План" onChange={e=>setDraft(items=>items.map((s,j)=>j===i?{...s,shotType:e.target.value as ShotDraft['shotType']}:s))}>
             <option value="WIDE">Общий план</option><option value="MEDIUM">Средний</option><option value="CLOSE_UP">Крупный</option><option value="OTHER">Другой</option>
            </select></div>
           <button aria-label="Удалить черновой кадр" onClick={()=>setDraft(d=>d.filter((_,j)=>j!==i))}><X size={16}/></button>
          </div>)}</div>}
         <div className="wizard-draft-actions">
          <button className="wizard-light" onClick={()=>setDraft(items=>[...items,{
           title:'Кадр '+String((currentScene.shots.length+items.length+1)).padStart(2,'0'),description:'',shotType:'MEDIUM',
           durationMs:3500,sourceLine:null,soundCue:'',musicCue:'',
          }])}><Plus size={16}/> Добавить кадр вручную</button>
          {!!draft.length&&<button className="wizard-primary" disabled={busy||draft.some(s=>!s.title.trim()||!s.description.trim())}
           onClick={()=>void approve()}><Save size={16}/> Сохранить {draft.length} кадр(ов)</button>}
         </div>
        </div>
        <div className="wizard-scene-switch">
         <button className="wizard-light" disabled={index<=0} onClick={()=>moveScene(-1)}><ArrowLeft size={16}/> Предыдущая сцена</button>
         <button className="wizard-light" disabled={!story.scenes[index+1]} onClick={()=>moveScene(1)}>Следующая сцена <ArrowRight size={16}/></button>
        </div>
       </div>
      </div>}
     </>}
     <NavButtons back={back} next={next} nextLabel="Открыть карту истории" busy={busy}/>
    </section>}
    {step===4&&<section className="wizard-workspace wizard-final">
     <StageTitle index={5} title="Вся история перед глазами" description="Сцены идут в сценарном порядке. Для каждой видны локация, участники, их реплики и последовательность кадров с загруженными фото."/>
     <div className="wizard-final-summary">
      <span><BookOpen size={19}/><b>{story?.scenes.length??0}</b> сцен</span>
      <span><Users size={19}/><b>{story?.characters.length??0}</b> персонажей</span>
      <span><MapPin size={19}/><b>{story?.locations.length??0}</b> локаций</span>
      <span><Clapperboard size={19}/><b>{story?.scenes.reduce((n,s)=>n+s.shots.length,0)??0}</b> кадров</span>
     </div>
     <div className="wizard-story-flow">{story?.scenes.map(scene=><StoryBoard key={scene.id} scene={scene} story={story} token={token!}
       onEdit={()=>{setSceneId(scene.id);setStep(3);}}/>)}</div>
     {!story?.scenes.length&&<div className="wizard-shots-blank"><BookOpen size={32}/>Нет загруженного сценария.</div>}
     <NavButtons back={back} busy={busy}/>
    </section>}
   </>}
  </main>
 </DashboardFrame>;
}
function NavButtons({back,next,nextLabel,busy}:{back:()=>void;next?:()=>void;nextLabel?:string;busy:boolean}){
 return <div className="wizard-footer-actions">
  <button className="wizard-light" disabled={busy} onClick={back}><ArrowLeft size={16}/> Назад</button>
  {next&&<button className="wizard-primary" disabled={busy} onClick={next}>{nextLabel??'Далее'} <ArrowRight size={17}/></button>}
 </div>;
}
function ShotCard({shot,token,number,busy,onFile,onSave}:{
 shot:WorkflowScene['shots'][number];token:string;number:number;busy:boolean;
 onFile:(file:File)=>Promise<void>;onSave:(title:string,description:string)=>Promise<void>;
}){
 const [editing,setEditing]=useState(false);
 const [title,setTitle]=useState(shot.title);
 const [description,setDescription]=useState(shot.description??'');
 useEffect(()=>{setTitle(shot.title);setDescription(shot.description??'');},[shot.id,shot.title,shot.description]);
 return <article className="wizard-shot-card">
  <div className="wizard-shot-image"><ImageGallery media={shot.media} token={token} large/></div>
  <span className="wizard-shot-badge">КАДР {String(number).padStart(2,'0')}</span>
  {editing?<div className="wizard-shot-form"><input value={title} maxLength={200} onChange={e=>setTitle(e.target.value)}/>
   <textarea rows={4} value={description} maxLength={700} onChange={e=>setDescription(e.target.value)}/>
   <button className="wizard-light" disabled={busy||!title.trim()||!description.trim()} onClick={()=>void onSave(title,description).then(()=>setEditing(false))}>Сохранить</button></div>:
  <><h4>{shot.title}</h4><p>{shot.description||'Описание не добавлено'}</p></>}
  <div className="wizard-shot-card-actions">
   <label><Upload size={16}/> Добавить фото<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
    onChange={e=>{const file=e.target.files?.[0];if(file)void onFile(file);e.target.value='';}}/></label>
   <button onClick={()=>setEditing(p=>!p)}>{editing?'Отмена':'Изменить'}</button>
  </div>
 </article>;
}
function StoryBoard({scene,story,token,onEdit}:{
 scene:WorkflowScene;story:WorkflowStory;token:string;onEdit:()=>void;
}){
 const location=story.locations.find(l=>l.id===scene.locationId);
 const cast=story.characters.filter(person=>scene.characters.some(name=>name.toLowerCase()===person.title.toLowerCase()));
 return <article className="wizard-story-block">
  <div className="wizard-story-index"><span>{String(scene.index).padStart(2,'0')}</span></div>
  <div className="wizard-story-content">
   <div className="wizard-story-title"><div><small>СЦЕНА {String(scene.index).padStart(2,'0')}</small><h3>{scene.title}</h3></div>
    <button className="wizard-light" onClick={onEdit}>Работа с кадрами <ArrowRight size={15}/></button></div>
   <div className="wizard-story-details">
    <div><span className="wizard-context-label"><MapPin size={14}/> ЛОКАЦИЯ</span>
     <strong>{location?.title||scene.suggestedLocation||'Не назначена'}</strong>
     {location&&<ImageGallery media={location.media} token={token}/>}
    </div>
    <div><span className="wizard-context-label"><Users size={14}/> ПЕРСОНАЖИ</span>
     <div className="wizard-cast-inline">{cast.map(person=><div key={person.id}>
       <ImageGallery media={person.media.slice(0,1)} token={token}/><strong>{person.title}</strong>
      </div>)}
      {!cast.length&&<p>{scene.characters.join(', ')||'Персонажи не определены'}</p>}
     </div>
    </div>
    <div><span className="wizard-context-label"><Quote size={14}/> ДЕЙСТВИЯ И РЕПЛИКИ</span>
     <p className="wizard-story-action">{scene.actionDescription||'Описание действий отсутствует в сценарии.'}</p>
     <div className="wizard-story-quotes">{scene.dialogues.map((line,i)=><div key={i}><strong>{line.speaker}</strong><p>{line.text}</p></div>)}</div>
    </div>
   </div>
   <div className="wizard-story-shots-header"><Clapperboard size={15}/> ПОСЛЕДОВАТЕЛЬНОСТЬ КАДРОВ <span>{scene.shots.length}</span></div>
   {scene.shots.length?<div className="wizard-story-shots">{scene.shots.map((shot,i)=><div key={shot.id}>
    <div className="wizard-story-frame"><ImageGallery media={shot.media} token={token}/></div>
    <small>{String(i+1).padStart(2,'0')} · {shot.shotType||'План'}</small>
    <strong>{shot.title}</strong><p>{shot.description}</p>
   </div>)}</div>:<p className="wizard-helper">Кадры для сцены ещё не добавлены. Нажми «Работа с кадрами».</p>}
  </div>
 </article>;
}
