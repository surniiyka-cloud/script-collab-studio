import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Copy, Mail, Shield, Trash2, UserPlus, Users, X } from 'lucide-react';
import { api } from '../api';
import type { ProjectMember, ProjectRole } from '../api';
import './project-access.css';

const roleName:Record<ProjectRole,string>={OWNER:'Владелец',EDITOR:'Редактор',VIEWER:'Наблюдатель'};
function message(e:unknown){return e instanceof Error?e.message:'Не удалось выполнить действие.';}
export function ProjectAccessDialog({projectId,title,token,isOwner,onClose,onDeleted}:{
 projectId:string;title:string;token:string;isOwner:boolean;onClose:()=>void;
 onDeleted:(storageCleanup:'completed'|'pending')=>void;
}){
 const titleId=useId();
 const [members,setMembers]=useState<ProjectMember[]>([]);
 const [email,setEmail]=useState('');
 const [inviteRole,setInviteRole]=useState<'EDITOR'|'VIEWER'>('EDITOR');
 const [typed,setTyped]=useState('');
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 useEffect(()=>{
  let live=true;
  void api.projectMembers(token,projectId).then(result=>{if(live)setMembers(result);})
   .catch(e=>{if(live)setError(message(e));})
   .finally(()=>{if(live)setLoading(false);});
  return ()=>{live=false;};
 },[projectId,token]);
 async function execute(task:()=>Promise<void>){
  setBusy(true);setError('');setNotice('');
  try{await task();}catch(e){setError(message(e));}finally{setBusy(false);}
 }
 async function add(e:FormEvent){
  e.preventDefault();if(!email.trim()||!isOwner)return;
  await execute(async()=>{
   const member=await api.addProjectMember(token,projectId,email.trim(),inviteRole);
   setMembers(old=>[...old,member]);setEmail('');
   setNotice('Доступ добавлен. Проект появится в аккаунте участника.');
  });
 }
 async function update(member:ProjectMember,next:'EDITOR'|'VIEWER'){
  await execute(async()=>{
   const updated=await api.updateProjectMember(token,projectId,member.userId,next);
   setMembers(old=>old.map(m=>m.userId===updated.userId?updated:m));
   setNotice('Права доступа обновлены.');
  });
 }
 async function remove(member:ProjectMember){
  if(!window.confirm('Убрать '+member.displayName+' из проекта «'+title+'»?'))return;
  await execute(async()=>{
   await api.removeProjectMember(token,projectId,member.userId);
   setMembers(old=>old.filter(m=>m.userId!==member.userId));
   setNotice('Доступ участника отозван.');
  });
 }
 async function copyLink(){
  setError('');setNotice('');
  try{
   await navigator.clipboard.writeText(window.location.origin+'/projects/'+projectId);
   setNotice('Ссылка скопирована. Открыть её смогут только добавленные участники после входа.');
  }catch{setError('Браузер не разрешил копирование. Скопируй адрес проекта из адресной строки.');}
 }
 async function deleteProject(){
  if(!isOwner||typed!==title)return;
  if(!window.confirm('Удалить проект «'+title+'» вместе со сценариями, кадрами и участниками? Это действие нельзя отменить.'))return;
  await execute(async()=>{
   const result=await api.deleteProject(token,projectId);
   onDeleted(result.storageCleanup);
  });
 }
 return <div className="access-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
  <div className="access-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
   <header className="access-header"><div><span>УПРАВЛЕНИЕ ПРОЕКТОМ</span><h2 id={titleId}>Участники и доступ</h2>
    <p>«{title}»</p></div><button type="button" disabled={busy} aria-label="Закрыть" onClick={onClose}><X size={21}/></button></header>
   {error&&<p role="alert" className="access-error">{error}</p>}
   {notice&&<p role="status" className="access-notice"><Check size={16}/>{notice}</p>}
   <section className="access-section">
    <div className="access-label"><Users size={18}/><h3>Кто видит проект</h3><span>{members.length} участн.</span></div>
    {loading?<p className="access-helper">Загружаем список…</p>:<div className="access-member-list">
     {members.map(member=><div className="access-member" key={member.userId}>
      <span className="access-avatar">{member.displayName.slice(0,1).toLocaleUpperCase('ru-RU')}</span>
      <div className="access-person"><strong>{member.displayName}</strong><span>{member.email}</span></div>
      {isOwner&&member.role!=='OWNER'?<>
       <select aria-label={'Роль '+member.displayName} value={member.role} disabled={busy}
        onChange={e=>void update(member,e.target.value as 'EDITOR'|'VIEWER')}>
         <option value="EDITOR">Редактор</option><option value="VIEWER">Наблюдатель</option>
       </select>
       <button className="access-remove" disabled={busy} title="Убрать участника" aria-label={'Убрать '+member.displayName} onClick={()=>void remove(member)}><X size={18}/></button>
      </>:<span className="access-role">{roleName[member.role]}</span>}
     </div>)}
    </div>}
    {isOwner&&<form onSubmit={e=>void add(e)} className="access-invite-form">
      <label htmlFor="member-email">Добавить участника по email</label>
      <div><span><Mail size={16}/></span><input id="member-email" required type="email" maxLength={254} placeholder="friend@example.com" value={email} onChange={e=>setEmail(e.target.value)}/>
       <select value={inviteRole} onChange={e=>setInviteRole(e.target.value as 'EDITOR'|'VIEWER')} aria-label="Права нового участника">
        <option value="EDITOR">Редактор</option><option value="VIEWER">Наблюдатель</option>
       </select><button type="submit" disabled={busy||!email.trim()}><UserPlus size={16}/> Добавить</button>
      </div>
      <p>Друг должен сначала создать аккаунт в этом же приложении. Редактор изменяет сцены и материалы, наблюдатель только просматривает.</p>
     </form>}
    <div className="access-link"><div><Shield size={17}/><p><strong>Приватная ссылка</strong><span>Сама ссылка не выдаёт доступ посторонним.</span></p></div>
     <button type="button" disabled={busy} onClick={()=>void copyLink()}><Copy size={16}/> Скопировать ссылку</button></div>
    {!isOwner&&<p className="access-helper">Только владелец может приглашать и удалять участников или изменять роли.</p>}
   </section>
   {isOwner&&<section className="access-danger"><div className="access-label"><Trash2 size={18}/><h3>Удаление проекта</h3></div>
     <p>Удалит проект, его сценарии, сцены, участников и связанные записи. Возврат невозможен. Перед удалением сделай резервную копию важных материалов.</p>
     <label htmlFor="delete-project-name">Для подтверждения введи название проекта целиком:</label>
     <input id="delete-project-name" value={typed} onChange={e=>setTyped(e.target.value)} placeholder={title} autoComplete="off"/>
     <button disabled={busy||typed!==title} onClick={()=>void deleteProject()}><Trash2 size={16}/> Удалить проект навсегда</button>
    </section>}
   <footer className="access-footer"><button type="button" disabled={busy} onClick={onClose}>Закрыть</button></footer>
  </div>
 </div>;
}
