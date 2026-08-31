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

test('next returns machine-readable JSON; gate --lite skips PRD checks (HTH-013/014)', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-cli-next-'));
  try {
    assert.equal(run(rootDir, ['init', '--preset', 'single', '--tier', 'lite', '--name', 'e2e']).status, 0);
    git(rootDir, ['init', '-b', 'main']);
    git(rootDir, ['config', 'user.email', 'harness@example.test']);
    git(rootDir, ['config', 'user.name', 'Harness Test']);
    git(rootDir, ['add', '.']);
    git(rootDir, ['commit', '-m', 'init']);

    // 无任务：next --json 返回稳定 no-task 结构
    const next1 = run(rootDir, ['next', '--json']);
    assert.equal(next1.status, 0, next1.stderr);
    const parsed1 = JSON.parse(next1.stdout);
    assert.equal(parsed1.phase, 'no-task');
    assert.ok(Array.isArray(parsed1.commands) && parsed1.commands.length > 0);
    assert.equal(typeof parsed1.humanDecisionRequired, 'boolean');

    // 创建任务后：next 返回 no-gate
    const started = run(rootDir, ['task', 'start', '--title', '优化：Fix x', '--allow', 'src/**', '--json']);
    assert.equal(started.status, 0, started.stderr);
    const taskId = JSON.parse(started.stdout).id;
    const next2 = run(rootDir, ['next', '--json']);
    assert.equal(JSON.parse(next2.stdout).phase, 'no-gate');

    // gate --lite：feature 类型但不含 PRD 检查（真 Lite）
    const opened = run(rootDir, ['gate', '--task', '优化：Fix x', '--task-id', taskId, '--lite']);
    assert.equal(opened.status, 1);
    const gateFile = readdirSync(join(rootDir, 'harness', 'gates')).find(f => f.endsWith('.json'));
    const gate = JSON.parse(readFileSync(join(rootDir, 'harness', 'gates', gateFile), 'utf-8'));
    const checkIds = gate.checks.map(check => check.id);
    assert.ok(!checkIds.includes('create-prd-doc'), 'lite gate must not include PRD checks');
    assert.ok(!checkIds.includes('user-confirmed'), 'lite gate must not include user-confirmed');

    // next 现在指向 preparation（列出待 clear 项）
    const next3 = run(rootDir, ['next', '--json']);
    assert.equal(JSON.parse(next3.stdout).phase, 'preparation');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('setup --dry-run lists files; doctor covers protection layers (HTH-012/015)', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-cli-setup-'));
  try {
    const dry = run(rootDir, ['setup', '--dry-run', '--preset', 'single', '--tier', 'lite']);
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /CREATE harness.config.mjs/);
    assert.match(dry.stdout, /GitHub/);
    assert.match(dry.stdout, /撤销/);

    assert.equal(run(rootDir, ['init', '--preset', 'single', '--tier', 'lite', '--name', 'e2e']).status, 0);
    const doctor = run(rootDir, ['doctor', '--format', 'json']);
    // doctor 可能因保护覆盖 fail（fresh 项目无 git hook/CI）返回非 0——预期行为（警告不计入通过）
    const report = JSON.parse(doctor.stdout);
    const names = report.results.map(r => r.name);
    assert.ok(names.includes('git-hook-installed'), `doctor must include git-hook-installed, got: ${names.join(',')}`);
    assert.ok(names.includes('ci-workflow'), 'doctor must include ci-workflow');
    assert.ok(names.includes('verifiers'), 'doctor must include verifiers');
    // 全新项目未装 git hook → fail（不把警告计入全部通过）
    const gitHook = report.results.find(r => r.name === 'git-hook-installed');
    assert.equal(gitHook.pass, false, 'fresh project has no git hook');
    const verifiers = report.results.find(r => r.name === 'verifiers');
    assert.equal(verifiers.pass, true, 'default config ships unit/docs verifiers');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// ── token 优化（AC-001/AC-002/AC-003）：gate --quiet / gate:status --short / gate:clear 精简 ──
test('gate --quiet omits check list but writes gate file; gate:status --short single line', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-cli-quiet-'));
  try {
    assert.equal(run(rootDir, ['init', '--preset', 'single', '--tier', 'lite', '--name', 'e2e']).status, 0);
    git(rootDir, ['init', '-b', 'main']);
    git(rootDir, ['config', 'user.email', 'harness@example.test']);
    git(rootDir, ['config', 'user.name', 'Harness Test']);
    git(rootDir, ['add', '.']);
    git(rootDir, ['commit', '-m', 'init']);

    const started = run(rootDir, ['task', 'start', '--title', '文档：Quiet gate', '--allow', 'README.md', '--json']);
    assert.equal(started.status, 0, started.stderr);
    const taskId = JSON.parse(started.stdout).id;

    const opened = run(rootDir, ['gate', '--task', '文档：Quiet gate', '--task-id', taskId, '--quiet']);
    assert.equal(opened.status, 1);
    assert.ok(!opened.stdout.includes('[ ]'), '--quiet 不输出逐条 check 列表');
    assert.match(opened.stdout, /checks \(/);

    // gate 文件仍写入且包含完整 check 列表（约束不减）
    const gateFile = readdirSync(join(rootDir, 'harness', 'gates')).find(file => file.endsWith('.json'));
    assert.ok(gateFile, 'gate file written');
    const gate = JSON.parse(readFileSync(join(rootDir, 'harness', 'gates', gateFile), 'utf-8'));
    assert.ok(gate.checks.length > 0, 'gate checks persisted');

    // gate:status --short：单行 + 退出码语义不变（PREPARATION 未清 → exit 1）
    const short = run(rootDir, ['gate:status', '--short']);
    assert.equal(short.status, 1);
    const lines = short.stdout.trim().split('\n');
    assert.equal(lines.length, 1, `--short 应单行输出，实际:\n${short.stdout}`);
    assert.match(short.stdout, /\| PREPARATION \| remaining=\d+/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// ── token 优化（AC-003）：gate:clear 回显精简（不重复 check 描述）──
test('gate:clear 回显精简：无 label 重复，含计数与剩余 id', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-cli-clear-'));
  try {
    assert.equal(run(rootDir, ['init', '--preset', 'single', '--tier', 'lite', '--name', 'e2e']).status, 0);
    git(rootDir, ['init', '-b', 'main']);
    git(rootDir, ['config', 'user.email', 'harness@example.test']);
    git(rootDir, ['config', 'user.name', 'Harness Test']);
    git(rootDir, ['add', '.']);
    git(rootDir, ['commit', '-m', 'init']);

    const started = run(rootDir, ['task', 'start', '--title', '文档：Clear echo', '--allow', 'README.md', '--json']);
    assert.equal(started.status, 0, started.stderr);
    const taskId = JSON.parse(started.stdout).id;
    run(rootDir, ['gate', '--task', '文档：Clear echo', '--task-id', taskId, '--quiet']);
    const gateFile = readdirSync(join(rootDir, 'harness', 'gates')).find(file => file.endsWith('.json'));
    const gate = JSON.parse(readFileSync(join(rootDir, 'harness', 'gates', gateFile), 'utf-8'));

    const first = gate.checks.find(c => c.id === 'search-app' || c.id === 'search-bin') || gate.checks[0];
    const cleared = run(rootDir, ['gate:clear', '--gate', gate.id, '--clear', first.id]);
    // 单项清除后 gate 未全清 → exit 1（正常语义）；回显仍应精简
    assert.match(cleared.stdout, /✅ .* — \d+\/\d+ checks cleared/);
    // 不重复输出 check label（描述）
    assert.ok(!cleared.stdout.includes(first.label), '回显不应重复 check 描述 label');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
