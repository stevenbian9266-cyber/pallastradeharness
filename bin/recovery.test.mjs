import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { createRecoveryPlan, recoveryStatus, validateRecoveryPlan } from './recovery.mjs';
import { startTask } from './task-orchestrator.mjs';

test('critical recovery plan captures code state and remains manual-only', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-recovery-'));
  try {
    writeFileSync(join(rootDir, 'payment.js'), 'export const charge = true\n');
    execFileSync('git', ['init', '-b', 'main'], { cwd: rootDir });
    execFileSync('git', ['config', 'user.email', 'harness@example.test'], { cwd: rootDir });
    execFileSync('git', ['config', 'user.name', 'Harness Test'], { cwd: rootDir });
    execFileSync('git', ['add', '.'], { cwd: rootDir });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: rootDir });
    const config = structuredClone(DEFAULT_CONFIG);
    const task = startTask({ rootDir, config, title: 'Change payment database', declaredRisk: 'critical' });
    writeFileSync(join(rootDir, 'payment.js'), 'export const charge = false\n');
    const plan = createRecoveryPlan({ rootDir, config, task, failureCriteria: ['charge errors rise'], stopConditions: ['first failed canary'], codeRecovery: ['revert reviewed commit'], dataRecovery: ['restore payment snapshot'], verification: ['run payment sandbox'] });
    assert.equal(plan.executionPolicy, 'manual-only');
    assert.deepEqual(validateRecoveryPlan(plan), []);
    assert.equal(recoveryStatus({ rootDir, config, task }).valid, true);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
