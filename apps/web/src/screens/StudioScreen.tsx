import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, BookOpen, ChevronDown, Clapperboard, Clock3,
  FileText, GitBranch, Layers, MoreHorizontal, Plus, Save, Search, Trash2,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError, isUnauthorized } from '../api';
import type { Graph, Project, Scene, Script } from '../api';
import { useAuth } from '../auth';
import { DashboardFrame, formatDate, FriendlyError, UserIndicator } from '../components/Chrome';
import { CreateModal, EmptyState } from '../components/Modal';

export function StudioScreen() {
  const { projectId } = useParams<{ projectId: string }>();
  const { token, sessionExpired } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [activeScript, setActiveScript] = useState<string | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selectedScene, setSelectedScene] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftSynopsis, setDraftSynopsis] = useState('');
  const [loading, setLoading] = useState(true);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [error, setError] = useState('');
  const [sceneError, setSceneError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<'script' | 'graph'>('script');
  const [graph, setGraph] = useState<Graph | null>(null);
  const [graphError, setGraphError] = useState('');
  const [graphRevision, setGraphRevision] = useState(0);
  const [modal, setModal] = useState<'script' | 'scene' | null>(null);
  const [reload, setReload] = useState(0);
  const [sceneFilter, setSceneFilter] = useState('');

  useEffect(() => {
    if (!projectId || !token) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    void Promise.all([api.project(token, projectId, controller.signal), api.scripts(token, projectId, controller.signal)])
      .then(([p, list]) => {
        if (controller.signal.aborted) return;
        setProject(p); setScripts(list);
        setActiveScript(current => list.some(s => s.id === current) ? current : list[0]?.id ?? null);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        if (isUnauthorized(err)) sessionExpired();
        else setError(err instanceof Error ? err.message : 'Не удалось открыть проект.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, projectId, reload, sessionExpired]);

  useEffect(() => {
    if (!token || !activeScript) { setScenes([]); setSelectedScene(null); return; }
    const controller = new AbortController();
    setSceneLoading(true); setSceneError('');
    void api.scenes(token, activeScript, controller.signal)
      .then(list => {
        if (controller.signal.aborted) return;
        setScenes(list);
        setSelectedScene(current => list.some(s => s.id === current) ? current : list[0]?.id ?? null);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        if (isUnauthorized(err)) sessionExpired();
        else setSceneError(err instanceof Error ? err.message : 'Не удалось загрузить сцены.');
      })
      .finally(() => { if (!controller.signal.aborted) setSceneLoading(false); });
    return () => controller.abort();
  }, [activeScript, token, reload, sessionExpired]);

  useEffect(() => {
    if (view !== 'graph' || !projectId || !token) return;
    const controller = new AbortController();
    setGraphError('');
    void api.graph(token, projectId, controller.signal)
      .then(setGraph)
      .catch(err => {
        if (controller.signal.aborted) return;
        if (isUnauthorized(err)) sessionExpired();
        else setGraphError(err instanceof Error ? err.message : 'Не удалось загрузить структуру.');
      });
    return () => controller.abort();
  }, [token, projectId, view, graphRevision, sessionExpired]);

  const currentScript = scripts.find(s => s.id === activeScript);
  const currentScene = scenes.find(s => s.id === selectedScene);
  const sceneIndex = scenes.findIndex(s => s.id === selectedScene);
  const filteredScenes = useMemo(() => scenes.filter(s =>
    (s.title + ' ' + (s.synopsis ?? '')).toLocaleLowerCase('ru-RU')
      .includes(sceneFilter.trim().toLocaleLowerCase('ru-RU'))), [scenes, sceneFilter]);

  useEffect(() => {
    setDraftTitle(currentScene?.title ?? '');
    setDraftSynopsis(currentScene?.synopsis ?? '');
    setNotice('');
  }, [currentScene?.id, currentScene?.title, currentScene?.synopsis]);
  const dirty = Boolean(currentScene && (draftTitle !== currentScene.title || draftSynopsis !== (currentScene.synopsis ?? '')));

  const createScript = useCallback(async (title: string) => {
    if (!token || !projectId) throw new Error('Требуется войти в аккаунт.');
    const created = await api.createScript(token, projectId, title);
    setScripts(list => [...list, created]); setActiveScript(created.id); setModal(null);
  }, [token, projectId]);
  const createScene = useCallback(async (title: string) => {
    if (!token || !activeScript) throw new Error('Сначала создайте сценарий.');
    const created = await api.createScene(token, activeScript, title);
    setScenes(list => [...list, created]); setSelectedScene(created.id);
    setGraphRevision(x => x + 1);
    setModal(null);
  }, [token, activeScript]);
  async function saveScene() {
    if (!token || !currentScene || saving) return;
    const cleanTitle = draftTitle.trim();
    if (!cleanTitle) { setNotice('Введите название сцены.'); return; }
    setSaving(true); setNotice('');
    try {
      const updated = await api.updateScene(token, currentScene.id, { title: cleanTitle, synopsis: draftSynopsis });
      setScenes(list => list.map(s => s.id === updated.id ? updated : s));
      setNotice('Изменения сохранены');
    } catch (err) {
      if (isUnauthorized(err)) sessionExpired();
      else setNotice(err instanceof ApiError ? err.message : 'Не удалось сохранить сцену.');
    } finally { setSaving(false); }
  }
  async function removeScene() {
    if (!token || !currentScene) return;
    if (!window.confirm('Удалить сцену «' + currentScene.title + '»? Это действие нельзя отменить.')) return;
    setSaving(true);
    try {
      await api.deleteScene(token, currentScene.id);
      const remaining = scenes.filter(s => s.id !== currentScene.id);
      setScenes(remaining); setSelectedScene(remaining[0]?.id ?? null);
      setGraphRevision(x => x + 1);
    } catch (err) {
      if (isUnauthorized(err)) sessionExpired();
      else setNotice(err instanceof Error ? err.message : 'Не удалось удалить сцену.');
    } finally { setSaving(false); }
  }

  return <DashboardFrame>
    <header className="topbar studio-topbar">
      <div className="breadcrumb"><Link to="/projects">Мои проекты</Link><span>/</span><strong>{project?.title ?? 'Загружаем…'}</strong></div>
      <UserIndicator/>
    </header>
    {loading ? <main className="boot-inline" role="status">Загружаем рабочее пространство…</main>
      : error || !project ? <main className="page-container">
          <FriendlyError message={error || 'Проект не найден.'} onRetry={()=>setReload(v=>v+1)}/>
          <Link className="button button-subtle" to="/projects"><ArrowLeft size={17}/> К проектам</Link>
        </main>
      : <main className="studio-page">
        <div className="studio-heading">
          <div className="studio-heading-title">
            <div className="eyebrow eyebrow-light"><span className="status-dot"/> ПРОСТРАНСТВО ИСТОРИИ</div>
            <h1>{project.title}</h1>
            <p>{project.description || 'Ваш творческий проект'}</p>
          </div>
          <span className="studio-version"><Clapperboard size={16}/> Сценарная студия · Этап 3</span>
        </div>
        <div className="studio-tabs" role="tablist" aria-label="Режим работы">
          <button className={view === 'script' ? 'studio-tab active' : 'studio-tab'}
            role="tab" aria-selected={view === 'script'} onClick={()=>setView('script')}><BookOpen size={17}/> Сценарий</button>
          <button className={view === 'graph' ? 'studio-tab active' : 'studio-tab'}
            role="tab" aria-selected={view === 'graph'} onClick={()=>setView('graph')}><GitBranch size={17}/> Структура <span className="tab-preview">ПРОСМОТР</span></button>
          <span className="tabs-fill"/>
          <span className="tabs-context"><Layers size={15}/> Сцены связаны с графом проекта</span>
        </div>
        <div className="studio-workbench">
          <aside className="scenes-panel" aria-label="Навигатор сценария">
            <div className="panel-label">НАВИГАТОР <MoreHorizontal size={18}/></div>
            <div className="script-picker-row">
              {scripts.length ? <label className="script-selector">
                <span className="sr-only">Выбрать сценарий</span>
                <select value={activeScript ?? ''} onChange={e => { setActiveScript(e.target.value); setSelectedScene(null); }} aria-label="Выбрать сценарий">
                  {scripts.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}
                </select><ChevronDown size={15}/></label> : <span className="no-script">Сценариев пока нет</span>}
              <button className="icon-button create-mini" aria-label="Создать сценарий" title="Новый сценарий" onClick={()=>setModal('script')}><Plus size={18}/></button>
            </div>
            {activeScript && <div className="scenes-panel-tools">
              <div className="scenes-count">СЦЕНЫ <span>{scenes.length}</span></div>
              <button className="create-mini icon-button" aria-label="Добавить сцену" title="Добавить сцену" onClick={()=>setModal('scene')}><Plus size={18}/></button>
            </div>}
            {activeScript && scenes.length > 3 && <label className="scene-search"><Search size={15}/><span className="sr-only">Поиск сцены</span>
              <input placeholder="Найти сцену…" value={sceneFilter} onChange={e=>setSceneFilter(e.target.value)}/></label>}
            <div className="scene-scroll">
              {sceneError && <FriendlyError message={sceneError} onRetry={()=>setReload(x=>x+1)}/>}
              {sceneLoading ? <p className="side-muted">Загружаем сцены…</p>
                : filteredScenes.map(scene => {
                  const n = scenes.findIndex(s => s.id === scene.id);
                  return <button key={scene.id} className={'scene-list-item ' + (selectedScene === scene.id ? 'active' : '')}
                    onClick={()=>{
                      if (dirty && !window.confirm('Есть несохранённые изменения. Перейти к другой сцене?')) return;
                      setSelectedScene(scene.id); setView('script');
                    }}>
                    <span className="scene-num">{String(n+1).padStart(2,'0')}</span>
                    <span className="scene-list-copy"><strong>{scene.title}</strong><small>{scene.synopsis?.trim() || 'Описание не добавлено'}</small></span>
                    {selectedScene === scene.id && <span className="scene-active-dot"/>}
                  </button>;
                })}
              {!sceneLoading && activeScript && !scenes.length && <div className="scene-empty"><FileText size={24}/>
                <strong>Добавьте первую сцену</strong>
                <button className="button button-soft" onClick={()=>setModal('scene')}><Plus size={16}/> Добавить</button></div>}
              {!sceneLoading && scenes.length>0 && filteredScenes.length===0 && <p className="side-muted">Нет подходящих сцен</p>}
              {!scripts.length && <div className="scene-empty"><Clapperboard size={28}/>
                <strong>Пока нет сценария</strong>
                <p>Создайте сценарий, чтобы добавить сцены</p>
                <button className="button button-soft" onClick={()=>setModal('script')}><Plus size={16}/> Создать</button></div>}
            </div>
            <div className="scenes-panel-footer"><span className="tiny-dot"/> Данные сохранены в проекте</div>
          </aside>
          <section className="workspace-content" aria-label={view === 'script' ? 'Сцена' : 'Структура'}>
            {view === 'graph' ? <div className="graph-stage">
              <div className="workspace-section-top"><span className="eyebrow eyebrow-light">СТРУКТУРА ПРОЕКТА</span>
                <button className="button button-subtle button-small" onClick={()=>setGraphRevision(v=>v+1)}>Обновить</button></div>
              <h2>Карта истории</h2>
              <p>Все сцены уже связаны с графом проекта. Интерактивная раскадровка появится на этапе 5.</p>
              {graphError && <FriendlyError message={graphError}/>}
              <div className="graph-stats">
                <div><GitBranch size={22}/><strong>{graph?.nodes.length ?? '—'}</strong><span>Узлов</span></div>
                <div><ArrowRight size={22}/><strong>{graph?.edges.length ?? '—'}</strong><span>Связей</span></div>
              </div>
              {graph && graph.nodes.length>0 && <div className="graph-node-list">
                <h3>Узлы проекта</h3>
                {graph.nodes.slice(0,30).map(n=><div key={n.id} className="graph-node-row">
                  <span className="node-type">{n.kind}</span><strong>{n.title}</strong>
                  {n.sceneId && <span className="node-linked">СЦЕНА</span>}
                </div>)}
              </div>}
              {graph && !graph.nodes.length && <EmptyState icon={<GitBranch size={30}/>} title="Граф пока пуст" subtitle="Создайте сцену, чтобы появился связанный узел."/>}
              <div className="next-stage-note"><Layers size={19}/><span>Интерактивное перемещение узлов и создание связей запланированы на этап 5.</span></div>
            </div> : !currentScript ? <EmptyState icon={<BookOpen size={34}/>} title="Создайте первый сценарий"
                subtitle="Внутри него можно организовать сцены, акты и будущую раскадровку."
                action={<button className="button button-primary" onClick={()=>setModal('script')}><Plus size={17}/> Новый сценарий</button>}/>
              : !currentScene ? <EmptyState icon={<FileText size={34}/>} title="Начните с первой сцены"
                subtitle="Каждая сцена станет отдельным элементом сценария и раскадровки."
                action={<button className="button button-primary" onClick={()=>setModal('scene')}><Plus size={17}/> Создать сцену</button>}/>
              : <div className="scene-stage">
                <div className="workspace-section-top">
                  <span className="eyebrow eyebrow-light">СЦЕНАРИЙ / {currentScript.title.toLocaleUpperCase('ru-RU')}</span>
                  <span className="page-number">СЦЕНА {String(sceneIndex+1).padStart(2,'0')} / {String(scenes.length).padStart(2,'0')}</span>
                </div>
                <div className="screenplay-sheet">
                  <div className="script-sheet-tag"><span className="tiny-dot"/> КАРТОЧКА СЦЕНЫ</div>
                  <label className="sheet-label" htmlFor="scene-title">Название сцены</label>
                  <input className="scene-title-input" id="scene-title" value={draftTitle} maxLength={200}
                    onChange={e=>setDraftTitle(e.target.value)} placeholder="INT. КОМНАТА — ДЕНЬ"/>
                  <div className="sheet-rule"/>
                  <label className="sheet-label" htmlFor="scene-description">Синопсис / описание</label>
                  <textarea className="scene-synopsis" id="scene-description" value={draftSynopsis} maxLength={2000}
                    placeholder="Что происходит в этой сцене? Опишите действие, настроение и важные детали…"
                    onChange={e=>setDraftSynopsis(e.target.value)}/>
                  <div className="screenplay-coming"><span className="screenplay-coming-icon"><PenLineIcon/></span>
                    <div><strong>Текст сценария — следующий этап</strong><p>Диалоги, ремарки, формат сценария и совместное редактирование появятся здесь на этапе 4. Текст не сохраняется в синопсис вместо Yjs-документа.</p></div>
                  </div>
                </div>
                <div className="scene-actions">
                  <button className="button button-danger-quiet" onClick={()=>void removeScene()} disabled={saving}><Trash2 size={17}/> Удалить сцену</button>
                  <div className="save-group">
                    <span role="status" className={'save-notice ' + (dirty ? 'unsaved' : '')}>{notice || (dirty ? 'Есть несохранённые изменения' : 'Нет изменений')}</span>
                    <button className="button button-primary" onClick={()=>void saveScene()} disabled={!dirty || saving || !draftTitle.trim()}><Save size={17}/>{saving ? 'Сохраняем…' : 'Сохранить сцену'}</button>
                  </div>
                </div>
              </div>}
          </section>
          <aside className="context-panel" aria-label="Информация о проекте">
            <div className="panel-label">КОНТЕКСТ ПРОЕКТА <MoreHorizontal size={18}/></div>
            <div className="context-card">
              <span className="context-card-head"><Clapperboard size={17}/> В РАБОТЕ</span>
              <h3>{project.title}</h3>
              <p>{project.description || 'История в процессе создания.'}</p>
            </div>
            <div className="context-stats">
              <div><span>Сценариев</span><strong>{scripts.length}</strong></div>
              <div><span>Сцен в выбранном сценарии</span><strong>{scenes.length}</strong></div>
              <div><span>Обновлён</span><strong className="context-date">{formatDate(project.updatedAt)}</strong></div>
            </div>
            {currentScene && view === 'script' && <div className="context-selected">
              <span className="panel-label">ВЫБРАННАЯ СЦЕНА</span>
              <div className="context-scene-number">{String(sceneIndex+1).padStart(2,'0')}</div>
              <strong>{currentScene.title}</strong><p>{currentScene.synopsis || 'Краткое описание ещё не добавлено.'}</p>
            </div>}
            <div className="context-next"><Clock3 size={17}/><p>Продолжение: редактор сценария, совместные курсоры и раскадровка.</p></div>
            <Link className="back-to-projects" to="/projects"><ArrowLeft size={16}/> К списку проектов</Link>
          </aside>
        </div>
      </main>}
    {modal === 'script' && <CreateModal title="Новый сценарий" label="Название сценария" placeholder="Рабочее название"
      onCreate={(title)=>createScript(title)} onClose={()=>setModal(null)}/>}
    {modal === 'scene' && <CreateModal title="Новая сцена" label="Название сцены" placeholder="Например, INT. КУХНЯ — УТРО"
      onCreate={(title)=>createScene(title)} onClose={()=>setModal(null)}/>}
  </DashboardFrame>;
}
function PenLineIcon() { return <FileText size={21}/> }
