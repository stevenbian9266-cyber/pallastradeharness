import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { checkDesignArtifacts, checkBaselineSections, checkReuseMatrix, MACHINE_DESIGN_CHECKS } from './design-check.mjs';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), 'harness.mjs');
const TASK = 'TASK-DESIGN-TEST';
const GATE = 'GATE-DESIGN-TEST';

function run(rootDir, args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: rootDir, encoding: 'utf-8' });
}

function sampleProject() {
  return mkdtempSync(join(tmpdir(), 'harness-dchk-'));
}

const FULL_TECH = '## Part A — 现状识别\n### A1 业务系统盘点\n### A2 数据模型识别\n### A3 字段盘点\n### A4 代码结构\n## Part B — 复用决策矩阵\n| 能力需求 | 决策 | 目标 | 依据 |\n|---|---|---|---|\n| 日期格式化 | 调用已有 | formatDate | src/lib/date.ts:12 |\n';

function writeDesigns(rootDir, { withUi = true, withTech = true, techContent = FULL_TECH } = {}) {
  const dir = join(rootDir, 'docs', 'designs', TASK);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  if (withUi) writeFileSync(join(dir, 'ui.md'), '# UI\n');
  writeFileSync(join(dir, 'interaction.md'), '# Interaction\n');
  writeFileSync(join(dir, 'visual.md'), '# Visual\n');
  if (withTech) writeFileSync(join(dir, 'tech-design.md'), techContent);
}

function writeGate(rootDir, checkIds) {
  const dir = join(rootDir, 'harness', 'gates');
  mkdirSync(dir, { recursive: true });
  const gate = {
    schemaVersion: '2.0',
    id: GATE,
    taskType: 'feature',
    taskDescription: 'design check test',
    createdAt: new Date().toISOString(),
    branch: 'main',
    head: 'abcdef12',
    taskId: TASK,
    checks: checkIds.map(id => ({ id, label: id, phase: 'preparation', status: 'pending', completedAt: null })),
  };
  writeFileSync(join(dir, `${GATE}.json`), JSON.stringify(gate, null, 2));
}

// AC-001: checkDesignArtifacts 6 项判定
test('AC-001: checkDesignArtifacts 齐全 6 项 pass；缺失/缺节/缺矩阵 fail', () => {
  const rootDir = sampleProject();
  try {
    writeDesigns(rootDir);
    let r = checkDesignArtifacts({ rootDir, taskId: TASK });
    for (const id of MACHINE_DESIGN_CHECKS) assert.ok(r[id].pass, `${id} should pass: ${r[id].reason}`);
    // 缺 ui.md → create-ui-doc fail
    writeDesigns(rootDir, { withUi: false });
    r = checkDesignArtifacts({ rootDir, taskId: TASK });
    assert.equal(r['create-ui-doc'].pass, false);
    // 缺 Part A → baseline fail
    writeDesigns(rootDir, { techContent: '## Part B\n| a | 调用已有 | b | c |\n' });
    r = checkDesignArtifacts({ rootDir, taskId: TASK });
    assert.equal(r['tech-design-has-baseline'].pass, false);
    // 缺 Part B → reuse fail
    writeDesigns(rootDir, { techContent: '## Part A\n### A1 业务系统盘点\n### A2 数据模型识别\n### A3 字段盘点\n### A4 代码结构\n' });
    r = checkDesignArtifacts({ rootDir, taskId: TASK });
    assert.equal(r['tech-design-has-reuse-matrix'].pass, false);
    // 无 tech-design → 两个内容项 fail
    writeDesigns(rootDir, { withTech: false });
    r = checkDesignArtifacts({ rootDir, taskId: TASK });
    assert.equal(r['tech-design-has-baseline'].pass, false);
    assert.equal(r['tech-design-has-reuse-matrix'].pass, false);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// 纯函数：checkBaselineSections / checkReuseMatrix
test('checkBaselineSections / checkReuseMatrix 纯函数判定', () => {
  assert.equal(checkBaselineSections('### A1 x\n### A2 x\n### A3 x\n### A4 x\n').pass, true);
  assert.equal(checkBaselineSections('### A1 x\n### A2 x\n').pass, false);
  assert.equal(checkReuseMatrix('| a | 调用已有 | b | c |').pass, true);
  assert.equal(checkReuseMatrix('| a | b | c |').pass, false);
  assert.equal(MACHINE_DESIGN_CHECKS.length, 6);
  assert.ok(!MACHINE_DESIGN_CHECKS.includes('design-confirmed'), 'design-confirmed 保持人工');
});

// AC-002: CLI design:check --task 输出 6 项；有 fail 时 exit 1
test('AC-002: CLI design:check --task 齐全 exit 0 / 缺失 exit 1', () => {
  const rootDir = sampleProject();
  try {
    writeDesigns(rootDir);
    let r = run(rootDir, ['design:check', '--task', TASK]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /create-ui-doc/);
    assert.match(r.stdout, /tech-design-has-baseline/);
    // 缺 ui.md → exit 1
    rmSync(join(rootDir, 'docs', 'designs', TASK, 'ui.md'));
    r = run(rootDir, ['design:check', '--task', TASK]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// AC-003: gate:clear 对 6 个设计检查项拦截——缺失拒绝，齐全通过
test('AC-003: gate:clear 设计检查项机器拦截', () => {
  const rootDir = sampleProject();
  try {
    writeGate(rootDir, ['create-ui-doc', 'tech-design-has-baseline', 'design-confirmed']);
    writeDesigns(rootDir);
    // 齐全 → clear 成功（gate 未全 clear 时 exit 1 是正常语义，断言 gate 文件状态）
    let r = run(rootDir, ['gate:clear', '--gate', GATE, '--clear', 'create-ui-doc']);
    let gate = JSON.parse(readFileSync(join(rootDir, 'harness', 'gates', `${GATE}.json`), 'utf-8'));
    const uiCheck = gate.checks.find(c => c.id === 'create-ui-doc');
    assert.equal(uiCheck.status, 'done', r.stdout + r.stderr);
    assert.match(uiCheck.note || '', /machine-verified/);
    // 缺 ui.md → 拒绝（check 保持 pending）
    rmSync(join(rootDir, 'docs', 'designs', TASK, 'ui.md'));
    r = run(rootDir, ['gate:clear', '--gate', GATE, '--clear', 'create-ui-doc']);
    assert.match(r.stdout, /machine check failed/);
    gate = JSON.parse(readFileSync(join(rootDir, 'harness', 'gates', `${GATE}.json`), 'utf-8'));
    assert.equal(gate.checks.find(c => c.id === 'create-ui-doc').status, 'done', '失败拦截不应回滚已通过项，但不应影响本项判定');
    // 缺 Part A → 拒绝（重新构造 gate：用新 check 项测试）
    writeGate(rootDir, ['tech-design-has-baseline', 'design-confirmed']);
    writeDesigns(rootDir, { techContent: '## Part B\n| a | 调用已有 | b | c |\n' });
    r = run(rootDir, ['gate:clear', '--gate', GATE, '--clear', 'tech-design-has-baseline']);
    assert.match(r.stdout, /machine check failed/);
    gate = JSON.parse(readFileSync(join(rootDir, 'harness', 'gates', `${GATE}.json`), 'utf-8'));
    assert.equal(gate.checks.find(c => c.id === 'tech-design-has-baseline').status, 'pending');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// AC-004: design-confirmed 不受拦截（无设计文档也可人工 clear）
test('AC-004: design-confirmed 人工 clear 不受拦截', () => {
  const rootDir = sampleProject();
  try {
    writeGate(rootDir, ['design-confirmed']);
    // 不写任何设计文档
    const r = run(rootDir, ['gate:clear', '--gate', GATE, '--clear', 'design-confirmed']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// AC-005: 无 taskId 扫描全部任务目录，任一 fail → exit 1
test('AC-005: design:check 无 taskId 扫描全部任务', () => {
  const rootDir = sampleProject();
  try {
    writeDesigns(rootDir);
    // 第二个任务缺 ui.md
    const dir2 = join(rootDir, 'docs', 'designs', 'TASK-OTHER');
    mkdirSync(dir2, { recursive: true });
    writeFileSync(join(dir2, 'tech-design.md'), FULL_TECH);
    const r = run(rootDir, ['design:check']);
    assert.equal(r.status, 1, r.stdout + r.stderr);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
