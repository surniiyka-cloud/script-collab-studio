import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createsCycle } from '../dist/graph.js';

test('self link rejected', () => assert.equal(createsCycle([], 'x', 'x'), true));
test('longer loop rejected', () => {
  const edges = [{ sourceNodeId: 'a', targetNodeId: 'b' }, { sourceNodeId: 'b', targetNodeId: 'c' }];
  assert.equal(createsCycle(edges, 'c', 'a'), true);
  assert.equal(createsCycle(edges, 'c', 'd'), false);
});
