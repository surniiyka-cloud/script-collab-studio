import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Clapperboard, Film, FolderOpen, LayoutGrid, Plus, Search, Settings2, Sparkles } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { api, isUnauthorized } from '../api';
import type { Project } from '../api';
import { useAuth } from '../auth';
import { DashboardFrame, formatDate, FriendlyError, UserIndicator } from '../components/Chrome';
import { CreateModal, EmptyState } from '../components/Modal';
import { ProjectAccessDialog } from '../components/ProjectAccessDialog';

const cards = ['project-warm', 'project-peach', 'project-blue', 'project-green'];
export function ProjectsScreen() {
  const { token, user, sessionExpired } = useAuth();
  const location=useLocation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [accessProject,setAccessProject]=useState<Project|null>(null);
  const [notice,setNotice]=useState((location.state as {notice?:string}|null)?.notice??'');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!token) return;
    const abort = new AbortController();
    setLoading(true); setError('');
    void api.projects(token, abort.signal).then(data => setProjects(data))
      .catch(err => {
        if (abort.signal.aborted) return;
        if (isUnauthorized(err)) sessionExpired();
        else setError(err instanceof Error ? err.message : 'Не удалось загрузить проекты.');
      }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [token, reload, sessionExpired]);
  const visible = useMemo(() => projects.filter(p =>
    [p.title, p.description ?? ''].join(' ').toLocaleLowerCase('ru-RU').includes(query.trim().toLocaleLowerCase('ru-RU'))
  ), [projects, query]);
  const create = useCallback(async (title: string, description: string) => {
    if (!token) return;
    const created = await api.createProject(token, title, description);
    setProjects(old => [created, ...old]); setShowCreate(false);
  }, [token]);
  return <DashboardFrame>
    <header className="topbar">
      <Link to="/projects" className="app-home-link"><Clapperboard size={21}/><strong>STORY / STUDIO</strong><span>Мои истории</span></Link>
      <UserIndicator/>
    </header>
    <main className="page-container project-page">
      <div className="page-heading">
        <div><div className="eyebrow eyebrow-light"><span className="status-dot"/> ТВОРЧЕСКАЯ МАСТЕРСКАЯ</div>
          <h1>Мои истории<span className="heading-period">.</span></h1>
          <p>Загрузи готовый сценарий, назначь персонажей и локации, собери кадры и увидь историю целиком.</p></div>
        <button className="button button-primary" onClick={()=>setShowCreate(true)}><Plus size={19}/> Начать историю</button>
      </div>
      <div className="work-banner">
        <span className="work-banner-icon"><Sparkles size={22}/></span>
        <div><strong>Сценарий → персонажи → локации → кадры → история</strong><p>Теперь вместо отдельных разрозненных редакторов — один понятный маршрут из пяти шагов. Текст сценария остаётся авторским.</p></div>
        <Film className="banner-film" size={112} strokeWidth={1}/>
      </div>
      <div className="content-toolbar">
        <div className="section-title"><LayoutGrid size={18}/><h2>Все истории</h2><span className="count-pill">{projects.length}</span></div>
        <label className="search-box"><Search size={18}/><span className="sr-only">Поиск проектов</span>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск по проектам…"/></label>
      </div>
      {error && <FriendlyError message={error} onRetry={()=>setReload(x=>x+1)}/>}
      {notice&&<p role="status" className="project-notice">{notice} <button onClick={()=>setNotice('')} aria-label="Скрыть сообщение">×</button></p>}
      {loading ? <div className="project-grid" aria-label="Загрузка проектов">
        {[0,1,2].map(n=><div key={n} className="project-card skeleton" aria-hidden="true"/>)}
      </div> : visible.length ? <div className="project-grid">
        {visible.map((project,index)=><article className="project-card" key={project.id}>
          <Link to={'/projects/'+project.id} className="project-card-link">
           <div className={'project-cover '+cards[index%cards.length]}>
             <div className="cover-details"><span className="cover-index">STORY / {String(index+1).padStart(2,'0')}</span><Film className="cover-clapper" size={58} strokeWidth={1.25}/></div>
             <span className="cover-symbol">S<span>.</span></span>
           </div>
           <div className="project-content">
             <div className="project-details"><span><span className="tiny-dot"/> {project.ownerId===user?.id?'МОЙ ПРОЕКТ':'ОБЩИЙ ПРОЕКТ'}</span><span>{formatDate(project.updatedAt)}</span></div>
             <h3>{project.title}</h3><p>{project.description?.trim() || 'Здесь начинается ваша история.'}</p>
             <span className="card-arrow" aria-label="Открыть проект"><ArrowRight size={18}/></span>
           </div>
          </Link>
          <button className="project-access-trigger" onClick={()=>setAccessProject(project)}>
           <Settings2 size={15}/> {project.ownerId===user?.id?'Участники / удалить':'Участники'}
          </button>
        </article>)}
        <button className="add-project-card" onClick={()=>setShowCreate(true)}>
          <span className="add-project-plus"><Plus size={26}/></span><strong>Новая история</strong><span>Создать ещё один проект</span>
        </button>
      </div> : <EmptyState icon={<FolderOpen size={32}/>}
        title={query ? 'Ничего не найдено' : 'Здесь пока пусто'}
        subtitle={query ? 'Попробуйте изменить поисковый запрос.' : 'Создайте свой первый проект — и начните писать.'}
        action={!query && <button className="button button-primary" onClick={()=>setShowCreate(true)}><Plus size={18}/> Создать проект</button>}/>}
      <footer className="page-footer"><span>Script Collab Studio</span><span>Ваши истории принадлежат вам{user?.displayName ? ', ' + user.displayName : ''}.</span></footer>
    </main>
    {accessProject&&token&&<ProjectAccessDialog projectId={accessProject.id} title={accessProject.title}
      token={token} isOwner={accessProject.ownerId===user?.id} onClose={()=>setAccessProject(null)}
      onDeleted={storageCleanup=>{
       setProjects(old=>old.filter(item=>item.id!==accessProject.id));
       setAccessProject(null);
       setNotice(storageCleanup==='completed'?'Проект удалён.':'Проект удалён из базы. Очистка загруженных файлов требует повторной проверки.');
      }}/>}
    {showCreate && <CreateModal title="Новый проект" label="Название проекта" placeholder="Например, Мой первый фильм"
      descriptionLabel="Короткое описание" onCreate={create} onClose={()=>setShowCreate(false)}/>}
  </DashboardFrame>;
}
