import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { clearGateCheck, createGate, detectTaskType, gateStatusSnapshot } from './gate-commands.mjs';

function project() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-gate-cmd-'));
  writeFileSync(join(rootDir, 'README.md'), '# gate-commands\n');
  execFileSync('git', ['init', '-b', 'main'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.email', 'harness@example.test'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'Harness Test'], { cwd: rootDir });
  execFileSync('git', ['add', '.'], { cwd: rootDir });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: rootDir });
  return rootDir;
}

const config = () => structuredClone(DEFAULT_CONFIG);

test('detectTaskType: prefix, keywords and explicit flag', () => {
  assert.deepEqual(detectTaskType({ taskDesc: '重构：拆模块' }), { taskType: 'refactor', detectedVia: '前缀' });
  assert.deepEqual(detectTaskType({ taskDesc: '请写一份使用手册' }), { taskType: 'docs', detectedVia: '内容关键词' });
  assert.deepEqual(detectTaskType({ taskDesc: '修复：x', explicitType: 'security' }), { taskType: 'security', detectedVia: '--type flag' });
  assert.deepEqual(detectTaskType({ taskDesc: 'zzz' }), { taskType: null, detectedVia: null });
});

test('createGate binds to the explicit task and starts in preparation', async () => {
  const rootDir = project();
  try {
    const result = await createGate({ rootDir, config: config(), taskDesc: '重构：split gate commands', taskType: 'refactor', taskId: 'TASK-test-1' });
    assert.equal(result.ok, true);
    assert.equal(result.taskId, 'TASK-test-1');
    assert.equal(result.gateState.phase, 'preparation');
    assert.ok(existsSync(result.gateFile));

    const persisted = JSON.parse(readFileSync(result.gateFile, 'utf-8'));
    assert.equal(persisted.taskId, 'TASK-test-1');
    assert.equal(persisted.schemaVersion, '2.0');
    assert.ok(result.checks.some(check => check.id === 'verify-test'));
    assert.ok(result.checks.every(check => typeof check.id === 'string'));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('createGate refuses without an active task (INV-03)', async () => {
  const rootDir = project();
  try {
    const result = await createGate({ rootDir, config: config(), taskDesc: '重构：x', taskType: 'refactor' });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'NO_ACTIVE_TASK');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('gateStatusSnapshot: preparation → implementation after clearing preparation checks', async () => {
  const rootDir = project();
  try {
    const created = await createGate({ rootDir, config: config(), taskDesc: '重构：y', taskType: 'refactor', taskId: 'TASK-test-2' });
    assert.equal(created.ok, true);

    const before = gateStatusSnapshot({ rootDir, config: config() });
    assert.equal(before.ok, true);
    assert.equal(before.phase, 'preparation');
    assert.equal(before.valid, false);
    assert.ok(before.remainingPreparation.length > 0);

    for (const id of before.remainingPreparation) {
      const cleared = clearGateCheck({ rootDir, config: config(), gateId: created.gateId, checkId: id });
      assert.equal(cleared.ok, true, `${id} should clear`);
    }

    const after = gateStatusSnapshot({ rootDir, config: config() });
    assert.equal(after.phase, 'implementation');
    assert.equal(after.valid, true);
    assert.ok(after.remainingVerification.includes('verify-test'));
    assert.equal(after.remainingPreparation.length, 0);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('clearGateCheck guards: verify-test evidence control, unknown check, missing gate', async () => {
  const rootDir = project();
  try {
    const created = await createGate({ rootDir, config: config(), taskDesc: '重构：z', taskType: 'refactor', taskId: 'TASK-test-3' });

    const verifyTest = clearGateCheck({ rootDir, config: config(), gateId: created.gateId, checkId: 'verify-test' });
    assert.equal(verifyTest.ok, false);
    assert.equal(verifyTest.code, 'EVIDENCE_CONTROLLED');
    assert.equal(verifyTest.taskId, 'TASK-test-3');

    const unknown = clearGateCheck({ rootDir, config: config(), gateId: created.gateId, checkId: 'nope' });
    assert.equal(unknown.ok, false);
    assert.equal(unknown.code, 'UNKNOWN_CHECK');
    assert.ok(unknown.available.length > 0);

    const missing = clearGateCheck({ rootDir, config: config(), gateId: 'GATE-missing', checkId: 'x' });
    assert.equal(missing.ok, false);
    assert.equal(missing.code, 'GATE_NOT_FOUND');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
