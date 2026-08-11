import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXIT_CODES, getArgs, npxCommand, parseFilesArg } from './cli-utils.mjs';

test('parseFilesArg accepts comma-separated and space-separated Lefthook arguments', () => {
  assert.deepEqual(parseFilesArg(['scan', '--files', 'a.ts,b.ts', 'folder with spaces/c.ts', '--json']), [
    'a.ts',
    'b.ts',
    'folder with spaces/c.ts',
  ]);
});

test('getArgs collects repeated flags without duplicates being imposed by the parser', () => {
  assert.deepEqual(getArgs(['--allow', 'src/**', '--allow', 'test/**,docs/**'], '--allow'), ['src/**', 'test/**', 'docs/**']);
});

test('platform command and exit code contracts are stable', () => {
  assert.equal(npxCommand('win32'), 'npx.cmd');
  assert.equal(npxCommand('linux'), 'npx');
  assert.deepEqual(EXIT_CODES, { OK: 0, POLICY_FAILURE: 1, USAGE_OR_CONFIG: 2, INTERNAL_ERROR: 3 });
});
