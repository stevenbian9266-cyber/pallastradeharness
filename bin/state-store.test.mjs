import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { atomicWriteJson, cacheWrite, readJson, repositoryIdentity, scopedCacheKey, withStateLock } from './state-store.mjs';

function repository() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-state-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.email', 'harness@example.test'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'Harness Test'], { cwd: rootDir });
  execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: rootDir });
  return rootDir;
}

test('state writes are atomic JSON and lock conflicts fail closed', () => {
  const rootDir = repository();
  try {
    const target = join(rootDir, '.harness-state', 'value.json');
    atomicWriteJson(target, { value: 1 });
    assert.deepEqual(readJson(target), { value: 1 });
    assert.throws(() => withStateLock(rootDir, DEFAULT_CONFIG, target, () =>
      withStateLock(rootDir, DEFAULT_CONFIG, target, () => null)), /locked by another Harness process/);
    assert.deepEqual(JSON.parse(readFileSync(target, 'utf-8')), { value: 1 });
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('cache and repository identity are isolated by worktree', () => {
  const rootDir = repository();
  try {
    const identity = repositoryIdentity(rootDir);
    assert.equal(identity.branch, 'main');
    const key = scopedCacheKey(rootDir, 'brain', { hash: 'a' });
    const path = cacheWrite(rootDir, DEFAULT_CONFIG, 'brain', { hash: 'a' }, { ok: true });
    assert.ok(existsSync(path));
    assert.match(path, new RegExp(key));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
