import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ConfigError } from './cli-utils.mjs';

export const STATE_SCHEMA_VERSION = '1.0';

function git(rootDir, args, fallback = null) {
  try {
    return execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();
  } catch {
    return fallback;
  }
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function repositoryIdentity(rootDir) {
  const root = realpathSync(resolve(rootDir));
  const repository = git(root, ['rev-parse', '--show-toplevel'], root);
  const commonDir = git(root, ['rev-parse', '--git-common-dir'], '.git');
  const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD'], 'unknown');
  const head = git(root, ['rev-parse', 'HEAD'], 'unknown');
  const worktreeId = sha256(`${realpathSync(repository)}\0${root}\0${commonDir}`).slice(0, 16);
  return { repository: realpathSync(repository), root, branch, head, worktreeId };
}

export function workspaceFingerprint(rootDir, config = {}) {
  const status = git(rootDir, ['status', '--porcelain=v1', '--untracked-files=all'], '');
  const ignored = [
    config.paths?.state || '.harness-state',
    config.paths?.evidence || 'artifacts/harness-evidence',
    config.paths?.gates || 'harness/gates',
    '.harness-cache',
  ].map(path => String(path).replaceAll('\\', '/').replace(/\/$/, ''));
  const relevant = String(status || '').split(/\r?\n/).filter(Boolean).filter(line => {
    const path = line.slice(3).replace(/^"|"$/g, '').replaceAll('\\', '/');
    return !ignored.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
  }).join('\n');
  return sha256(relevant || 'clean');
}

export function statePaths(rootDir, config = {}) {
  const state = resolve(rootDir, config.paths?.state || '.harness-state');
  return {
    state,
    tasks: join(state, 'tasks'),
    checkpoints: join(state, 'checkpoints'),
    decisions: join(state, 'decisions'),
    brain: join(state, 'brain'),
    evidence: join(state, 'evidence'),
    recovery: join(state, 'recovery'),
    knowledge: join(state, 'knowledge'),
    locks: join(state, 'locks'),
    cache: join(state, 'cache'),
  };
}

export function ensureStateDirectories(rootDir, config) {
  const paths = statePaths(rootDir, config);
  for (const path of Object.values(paths)) mkdirSync(path, { recursive: true });
  return paths;
}

export function readJson(path, { required = true } = {}) {
  if (!existsSync(path)) {
    if (!required) return null;
    throw new ConfigError(`State file not found: ${path}`);
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (error) {
    throw new ConfigError(`Invalid JSON state ${path}: ${error.message}`, { cause: error });
  }
}

export function atomicWriteJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf-8', flag: 'wx' });
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function atomicWriteText(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, String(value), { encoding: 'utf-8', flag: 'wx' });
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function lockName(path) {
  return sha256(resolve(path)).slice(0, 24);
}

export function withStateLock(rootDir, config, targetPath, operation, { staleMs = 300_000 } = {}) {
  const paths = ensureStateDirectories(rootDir, config);
  const lock = join(paths.locks, `${lockName(targetPath)}.lock`);
  if (existsSync(lock)) {
    const age = Date.now() - statSync(lock).mtimeMs;
    if (age > staleMs) unlinkSync(lock);
  }
  let handle;
  try {
    handle = openSync(lock, 'wx');
    writeFileSync(handle, JSON.stringify({ pid: process.pid, targetPath, createdAt: new Date().toISOString() }));
  } catch (error) {
    throw new ConfigError(`State is locked by another Harness process: ${targetPath}`, { cause: error });
  }
  try {
    return operation();
  } finally {
    if (handle !== undefined) closeSync(handle);
    if (existsSync(lock)) unlinkSync(lock);
  }
}

function validateStateEnvelope(value, kind) {
  if (!value || typeof value !== 'object') throw new ConfigError(`${kind} state must be an object`);
  if (value.stateSchemaVersion && value.stateSchemaVersion !== STATE_SCHEMA_VERSION) {
    throw new ConfigError(`${kind} uses unsupported state schema ${value.stateSchemaVersion}; expected ${STATE_SCHEMA_VERSION}`);
  }
  return value;
}

export function taskPath(rootDir, config, taskId) {
  return join(statePaths(rootDir, config).tasks, `${taskId}.json`);
}

export function saveTask(rootDir, config, task) {
  const path = taskPath(rootDir, config, task.id);
  return withStateLock(rootDir, config, path, () => {
    const persisted = { stateSchemaVersion: STATE_SCHEMA_VERSION, ...task, updatedAt: new Date().toISOString() };
    atomicWriteJson(path, persisted);
    return persisted;
  });
}

export function loadTask(rootDir, config, taskId) {
  return validateStateEnvelope(readJson(taskPath(rootDir, config, taskId)), 'Task');
}

export function listTasks(rootDir, config) {
  const paths = ensureStateDirectories(rootDir, config);
  return readdirSync(paths.tasks)
    .filter(file => file.endsWith('.json'))
    .map(file => validateStateEnvelope(readJson(join(paths.tasks, file)), 'Task'))
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

export function resolveTask(rootDir, config, taskId, { allowTerminal = true } = {}) {
  if (taskId) return loadTask(rootDir, config, taskId);
  const terminal = new Set(['completed', 'cancelled', 'superseded']);
  const candidates = listTasks(rootDir, config).filter(task => allowTerminal || !terminal.has(task.status));
  const active = candidates.filter(task => !terminal.has(task.status));
  if (active.length === 1) return active[0];
  if (active.length > 1) throw new ConfigError(`Multiple active tasks; specify --task <id>: ${active.map(task => task.id).join(', ')}`);
  if (allowTerminal && candidates.length > 0) return candidates[0];
  throw new ConfigError('No active task. Run `harness task start --title "..."`.');
}

const cacheIdentity = new Map();

export function scopedCacheKey(rootDir, namespace, input) {
  const root = resolve(rootDir);
  let identity = cacheIdentity.get(root);
  if (!identity) {
    const current = repositoryIdentity(root);
    identity = { repository: current.repository, worktreeId: current.worktreeId };
    cacheIdentity.set(root, identity);
  }
  return sha256(JSON.stringify({ repository: identity.repository, worktreeId: identity.worktreeId, namespace, input }));
}

export function cacheRead(rootDir, config, namespace, input) {
  const key = scopedCacheKey(rootDir, namespace, input);
  const path = join(statePaths(rootDir, config).cache, namespace, `${key}.json`);
  return readJson(path, { required: false });
}

export function cacheWrite(rootDir, config, namespace, input, value) {
  const key = scopedCacheKey(rootDir, namespace, input);
  const path = join(statePaths(rootDir, config).cache, namespace, `${key}.json`);
  atomicWriteJson(path, { stateSchemaVersion: STATE_SCHEMA_VERSION, key, createdAt: new Date().toISOString(), value });
  return path;
}
