import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { buildHandoff, createCheckpoint, resumeTask, startTask, transitionTask } from './task-orchestrator.mjs';

function repository() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-task-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.email', 'harness@example.test'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'Harness Test'], { cwd: rootDir });
  execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: rootDir });
  return rootDir;
}

test('task checkpoints persist and resume across process-shaped reloads', () => {
  const rootDir = repository();
  try {
    const task = startTask({ rootDir, config: DEFAULT_CONFIG, title: 'Add API endpoint', acceptanceCriteria: ['works'] });
    assert.equal(task.status, 'planned');
    assert.equal(task.riskLevel, 'standard');
    const { task: paused, checkpoint } = createCheckpoint({ rootDir, config: DEFAULT_CONFIG, task, status: 'paused', summary: 'end of day', nextActions: ['continue tests'] });
    assert.equal(paused.status, 'paused');
    assert.equal(checkpoint.nextActions[0], 'continue tests');
    const resumed = resumeTask({ rootDir, config: DEFAULT_CONFIG, task: paused });
    assert.equal(resumed.status, 'implementing');
    const { handoff } = buildHandoff({ rootDir, config: DEFAULT_CONFIG, task: resumed });
    assert.equal(handoff.taskId, task.id);
    assert.equal(handoff.nextActions[0], 'continue tests');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('illegal lifecycle transitions fail without mutating task', () => {
  const task = { status: 'completed', history: [] };
  assert.throws(() => transitionTask(task, 'implementing'), /Illegal task transition/);
  assert.equal(task.status, 'completed');
});
