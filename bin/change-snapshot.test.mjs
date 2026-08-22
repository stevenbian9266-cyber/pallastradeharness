import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  SNAPSHOT_SCHEMA_VERSION,
  canonicalManifest,
  manifestHash,
  matchesAllow,
  allowPolicyHash,
  configHash,
  indexTree,
  createSnapshot,
  snapshotsEqual,
  diffSnapshots,
} from './change-snapshot.mjs';

function git(root, args) {
  return execFileSync('git', ['-c', 'core.quotepath=false', ...args], { cwd: root, encoding: 'utf-8', stdio: 'pipe' }).trim();
}

function makeRepo(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'csnap-'));
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  for (const [p, content] of Object.entries(files)) {
    const abs = join(root, ...p.split('/'));
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'init']);
  return root;
}

function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('canonicalManifest 排序与格式稳定（golden，UTF-8 码点排序）', () => {
  const a = [{ path: 'b/x.txt', sha256: '2222' }, { path: 'a.txt', sha256: '1111' }];
  const b = [{ path: 'a.txt', sha256: '1111' }, { path: 'b/x.txt', sha256: '2222' }];
  const expected = 'a.txt\t1111\nb/x.txt\t2222';
  assert.equal(canonicalManifest(a), expected);
  assert.equal(canonicalManifest(b), expected); // 输入顺序无关
});

test('manifestHash 空集 = sha256("") 常量', () => {
  assert.equal(manifestHash([]), sha256(''));
});

test('manifestHash 随文件内容变化', () => {
  const m1 = manifestHash([{ path: 'a.txt', sha256: 'x' }]);
  const m2 = manifestHash([{ path: 'a.txt', sha256: 'y' }]);
  assert.notEqual(m1, m2);
});

test('matchesAllow 目录 glob 递归匹配', () => {
  assert.equal(matchesAllow('bin/foo.mjs', ['bin/**']), true);
  assert.equal(matchesAllow('bin/foo.mjs', ['bin']), true);
  assert.equal(matchesAllow('README.md', ['bin/**']), false);
  assert.equal(matchesAllow('anything', []), true); // 无 allow = 全允许
  assert.equal(matchesAllow('docs/a.md', ['docs/**', 'README.md']), true);
});

test('allowPolicyHash 与顺序无关、与分隔符归一化', () => {
  assert.equal(allowPolicyHash(['bin/**', 'docs/**']), allowPolicyHash(['docs/**', 'bin/**']));
  assert.equal(allowPolicyHash(['bin\\**']), allowPolicyHash(['bin/**'])); // 反斜杠归一化
});

test('configHash 随配置变化（INV-04 前置）', () => {
  assert.notEqual(configHash({ evidence: { autoVerify: true } }), configHash({ evidence: { autoVerify: false } }));
  assert.equal(configHash({}), configHash({}));
});

test('createSnapshot 输出完整合同字段', () => {
  const root = makeRepo({ 'src/a.txt': 'one', 'docs/r.md': '# hi' });
  try {
    const snap = createSnapshot({ rootDir: root, taskId: 'TASK-test', allow: ['src/**', 'docs/**'], config: {} });
    assert.equal(snap.schemaVersion, SNAPSHOT_SCHEMA_VERSION);
    assert.equal(snap.taskId, 'TASK-test');
    assert.ok(snap.repositoryId.length === 64);
    assert.ok(snap.worktreeId.length === 16);
    assert.ok(/^[0-9a-f]{40}$/.test(snap.indexTree));
    assert.equal(snap.worktreeManifestHash.length, 64);
    assert.equal(snap.untrackedManifestHash.length, 64);
    assert.equal(snap.allowPolicyHash.length, 64);
    assert.equal(snap.configHash.length, 64);
    assert.ok(!Number.isNaN(Date.parse(snap.createdAt)));
  } finally {
    cleanup(root);
  }
});

test('staged 内容变化 → indexTree 变化 → 证据应失效（INV-01）', () => {
  const root = makeRepo({ 'src/a.txt': 'one' });
  try {
    const before = createSnapshot({ rootDir: root, taskId: 'TASK-1', allow: ['src/**'], config: {} });
    writeFileSync(join(root, 'src/a.txt'), 'two');
    git(root, ['add', 'src/a.txt']);
    const after = createSnapshot({ rootDir: root, taskId: 'TASK-1', allow: ['src/**'], config: {} });
    assert.notEqual(before.indexTree, after.indexTree);
    assert.deepEqual(diffSnapshots(before, after), ['indexTree', 'worktreeManifestHash']);
    assert.equal(snapshotsEqual(before, after), false);
  } finally {
    cleanup(root);
  }
});

test('工作区修改未 staged → worktreeManifestHash 变化', () => {
  const root = makeRepo({ 'src/a.txt': 'one' });
  try {
    const before = createSnapshot({ rootDir: root, taskId: 'TASK-1', allow: ['src/**'], config: {} });
    writeFileSync(join(root, 'src/a.txt'), 'changed-but-not-staged');
    const after = createSnapshot({ rootDir: root, taskId: 'TASK-1', allow: ['src/**'], config: {} });
    assert.equal(before.indexTree, after.indexTree); // staged 未变
    assert.notEqual(before.worktreeManifestHash, after.worktreeManifestHash);
  } finally {
    cleanup(root);
  }
});

test('新增 untracked 文件在允许范围内 → untrackedManifestHash 变化', () => {
  const root = makeRepo({ 'src/a.txt': 'one' });
  try {
    const before = createSnapshot({ rootDir: root, taskId: 'TASK-1', allow: ['src/**'], config: {} });
    writeFileSync(join(root, 'src/new.txt'), 'new file');
    const after = createSnapshot({ rootDir: root, taskId: 'TASK-1', allow: ['src/**'], config: {} });
    assert.notEqual(before.untrackedManifestHash, after.untrackedManifestHash);
  } finally {
    cleanup(root);
  }
});

test('新增 untracked 文件在允许范围外 → 不影响 snapshot（不误伤）', () => {
  const root = makeRepo({ 'src/a.txt': 'one' });
  try {
    const before = createSnapshot({ rootDir: root, taskId: 'TASK-1', allow: ['src/**'], config: {} });
    writeFileSync(join(root, 'unrelated.txt'), 'outside scope');
    const after = createSnapshot({ rootDir: root, taskId: 'TASK-1', allow: ['src/**'], config: {} });
    assert.equal(snapshotsEqual(before, after), true);
  } finally {
    cleanup(root);
  }
});

test('allow 范围变化 → allowPolicyHash 变化 → 证据失效（INV-04）', () => {
  const root = makeRepo({ 'src/a.txt': 'one' });
  try {
    const snapA = createSnapshot({ rootDir: root, taskId: 'TASK-1', allow: ['src/**'], config: {} });
    const snapB = createSnapshot({ rootDir: root, taskId: 'TASK-1', allow: ['src/**', 'docs/**'], config: {} });
    assert.notEqual(snapA.allowPolicyHash, snapB.allowPolicyHash);
    assert.ok(diffSnapshots(snapA, snapB).includes('allowPolicyHash'));
  } finally {
    cleanup(root);
  }
});

test('配置变化 → configHash 变化 → 证据失效（INV-04）', () => {
  const root = makeRepo({ 'src/a.txt': 'one' });
  try {
    const snapA = createSnapshot({ rootDir: root, taskId: 'TASK-1', allow: ['src/**'], config: { evidence: { autoVerify: true } } });
    const snapB = createSnapshot({ rootDir: root, taskId: 'TASK-1', allow: ['src/**'], config: { evidence: { autoVerify: false } } });
    assert.notEqual(snapA.configHash, snapB.configHash);
  } finally {
    cleanup(root);
  }
});

test('indexTree 在无 staged 变更时稳定（确定性）', () => {
  const root = makeRepo({ 'src/a.txt': 'one' });
  try {
    assert.equal(indexTree(root), indexTree(root));
  } finally {
    cleanup(root);
  }
});

test('snapshot 跨多次生成（无变化）identity 稳定', () => {
  const root = makeRepo({ 'src/a.txt': 'one' });
  try {
    const s1 = createSnapshot({ rootDir: root, taskId: 'TASK-1', allow: ['src/**'], config: {} });
    const s2 = createSnapshot({ rootDir: root, taskId: 'TASK-1', allow: ['src/**'], config: {} });
    assert.equal(snapshotsEqual(s1, s2), true);
    assert.deepEqual(diffSnapshots(s1, s2), []);
  } finally {
    cleanup(root);
  }
});
