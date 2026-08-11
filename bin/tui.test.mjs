import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { startTask } from './task-orchestrator.mjs';
import { buildDashboard } from './tui.mjs';

test('dashboard gives every active task an explicit next action', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-tui-'));
  try {
    writeFileSync(join(rootDir, 'README.md'), '# TUI\n');
    execFileSync('git', ['init', '-b', 'main'], { cwd: rootDir });
    execFileSync('git', ['config', 'user.email', 'harness@example.test'], { cwd: rootDir });
    execFileSync('git', ['config', 'user.name', 'Harness Test'], { cwd: rootDir });
    execFileSync('git', ['add', '.'], { cwd: rootDir });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: rootDir });
    const config = structuredClone(DEFAULT_CONFIG);
    const task = startTask({ rootDir, config, title: 'Copy edit' });
    const dashboard = buildDashboard({ rootDir, config });
    assert.equal(dashboard.summary.active, 1);
    assert.equal(dashboard.tasks[0].id, task.id);
    assert.match(dashboard.tasks[0].nextAction, /brain context/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
