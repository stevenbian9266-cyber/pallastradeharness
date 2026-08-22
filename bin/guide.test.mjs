import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { startTask } from './task-orchestrator.mjs';
import { doTask, nextAction } from './guide.mjs';

function project() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-guide-'));
  writeFileSync(join(rootDir, 'README.md'), '# Sample\n');
  execFileSync('git', ['init', '-b', 'main'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.email', 'h@h'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'H'], { cwd: rootDir });
  execFileSync('git', ['add', '.'], { cwd: rootDir });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: rootDir });
  return { rootDir, config: structuredClone(DEFAULT_CONFIG) };
}

test('next without any task suggests starting one', () => {
  const { rootDir, config } = project();
  try {
    const next = nextAction({ rootDir, config });
    assert.equal(next.phase, 'no-task');
    assert.ok(next.commands.some(c => c.includes('harness do')));
    assert.equal(next.humanDecisionRequired, true);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('next with task but no gate suggests opening gate', () => {
  const { rootDir, config } = project();
  try {
    startTask({ rootDir, config, title: 'T' });
    const next = nextAction({ rootDir, config });
    assert.equal(next.phase, 'no-gate');
    assert.ok(next.commands.some(c => c.includes('harness gate --task')));
    assert.equal(next.humanDecisionRequired, false);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('next with gate in preparation lists clear commands', () => {
  const { rootDir, config } = project();
  try {
    const task = startTask({ rootDir, config, title: 'T' });
    const gateDir = join(rootDir, 'harness', 'gates');
    mkdirSync(gateDir, { recursive: true });
    writeFileSync(join(gateDir, 'GATE-1.json'), JSON.stringify({
      schemaVersion: '2.0', id: 'GATE-1', taskId: task.id, checks: [
        { id: 'search-app', phase: 'preparation', status: 'pending' },
        { id: 'verify-test', phase: 'verification', status: 'pending' },
      ],
    }));
    const next = nextAction({ rootDir, config });
    assert.equal(next.phase, 'preparation');
    assert.ok(next.commands.some(c => c.includes('gate:clear') && c.includes('search-app')));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('next with gate awaiting verification lists verifier commands', () => {
  const { rootDir, config } = project();
  try {
    const task = startTask({ rootDir, config, title: 'T' });
    const gateDir = join(rootDir, 'harness', 'gates');
    mkdirSync(gateDir, { recursive: true });
    writeFileSync(join(gateDir, 'GATE-1.json'), JSON.stringify({
      schemaVersion: '2.0', id: 'GATE-1', taskId: task.id, cleared: false, checks: [
        { id: 'search-app', phase: 'preparation', status: 'done' },
        { id: 'verify-test', phase: 'verification', status: 'pending' },
      ],
    }));
    const next = nextAction({ rootDir, config });
    assert.equal(next.phase, 'verification');
    assert.ok(next.commands.some(c => c.includes('verify unit')));
    assert.ok(next.commands.some(c => c.includes('evidence verify')));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('next with cleared gate suggests finishing task', () => {
  const { rootDir, config } = project();
  try {
    const task = startTask({ rootDir, config, title: 'T' });
    const gateDir = join(rootDir, 'harness', 'gates');
    mkdirSync(gateDir, { recursive: true });
    writeFileSync(join(gateDir, 'GATE-1.json'), JSON.stringify({
      schemaVersion: '2.0', id: 'GATE-1', taskId: task.id, cleared: true, checks: [
        { id: 'search-app', phase: 'preparation', status: 'done' },
        { id: 'verify-test', phase: 'verification', status: 'done' },
      ],
    }));
    const next = nextAction({ rootDir, config });
    assert.equal(next.phase, 'finish');
    assert.ok(next.commands.some(c => c.includes('task finish')));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('doTask without task suggests task start with description and allow', () => {
  const { rootDir, config } = project();
  try {
    const next = doTask({ rootDir, config, description: '优化：fix x', allow: 'src/**' });
    assert.equal(next.phase, 'no-task');
    assert.ok(next.commands[0].includes('task start'));
    assert.ok(next.commands[0].includes('优化：fix x'));
    assert.ok(next.commands[0].includes('--allow "src/**"'));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
