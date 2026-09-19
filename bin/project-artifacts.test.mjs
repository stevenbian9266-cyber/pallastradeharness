/**
 * project-artifacts.test.mjs — ProjectArtifact 文件实现（Batch C / C01 / AC-002）
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  getArtifact, hashContent, hashFile, hashFiles, listArtifacts,
  readArtifactManifest, refreshArtifacts, upsertArtifact,
} from './project-artifacts.mjs';

const CONFIG = { paths: { state: '.harness-state' }, constitution: { dir: 'harness/constitution' } };

function project() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-artifacts-'));
  mkdirSync(join(rootDir, 'harness/constitution'), { recursive: true });
  writeFileSync(join(rootDir, 'architecture.md'), '# Architecture v1\n');
  writeFileSync(join(rootDir, 'testing.md'), '# Testing v1\n');
  return rootDir;
}

test('AC-002: hashContent / hashFile / hashFiles 可复算且区分内容', () => {
  const rootDir = project();
  try {
    assert.match(hashContent('x'), /^sha256:[a-f0-9]{64}$/);
    const first = hashFile({ rootDir, path: 'architecture.md' });
    assert.equal(first, hashFile({ rootDir, path: 'architecture.md' }), 'stable across calls');
    assert.equal(hashFile({ rootDir, path: 'missing.md' }), null);
    const bundle = hashFiles({ rootDir, files: ['architecture.md', 'testing.md'] });
    writeFileSync(join(rootDir, 'testing.md'), '# Testing v2\n');
    assert.notEqual(hashFiles({ rootDir, files: ['architecture.md', 'testing.md'] }), bundle);
    assert.equal(hashFiles({ rootDir, files: ['testing.md', 'architecture.md'] }), hashFiles({ rootDir, files: ['architecture.md', 'testing.md'] }), 'order independent');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('AC-002: upsertArtifact 注册/更新 + 保留 created_at', () => {
  const rootDir = project();
  try {
    const created = upsertArtifact({
      rootDir, config: CONFIG, id: 'architecture', type: 'constitution',
      path: 'architecture.md', templateId: 'architecture',
    });
    assert.equal(created.status, 'ACTIVE');
    assert.match(created.content_hash, /^sha256:/);
    writeFileSync(join(rootDir, 'architecture.md'), '# Architecture v2\n');
    const updated = upsertArtifact({
      rootDir, config: CONFIG, id: 'architecture', type: 'constitution',
      path: 'architecture.md', templateId: 'architecture',
    });
    assert.notEqual(updated.content_hash, created.content_hash);
    assert.equal(updated.created_at, created.created_at, 'created_at preserved');
    assert.equal(listArtifacts({ rootDir, config: CONFIG }).length, 1);
    assert.equal(getArtifact({ rootDir, config: CONFIG, id: 'architecture' }).id, 'architecture');
    assert.equal(getArtifact({ rootDir, config: CONFIG, id: 'nope' }), null);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('AC-002: refreshArtifacts 检测 drift（CHANGED / MISSING）并回到 ACTIVE', () => {
  const rootDir = project();
  try {
    upsertArtifact({ rootDir, config: CONFIG, id: 'architecture', type: 'constitution', path: 'architecture.md' });
    assert.deepEqual(refreshArtifacts({ rootDir, config: CONFIG }).drift, []);
    writeFileSync(join(rootDir, 'architecture.md'), '# changed\n');
    const drifted = refreshArtifacts({ rootDir, config: CONFIG });
    assert.equal(drifted.drift.length, 1);
    assert.equal(drifted.drift[0].kind, 'CHANGED');
    assert.equal(drifted.artifacts[0].status, 'STALE');
    writeFileSync(join(rootDir, 'architecture.md'), '# Architecture v1\n');
    assert.equal(refreshArtifacts({ rootDir, config: CONFIG }).artifacts[0].status, 'ACTIVE', 'restored → ACTIVE');
    rmSync(join(rootDir, 'architecture.md'));
    assert.equal(refreshArtifacts({ rootDir, config: CONFIG }).drift[0].kind, 'MISSING');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('AC-002: upsertArtifact 对不存在的制品路径报错（拒绝幽灵制品）', () => {
  const rootDir = project();
  try {
    assert.throws(
      () => upsertArtifact({ rootDir, config: CONFIG, id: 'x', type: 'constitution', path: 'ghost.md' }),
      /artifact path does not exist/,
    );
    assert.deepEqual(readArtifactManifest({ rootDir, config: CONFIG }).artifacts, []);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
