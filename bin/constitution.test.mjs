/**
 * constitution.test.mjs — ConstitutionVersion / Task 冻结 / Context 选择（Batch C / C02 / C05 / C06 / AC-003-005）
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  buildConstitutionSnapshot, computeConstitutionVersion, diffConstitutionVersions,
  getCurrentConstitutionVersion, listConstitutionVersions, lockConstitutionVersion,
  selectConstitutionContext, skillsHashes,
} from './constitution.mjs';
import { saveRefreshedArtifacts, upsertArtifact } from './project-artifacts.mjs';

const CONFIG = { paths: { state: '.harness-state' }, constitution: { dir: 'harness/constitution' } };

function project() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-constitution-'));
  mkdirSync(join(rootDir, 'harness/constitution'), { recursive: true });
  mkdirSync(join(rootDir, 'skills/quality'), { recursive: true });
  writeFileSync(join(rootDir, 'architecture.md'), '# Architecture v1\n');
  writeFileSync(join(rootDir, 'testing.md'), '# Testing v1\n');
  writeFileSync(join(rootDir, 'skills/quality/SKILL.md'), '---\nname: quality\n---\n# Quality\n');
  return rootDir;
}

function register(rootDir) {
  upsertArtifact({ rootDir, config: CONFIG, id: 'architecture', type: 'constitution', path: 'architecture.md', templateId: 'architecture' });
  upsertArtifact({ rootDir, config: CONFIG, id: 'testing', type: 'constitution', path: 'testing.md', templateId: 'testing-standard' });
}

test('AC-003: version 由内容决定（稳定、随变更漂移、含 skills）', () => {
  const rootDir = project();
  try {
    register(rootDir);
    const first = computeConstitutionVersion({ rootDir, config: CONFIG });
    assert.match(first.version, /^constitution-[a-f0-9]{12}$/);
    assert.equal(computeConstitutionVersion({ rootDir, config: CONFIG }).version, first.version, 'deterministic');
    assert.equal(first.slots.architecture, 'present');
    assert.equal(first.slots.product, 'not_applicable');
    assert.equal(first.slots.project_overview, 'missing');
    assert.ok(Object.keys(first.skills).some(path => path.includes('skills/quality/SKILL.md')));
    writeFileSync(join(rootDir, 'architecture.md'), '# Architecture v2\n');
    const drifted = computeConstitutionVersion({ rootDir, config: CONFIG });
    assert.equal(drifted.version, first.version, '版本描述已登记基线；未走变更流时保持不变（drift 是信号）');
    assert.equal(drifted.drift.length, 1, 'drift 被捕获');
    saveRefreshedArtifacts({ rootDir, config: CONFIG });
    assert.notEqual(computeConstitutionVersion({ rootDir, config: CONFIG }).version, first.version, '接受新基线后版本漂移');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('AC-003: lock 写快照 + 不可覆盖 + current 指针 + diff 可比较', () => {
  const rootDir = project();
  try {
    assert.equal(lockConstitutionVersion({ rootDir, config: CONFIG }).code, 'NO_ARTIFACTS');
    register(rootDir);
    const locked = lockConstitutionVersion({ rootDir, config: CONFIG, now: '2026-09-19T00:00:00.000Z' });
    assert.equal(locked.ok, true);
    assert.match(locked.version, /^constitution-[a-f0-9]{12}$/);
    assert.equal(getCurrentConstitutionVersion({ rootDir, config: CONFIG }).version, locked.version);
    assert.deepEqual(listConstitutionVersions({ rootDir, config: CONFIG }), [`${locked.version}.json`]);
    const again = lockConstitutionVersion({ rootDir, config: CONFIG });
    assert.equal(again.code, 'ALREADY_LOCKED');
    // 变更 → 刷新 → 新版本 → diff
    writeFileSync(join(rootDir, 'architecture.md'), '# Architecture v2\n');
    assert.equal(lockConstitutionVersion({ rootDir, config: CONFIG }).code, 'DRIFT_REQUIRED');
    saveRefreshedArtifacts({ rootDir, config: CONFIG });
    const second = lockConstitutionVersion({ rootDir, config: CONFIG });
    assert.equal(second.ok, true);
    const diff = diffConstitutionVersions({ rootDir, config: CONFIG, from: locked.version, to: second.version });
    assert.deepEqual(diff.changed.map(item => item.id), ['architecture']);
    assert.deepEqual(diff.added, []);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('AC-004: Task 冻结快照（有 Constitution → 全量 hash；无 → null）', () => {
  const rootDir = project();
  try {
    assert.equal(buildConstitutionSnapshot({ rootDir, config: CONFIG }), null, 'no artifacts → null');
    register(rootDir);
    upsertArtifact({ rootDir, config: CONFIG, id: 'tech_stack', type: 'constitution', path: 'testing.md', templateId: 'tech-stack' });
    const locked = lockConstitutionVersion({ rootDir, config: CONFIG });
    const snapshot = buildConstitutionSnapshot({ rootDir, config: CONFIG });
    assert.equal(snapshot.constitution_version, locked.version);
    assert.match(snapshot.architecture_hash, /^sha256:/);
    assert.match(snapshot.testing_hash, /^sha256:/);
    assert.equal(snapshot.tech_stack_hash, snapshot.testing_hash, 'same file registered twice');
    assert.equal(snapshot.engineering_hash, null, 'unregistered slot → null');
    assert.ok(Object.keys(snapshot.applicable_skill_hashes).length >= 1);
    assert.equal(snapshot.artifact_count, 3);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('AC-005: Context 选择按相关性且不超过上限', () => {
  const rootDir = project();
  try {
    register(rootDir);
    const task = { title: '修复：testing 断言失败', goals: ['修复测试'], linkedPrd: null };
    const selected = selectConstitutionContext({ rootDir, config: CONFIG, task });
    assert.ok(selected.length >= 1 && selected.length <= 3, `limit respected (got ${selected.length})`);
    assert.ok(selected.some(item => item.id === 'testing'), 'testing artifact relevant');
    assert.ok(selected.every(item => item.hash && item.path && item.status));
    const limited = selectConstitutionContext({ rootDir, config: CONFIG, task, limit: 1 });
    assert.equal(limited.length, 1);
    assert.deepEqual(selectConstitutionContext({ rootDir, config: { ...CONFIG, constitution: { dir: 'harness/constitution' } }, task, limit: 5 }).length >= 1, true);
    const empty = mkdtempSync(join(tmpdir(), 'harness-constitution-empty-'));
    try {
      assert.deepEqual(selectConstitutionContext({ rootDir: empty, config: CONFIG, task }), []);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('AC-004: skillsHashes 确定性（排序、内容敏感）', () => {
  const rootDir = project();
  try {
    const first = skillsHashes({ rootDir, config: CONFIG });
    assert.deepEqual(Object.keys(first), ['skills/quality/SKILL.md']);
    writeFileSync(join(rootDir, 'skills/quality/SKILL.md'), '---\nname: quality\n---\n# Quality v2\n');
    assert.notEqual(skillsHashes({ rootDir, config: CONFIG })['skills/quality/SKILL.md'], first['skills/quality/SKILL.md']);
    assert.ok(readFileSync(join(rootDir, 'skills/quality/SKILL.md'), 'utf-8').includes('v2'));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
