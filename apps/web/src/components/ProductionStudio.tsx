import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { ArrowRight, Check, CirclePlay, Clapperboard, FileText, Film, ImagePlus, Music, Pause, Play, Plus, RefreshCw, Sparkles, Upload, UserRound, WandSparkles } from 'lucide-react';
import { api } from '../api';
import type { Asset, FilmTimeline, ImportPreview, ProductionNode, ShotDraft } from '../api';
import './production.css';

type Tab='import'|'cast'|'shots'|'preview';
export function ProductionStudio({projectId,token,scriptId,sceneId,onImported,onShotsChanged}:{
 projectId:string;token:string;scriptId:string|null;sceneId:string|null;
 onImported:(scriptId:string)=>void;onShotsChanged:()=>void;
}){
 const [tab,setTab]=useState<Tab>('import');
 const [source,setSource]=useState('');
 const [name,setName]=useState('Новый сценарий');
 const [parsed,setParsed]=useState<ImportPreview|null>(null);
 const [characters,setCharacters]=useState<ProductionNode[]>([]);
 const [newCharacter,setNewCharacter]=useState('');
 const [draft,setDraft]=useState<ShotDraft[]>([]);
 const [approved,setApproved]=useState<ProductionNode[]>([]);
 const [timeline,setTimeline]=useState<FilmTimeline|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [info,setInfo]=useState('');
 const [playing,setPlaying]=useState(false);
 const [frame,setFrame]=useState(0);
 const [refresh,setRefresh]=useState(0);
 const storyFrames=useMemo(()=>timeline?.scenes.flatMap(scene=>scene.shots.map(shot=>({...shot,sceneTitle:scene.title})))??[],[timeline]);

 useEffect(()=>{
  if(tab!=='cast')return;
  let live=true;
  void api.characters(token,projectId).then(x=>{if(live)setCharacters(x);}).catch(e=>{if(live)setError(String(e));});
  return ()=>{live=false};
 },[token,projectId,tab,refresh]);
 useEffect(()=>{
  if(tab!=='shots'||!sceneId){setApproved([]);return;}
  let live=true;
  void api.approvedShots(token,sceneId).then(x=>{if(live)setApproved(x);}).catch(e=>{if(live)setError(String(e));});
  return ()=>{live=false;};
 },[token,sceneId,tab,refresh]);
 useEffect(()=>{
  if(tab!=='preview'||!scriptId){setTimeline(null);return;}
  let live=true;setPlaying(false);setFrame(0);
  void api.timeline(token,projectId,scriptId).then(x=>{if(live)setTimeline(x);}).catch(e=>{if(live)setError(String(e));});
  return ()=>{live=false;};
 },[token,projectId,scriptId,tab,refresh]);
 useEffect(()=>{
  if(!playing||!storyFrames.length)return;
  const duration=Math.min(60000,Math.max(500,storyFrames[frame]?.durationMs??3500));
  const id=window.setTimeout(()=>{
   if(frame>=storyFrames.length-1){setPlaying(false);return;}
   setFrame(i=>i+1);
  },duration);
  return ()=>window.clearTimeout(id);
 },[playing,frame,storyFrames]);

 const choose=(selected:Tab)=>{setTab(selected);setInfo('');setError('');};
 function report(e:unknown){setError(e instanceof Error?e.message:'Не удалось выполнить операцию.');}
 async function onFile(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];if(!file)return;
  setError('');setParsed(null);
  if(file.size>600000){setError('Слишком большой сценарий. Максимум 400 000 символов.');return;}
  if(!/\.(txt|fountain|md)$/i.test(file.name)){setError('Пока поддерживаем TXT, Fountain и Markdown. Для PDF/DOCX используйте текстовую версию.');return;}
  const text=await file.text();
  setSource(text);setName(file.name.replace(/\.[^.]+$/,'').slice(0,200)||'Сценарий');
  setInfo('Файл загружен. Проверьте текст и нажмите «Разобрать сценарий».');
 }
 async function inspect(){
  setBusy(true);setError('');setInfo('');
  try{setParsed(await api.previewImport(token,projectId,source));}
  catch(e){report(e);}finally{setBusy(false);}
 }
 async function commit(){
  if(!parsed)return;
  if(!window.confirm('Создать '+parsed.scenes.length+' сцен(ы) и сохранить текст в проекте? Существующие сценарии не изменятся.'))return;
  setBusy(true);setError('');
  try{
   const value=await api.commitImport(token,projectId,{title:name.trim(),text:source,digest:parsed.digest});
   setInfo('Импортировано '+value.scenes.length+' сцен. Персонажей обнаружено: '+value.characters.length+'.');
   setParsed(null);setSource('');onImported(value.scriptId);choose('cast');
  }catch(e){report(e);}finally{setBusy(false);}
 }
 async function addCharacter(){
  if(!newCharacter.trim())return;
  setBusy(true);setError('');
  try{await api.createCharacter(token,projectId,newCharacter.trim());setNewCharacter('');setRefresh(v=>v+1);}
  catch(e){report(e);}finally{setBusy(false);}
 }
 async function sendReference(nodeId:string,file:File){
  setBusy(true);setError('');setInfo('');
  try{
   if(file.size>8*1024*1024||!['image/jpeg','image/png','image/webp','audio/mpeg','audio/wav','audio/x-wav'].includes(file.type))
    throw Error('Выберите JPG/PNG/WebP/MP3/WAV до 8 МБ.');
   await api.uploadMedia(token,projectId,nodeId,file);
   setInfo('Файл сохранён в приватном хранилище MinIO.');
   setRefresh(v=>v+1);
  }catch(e){report(e);}finally{setBusy(false);}
 }
 async function generate(useAI=false){
  if(!sceneId)return;
  setBusy(true);setError('');setInfo('');
  try{
   const value=useAI?await api.aiShotDraft(token,sceneId):await api.shotDraft(token,sceneId);
   setDraft(value.shots);
   setInfo(value.note);
  }catch(e){report(e);}finally{setBusy(false);}
 }
 async function approve(){
  if(!sceneId||!draft.length)return;
  if(!window.confirm('Добавить '+draft.length+' кадров к выбранной сцене? Текст сценария не изменится.'))return;
  setBusy(true);setError('');
  try{
   await api.approveShots(token,sceneId,draft);
   setDraft([]);setInfo('Кадры утверждены и добавлены в структуру проекта.');
   setRefresh(v=>v+1);onShotsChanged();
  }catch(e){report(e);}finally{setBusy(false);}
 }

 return <div className="production-stage">
  <header className="production-head">
    <div><span className="eyebrow eyebrow-light"><Sparkles size={13}/> SCRIPT → FILM</span>
      <h2>Производственная студия</h2>
      <p>От готового сценария до покадровки и чернового аниматика — без изменения авторского текста.</p></div>
    <span className="production-mode">ПОШАГОВЫЙ РЕЖИМ</span>
  </header>
  <nav className="production-nav" aria-label="Этапы производства">
   {([
    ['import','01','Сценарий'],['cast','02','Персонажи'],['shots','03','Покадровка'],['preview','04','Предпросмотр'],
   ] as const).map(([id,n,label])=><button key={id} className={tab===id?'selected':''} onClick={()=>choose(id)}>
    <span>{n}</span>{label}</button>)}
  </nav>
  {error&&<div className="production-error" role="alert">{error}</div>}
  {info&&<p className="production-notice" role="status"><Check size={16}/>{info}</p>}
  {tab==='import'&&<section className="production-panel">
    <div className="production-panel-title"><FileText size={20}/><div><h3>Импорт полного сценария</h3><p>Сначала проверьте распознанные сцены. Ничего не будет записано до подтверждения.</p></div></div>
    <label className="production-upload"><Upload size={25}/><strong>Загрузить сценарий</strong><span>TXT, Fountain или Markdown</span>
      <input type="file" accept=".txt,.fountain,.md,text/plain" onChange={onFile}/></label>
    <label className="production-field">Название сценария<input maxLength={200} value={name} onChange={e=>setName(e.target.value)}/></label>
    <label className="production-field">Полный текст<textarea rows={11} value={source} onChange={e=>{setSource(e.target.value);setParsed(null);}} placeholder="Вставьте полный сценарий с заголовками сцен, ремарками и диалогами…"/></label>
    <div className="production-row"><span className="production-muted">{source.length.toLocaleString('ru-RU')} символов · исходный текст не редактируется автоматически</span>
      <button className="button button-primary" disabled={busy||!source.trim()} onClick={()=>void inspect()}>{busy?'Разбираем…':'Разобрать сценарий'}<ArrowRight size={16}/></button></div>
    {parsed&&<div className="production-preview-import">
      <div className="production-row"><strong>Обнаружено сцен: {parsed.scenes.length}</strong><span>Персонажи: {parsed.characters.length}</span></div>
      {parsed.warnings.map((warning,i)=><p key={i} className="production-warning">{warning}</p>)}
      <div className="preview-scene-list">{parsed.scenes.map((scene,i)=><div key={i}>
        <strong>{String(i+1).padStart(2,'0')}. {scene.title}</strong>
        <p>{scene.blocks.filter(b=>b.text.trim()).slice(0,3).map(b=>b.text).join(' · ').slice(0,210)}</p>
      </div>)}</div>
      <div className="production-row"><span>Сначала подтвердите структуру. Реплики останутся без изменений.</span>
        <button className="button button-primary" disabled={busy||!name.trim()} onClick={()=>void commit()}>Подтвердить импорт <Check size={17}/></button></div>
    </div>}
  </section>}
  {tab==='cast'&&<section className="production-panel">
    <div className="production-panel-title"><UserRound size={21}/><div><h3>Персонажи и референсы</h3>
     <p>Укажите, кто изображён на фотографии. Несколько фото можно прикрепить к одному персонажу.</p></div></div>
    <div className="production-row production-character-create">
      <input placeholder="Имя персонажа" maxLength={200} value={newCharacter} onChange={e=>setNewCharacter(e.target.value)}/>
      <button className="button button-primary" disabled={busy||!newCharacter.trim()} onClick={()=>void addCharacter()}><Plus size={16}/> Добавить</button>
    </div>
    <div className="production-cast-grid">{characters.map(character=><div key={character.id} className="production-character">
       <div className="production-character-top"><span className="production-character-icon"><UserRound size={20}/></span><strong>{character.title}</strong></div>
       <div className="production-thumbs">{character.mediaLinks?.map(link=><AssetView key={link.asset.id} token={token} asset={link.asset}/>)}</div>
       <label className="production-filebutton"><ImagePlus size={16}/> Добавить фото
         <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
           onChange={e=>{const file=e.target.files?.[0];if(file)void sendReference(character.id,file);e.target.value='';}}/>
       </label>
      </div>)}
      {!characters.length&&<p className="production-muted">Персонажи появятся после импорта. Можно добавить их вручную.</p>}
    </div>
   </section>}
  {tab==='shots'&&<section className="production-panel">
    <div className="production-panel-title"><Clapperboard size={22}/><div><h3>Покадровка текущей сцены</h3><p>Создайте варианты кадров из оригинального текста. Затем проверьте и утвердите их.</p></div></div>
    {!sceneId?<p className="production-empty">Выберите сцену в навигаторе слева.</p>:<>
      <div className="production-row"><div className="production-shot-actions">
       <button className="button button-subtle" disabled={busy} onClick={()=>void generate()}><RefreshCw size={16}/> Черновая покадровка</button>
       <button className="button button-subtle" disabled={busy} onClick={()=>void generate(true)}><WandSparkles size={16}/> Предложить через Ollama</button>
      </div><span className="production-muted">ИИ доступен только если настроен локально</span></div>
      {!!approved.length&&<div className="production-approved">
       <h4>Утверждённые кадры ({approved.length})</h4>
       {approved.map(shot=><div key={shot.id} className="production-approved-shot">
         <strong>{shot.title}</strong><p>{shot.description}</p>
         <div className="production-thumbs">{shot.mediaLinks?.map(link=><AssetView key={link.asset.id} token={token} asset={link.asset}/>)}</div>
         <label className="production-filebutton"><ImagePlus size={15}/> Загрузить кадр или звук
           <input type="file" accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/wav" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void sendReference(shot.id,f);e.target.value='';}}/>
         </label>
       </div>)}
      </div>}
      {draft.length>0&&<div className="production-drafts"><h4>Варианты для утверждения ({draft.length})</h4>
        {draft.map((shot,i)=><div key={i} className="production-shot-editor">
          <span>{String(i+1).padStart(2,'0')}</span>
          <div className="production-shot-edit-fields">
           <input value={shot.title} maxLength={200} aria-label="Название кадра" onChange={e=>setDraft(list=>list.map((x,n)=>n===i?{...x,title:e.target.value}:x))}/>
           <textarea value={shot.description} maxLength={700} aria-label="Описание кадра" onChange={e=>setDraft(list=>list.map((x,n)=>n===i?{...x,description:e.target.value}:x))}/>
           <div className="production-shot-options">
             <select value={shot.shotType} aria-label="Тип плана" onChange={e=>setDraft(list=>list.map((x,n)=>n===i?{...x,shotType:e.target.value as ShotDraft['shotType']}:x))}>
               <option value="WIDE">Общий</option><option value="MEDIUM">Средний</option><option value="CLOSE_UP">Крупный</option><option value="OTHER">Другой</option>
             </select>
             <label>Секунд <input type="number" min={0.5} max={60} step={0.5} value={shot.durationMs/1000} onChange={e=>setDraft(list=>list.map((x,n)=>n===i?{...x,durationMs:Math.round(Number(e.target.value)*1000)}:x))}/></label>
           </div>
           <input placeholder="Звуковая атмосфера (подсказка)" maxLength={250} value={shot.soundCue} onChange={e=>setDraft(list=>list.map((x,n)=>n===i?{...x,soundCue:e.target.value}:x))}/>
           <input placeholder="Музыкальный мотив (подсказка)" maxLength={250} value={shot.musicCue} onChange={e=>setDraft(list=>list.map((x,n)=>n===i?{...x,musicCue:e.target.value}:x))}/>
          </div>
         </div>)}
         <div className="production-row"><button className="button button-subtle" onClick={()=>setDraft([])}>Отклонить варианты</button>
           <button className="button button-primary" disabled={busy||draft.some(x=>!x.title.trim()||!x.description.trim())} onClick={()=>void approve()}>Утвердить кадры <Check size={16}/></button></div>
       </div>}
    </>}
   </section>}
  {tab==='preview'&&<section className="production-panel">
    <div className="production-panel-title"><Film size={21}/><div><h3>Предпросмотр фильма</h3>
      <p>Аниматик из утверждённых кадров. Пока это не экспорт MP4 и не сгенерированное видео.</p></div></div>
    {!scriptId?<p className="production-empty">Выберите сценарий слева.</p>:<>
      <button className="button button-subtle button-small" onClick={()=>setRefresh(x=>x+1)}><RefreshCw size={14}/> Обновить таймлайн</button>
      {!storyFrames.length?<p className="production-empty">Чтобы собрать превиз, сначала утвердите покадровку хотя бы одной сцены.</p>:<>
       <div className="film-preview" aria-label="Предпросмотр кадров">
        <span className="film-preview-counter">КАДР {frame+1} / {storyFrames.length}</span>
        <ShotPreview token={token} shot={storyFrames[frame]}/>
        <div className="film-preview-caption"><span>{storyFrames[frame]?.sceneTitle}</span><strong>{storyFrames[frame]?.title}</strong><p>{storyFrames[frame]?.description}</p></div>
       </div>
       <div className="film-transport">
        <button className="button button-primary" onClick={()=>setPlaying(p=>!p)}>{playing?<Pause size={18}/>:<Play size={18}/>} {playing?'Пауза':'Воспроизвести'}</button>
        <button className="button button-subtle" onClick={()=>{setPlaying(false);setFrame(0);}}>В начало</button>
        <span>Общая длительность ~{Math.round(storyFrames.reduce((sum,x)=>sum+x.durationMs,0)/1000)} сек.</span>
       </div>
       <div className="film-strip">{storyFrames.map((shot,i)=><button key={shot.id} className={i===frame?'active':''} onClick={()=>{setPlaying(false);setFrame(i);}}>
         <span>{String(i+1).padStart(2,'0')}</span><strong>{shot.title}</strong></button>)}</div>
      </>}
    </>}
   </section>}
 </div>;
}
function AssetView({token,asset}:{token:string;asset:Asset}){
 const [url,setUrl]=useState<string|null>(null);
 useEffect(()=>{
  let alive=true;let created:string|null=null;
  void api.mediaBlob(token,asset.id).then(blob=>{
   if(!alive)return;created=URL.createObjectURL(blob);setUrl(created);
  }).catch(()=>{if(alive)setUrl(null)});
  return ()=>{alive=false;if(created)URL.revokeObjectURL(created);};
 },[token,asset.id]);
 return <div className="production-asset">{!url?<span>Загрузка…</span>:asset.kind==='AUDIO'
  ?<audio controls src={url} aria-label={asset.filename}/>
  :<img src={url} alt={asset.filename} loading="lazy"/>}</div>;
}
function ShotPreview({token,shot}:{token:string;shot:{title:string;description:string|null;media?:Array<{id:string;kind:string;filename:string;mimeType:string}>}}){
 const image=shot.media?.find(x=>x.kind==='IMAGE');
 const [url,setUrl]=useState<string|null>(null);
 useEffect(()=>{
  setUrl(null);let alive=true;let created:string|null=null;
  if(image)void api.mediaBlob(token,image.id).then(blob=>{if(alive){created=URL.createObjectURL(blob);setUrl(created);}}).catch(()=>{});
  return ()=>{alive=false;if(created)URL.revokeObjectURL(created);};
 },[image?.id,token]);
 return url?<img className="film-preview-image" src={url} alt={shot.title}/>:
   <div className="film-preview-empty"><Clapperboard size={49}/><span>Добавьте изображение кадра, чтобы увидеть его здесь</span></div>;
}
