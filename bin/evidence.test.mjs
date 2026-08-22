import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { buildEvidenceBundle, completeVerificationGate, evidenceFreshness, recordEvidence, runEvidenceCommand, verifyTaskEvidence } from './evidence.mjs';
import { startTask } from './task-orchestrator.mjs';

function project(title = 'Copy edit') {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-evidence-'));
  writeFileSync(join(rootDir, 'README.md'), '# Sample\n');
  execFileSync('git', ['init', '-b', 'main'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.email', 'harness@example.test'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'Harness Test'], { cwd: rootDir });
  execFileSync('git', ['add', '.'], { cwd: rootDir });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: rootDir });
  const config = structuredClone(DEFAULT_CONFIG);
  const task = startTask({ rootDir, config, title });
  return { rootDir, config, task };
}

test('command evidence is bound to current code and stale evidence cannot verify', () => {
  const { rootDir, config, task } = project();
  try {
    writeFileSync(join(rootDir, 'README.md'), '# Changed\n');
    const evidence = runEvidenceCommand({ rootDir, config, task, evidenceType: 'test', summary: 'node smoke test', command: [process.execPath, '-e', 'process.exit(0)'] });
    assert.equal(evidence.success, true);
    assert.equal(evidenceFreshness({ rootDir, config, evidence }).fresh, true);
    assert.equal(verifyTaskEvidence({ rootDir, config, task }).ok, true);
    writeFileSync(join(rootDir, 'README.md'), '# Changed again\n');
    const verification = verifyTaskEvidence({ rootDir, config, task });
    assert.equal(verification.ok, false);
    assert.equal(verification.stale.length, 1);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('fresh evidence automatically completes a task-bound gate and creates a bundle', () => {
  const { rootDir, config, task } = project();
  try {
    const gateDir = join(rootDir, 'harness', 'gates');
    mkdirSync(gateDir, { recursive: true });
    writeFileSync(join(gateDir, 'GATE-1.json'), JSON.stringify({
      schemaVersion: '2.0', id: 'GATE-1', taskId: task.id, checks: [
        { id: 'search-app', phase: 'preparation', status: 'done' },
        { id: 'verify-test', phase: 'verification', status: 'pending' },
      ],
    }));
    const evidence = runEvidenceCommand({ rootDir, config, task, evidenceType: 'test', summary: 'tests pass', command: [process.execPath, '-e', 'console.log("ok")'] });
    const verification = verifyTaskEvidence({ rootDir, config, task });
    const completed = completeVerificationGate({ rootDir, config, task, verification, gateId: 'GATE-1' });
    assert.equal(completed.completed, true);
    const gate = JSON.parse(readFileSync(join(gateDir, 'GATE-1.json'), 'utf-8'));
    assert.equal(gate.cleared, true);
    assert.deepEqual(gate.checks[1].evidence, [evidence.id]);
    const bundle = buildEvidenceBundle({ rootDir, config, task });
    assert.equal(bundle.bundle.verification.ok, true);
    assert.equal(bundle.bundle.evidence.length, 1);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('failed command evidence is retained but cannot satisfy verification', () => {
  const { rootDir, config, task } = project();
  try {
    const evidence = runEvidenceCommand({ rootDir, config, task, evidenceType: 'test', summary: 'failing test', command: [process.execPath, '-e', 'process.exit(7)'] });
    assert.equal(evidence.exitCode, 7);
    assert.equal(evidence.success, false);
    const verification = verifyTaskEvidence({ rootDir, config, task });
    assert.equal(verification.ok, false);
    assert.deepEqual(verification.missing, ['test']);
    assert.equal(verification.failed[0].id, evidence.id);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// ────────────────────────────────────────────────────────────────
// ChangeSnapshot 集成（HTH-003 / INV-01）
// ────────────────────────────────────────────────────────────────
test('evidence run records ChangeSnapshot start/end and stays valid when nothing changes', () => {
  const { rootDir, config, task } = project();
  try {
    const evidence = runEvidenceCommand({ rootDir, config, task, evidenceType: 'test', summary: 'snapshot bound', command: [process.execPath, '-e', 'process.exit(0)'] });
    assert.ok(evidence.snapshot, 'evidence should carry a ChangeSnapshot');
    assert.ok(evidence.snapshot.start.indexTree, 'snapshot.start.indexTree is required');
    assert.equal(evidence.snapshot.status, 'valid');
    assert.equal(evidence.metadata.snapshotStatus, 'valid');
    assert.equal(evidence.snapshot.start.taskId, task.id);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('evidence is superseded when files change during the run (INV-01)', () => {
  const { rootDir, config, task } = project();
  try {
    const evidence = runEvidenceCommand({
      rootDir, config, task, evidenceType: 'test', summary: 'mutating run',
      // 写入 allow 范围（startTask 默认 allow: app/**/*, src/**/*）内的文件
      command: [process.execPath, '-e', "require('node:fs').mkdirSync('src', { recursive: true }); require('node:fs').writeFileSync('src/changed.txt', 'boom')"],
    });
    assert.equal(evidence.snapshot.status, 'superseded');
    assert.equal(evidence.metadata.snapshotStatus, 'superseded');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('evidence freshness fails when staged tree changes after verification (INV-01)', () => {
  const { rootDir, config, task } = project();
  try {
    const evidence = runEvidenceCommand({ rootDir, config, task, evidenceType: 'test', summary: 'bound', command: [process.execPath, '-e', 'process.exit(0)'] });
    assert.equal(evidenceFreshness({ rootDir, config, evidence }).fresh, true);
    // 验证后修改并暂存目标文件 → staged tree 变化 → 证据失效
    writeFileSync(join(rootDir, 'README.md'), '# Changed\n');
    execFileSync('git', ['add', 'README.md'], { cwd: rootDir });
    const freshness = evidenceFreshness({ rootDir, config, evidence });
    assert.equal(freshness.fresh, false);
    assert.ok(freshness.reasons.some(reason => reason.includes('change snapshot mismatch')), `expected snapshot mismatch, got: ${freshness.reasons.join('; ')}`);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// ────────────────────────────────────────────────────────────────
// Verifier Registry（HTH-005）与手工证据收紧（HTH-006）
// ────────────────────────────────────────────────────────────────
test('diagnostic test evidence (no registered verifier) cannot satisfy verification (F-02)', () => {
  const { rootDir, config, task } = project();
  try {
    const evidence = runEvidenceCommand({ rootDir, config, task, evidenceType: 'test', summary: 'arbitrary cmd', command: [process.execPath, '-e', 'process.exit(0)'], diagnostic: true });
    assert.equal(evidence.metadata.diagnostic, true);
    const verification = verifyTaskEvidence({ rootDir, config, task });
    assert.equal(verification.ok, false);
    assert.deepEqual(verification.missing, ['test']);
    assert.equal(verification.pending.length, 1);
    assert.ok(verification.pending[0].reason.includes('diagnostic'));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('manual evidence without approval has success:null and cannot satisfy verification', () => {
  const { rootDir, config, task } = project();
  try {
    const evidence = recordEvidence({ rootDir, config, task, evidenceType: 'knowledge', summary: 'assessed' });
    assert.equal(evidence.success, null);
    const verification = verifyTaskEvidence({ rootDir, config, task });
    assert.equal(verification.ok, false);
    assert.equal(verification.pending.length, 1);
    assert.ok(verification.reasons.some(reason => reason.includes('pending')));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('approved manual evidence satisfies the knowledge requirement', () => {
  const { rootDir, config, task } = project();
  try {
    const evidence = recordEvidence({ rootDir, config, task, evidenceType: 'knowledge', summary: 'assessed', exitCode: 0, metadata: { approved: true } });
    assert.equal(evidence.success, true);
    const verification = verifyTaskEvidence({ rootDir, config, task });
    // 已审批的 knowledge 证据进入 valid（满足 requiredEvidence 中的 knowledge 维度时可用）
    assert.ok(verification.evidence.includes(evidence.id), 'approved knowledge evidence is valid');
    assert.equal(verification.ok, false, 'test type still missing');
    assert.equal(verification.missing.includes('test'), true);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('verifier definition change makes old evidence stale (INV-04)', () => {
  const { rootDir, config, task } = project();
  try {
    const evidence = runEvidenceCommand({ rootDir, config, task, evidenceType: 'test', summary: 'bound to verifier', command: [process.execPath, '-e', 'process.exit(0)'], verifierId: 'unit', verifierDefinitionHash: 'deadbeef' });
    assert.equal(evidence.verifierId, 'unit');
    const freshness = evidenceFreshness({ rootDir, config, evidence });
    assert.equal(freshness.fresh, false);
    assert.ok(freshness.reasons.some(reason => reason.includes('verifier definition changed')));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('package-manager commands can be captured through platform shims', () => {
  const { rootDir, config, task } = project();
  try {
    const evidence = runEvidenceCommand({ rootDir, config, task, evidenceType: 'test', summary: 'npm version', command: ['npm', '--version'] });
    assert.equal(evidence.exitCode, 0, evidence.stderr);
    assert.equal(evidence.success, true);
    assert.match(evidence.stdout, /^\d+\.\d+\.\d+/);
    assert.equal(evidence.metadata.windowsShim, process.platform === 'win32');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
