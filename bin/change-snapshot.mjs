#!/usr/bin/env node
/**
 * change-snapshot.mjs — ChangeSnapshot 数据合同与 canonical hash
 *
 * RFC: docs/rfc/0002-change-snapshot.md
 * 目标: 将 Task/Gate/Evidence 与提交绑定到同一份可重算的变更快照（INV-01/04）。
 *
 * 关键设计:
 *   - indexTree = git write-tree（staged 内容的"准备提交主身份"）
 *   - worktreeManifestHash = 允许范围内已跟踪文件的工作区内容（保守覆盖 staged/unstaged）
 *   - untrackedManifestHash = 允许范围内 untracked 文件
 *   - allowPolicyHash / configHash = 策略与配置的稳定 hash（变化即失效）
 *   - manifest 跨平台稳定: 正斜杠路径、UTF-8、LF、UTF-8 码点排序
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { minimatch } from 'minimatch';
import { repositoryIdentity, sha256, atomicWriteJson, readJson, statePaths, ensureStateDirectories } from './state-store.mjs';

export const SNAPSHOT_SCHEMA_VERSION = '2.0';

// ────────────────────────────────────────────────────────────────
// Git helpers
// ────────────────────────────────────────────────────────────────
function git(rootDir, args, { fallback = null, buffer = false } = {}) {
  try {
    const result = execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
      cwd: rootDir,
      encoding: buffer ? 'buffer' : 'utf-8',
      stdio: 'pipe',
    });
    return buffer ? result : String(result).trim();
  } catch {
    return fallback;
  }
}

/** 当前 index 的 tree hash（staged 内容主身份） */
export function indexTree(rootDir) {
  const tree = git(rootDir, ['write-tree']);
  if (!tree) throw new Error('Cannot compute index tree: empty index or git unavailable');
  return tree;
}

// ────────────────────────────────────────────────────────────────
// Canonical manifest
// ────────────────────────────────────────────────────────────────
/**
 * 对 [{ path, sha256 }] 生成跨平台稳定 manifest 文本。
 * 排序按 UTF-8 码点（Buffer.compare），跨平台一致、不依赖 locale。
 */
export function canonicalManifest(entries) {
  const lines = entries
    .map(e => `${e.path}\t${e.sha256}`)
    .sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')));
  return lines.join('\n');
}

export function manifestHash(entries) {
  return sha256(canonicalManifest(entries));
}

function fileSha(rootDir, relPath) {
  const absolute = join(rootDir, ...relPath.split('/'));
  if (!existsSync(absolute)) return null;
  const stat = lstatSync(absolute);
  if (stat.isSymbolicLink()) return sha256(`symlink:${readlinkSync(absolute)}`);
  if (!stat.isFile()) return null;
  return sha256(readFileSync(absolute));
}

/** 从 NUL 分隔的 git 输出解析文件列表（-z 避免引号/换行问题） */
function parseNul(buffer) {
  if (!buffer || buffer.length === 0) return [];
  return buffer.toString('utf8').split('\0').filter(Boolean).map(s => s.replaceAll('\\', '/'));
}

function listTracked(rootDir) {
  const out = git(rootDir, ['ls-files', '--cached', '-z'], { buffer: true, fallback: Buffer.alloc(0) });
  return parseNul(out);
}

function listUntracked(rootDir) {
  const out = git(rootDir, ['ls-files', '--others', '--exclude-standard', '-z'], { buffer: true, fallback: Buffer.alloc(0) });
  return parseNul(out);
}

// ────────────────────────────────────────────────────────────────
// Allow-scope filtering
// ────────────────────────────────────────────────────────────────
export function matchesAllow(relPath, allowGlobs) {
  const normalized = String(relPath).replaceAll('\\', '/').replace(/^\.\//, '');
  if (!allowGlobs || allowGlobs.length === 0) return true;
  return allowGlobs.some(glob => {
    const g = String(glob).replaceAll('\\', '/').replace(/\/$/, '');
    if (minimatch(normalized, g, { dot: true })) return true;
    if (minimatch(normalized, `${g}/**`, { dot: true })) return true;
    return false;
  });
}

/** 读取文件内容 hash；跳过目录与缺失文件 */
export function fileEntries(rootDir, relPaths) {
  const entries = [];
  for (const relPath of relPaths) {
    const normalized = String(relPath).replaceAll('\\', '/');
    const digest = fileSha(rootDir, normalized);
    if (digest !== null) entries.push({ path: normalized, sha256: digest });
  }
  return entries;
}

/** 相对路径（正斜杠），供外部组合 manifest 时使用 */
export function relativePath(rootDir, absolutePath) {
  const rel = relative(resolve(rootDir), resolve(absolutePath)).replaceAll('\\', '/');
  return rel === '' ? '' : rel.replace(/^\.\//, '');
}

// ────────────────────────────────────────────────────────────────
// Policy / config hashes
// ────────────────────────────────────────────────────────────────
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function allowPolicyHash(allowGlobs) {
  const normalized = [...(allowGlobs || [])].map(g => String(g).replaceAll('\\', '/')).sort();
  return sha256(stableStringify(normalized));
}

/** 配置 hash：影响验证语义的配置变化 → 旧证据失效（INV-04） */
export function configHash(config = {}) {
  const relevant = {
    evidence: config.evidence || {},
    risk: config.risk || {},
    gates: config.gates || {},
  };
  return sha256(stableStringify(relevant));
}

// ────────────────────────────────────────────────────────────────
// Snapshot 组装
// ────────────────────────────────────────────────────────────────
export function createSnapshot({ rootDir, taskId, branch, baseHead, allow = [], config = {} }) {
  const identity = repositoryIdentity(rootDir);
  const index = indexTree(rootDir);

  const tracked = listTracked(rootDir).filter(p => matchesAllow(p, allow));
  const untracked = listUntracked(rootDir).filter(p => matchesAllow(p, allow));

  const worktreeEntries = fileEntries(rootDir, tracked);
  const untrackedEntries = fileEntries(rootDir, untracked);

  const repositoryId = sha256(`${resolve(rootDir)}\0${identity.repository}\0${git(rootDir, ['rev-parse', '--git-common-dir'], { fallback: '.git' })}`);

  const snapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    id: id('SNAP', `${taskId}:${index}:${Date.now()}`),
    taskId,
    repositoryId,
    worktreeId: identity.worktreeId,
    branch: branch || identity.branch,
    baseHead: baseHead || identity.head,
    indexTree: index,
    worktreeManifestHash: manifestHash(worktreeEntries),
    untrackedManifestHash: manifestHash(untrackedEntries),
    allowPolicyHash: allowPolicyHash(allow),
    configHash: configHash(config),
    createdAt: new Date().toISOString(),
  };
  return Object.freeze(snapshot);
}

// ────────────────────────────────────────────────────────────────
// 比较与 diff
// ────────────────────────────────────────────────────────────────
const IDENTITY_KEYS = ['indexTree', 'worktreeManifestHash', 'untrackedManifestHash', 'allowPolicyHash', 'configHash', 'branch', 'baseHead', 'repositoryId', 'worktreeId'];

export function snapshotIdentity(snapshot) {
  const out = {};
  for (const key of IDENTITY_KEYS) out[key] = snapshot[key];
  return out;
}

export function snapshotsEqual(a, b) {
  return IDENTITY_KEYS.every(key => a[key] === b[key]);
}

/** 返回两个 snapshot 之间发生变化的字段名列表 */
export function diffSnapshots(a, b) {
  return IDENTITY_KEYS.filter(key => a[key] !== b[key]);
}

// ────────────────────────────────────────────────────────────────
// 持久化
// ────────────────────────────────────────────────────────────────
function snapshotDirectory(rootDir, config) {
  return join(statePaths(rootDir, config).snapshots || join(statePaths(rootDir, config).state, 'snapshots'));
}

export function writeSnapshot(rootDir, config, snapshot) {
  const dir = snapshotDirectory(rootDir, config);
  ensureStateDirectories(rootDir, config);
  const target = join(dir, `${snapshot.id}.json`);
  atomicWriteJson(target, snapshot);
  return target;
}

export function readSnapshot(rootDir, config, snapshotId) {
  return readJson(join(snapshotDirectory(rootDir, config), `${snapshotId}.json`), { required: false });
}

export function listSnapshots(rootDir, config) {
  const dir = snapshotDirectory(rootDir, config);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.json')).map(f => readJson(join(dir, f), { required: false })).filter(Boolean);
}

// ────────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────────
function id(prefix, seed) {
  const date = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${prefix}-${date}-${createHash('sha256').update(String(seed)).digest('hex').slice(0, 10)}`;
}
