/**
 * fact-gates.test.mjs — 事实驱动 Gate + Strict Finish（Batch C / C12 / C14 / AC-008 / AC-010）
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { statePaths, saveTask } from './state-store.mjs';
import { recordApproval, requirementApprovalFiles, designApprovalFiles } from './approvals.mjs';
import { deriveGateFacts, evaluateStrictFinish, strictGovernanceEnabled } from './fact-gates.mjs';
import { recordEvidence } from './evidence.mjs';

const CONFIG = structuredClone(DEFAULT_CONFIG);
const CONFIG_STRICT = { ...structuredClone(DEFAULT_CONFIG), strictGovernance: true };

function project() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-facts-'));
  writeFileSync(join(rootDir, 'README.md'), '# project\n');
  execFileSync('git', ['init', '-b', 'main'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.email', 'harness@example.test'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'Harness Test'], { cwd: rootDir });
  execFileSync('git', ['add', '.'], { cwd: rootDir });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: rootDir });
  return rootDir;
}

function baseTask(overrides = {}) {
  return {
    id: 'TASK-C1',
    title: '新增：C 功能',
    status: 'implementing',
    risk: { level: 'standard' },
    riskLevel: 'standard',
    changePlan: { allow: ['src/**'], deny: [], standards: [], requiredEvidence: ['test', 'review', 'knowledge'] },
    evidence: [],
    decisions: [],
    linkedPrd: null,
    contextPack: null,
    ...overrides,
  };
}

function writeContext(rootDir) {
  mkdirSync(statePaths(rootDir, CONFIG).brain, { recursive: true });
  writeFileSync(join(statePaths(rootDir, CONFIG).brain, 'context-TASK-C1.json'), JSON.stringify({ id: 'CTX-1' }));
}

test('AC-008: 事实门默认状态（无审批 / 有 plan / 无证据）', () => {
  const rootDir = project();
  try {
    const facts = deriveGateFacts({ rootDir, config: CONFIG, task: baseTask() });
    assert.equal(facts.REQUIREMENT_APPROVED.required, true);
    assert.equal(facts.REQUIREMENT_APPROVED.ok, false);
    assert.equal(facts.UI_APPROVED.required, false, '无设计产物 → 不要求 UI 审批');
    assert.equal(facts.PLAN_READY.ok, true);
    assert.equal(facts.TESTS_PASS.ok, false);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('AC-008: 有效审批使 REQUIREMENT_APPROVED / UI_APPROVED 转 ok', () => {
  const rootDir = project();
  try {
    mkdirSync(join(rootDir, 'docs/prd/other'), { recursive: true });
    mkdirSync(join(rootDir, 'harness/requirements'), { recursive: true });
    mkdirSync(join(rootDir, 'docs/designs/TASK-C1'), { recursive: true });
    writeFileSync(join(rootDir, 'docs/prd/other/PRD-20260919-x.md'), '# PRD\n');
    writeFileSync(join(rootDir, 'harness/requirements/REQ-x.md'), '> Task: TASK-C1\n');
    writeFileSync(join(rootDir, 'docs/designs/TASK-C1/ui.md'), '# UI\n');
    const task = baseTask({ linkedPrd: 'PRD-20260919-x' });
    recordApproval({
      rootDir, config: CONFIG, taskId: task.id, type: 'requirement',
      files: requirementApprovalFiles({ rootDir, config: CONFIG, task }),
    });
    recordApproval({
      rootDir, config: CONFIG, taskId: task.id, type: 'ui',
      files: designApprovalFiles({ rootDir, config: CONFIG, task }),
    });
    const facts = deriveGateFacts({ rootDir, config: CONFIG, task });
    assert.equal(facts.REQUIREMENT_APPROVED.ok, true);
    assert.equal(facts.UI_APPROVED.required, true);
    assert.equal(facts.UI_APPROVED.ok, true);
    // 制品变化 → 审批失效 → 事实回落
    writeFileSync(join(rootDir, 'docs/designs/TASK-C1/ui.md'), '# UI v2\n');
    assert.equal(deriveGateFacts({ rootDir, config: CONFIG, task }).UI_APPROVED.ok, false);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('AC-010: strict 收尾列出 REQUIRED_ACTIONS（缺什么就报什么）', () => {
  const rootDir = project();
  try {
    const result = evaluateStrictFinish({ rootDir, config: CONFIG_STRICT, task: baseTask() });
    assert.equal(result.ok, false);
    const ids = result.missing.map(item => item.id);
    for (const expected of ['context_audit', 'requirement_approval', 'architecture_impact', 'tech_stack_impact', 'review', 'required_tests', 'fresh_evidence', 'knowledge']) {
      assert.ok(ids.includes(expected), `missing ${expected} (got ${ids.join(', ')})`);
    }
    for (const item of result.missing) {
      assert.ok(typeof item.label === 'string' && item.label.length > 0);
      assert.ok(typeof item.action === 'string' && item.action.length > 0, `action required for ${item.id}`);
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('AC-010: 补齐事实后对应缺项消失（只留证据类缺项）', () => {
  const rootDir = project();
  try {
    mkdirSync(join(rootDir, 'docs/prd/other'), { recursive: true });
    mkdirSync(join(rootDir, 'harness/requirements'), { recursive: true });
    mkdirSync(join(rootDir, 'docs/designs/TASK-C1'), { recursive: true });
    writeFileSync(join(rootDir, 'docs/prd/other/PRD-20260919-x.md'), '# PRD\n');
    writeFileSync(join(rootDir, 'harness/requirements/REQ-x.md'), '> Task: TASK-C1\n');
    writeFileSync(join(rootDir, 'docs/designs/TASK-C1/ui.md'), '# UI\n');
    const task = baseTask({
      linkedPrd: 'PRD-20260919-x',
      impact: { architecture: 'LOCAL', techStack: 'NONE', reason: '新增模块内改动' },
    });
    recordApproval({ rootDir, config: CONFIG, taskId: task.id, type: 'requirement', files: requirementApprovalFiles({ rootDir, config: CONFIG, task }) });
    recordApproval({ rootDir, config: CONFIG, taskId: task.id, type: 'ui', files: designApprovalFiles({ rootDir, config: CONFIG, task }) });
    writeContext(rootDir);
    const result = evaluateStrictFinish({ rootDir, config: CONFIG_STRICT, task });
    const ids = result.missing.map(item => item.id);
    for (const gone of ['context_audit', 'requirement_approval', 'architecture_impact', 'tech_stack_impact', 'ui_approval']) {
      assert.ok(!ids.includes(gone), `${gone} should be satisfied (got ${ids.join(', ')})`);
    }
    for (const remain of ['review', 'required_tests', 'fresh_evidence', 'knowledge']) {
      assert.ok(ids.includes(remain), `${remain} should remain missing`);
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('AC-010: strictGovernance 开关语义（默认关、两种开启写法）', () => {
  assert.equal(strictGovernanceEnabled({}), false);
  assert.equal(strictGovernanceEnabled(undefined), false);
  assert.equal(strictGovernanceEnabled({ strictGovernance: true }), true);
  assert.equal(strictGovernanceEnabled({ governance: { strictGovernance: true } }), true);
  assert.equal(strictGovernanceEnabled({ strictGovernance: false, governance: { strictGovernance: true } }), true, 'governance 命名空间优先一致开启');
});

test('AC-001: quick 任务补齐 review/knowledge 证据后 strict 不再要求（收尾死锁回归）', () => {
  const rootDir = project();
  try {
    // quick：任务自身 requiredEvidence 只有 test → satisfied 永远不会包含 review/knowledge
    const task = baseTask({
      riskLevel: 'quick',
      risk: { level: 'quick', requiredEvidence: ['test'] },
      changePlan: { allow: ['src/**'], deny: [], standards: [], requiredEvidence: ['test'] },
    });
    const before = evaluateStrictFinish({ rootDir, config: CONFIG_STRICT, task }).missing.map(item => item.id);
    assert.ok(before.includes('review') && before.includes('knowledge'), `未补齐时应报缺项（实际 ${before.join(', ')}）`);

    saveTask(rootDir, CONFIG, task);
    for (const evidenceType of ['review', 'knowledge']) {
      recordEvidence({ rootDir, config: CONFIG, task, evidenceType, summary: `${evidenceType} ok`, exitCode: 0 });
    }
    const after = evaluateStrictFinish({ rootDir, config: CONFIG_STRICT, task });
    const ids = after.missing.map(item => item.id);
    assert.ok(!ids.includes('review'), `review 缺项应消失（实际 ${ids.join(', ')}）`);
    assert.ok(!ids.includes('knowledge'), `knowledge 缺项应消失（实际 ${ids.join(', ')}）`);
    assert.ok(ids.includes('required_tests'), '严格门槛不降：未跑注册验证器时 test 缺项仍在');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('AC-002: 无任何 evidence 记录时 strict 仍报 review/knowledge（门槛不被放宽）', () => {
  const rootDir = project();
  try {
    const task = baseTask({
      riskLevel: 'quick',
      risk: { level: 'quick', requiredEvidence: ['test'] },
      changePlan: { allow: ['src/**'], deny: [], standards: [], requiredEvidence: ['test'] },
    });
    const ids = evaluateStrictFinish({ rootDir, config: CONFIG_STRICT, task }).missing.map(item => item.id);
    for (const expected of ['review', 'required_tests', 'knowledge']) {
      assert.ok(ids.includes(expected), `应报 ${expected}（实际 ${ids.join(', ')}）`);
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
