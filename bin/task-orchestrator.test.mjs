import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { buildHandoff, createCheckpoint, resumeTask, runTask, startTask, transitionTask } from './task-orchestrator.mjs';

function repository() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-task-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.email', 'harness@example.test'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'Harness Test'], { cwd: rootDir });
  execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: rootDir });
  return rootDir;
}

function capture(fn) {
  const chunks = [];
  const original = console.log;
  console.log = (text) => chunks.push(String(text));
  try {
    fn();
  } finally {
    console.log = original;
  }
  return chunks.join('\n');
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

// ── token 优化（AC-004）：task list 默认裁剪 + --all + --status ──
test('task list 默认按 taskListDefaultLimit 裁剪，--all 全量，--status 过滤', () => {
  const rootDir = repository();
  try {
    const config = { ...structuredClone(DEFAULT_CONFIG), output: { ...DEFAULT_CONFIG.output, taskListDefaultLimit: 2 } };
    startTask({ rootDir, config, title: 'A' });
    startTask({ rootDir, config, title: 'B' });
    startTask({ rootDir, config, title: 'C' });

    // 默认裁剪到 2 条 + 提示行
    const limited = capture(() => runTask({ rootDir, config, args: ['task', 'list'] }));
    const taskLines = limited.split('\n').filter(line => line.includes('TASK-'));
    assert.equal(taskLines.length, 2, `默认应只显示 2 条，实际:\n${limited}`);
    assert.match(limited, /显示最近 2 条/);
    assert.match(limited, /--all 查看全部/);

    // --all 全量
    const all = capture(() => runTask({ rootDir, config, args: ['task', 'list', '--all'] }));
    const allLines = all.split('\n').filter(line => line.includes('TASK-'));
    assert.equal(allLines.length, 3, `--all 应显示全部，实际:\n${all}`);
    assert.ok(!all.includes('显示最近'), '全量模式不出现裁剪提示');

    // --status 过滤
    const filtered = capture(() => runTask({ rootDir, config, args: ['task', 'list', '--status', 'planned', '--all'] }));
    const filteredLines = filtered.split('\n').filter(line => line.includes('TASK-'));
    assert.equal(filteredLines.length, 3, '全部为 planned 任务');
    assert.ok(filteredLines.every(line => line.includes('planned')), '仅含 planned');

    // --json 不受裁剪影响（全量）
    const jsonOut = capture(() => runTask({ rootDir, config, args: ['task', 'list', '--json'] }));
    const parsed = JSON.parse(jsonOut);
    assert.equal(parsed.length, 3, 'JSON 输出全量');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
