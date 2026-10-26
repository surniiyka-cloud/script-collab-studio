import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FixedWindowLimiter, canEdit } from '../src/security.ts';

test('throttle refuses excess login attempts and tells client when to retry', () => {
  let time = 1_000;
  const limit = new FixedWindowLimiter(2, 10_000, () => time);
  assert.deepEqual(limit.check('ip-a'), { allowed: true });
  assert.deepEqual(limit.check('ip-a'), { allowed: true });
  assert.deepEqual(limit.check('ip-a'), { allowed: false, retryAfterSeconds: 10 });
  time += 7_500;
  assert.deepEqual(limit.check('ip-a'), { allowed: false, retryAfterSeconds: 3 });
  time += 2_500;
  assert.deepEqual(limit.check('ip-a'), { allowed: true });
});

test('throttle maintains independent counters per IP and route key', () => {
  const limit = new FixedWindowLimiter(1, 60_000, () => 0);
  assert.equal(limit.check('login:ip-a').allowed, true);
  assert.equal(limit.check('login:ip-a').allowed, false);
  assert.equal(limit.check('login:ip-b').allowed, true);
  assert.equal(limit.check('register:ip-a').allowed, true);
});

test('throttle fails closed if key capacity is reached', () => {
  const limit = new FixedWindowLimiter(1, 60_000, () => 0, 1);
  assert.equal(limit.check('a').allowed, true);
  assert.deepEqual(limit.check('b'), { allowed: false, retryAfterSeconds: 60 });
});

test('edit access belongs to Owner and Editor but not Viewer', () => {
  assert.equal(canEdit('OWNER'), true);
  assert.equal(canEdit('EDITOR'), true);
  assert.equal(canEdit('VIEWER'), false);
});
