import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { WIZARD_STEPS, wizardAnswersToProfile, validateAnswers, loadAnswers, saveAnswers, clearAnswers, applyAnswers, derivePrdCategory } from './wizard.mjs';
import { readProfile, governanceReady, listVersions } from './governance.mjs';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), 'harness.mjs');

function sampleProject() {
  return mkdtempSync(join(tmpdir(), 'harness-wiz-'));
}

const FULL_ANSWERS = {
  name: 'taskflow',
  purpose: '给 6 人小团队做内部任务管理工具',
  business: '成员创建/分配/流转任务，admin 管理成员与项目',
  product: '登录、任务 CRUD、状态流转、成员管理（内部管理后台 + 工作流）',
  tech: 'Node.js + TypeScript + Express + SQLite 单进程（方案 A）',
  data: 'user/project/task 三个实体，任务状态机 todo→in_progress→review→done',
  auth: '邮箱+密码登录；member/admin 两级；最小权限',
  risk_domains: ['authentication', 'business_data'],
  code: 'src/{routes,services,repositories,domain,views,ui} + test/',
  skills: ['requirements-discovery', 'api-development', 'frontend-page', 'testing-quality', 'documentation-sync'],
};

// AC-001: 10 步定义 + 答案→画像映射 + prd_category 派生
test('AC-001: WIZARD_STEPS 10 步 & wizardAnswersToProfile 映射', () => {
  assert.equal(WIZARD_STEPS.length, 10);
  const profile = wizardAnswersToProfile({ answers: FULL_ANSWERS, name: 'taskflow' });
  assert.equal(profile.mode, 'greenfield');
  assert.equal(profile.status, 'governance_ready');
  assert.deepEqual(profile.risk_domains, ['authentication', 'business_data']);
  assert.ok(profile.skills.includes('api-development'));
  // prd_category 由 product 关键词派生（工作流/内部工具）
  assert.ok(['workflow_system', 'internal_tool'].includes(profile.prd_category));
  assert.equal(derivePrdCategory('订单审批与状态流转'), 'workflow_system');
});

// AC-002: validateAnswers 缺失清单
test('AC-002: validateAnswers 返回缺失步骤', () => {
  const missing = validateAnswers({ purpose: 'x' });
  assert.ok(missing.length >= 8);
  assert.ok(missing.includes('2.business'));
  assert.ok(missing.includes('7.risk_domains'));
  assert.equal(validateAnswers(FULL_ANSWERS).length, 0);
});

// AC-003: applyAnswers 生成 ready 画像并写入 project.yaml
test('AC-003: applyAnswers 生成 ready 画像', () => {
  const rootDir = sampleProject();
  try {
    const profile = applyAnswers({ rootDir, config: DEFAULT_CONFIG, answers: FULL_ANSWERS, name: 'taskflow' });
    assert.equal(governanceReady(profile).ready, true);
    const back = readProfile({ rootDir, config: DEFAULT_CONFIG });
    assert.equal(back.name, 'taskflow');
    assert.equal(back.status, 'governance_ready');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// 答案落盘/恢复
test('answers 落盘可恢复（save/load/clear）', () => {
  const rootDir = sampleProject();
  try {
    saveAnswers({ rootDir, config: DEFAULT_CONFIG, answers: FULL_ANSWERS });
    const back = loadAnswers({ rootDir, config: DEFAULT_CONFIG });
    assert.equal(back.purpose, FULL_ANSWERS.purpose);
    assert.deepEqual(back.risk_domains, ['authentication', 'business_data']);
    clearAnswers({ rootDir, config: DEFAULT_CONFIG });
    assert.deepEqual(loadAnswers({ rootDir, config: DEFAULT_CONFIG }), {});
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// AC-004: finish 锁定治理版本
test('AC-004: wizard from + finish 锁定 governance-0.1.0（CLI）', () => {
  const rootDir = sampleProject();
  try {
    const file = join(rootDir, 'answers.json');
    writeFileSync(file, JSON.stringify(FULL_ANSWERS));
    let r = spawnSync(process.execPath, [CLI, 'wizard', 'from', '--file', 'answers.json'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    r = spawnSync(process.execPath, [CLI, 'wizard', 'status', '--json'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const status = JSON.parse(r.stdout);
    assert.equal(status.done, 9);   // 9 个可答步骤 + 第 10 步确认
    assert.equal(status.total, 9);
    assert.equal(status.missing.length, 0);
    r = spawnSync(process.execPath, [CLI, 'wizard', 'finish'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /governance-0\.1\.0/);
    assert.ok(existsSync(join(rootDir, 'harness', 'project.yaml')));
    const versions = listVersions({ rootDir, config: DEFAULT_CONFIG });
    assert.deepEqual(versions, ['governance-0.1.0.json']);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// AC-006: finish 缺步骤被拒绝
test('AC-006: wizard finish 缺步骤被拒绝', () => {
  const rootDir = sampleProject();
  try {
    const r = spawnSync(process.execPath, [CLI, 'wizard', 'finish', '--name', 'demo'], { cwd: rootDir, encoding: 'utf-8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /未完成|step|business/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
