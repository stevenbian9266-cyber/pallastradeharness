import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), 'harness.mjs');

function run(rootDir, args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: rootDir, encoding: 'utf-8' });
}

function git(rootDir, args) {
  return execFileSync('git', args, { cwd: rootDir, encoding: 'utf-8' });
}

test('init -> task start -> phased gate -> verify -> finish lifecycle', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-cli-'));
  try {
    assert.equal(run(rootDir, ['init', '--preset', 'single', '--tier', 'lite', '--name', 'e2e']).status, 0);
    git(rootDir, ['init', '-b', 'main']);
    git(rootDir, ['config', 'user.email', 'harness@example.test']);
    git(rootDir, ['config', 'user.name', 'Harness Test']);
    mkdirSync(join(rootDir, 'src'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'ok.test.mjs'), "import { test } from 'node:test'; test('ok', () => {});\n");
    git(rootDir, ['add', '.']);
    git(rootDir, ['commit', '-m', 'init']);
    const taskScopedSync = run(rootDir, ['sync-check', '--base', 'HEAD']);
    assert.equal(taskScopedSync.status, 0, taskScopedSync.stderr);

    const started = run(rootDir, ['task', 'start', '--title', '文档：Document the project', '--allow', 'docs/**', '--json']);
    assert.equal(started.status, 0, started.stderr);
    const taskId = JSON.parse(started.stdout).id;

    const opened = run(rootDir, ['gate', '--task', '文档：Document the project', '--task-id', taskId]);
    assert.equal(opened.status, 1);
    const gateFile = readdirSync(join(rootDir, 'harness', 'gates')).find(file => file.endsWith('.json'));
    const gate = JSON.parse(readFileSync(join(rootDir, 'harness', 'gates', gateFile), 'utf-8'));
    const gateId = gate.id;

    for (const check of gate.checks) {
      if (check.phase === 'preparation' && check.status !== 'done') {
        run(rootDir, ['gate:clear', '--gate', gateId, '--clear', check.id]);
      }
    }
    assert.equal(run(rootDir, ['gate:status']).status, 0);
    assert.equal(run(rootDir, ['gate:required']).status, 1, 'commit gate stays blocked before verification');

    const ev = run(rootDir, ['evidence', 'run', '--task', taskId, '--type', 'test', '--verifier', 'unit']);
    assert.equal(ev.status, 0, ev.stderr);
    run(rootDir, ['evidence', 'record', '--task', taskId, '--type', 'review', '--summary', 'docs reviewed', '--approve']);
    run(rootDir, ['evidence', 'record', '--task', taskId, '--type', 'knowledge', '--summary', 'knowledge assessed', '--approve']);
    const verified = run(rootDir, ['evidence', 'verify', '--task', taskId, '--gate', gateId]);
    assert.equal(verified.status, 0, verified.stdout);
    assert.equal(run(rootDir, ['gate:required']).status, 0);

    // task finish 必须在 HEAD 移动（提交）之前完成——否则证据因 HEAD 变化而 stale
    const finished = run(rootDir, ['task', 'finish', '--task', taskId]);
    assert.equal(finished.status, 0, `finish failed: ${finished.stdout} | ${finished.stderr}`);

    writeFileSync(join(rootDir, 'after-gate.txt'), 'new commit\n');
    git(rootDir, ['add', 'after-gate.txt']);
    git(rootDir, ['commit', '-m', 'move head']);
    assert.equal(run(rootDir, ['gate:required']).status, 1, 'a cleared gate cannot be reused after HEAD moves');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('gate:required blocks commit when staged tree changes after verification (INV-01)', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-cli-snap-'));
  try {
    assert.equal(run(rootDir, ['init', '--preset', 'single', '--tier', 'lite', '--name', 'e2e']).status, 0);
    git(rootDir, ['init', '-b', 'main']);
    git(rootDir, ['config', 'user.email', 'harness@example.test']);
    git(rootDir, ['config', 'user.name', 'Harness Test']);
    mkdirSync(join(rootDir, 'src'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'x.txt'), 'v1\n');
    // unit verifier（node --test **/*.test.mjs）需要可运行的测试文件
    writeFileSync(join(rootDir, 'src', 'ok.test.mjs'), "import { test } from 'node:test'; test('ok', () => {});\n");
    git(rootDir, ['add', '.']);
    git(rootDir, ['commit', '-m', 'init']);

    // task start 持久化 task 状态（supervise plan 只产生 plan，不写 task 文件）
    const started = run(rootDir, ['task', 'start', '--title', '修复：Fix a bug', '--allow', 'src/**', '--json']);
    assert.equal(started.status, 0, started.stderr);
    const taskId = JSON.parse(started.stdout).id;

    const opened = run(rootDir, ['gate', '--task', '修复：Fix a bug', '--task-id', taskId]);
    assert.equal(opened.status, 1);
    const gateFile = readdirSync(join(rootDir, 'harness', 'gates')).find(file => file.endsWith('.json'));
    const gate = JSON.parse(readFileSync(join(rootDir, 'harness', 'gates', gateFile), 'utf-8'));
    for (const check of gate.checks) {
      if (check.phase === 'preparation' && check.status !== 'done') {
        run(rootDir, ['gate:clear', '--gate', gate.id, '--clear', check.id]);
      }
    }

    // 记录含 ChangeSnapshot 的受信测试证据（verifier 注册命令）+ review/knowledge（approved）
    // task-bound gate 的 verify-test 只能由 evidence verify 关闭
    const ev = run(rootDir, ['evidence', 'run', '--task', taskId, '--type', 'test', '--verifier', 'unit']);
    assert.equal(ev.status, 0, ev.stderr);
    run(rootDir, ['evidence', 'record', '--task', taskId, '--type', 'review', '--summary', 'docs reviewed', '--approve']);
    run(rootDir, ['evidence', 'record', '--task', taskId, '--type', 'knowledge', '--summary', 'knowledge assessed', '--approve']);
    const verified = run(rootDir, ['evidence', 'verify', '--task', taskId, '--gate', gate.id]);
    assert.equal(verified.status, 0, verified.stdout);

    assert.equal(run(rootDir, ['gate:required']).status, 0, 'gate passes while staged tree matches verified snapshot');

    // 验证后修改并暂存 → staged tree 变化 → 阻止提交（INV-01）
    writeFileSync(join(rootDir, 'src', 'x.txt'), 'v2\n');
    git(rootDir, ['add', 'src/x.txt']);
    const blocked = run(rootDir, ['gate:required']);
    assert.equal(blocked.status, 1, 'staged tree change after verification must block commit');
    assert.match(blocked.stdout, /staged tree changed/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('CLI exit code and JSON output contracts are machine-readable', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-cli-contract-'));
  try {
    const unknown = run(rootDir, ['does-not-exist']);
    assert.equal(unknown.status, 2);
    const coverage = run(rootDir, ['standards', 'coverage', '--json']);
    assert.equal(coverage.status, 0, coverage.stderr);
    assert.ok(JSON.parse(coverage.stdout).machineEnforced > 0);
    const evalCheck = run(rootDir, ['eval-llm', '--check']);
    assert.equal(evalCheck.status, 1);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('task-bound gate closes only through fresh typed evidence', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-cli-task-evidence-'));
  try {
    assert.equal(run(rootDir, ['init', '--preset', 'single', '--tier', 'lite', '--name', 'lifecycle']).status, 0);
    git(rootDir, ['init', '-b', 'main']);
    git(rootDir, ['config', 'user.email', 'harness@example.test']);
    git(rootDir, ['config', 'user.name', 'Harness Test']);
    mkdirSync(join(rootDir, 'src'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'ok.test.mjs'), "import { test } from 'node:test'; test('ok', () => {});\n");
    git(rootDir, ['add', '.']);
    git(rootDir, ['commit', '-m', 'init']);

    const started = run(rootDir, ['task', 'start', '--title', 'Copy text', '--allow', 'README.md', '--json']);
    assert.equal(started.status, 0, started.stderr);
    const taskId = JSON.parse(started.stdout).id;
    const opened = run(rootDir, ['gate', '--task', 'Copy text', '--type', 'docs', '--task-id', taskId]);
    assert.equal(opened.status, 1);
    const gateFile = readdirSync(join(rootDir, 'harness', 'gates')).find(file => file.endsWith('.json'));
    const gateId = JSON.parse(readFileSync(join(rootDir, 'harness', 'gates', gateFile), 'utf-8')).id;

    assert.equal(run(rootDir, ['gate:clear', '--gate', gateId, '--clear', 'search-app']).status, 1);
    assert.equal(run(rootDir, ['gate:clear', '--gate', gateId, '--clear', 'search-test']).status, 0);
    const manual = run(rootDir, ['gate:clear', '--gate', gateId, '--clear', 'verify-test', '--note', 'claimed']);
    assert.equal(manual.status, 1);
    assert.match(manual.stderr + manual.stdout, /evidence verify/i);

    writeFileSync(join(rootDir, 'README.md'), '# Verified lifecycle\n');
    const evidence = run(rootDir, ['evidence', 'run', '--task', taskId, '--type', 'test', '--verifier', 'unit']);
    assert.equal(evidence.status, 0, evidence.stderr);
    const verified = run(rootDir, ['evidence', 'verify', '--task', taskId, '--gate', gateId]);
    assert.equal(verified.status, 0, verified.stderr);
    assert.match(verified.stdout, /gate .* finished/i);
    const finished = run(rootDir, ['task', 'finish', '--task', taskId]);
    assert.equal(finished.status, 0, finished.stderr);
    assert.match(finished.stdout, /completed with verified evidence/i);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('gate requires a Task by default; taskless gate cannot clear verify-test (INV-03)', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-cli-taskless-'));
  try {
    assert.equal(run(rootDir, ['init', '--preset', 'single', '--tier', 'lite', '--name', 'e2e']).status, 0);
    git(rootDir, ['init', '-b', 'main']);
    git(rootDir, ['config', 'user.email', 'harness@example.test']);
    git(rootDir, ['config', 'user.name', 'Harness Test']);
    git(rootDir, ['add', '.']);
    git(rootDir, ['commit', '-m', 'init']);

    // 无活动 task → gate 拒绝创建（INV-03）
    const rejected = run(rootDir, ['gate', '--task', '文档：Write docs']);
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr + rejected.stdout, /No active task found/);

    // legacy.allowTasklessGate=true → 允许创建 taskless gate（弃用路径）
    writeFileSync(join(rootDir, 'harness.config.mjs'), "export default { legacy: { allowTasklessGate: true } };\n");
    git(rootDir, ['add', '.']);
    git(rootDir, ['commit', '-m', 'enable taskless legacy']);
    const opened = run(rootDir, ['gate', '--task', '文档：Write docs', '--type', 'docs']);
    assert.equal(opened.status, 1);
    const gateFile = readdirSync(join(rootDir, 'harness', 'gates')).find(f => f.endsWith('.json'));
    const gate = JSON.parse(readFileSync(join(rootDir, 'harness', 'gates', gateFile), 'utf-8'));
    assert.equal(gate.taskId, null);

    // taskless gate 的 verify-test 不可手工 clear（证据控制）
    const manual = run(rootDir, ['gate:clear', '--gate', gate.id, '--clear', 'verify-test', '--note', 'x']);
    assert.equal(manual.status, 1);
    assert.match(manual.stdout, /TASKLESS gate/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
