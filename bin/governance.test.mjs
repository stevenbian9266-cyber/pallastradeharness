import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { validateProfile, governanceReady, readProfile, writeProfile, lockVersion, listVersions, profilePath } from './governance.mjs';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), 'harness.mjs');

function sampleProject() {
  return mkdtempSync(join(tmpdir(), 'harness-gov-'));
}

const READY_PROFILE = {
  name: 'taskflow',
  mode: 'greenfield',
  status: 'governance_ready',
  risk_domains: ['authentication', 'business_data'],
  skills: ['requirements-discovery', 'api-development'],
  prd_category: 'workflow_system',
  coding_policy: 'coding-policy@1.0.0',
  style_policy: 'style-policy@1.0.0',
  blocking_conflicts: 0,
};

// AC-001: 合法画像通过，非法被拒绝
test('AC-001: validateProfile 合法/非法', () => {
  assert.equal(validateProfile(READY_PROFILE).length, 0);
  assert.ok(validateProfile({ ...READY_PROFILE, name: undefined }).some(e => e.includes('name')));
  assert.ok(validateProfile({ ...READY_PROFILE, mode: 'weird' }).some(e => e.includes('mode')));
  assert.ok(validateProfile({ ...READY_PROFILE, status: 'flying' }).some(e => e.includes('status')));
});

// AC-002: governanceReady 缺失清单 / ready
test('AC-002: governanceReady 就绪与缺失判定', () => {
  const ready = governanceReady(READY_PROFILE);
  assert.equal(ready.ready, true);
  const draft = governanceReady({ name: 'x', mode: 'greenfield', status: 'governance_setup_required' });
  assert.equal(draft.ready, false);
  assert.ok(draft.missing.includes('risk_domains'));
  assert.ok(draft.missing.includes('status=governance_ready'));
  const blocked = governanceReady({ ...READY_PROFILE, blocking_conflicts: 2 });
  assert.equal(blocked.ready, false);
  assert.ok(blocked.missing.includes('blocking_conflicts=0'));
});

// AC-003: writeProfile → readProfile 往返
test('AC-003: writeProfile/readProfile 往返', () => {
  const rootDir = sampleProject();
  try {
    writeProfile({ rootDir, config: DEFAULT_CONFIG, profile: READY_PROFILE });
    assert.ok(existsSync(profilePath(rootDir, DEFAULT_CONFIG)));
    const back = readProfile({ rootDir, config: DEFAULT_CONFIG });
    assert.equal(back.name, 'taskflow');
    assert.deepEqual(back.risk_domains, ['authentication', 'business_data']);
    assert.throws(() => writeProfile({ rootDir, config: DEFAULT_CONFIG, profile: { mode: 'greenfield' } }), /Invalid governance profile/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// AC-004: lockVersion 生成快照 + 回写 + 拒绝重复
test('AC-004: lockVersion 锁定/回写/拒绝重复', () => {
  const rootDir = sampleProject();
  try {
    writeProfile({ rootDir, config: DEFAULT_CONFIG, profile: READY_PROFILE });
    const result = lockVersion({ rootDir, config: DEFAULT_CONFIG, profile: READY_PROFILE });
    assert.equal(result.version, 'governance-0.1.0');
    assert.ok(existsSync(result.path));
    const versions = listVersions({ rootDir, config: DEFAULT_CONFIG });
    assert.deepEqual(versions, ['governance-0.1.0.json']);
    const back = readProfile({ rootDir, config: DEFAULT_CONFIG });
    assert.equal(back.governance_version, 'governance-0.1.0');
    assert.throws(() => lockVersion({ rootDir, config: DEFAULT_CONFIG, profile: back }), /already locked/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// AC-005: CLI governance:init → status（未就绪）→ 补全 → version 锁定
test('AC-005: governance CLI init/status/version', () => {
  const rootDir = sampleProject();
  try {
    let r = spawnSync(process.execPath, [CLI, 'governance:init', '--name', 'demo'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    r = spawnSync(process.execPath, [CLI, 'governance:status'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /还不能开始编码/);
    // 未就绪时锁定被拒绝
    r = spawnSync(process.execPath, [CLI, 'governance:version'], { cwd: rootDir, encoding: 'utf-8' });
    assert.notEqual(r.status, 0);
    // 补全为 ready 画像
    writeProfile({ rootDir, config: DEFAULT_CONFIG, profile: READY_PROFILE });
    r = spawnSync(process.execPath, [CLI, 'governance:version'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /governance-0\.1\.0/);
    r = spawnSync(process.execPath, [CLI, 'governance:status'], { cwd: rootDir, encoding: 'utf-8' });
    assert.match(r.stdout, /治理已就绪/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// AC-006: ready 项目 task start 写入 governanceVersion
test('AC-006: task start 在 ready 项目上绑定 governanceVersion', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'docs', 'prd', 'other'), { recursive: true });
    writeFileSync(join(rootDir, 'docs', 'prd', 'other', 'PRD-X.md'), '# PRD-X\n- AC-001');
    writeProfile({ rootDir, config: DEFAULT_CONFIG, profile: READY_PROFILE });
    lockVersion({ rootDir, config: DEFAULT_CONFIG, profile: READY_PROFILE });
    const r = spawnSync(process.execPath, [CLI, 'task', 'start', '--title', '新增：demo', '--allow', 'src/**', '--json'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const task = JSON.parse(r.stdout);
    assert.equal(task.governanceVersion, 'governance-0.1.0');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
