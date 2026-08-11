import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { assessKnowledge, verifyKnowledge } from './knowledge-loop.mjs';
import { startTask } from './task-orchestrator.mjs';

test('knowledge loop requires explicit three-state conclusions for affected assets', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-knowledge-'));
  try {
    writeFileSync(join(rootDir, 'app.js'), 'export const x = 1\n');
    writeFileSync(join(rootDir, 'README.md'), '# App\n');
    execFileSync('git', ['init', '-b', 'main'], { cwd: rootDir });
    execFileSync('git', ['config', 'user.email', 'harness@example.test'], { cwd: rootDir });
    execFileSync('git', ['config', 'user.name', 'Harness Test'], { cwd: rootDir });
    execFileSync('git', ['add', '.'], { cwd: rootDir });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: rootDir });
    const config = structuredClone(DEFAULT_CONFIG);
    config.syncCheck = { rules: [{ re: /^app\.js$/, label: 'app', assets: ['README.md'] }] };
    const task = startTask({ rootDir, config, title: 'Refactor application' });
    writeFileSync(join(rootDir, 'app.js'), 'export const x = 2\n');
    assert.deepEqual(verifyKnowledge({ rootDir, config, task }).missing, ['README.md']);
    const assessment = assessKnowledge({ rootDir, config, task, asset: 'README.md', status: 'reviewed-no-change', reason: 'public behavior is unchanged', sources: ['app.js'] });
    assert.equal(assessment.status, 'reviewed-no-change');
    const verified = verifyKnowledge({ rootDir, config, task, record: true });
    assert.equal(verified.ok, true);
    assert.equal(verified.evidence.evidenceType, 'knowledge');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
