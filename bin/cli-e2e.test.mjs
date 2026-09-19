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

// ────────────────────────────────────────────────────────────────
// strict 严格治理 self-dogfood（Batch E / E01）
// ────────────────────────────────────────────────────────────────

const DOGFOOD_REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 临时项目：仅声明 strict 开关，其余配置走 DEFAULT_CONFIG 深合并。 */
function strictDogfoodProject({ strict }) {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-strict-'));
  const governance = strict ? ",\n  governance: { strictGovernance: true }" : '';
  writeFileSync(join(rootDir, 'harness.config.mjs'), `export default {\n  schemaVersion: '1.0',\n  name: 'strict-e2e'${governance}\n};\n`);
  git(rootDir, ['init', '-b', 'main']);
  git(rootDir, ['config', 'user.email', 'harness@example.test']);
  git(rootDir, ['config', 'user.name', 'Harness Test']);
  mkdirSync(join(rootDir, 'src'), { recursive: true });
  writeFileSync(join(rootDir, 'src', 'ok.test.mjs'), "import { test } from 'node:test'; test('ok', () => {});\n");
  git(rootDir, ['add', '.']);
  git(rootDir, ['commit', '-m', 'init']);
  return rootDir;
}

/** 建任务 + 开门 + 清准备项（返回 { taskId, gateId }）。
 *  risk 默认 standard（与仓库任务一致）；quick 路径由死锁回归用例覆盖。
 */
function startDogfoodTask(rootDir, title, { risk = 'standard' } = {}) {
  const started = run(rootDir, ['task', 'start', '--title', title, '--allow', 'src/**', '--risk', risk, '--json']);
  assert.equal(started.status, 0, `task start failed: ${started.stderr}`);
  const taskId = JSON.parse(started.stdout).id;
  assert.equal(run(rootDir, ['gate', '--task', title, '--task-id', taskId, '--quiet']).status, 1);
  const gateFile = readdirSync(join(rootDir, 'harness', 'gates')).find(file => file.endsWith('.json'));
  const gate = JSON.parse(readFileSync(join(rootDir, 'harness', 'gates', gateFile), 'utf-8'));
  for (const check of gate.checks) {
    if (check.phase === 'preparation' && check.status !== 'done') {
      run(rootDir, ['gate:clear', '--gate', gate.id, '--clear', check.id]);
    }
  }
  return { taskId, gateId: gate.id };
}

/** 读取任务状态文件。 */
function readDogfoodTask(rootDir, taskId) {
  return JSON.parse(readFileSync(join(rootDir, '.harness-state', 'tasks', `${taskId}.json`), 'utf-8'));
}

/** 补齐 strict 收尾所需事实：Context + Impact + 真实证据链。 */
function satisfyDogfoodFacts(rootDir, { taskId, gateId }) {
  assert.equal(run(rootDir, ['brain', 'context', '--task', taskId]).status, 0);
  assert.equal(run(rootDir, ['task', 'impact', '--task', taskId, '--architecture', 'LOCAL', '--tech-stack', 'NONE', '--reason', 'e2e dogfood']).status, 0);
  assert.equal(run(rootDir, ['evidence', 'run', '--task', taskId, '--type', 'test', '--verifier', 'unit']).status, 0);
  run(rootDir, ['evidence', 'record', '--task', taskId, '--type', 'review', '--summary', 'reviewed', '--approve']);
  run(rootDir, ['evidence', 'record', '--task', taskId, '--type', 'knowledge', '--summary', 'knowledge assessed', '--approve']);
  const verified = run(rootDir, ['evidence', 'verify', '--task', taskId, '--gate', gateId]);
  assert.equal(verified.status, 0, `evidence verify failed: ${verified.stdout}`);
}

test('PRD-20260919-other-strict-dogfood AC-001/AC-006: 本仓声明严格治理（防回退守卫）且生命周期含 task impact', () => {
  const config = readFileSync(join(DOGFOOD_REPO_ROOT, 'harness.config.mjs'), 'utf-8');
  assert.match(config, /governance:\s*\{[\s\S]*?strictGovernance:\s*true/, '本仓 harness.config.mjs 必须声明 governance.strictGovernance: true');
  const agents = readFileSync(join(DOGFOOD_REPO_ROOT, 'AGENTS.md'), 'utf-8');
  assert.ok(agents.includes('task impact'), 'AGENTS.md 生命周期必须包含 task impact 步骤（strict 收尾必需事实）');
  assert.ok(agents.includes('严格治理'), 'AGENTS.md 必须说明严格治理语义');
});

test('PRD-20260919-other-strict-dogfood AC-002/AC-003/AC-004: strict 缺事实被阻断 → 补齐事实后放行', () => {
  const rootDir = strictDogfoodProject({ strict: true });
  try {
    const { taskId, gateId } = startDogfoodTask(rootDir, '修复：strict dogfood task');
    const statusBefore = readDogfoodTask(rootDir, taskId).status;

    const blocked = run(rootDir, ['task', 'finish', '--task', taskId]);
    const out = `${blocked.stdout}${blocked.stderr}`;
    assert.equal(blocked.status, 1, 'strict 必须阻断缺事实的收尾');
    assert.match(out, /Strict finish blocked/);
    assert.match(out, /REQUIRED_ACTIONS/);
    for (const id of ['context_audit', 'architecture_impact', 'tech_stack_impact', 'review', 'knowledge']) {
      assert.ok(out.includes(`[${id}]`), `REQUIRED_ACTIONS 应包含 ${id}`);
    }
    assert.ok(!out.includes('[requirement_approval]'), '修复类任务无 PRD → 不要求 Requirement Approval（事实门按需推导）');
    assert.equal(readDogfoodTask(rootDir, taskId).status, statusBefore, '阻断不得改变任务状态');

    const noDecision = run(rootDir, ['task', 'impact', '--task', taskId, '--architecture', 'ARCHITECTURE_CHANGE', '--tech-stack', 'NONE']);
    assert.equal(noDecision.status, 1, 'ARCHITECTURE_CHANGE 缺 Decision 必须被拒');

    satisfyDogfoodFacts(rootDir, { taskId, gateId });
    assert.equal(readDogfoodTask(rootDir, taskId).impact.architecture, 'LOCAL');

    const finished = run(rootDir, ['task', 'finish', '--task', taskId]);
    assert.equal(finished.status, 0, `strict 事实齐备后必须放行：${finished.stdout}${finished.stderr}`);
    assert.match(finished.stdout, /completed with verified evidence/);
    assert.equal(readDogfoodTask(rootDir, taskId).status, 'completed');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('PRD-20260919-other-strict-dogfood AC-005: 未声明 strict 的项目走兼容路径（无 strict 阻断）', () => {  const rootDir = strictDogfoodProject({ strict: false });
  try {
    const { taskId } = startDogfoodTask(rootDir, '修复：compat path task');
    const finished = run(rootDir, ['task', 'finish', '--task', taskId]);
    const out = `${finished.stdout}${finished.stderr}`;
    assert.equal(finished.status, 1, '证据缺失仍不得收尾');
    assert.ok(!out.includes('Strict finish blocked'), '非 strict 不得出现 strict 阻断');
    assert.match(out, /Task cannot finish/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('strict 收尾死锁回归（E02）：quick 风险任务补齐事实后可收尾', () => {
  const rootDir = strictDogfoodProject({ strict: true });
  try {
    const { taskId, gateId } = startDogfoodTask(rootDir, '修复：quick strict task', { risk: 'quick' });
    assert.equal(readDogfoodTask(rootDir, taskId).riskLevel, 'quick');
    satisfyDogfoodFacts(rootDir, { taskId, gateId });

    const finished = run(rootDir, ['task', 'finish', '--task', taskId]);
    assert.equal(finished.status, 0, `quick 任务在 strict 下必须可收尾：${finished.stdout}${finished.stderr}`);
    assert.equal(readDogfoodTask(rootDir, taskId).status, 'completed');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
