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
