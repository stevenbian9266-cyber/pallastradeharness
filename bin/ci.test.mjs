import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GITHUB_CHECK_NAMES, githubWorkflow } from './ci.mjs';

test('GitHub workflow is deterministic and covers the supported OS/Node matrix', () => {
  const workflow = githubWorkflow({ base: 'dev' });
  assert.match(workflow, /branches: \[dev\]/);
  assert.match(workflow, /os: \[ubuntu-latest, windows-latest, macos-latest\]/);
  assert.match(workflow, /node: \[22, 24\]/);
  assert.match(workflow, /harness supervise review --base origin\/dev --json/);
  assert.equal(GITHUB_CHECK_NAMES.length, 6);
});
