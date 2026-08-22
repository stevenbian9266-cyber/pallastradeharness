import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greet } from './index.ts';

test('greet returns Hello with name', () => {
  assert.equal(greet('Harness'), 'Hello, Harness!');
});
