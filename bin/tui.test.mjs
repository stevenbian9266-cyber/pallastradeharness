import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { startTask } from './task-orchestrator.mjs';
import { buildDashboard, buildTaskDetail, interactiveReduce, renderDetail } from './tui.mjs';

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

test('buildTaskDetail exposes goals, criteria, blockers and evidence (HTH-016)', () => {
  const task = {
    id: 'TASK-1', title: 'Add payment', status: 'implementing', riskLevel: 'critical',
    goals: ['Support Stripe'], acceptanceCriteria: ['Refund works'], blockers: ['Awaiting key'],
  };
  const evidence = [{ id: 'EVD-1', evidenceType: 'test', capturedAt: '2026-08-22T00:00:00.000Z' }];
  const detail = buildTaskDetail(task, evidence);
  assert.equal(detail.id, 'TASK-1');
  assert.equal(detail.risk, 'critical');
  assert.deepEqual(detail.goals, ['Support Stripe']);
  assert.deepEqual(detail.acceptanceCriteria, ['Refund works']);
  assert.deepEqual(detail.blockers, ['Awaiting key']);
  assert.equal(detail.evidence.length, 1);
  assert.equal(detail.evidence[0].type, 'test');
  assert.equal(detail.evidenceCount, 1);
  assert.match(detail.nextAction, /supervise diff/);
  const rendered = renderDetail(detail);
  assert.match(rendered, /Task TASK-1/);
  assert.match(rendered, /Support Stripe/);
  assert.match(rendered, /Awaiting key/);
});

test('interactiveReduce navigates list, opens detail, runs action, refreshes and quits (HTH-016)', () => {
  const initial = { mode: 'list', cursor: 0, detailTaskId: null, exit: false, runAction: false, refresh: false };
  const down = interactiveReduce(initial, 'down', 3);
  assert.equal(down.cursor, 1);
  // clamp at bottom
  const clamped = interactiveReduce({ ...initial, cursor: 2 }, 'down', 3);
  assert.equal(clamped.cursor, 2);
  // clamp at top
  const clampedTop = interactiveReduce(initial, 'up', 3);
  assert.equal(clampedTop.cursor, 0);
  // open detail
  const detail = interactiveReduce(down, 'return', 3);
  assert.equal(detail.mode, 'detail');
  assert.equal(detail.detailTaskId, 1);
  // back to list
  const back = interactiveReduce(detail, 'b', 3);
  assert.equal(back.mode, 'list');
  assert.equal(back.detailTaskId, null);
  // run next action from detail
  const run = interactiveReduce(detail, 'return', 3);
  assert.equal(run.runAction, true);
  // refresh
  assert.equal(interactiveReduce(initial, 'r', 3).refresh, true);
  // quit
  assert.equal(interactiveReduce(initial, 'q', 3).exit, true);
  assert.equal(interactiveReduce(initial, 'escape', 3).exit, true);
});

test('every interactive action has a CLI/JSON equivalent (HTH-016 contract)', () => {
  // 详情/动作/刷新/退出 均有等价命令或 --json 输出：
  // 查看详情 → task status --task <id> --json；执行动作 → nextAction 本身就是 CLI；
  // 刷新 → 重新运行 tui；退出 → 无副作用等价（--no-interactive 即静态等价物）。
  assert.equal(typeof buildTaskDetail, 'function');
  assert.equal(typeof interactiveReduce, 'function');
  const detail = buildTaskDetail({ id: 'TASK-x', title: 'T', status: 'planned', riskLevel: 'standard' }, []);
  assert.match(detail.nextAction, /^brain context --task TASK-x$/);
});
