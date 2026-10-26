/**
 * Stage 3 REST client. The Vite development proxy forwards /api to Fastify.
 * Do not put the API password, JWT signing secret or database URL in the browser.
 */
export type User = { id: string; displayName: string; email: string };
export type Project = {
  id: string; title: string; description: string | null;
  ownerId: string; createdAt: string; updatedAt: string;
};
export type Act = { id: string; title: string; scriptId: string; sortKey: string };
export type Script = {
  id: string; projectId: string; title: string; createdAt: string;
  updatedAt: string; acts?: Act[];
};
export type Scene = {
  id: string; scriptId: string; actId: string; title: string;
  synopsis: string | null; sortKey: string; createdAt: string; updatedAt: string;
};
export type GraphNode = { id: string; title: string; kind: string; sceneId: string | null };
export type GraphEdge = { id: string; sourceNodeId: string; targetNodeId: string; kind: string };
export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

export type ImportBlock = { kind: 'heading'|'action'|'character'|'dialogue'|'parenthetical'|'transition'; text:string; sourceLine:number; speaker?:string;dialogueText?:string;delivery?:string };
export type ImportPreview = {
 digest:string; length:number; characters:string[]; warnings:string[];frontMatter:ImportBlock[];
 scenes:Array<{title:string;sourceLineStart:number;blocks:ImportBlock[];timecode:string|null;locationHint:string|null;timeOfDay:string|null}>;
};
export type ImportCommit = {scriptId:string;scenes:Array<{id:string;title:string}>;characters:string[]};
export type ShotDraft = {
 title:string;description:string;shotType:'WIDE'|'MEDIUM'|'CLOSE_UP'|'OTHER';
 durationMs:number;sourceLine:number|null;soundCue:string;musicCue:string;
};
export type Asset = {id:string;filename:string;mimeType:string;kind:'IMAGE'|'AUDIO';sizeBytes:string};
export type ProductionNode = {
 id:string;title:string;description:string|null;kind:string;sceneId:string|null;
 shotType:string|null;durationMs:number|null;metadata:unknown;
 mediaLinks?:Array<{id:string;asset:Asset}>;
};
export type AIStatus = {
 text: {configured:boolean;reachable:boolean;label:string;message:string};
 image: {configured:boolean;reachable:boolean;label:string;message:string};
};
export type FilmTimeline = {script:{id:string;title:string};scenes:Array<{
 id:string;title:string;shots:Array<{id:string;title:string;description:string|null;shotType:string|null;durationMs:number;metadata:unknown;media?:Array<{id:string;kind:string;mimeType:string;filename:string}>}>;
}>};

export type WorkflowMedia = {id:string;kind:string;filename:string;mimeType:string;sizeBytes:string};
export type WorkflowSubject = {id:string;title:string;description:string|null;media:WorkflowMedia[]};
export type WorkflowScene = {
 id:string;index:number;title:string;synopsis:string|null;locationId:string|null;
 suggestedLocation:string|null;timecode:string|null;timeOfDay:string|null;blocks:ImportBlock[];actionDescription:string;
 characters:string[];dialogues:Array<{speaker:string;text:string;sourceLine:number;delivery?:string}>;
 shots:Array<{id:string;title:string;description:string|null;shotType:string|null;durationMs:number;media:WorkflowMedia[]}>;
};
export type WorkflowStory = {
 script:{id:string;title:string};scenes:WorkflowScene[];
 characters:WorkflowSubject[];locations:WorkflowSubject[];
};
export type Session = { user: User; accessToken: string };
export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}
export const isUnauthorized = (e: unknown): boolean => e instanceof ApiError && e.status === 401;

async function request<T>(
  path: string, method = 'GET', token?: string, body?: unknown, signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/v1' + path, {
      method, signal,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'Не удаётся связаться с сервером. Проверьте запуск API.');
  }
  let result: { data?: T; error?: { code?: string; message?: string } };
  try { result = await response.json() as typeof result; }
  catch { throw new ApiError(response.status, 'BAD_RESPONSE', 'Неожиданный ответ сервера.'); }
  if (!response.ok) {
    throw new ApiError(response.status, result.error?.code ?? 'REQUEST_FAILED',
      response.status === 429 ? result.error?.message ?? 'Слишком много запросов. Попробуйте через минуту.'
        : response.status >= 500 && /^(AI_|COMFYUI_|IMAGE_AI_|SHOT_DESCRIPTION_REQUIRED)/.test(result.error?.code ?? '')
          ? result.error?.message ?? 'Проверьте подключение ИИ.'
        : response.status >= 500 ? 'Ошибка сервера. Код: ' + (result.error?.code ?? 'INTERNAL_ERROR')
        : result.error?.message ?? 'Запрос не выполнен.');
  }
  if (result.data === undefined) throw new ApiError(response.status, 'BAD_RESPONSE', 'Сервер не вернул данные.');
  return result.data;
}
export const api = {
  login: (email: string, password: string) => request<Session>('/auth/login', 'POST', undefined, { email, password }),
  register: (email: string, password: string, displayName: string) =>
    request<Session>('/auth/register', 'POST', undefined, { email, password, displayName }),
  me: (token: string, signal?: AbortSignal) => request<User>('/auth/me', 'GET', token, undefined, signal),
  projects: (token: string, signal?: AbortSignal) => request<Project[]>('/projects', 'GET', token, undefined, signal),
  createProject: (token: string, title: string, description: string) =>
    request<Project>('/projects', 'POST', token, { title, description }),
  project: (token: string, id: string, signal?: AbortSignal) =>
    request<Project>('/projects/' + encodeURIComponent(id), 'GET', token, undefined, signal),
  scripts: (token: string, projectId: string, signal?: AbortSignal) =>
    request<Script[]>('/projects/' + encodeURIComponent(projectId) + '/scripts', 'GET', token, undefined, signal),
  createScript: (token: string, projectId: string, title: string) =>
    request<Script>('/projects/' + encodeURIComponent(projectId) + '/scripts', 'POST', token, { title }),
  scenes: (token: string, scriptId: string, signal?: AbortSignal) =>
    request<Scene[]>('/scripts/' + encodeURIComponent(scriptId) + '/scenes', 'GET', token, undefined, signal),
  createScene: (token: string, scriptId: string, title: string) =>
    request<Scene>('/scripts/' + encodeURIComponent(scriptId) + '/scenes', 'POST', token, { title }),
  updateScene: (token: string, sceneId: string, updates: { title?: string; synopsis?: string | null }) =>
    request<Scene>('/scenes/' + encodeURIComponent(sceneId), 'PATCH', token, updates),
  deleteScene: (token: string, sceneId: string) =>
    request<{ deleted: boolean }>('/scenes/' + encodeURIComponent(sceneId), 'DELETE', token),
  graph: (token: string, projectId: string, signal?: AbortSignal) =>
    request<Graph>('/projects/' + encodeURIComponent(projectId) + '/graph', 'GET', token, undefined, signal),

  previewImport: (token:string, projectId:string, text:string) =>
    request<ImportPreview>('/projects/'+encodeURIComponent(projectId)+'/production/import/preview','POST',token,{text}),
  commitImport: (token:string, projectId:string, input:{title:string;text:string;digest:string}) =>
    request<ImportCommit>('/projects/'+encodeURIComponent(projectId)+'/production/import/commit','POST',token,input),
  workflowStory: (token:string,projectId:string,scriptId:string) =>
    request<WorkflowStory>('/projects/'+encodeURIComponent(projectId)+'/workflow/story?scriptId='+encodeURIComponent(scriptId),'GET',token),
  createLocation: (token:string,projectId:string,title:string,description?:string) =>
    request<WorkflowSubject>('/projects/'+encodeURIComponent(projectId)+'/workflow/locations','POST',token,{title,description}),
  reorderShots: (token:string,sceneId:string,shotIds:string[]) =>
    request<{sceneId:string;shotIds:string[]}>('/scenes/'+encodeURIComponent(sceneId)+'/workflow/shots/order','PUT',token,{shotIds}),
  assignSceneLocation: (token:string,sceneId:string,locationId:string|null) =>
    request<{sceneId:string;locationId:string|null}>('/scenes/'+encodeURIComponent(sceneId)+'/workflow/location','PUT',token,{locationId}),
  updateNode: (token:string,nodeId:string,changes:{title?:string;description?:string|null;durationMs?:number;shotType?:string}) =>
    request<ProductionNode>('/nodes/'+encodeURIComponent(nodeId),'PATCH',token,changes),
  characters: (token:string,projectId:string) =>
    request<ProductionNode[]>('/projects/'+encodeURIComponent(projectId)+'/production/characters','GET',token),
  createCharacter: (token:string,projectId:string,name:string) =>
    request<ProductionNode>('/projects/'+encodeURIComponent(projectId)+'/production/characters','POST',token,{name}),
  shotDraft: (token:string,sceneId:string) =>
    request<{sceneId:string;shots:ShotDraft[];source:string;note:string}>('/scenes/'+encodeURIComponent(sceneId)+'/production/shot-draft','GET',token),
  aiStatus: (token:string,projectId:string) =>
    request<AIStatus>('/projects/'+encodeURIComponent(projectId)+'/production/ai-status','GET',token),
  generateFrameImage: (token:string,projectId:string,shotId:string,prompt?:string) =>
    request<{asset:Asset;note:string}>('/projects/'+encodeURIComponent(projectId)+'/production/shots/'+encodeURIComponent(shotId)+'/generate-image','POST',token,prompt?{prompt}:{}),
  aiShotDraft: (token:string,sceneId:string) =>
    request<{sceneId:string;shots:ShotDraft[];source:string;note:string}>('/scenes/'+encodeURIComponent(sceneId)+'/production/shot-draft/ai','POST',token,{}),
  approvedShots: (token:string,sceneId:string) =>
    request<ProductionNode[]>('/scenes/'+encodeURIComponent(sceneId)+'/production/shots','GET',token),
  approveShots: (token:string,sceneId:string,shots:ShotDraft[]) =>
    request<ProductionNode[]>('/scenes/'+encodeURIComponent(sceneId)+'/production/shots/approve','POST',token,{shots}),
  timeline: (token:string,projectId:string,scriptId:string) =>
    request<FilmTimeline>('/projects/'+encodeURIComponent(projectId)+'/production/timeline?scriptId='+encodeURIComponent(scriptId),'GET',token),
  uploadMedia: async (token:string,projectId:string,nodeId:string,file:File):Promise<Asset> => {
    const reply=await fetch('/api/v1/projects/'+encodeURIComponent(projectId)+'/production/nodes/'+encodeURIComponent(nodeId)+'/media',{
      method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':file.type,'x-file-name':encodeURIComponent(file.name)},body:file,
    });
    const json=await reply.json() as {data?:Asset;error?:{message:string}};
    if(!reply.ok||!json.data)throw new ApiError(reply.status,'MEDIA_UPLOAD_FAILED',json.error?.message||'Не удалось загрузить файл.');
    return json.data;
  },
  exportAnimatic: async (token:string,projectId:string,scriptId:string):Promise<Blob> => {
    const response=await fetch('/api/v1/projects/'+encodeURIComponent(projectId)+'/production/render',{
      method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({scriptId}),
    });
    if(!response.ok){
      let message='Не удалось собрать MP4.';
      try{const data=await response.json() as {error?:{message?:string}};message=data.error?.message??message;}catch{}
      throw new ApiError(response.status,'RENDER_FAILED',message);
    }
    return response.blob();
  },
  mediaBlob: async (token:string,mediaId:string):Promise<Blob> => {
    const reply=await fetch('/api/v1/media/'+encodeURIComponent(mediaId)+'/file',{headers:{Authorization:'Bearer '+token}});
    if(!reply.ok)throw new ApiError(reply.status,'MEDIA_READ_FAILED','Не удалось получить файл.');
    return reply.blob();
  },
};
