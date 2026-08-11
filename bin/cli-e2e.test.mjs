import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
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

test('init -> task plan -> phased gate -> verify -> finish lifecycle', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-cli-'));
  try {
    assert.equal(run(rootDir, ['init', '--preset', 'single', '--tier', 'lite', '--name', 'e2e']).status, 0);
    git(rootDir, ['init', '-b', 'main']);
    git(rootDir, ['config', 'user.email', 'harness@example.test']);
    git(rootDir, ['config', 'user.name', 'Harness Test']);
    git(rootDir, ['add', '.']);
    git(rootDir, ['commit', '-m', 'init']);
    const taskScopedSync = run(rootDir, ['sync-check', '--base', 'HEAD']);
    assert.equal(taskScopedSync.status, 0, taskScopedSync.stderr);

    const plan = run(rootDir, ['supervise', 'plan', '--task', 'Document the project', '--allow', 'docs/**', '--json']);
    assert.equal(plan.status, 0, plan.stderr);
    assert.equal(JSON.parse(plan.stdout).plan.type, 'Task');

    const opened = run(rootDir, ['gate', '--task', 'Document the project', '--type', 'docs']);
    assert.equal(opened.status, 1);
    const gateFile = readdirSync(join(rootDir, 'harness', 'gates')).find(file => file.endsWith('.json'));
    const gateId = JSON.parse(readFileSync(join(rootDir, 'harness', 'gates', gateFile), 'utf-8')).id;

    assert.equal(run(rootDir, ['gate:clear', '--gate', gateId, '--clear', 'search-app']).status, 1);
    const implementationReady = run(rootDir, ['gate:clear', '--gate', gateId, '--clear', 'search-test']);
    assert.equal(implementationReady.status, 0, implementationReady.stderr);
    assert.match(implementationReady.stdout, /PREPARATION CLEARED/);
    assert.equal(run(rootDir, ['gate:status']).status, 0);
    assert.equal(run(rootDir, ['gate:required']).status, 1, 'commit gate stays blocked before verification');

    const finished = run(rootDir, ['gate:clear', '--gate', gateId, '--clear', 'verify-test', '--note', 'node:test passed']);
    assert.equal(finished.status, 0);
    assert.match(finished.stdout, /GATE FINISHED/);
    assert.equal(run(rootDir, ['gate:required']).status, 0);
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
