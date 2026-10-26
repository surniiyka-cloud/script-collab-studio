/** Real HTTP smoke test. Start the API with a migrated development database first. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const origin = process.env.API_ORIGIN ?? 'http://127.0.0.1:3001';
async function call(path, { method = 'GET', body, token, expect = 200 } = {}) {
  const res = await fetch(origin + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await res.json();
  assert.equal(res.status, expect, `${method} ${path} -> ${res.status}: ${JSON.stringify(payload)}`);
  return payload.data ?? payload;
}

const unique = randomUUID();
console.log('1/8 API readiness');
await call('/health/ready');
console.log('2/8 Register first user');
const auth = await call('/api/v1/auth/register', {
  method: 'POST',
  body: { email: `smoke-${unique}@example.test`, password: 'long-test-password-123!', displayName: 'Smoke Tester' },
});
assert.ok(auth.accessToken);
console.log('3/8 Create project and a screenplay');
const project = await call('/api/v1/projects', { method: 'POST', token: auth.accessToken, body: { title: 'Smoke screenplay' } });
const script = await call(`/api/v1/projects/${project.id}/scripts`, { method: 'POST', token: auth.accessToken, body: { title: 'Draft 1' } });
assert.equal(script.acts.length, 1);
console.log('4/8 Create two scenes');
const s1 = await call(`/api/v1/scripts/${script.id}/scenes`, { method: 'POST', token: auth.accessToken, body: { title: 'INT. OFFICE - DAY' } });
const s2 = await call(`/api/v1/scripts/${script.id}/scenes`, { method: 'POST', token: auth.accessToken, body: { title: 'EXT. LAKE - DUSK' } });
console.log('5/8 Verify automatically created scene nodes');
const board = await call(`/api/v1/projects/${project.id}/graph`, { token: auth.accessToken });
const n1 = board.nodes.find(n => n.sceneId === s1.id && n.kind === 'SCENE');
const n2 = board.nodes.find(n => n.sceneId === s2.id && n.kind === 'SCENE');
assert.ok(n1 && n2, 'Both scenes should have SCENE nodes');
console.log('6/8 Connect scene nodes; reject a loop');
const edge = await call(`/api/v1/projects/${project.id}/edges`, {
  method: 'POST', token: auth.accessToken, body: { sourceNodeId: n1.id, targetNodeId: n2.id, kind: 'SEQUENCE' },
});
assert.equal(edge.kind, 'SEQUENCE');
await call(`/api/v1/projects/${project.id}/edges`, {
  method: 'POST', token: auth.accessToken, body: { sourceNodeId: n2.id, targetNodeId: n1.id, kind: 'SEQUENCE' }, expect: 409,
});
console.log('7/8 Deny access to unrelated user');
const stranger = await call('/api/v1/auth/register', {
  method: 'POST', body: { email: `outsider-${unique}@example.test`, password: 'another-test-password-123!', displayName: 'Outsider' },
});
await call(`/api/v1/projects/${project.id}`, { token: stranger.accessToken, expect: 404 });
console.log('8/8 Verify updated graph then remove the project');
const updatedBoard = await call(`/api/v1/projects/${project.id}/graph`, { token: auth.accessToken });
assert.ok(updatedBoard.edges.some(e => e.id === edge.id));
await call(`/api/v1/projects/${project.id}`, { method: 'DELETE', token: auth.accessToken });
console.log('PASS: HTTP backend smoke (auth, project, script, scenes, nodes, edge, cycle, membership, deletion).');
