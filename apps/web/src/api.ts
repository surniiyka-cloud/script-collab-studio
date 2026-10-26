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
      response.status === 429 ? 'Слишком много запросов. Попробуйте через минуту.'
        : response.status >= 500 ? 'Ошибка сервера. Попробуйте ещё раз.'
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
};
