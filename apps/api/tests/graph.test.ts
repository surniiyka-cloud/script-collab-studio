import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createsCycle } from '../src/graph.js';

test('reject self links and directed loops', () => {
  const links = [ { sourceNodeId: 'a', targetNodeId: 'b' }, { sourceNodeId: 'b', targetNodeId: 'c' } ];
  assert.equal(createsCycle(links, 'c', 'a'), true);
  assert.equal(createsCycle(links, 'c', 'd'), false);
  assert.equal(createsCycle(links, 'a', 'a'), true);
});
