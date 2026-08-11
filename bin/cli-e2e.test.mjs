import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

    writeFileSync(join(rootDir, 'after-gate.txt'), 'new commit\n');
    git(rootDir, ['add', 'after-gate.txt']);
    git(rootDir, ['commit', '-m', 'move head']);
    assert.equal(run(rootDir, ['gate:required']).status, 1, 'a cleared gate cannot be reused after HEAD moves');
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

test('task-bound gate closes only through fresh typed evidence', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-cli-task-evidence-'));
  try {
    assert.equal(run(rootDir, ['init', '--preset', 'single', '--tier', 'lite', '--name', 'lifecycle']).status, 0);
    git(rootDir, ['init', '-b', 'main']);
    git(rootDir, ['config', 'user.email', 'harness@example.test']);
    git(rootDir, ['config', 'user.name', 'Harness Test']);
    git(rootDir, ['add', '.']);
    git(rootDir, ['commit', '-m', 'init']);

    const started = run(rootDir, ['task', 'start', '--title', 'Copy text', '--allow', 'README.md', '--json']);
    assert.equal(started.status, 0, started.stderr);
    const taskId = JSON.parse(started.stdout).id;
    const opened = run(rootDir, ['gate', '--task', 'Copy text', '--type', 'docs', '--task-id', taskId]);
    assert.equal(opened.status, 1);
    const gateFile = readdirSync(join(rootDir, 'harness', 'gates')).find(file => file.endsWith('.json'));
    const gateId = JSON.parse(readFileSync(join(rootDir, 'harness', 'gates', gateFile), 'utf-8')).id;

    assert.equal(run(rootDir, ['gate:clear', '--gate', gateId, '--clear', 'search-app']).status, 1);
    assert.equal(run(rootDir, ['gate:clear', '--gate', gateId, '--clear', 'search-test']).status, 0);
    const manual = run(rootDir, ['gate:clear', '--gate', gateId, '--clear', 'verify-test', '--note', 'claimed']);
    assert.equal(manual.status, 1);
    assert.match(manual.stderr + manual.stdout, /evidence verify/i);

    writeFileSync(join(rootDir, 'README.md'), '# Verified lifecycle\n');
    const evidence = run(rootDir, ['evidence', 'run', '--task', taskId, '--type', 'test', '--', process.execPath, '-e', 'process.exit(0)']);
    assert.equal(evidence.status, 0, evidence.stderr);
    const verified = run(rootDir, ['evidence', 'verify', '--task', taskId, '--gate', gateId]);
    assert.equal(verified.status, 0, verified.stderr);
    assert.match(verified.stdout, /gate .* finished/i);
    const finished = run(rootDir, ['task', 'finish', '--task', taskId]);
    assert.equal(finished.status, 0, finished.stderr);
    assert.match(finished.stdout, /completed with verified evidence/i);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
