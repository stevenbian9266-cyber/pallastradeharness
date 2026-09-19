/**
 * sqlite-store.mjs — Cloud SQLite 存储基建（Batch D / D06；ADR-0002 D2）
 *
 * 定位：Cloud Runtime 的**存储底座**（schema / 迁移 / pragma / 事务 / 打开）。
 *   - Local Runtime 继续使用 File/Git/Shell（指令 D06：不迁移 Local 到 SQLite）；
 *   - Cloud 使用本模块 + bin/sqlite-repositories.mjs 实现同一端口面（D07）；
 *   - 两侧由 bin/repository-contract.mjs 的同一套契约用例同时驱动（防双轨漂移）。
 *
 * 约束：
 *   - 仅使用 Node 内置 `node:sqlite`（ADR-0002 D2；不引入原生依赖）；
 *   - engines 仍为 >=22.0.0，而 `node:sqlite` 自 22.5 起可用 → **懒加载 + 可用性判定**；
 *   - 本模块不做任何业务判定（ARCH-R1/R2），不含本机 IO 依赖。
 */

/** schema 版本（= 最后一个迁移版本号）。 */
export const SQLITE_SCHEMA_VERSION = 2;

/** 默认 busy_timeout（毫秒）。 */
export const DEFAULT_BUSY_TIMEOUT_MS = 5000;

/** busy_timeout 回退语句（静态字面量：不对 SQL 做任何拼接，避免注入面）。 */
const BUSY_TIMEOUT_FALLBACK_SQL = 'PRAGMA busy_timeout = 5000';

/** Cloud 存储表清单（指令 TASK-D06 至少集 + 提交式上下文表 + 迁移版本表）。 */
export const SQLITE_TABLES = Object.freeze([
  'projects',
  'project_artifacts',
  'constitution_versions',
  'tasks',
  'task_checkpoints',
  'task_events',
  'gates',
  'approvals',
  'findings',
  'evidences',
  'decisions',
  'knowledge_assessments',
  'context_submissions',
  'git_snapshots',
  'schema_migrations',
]);

/** 提交式上下文表（迁移 v2；仅本模块内部使用）。 */
const SUBMISSION_MIGRATION_STATEMENTS = Object.freeze([
  `CREATE TABLE IF NOT EXISTS context_submissions (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    project_id TEXT,
    task_id TEXT,
    summary TEXT,
    data_json TEXT NOT NULL,
    submitted_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS git_snapshots (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    task_id TEXT,
    commit_sha TEXT,
    base_commit TEXT,
    changed_files_json TEXT,
    tree_hash TEXT,
    diff_hash TEXT,
    workspace_hash TEXT,
    summary TEXT,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_context_submissions_task ON context_submissions(task_id)',
  'CREATE INDEX IF NOT EXISTS idx_context_submissions_kind ON context_submissions(kind)',
  'CREATE INDEX IF NOT EXISTS idx_git_snapshots_task ON git_snapshots(task_id)',
  'CREATE INDEX IF NOT EXISTS idx_git_snapshots_kind ON git_snapshots(kind)',
]);

const CORE_STATEMENTS = Object.freeze([
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT,
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS project_artifacts (
    id TEXT PRIMARY KEY,
    type TEXT,
    path TEXT,
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS constitution_versions (
    version TEXT PRIMARY KEY,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    status TEXT,
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS task_checkpoints (
    id TEXT PRIMARY KEY,
    task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS task_events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS gates (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    type TEXT NOT NULL,
    summary TEXT,
    status TEXT,
    artifact_hash TEXT,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS findings (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS evidences (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    evidence_type TEXT NOT NULL,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS decisions (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS knowledge_assessments (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id, seq)',
  'CREATE INDEX IF NOT EXISTS idx_evidences_task ON evidences(task_id)',
  'CREATE INDEX IF NOT EXISTS idx_approvals_task ON approvals(task_id)',
  'CREATE INDEX IF NOT EXISTS idx_project_artifacts_type ON project_artifacts(type)',
]);

/** 迁移脚本（按 version 升序应用；仅本模块内部使用）。 */
export const MIGRATIONS = Object.freeze([
  Object.freeze({ version: 1, name: 'cloud-core', statements: CORE_STATEMENTS }),
  Object.freeze({ version: 2, name: 'submitted-context', statements: SUBMISSION_MIGRATION_STATEMENTS }),
]);

/** `node:sqlite` 可用性（无副作用、不抛错；需要 Node >= 22.5）。 */
export function isSqliteAvailable() {
  const [major, minor] = String(process.versions.node).split('.').map(Number);
  return major > 22 || (major === 22 && minor >= 5);
}

/**
 * 短事务：`BEGIN IMMEDIATE` → fn() → `COMMIT`；异常则 `ROLLBACK` 并**重抛原错误**（不吞错）。
 * @template T
 * @param {object} db node:sqlite DatabaseSync 句柄
 * @param {() => T} fn 事务体
 * @returns {T}
 */
export function withTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // 回滚失败不掩盖原错误（连接已失效时 COMMIT/ROLLBACK 都可能抛）
    }
    throw error;
  }
}

/**
 * 应用缺失的迁移（幂等；每个版本一个事务）。
 * @returns {{applied: number, version: number}}
 */
export function migrateDatabase(db, { migrations = MIGRATIONS } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const done = new Set(db.prepare('SELECT version FROM schema_migrations').all().map(row => Number(row.version)));
  let applied = 0;
  for (const migration of migrations) {
    if (done.has(migration.version)) continue;
    withTransaction(db, () => {
      for (const statement of migration.statements) db.exec(statement);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(migration.version, migration.name, new Date().toISOString());
    });
    applied += 1;
  }
  return { applied, version: SQLITE_SCHEMA_VERSION };
}

/**
 * 打开并初始化数据库（同步；注入 `DatabaseSync` 构造器，便于测试与嵌入）。
 * @param {object} options
 * @param {string} [options.file] 数据库文件（`:memory:` 为内存库）
 * @param {Function} options.DatabaseSync node:sqlite 构造器
 * @param {number} [options.busyTimeoutMs] busy_timeout（毫秒；经构造器选项设置）
 * @param {readonly object[]} [options.migrations]
 */
export function openHarnessDatabaseSync({
  file = ':memory:', DatabaseSync, busyTimeoutMs = DEFAULT_BUSY_TIMEOUT_MS, migrations,
} = {}) {
  if (typeof DatabaseSync !== 'function') {
    throw new TypeError('openHarnessDatabaseSync requires the node:sqlite DatabaseSync constructor');
  }
  const timeout = Math.max(0, Number(busyTimeoutMs) || 0);
  const db = new DatabaseSync(file, { timeout });
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  ensureBusyTimeout(db);
  migrateDatabase(db, { migrations });
  return db;
}

/**
 * busy_timeout 保障：优先由构造器 `timeout` 选项生效；
 * 较旧运行时若不支持该选项（读回 0），则回退到静态字面量 PRAGMA（默认 5000ms）。
 */
function ensureBusyTimeout(db) {
  if (Number(db.prepare('PRAGMA busy_timeout').get().timeout) > 0) return;
  db.exec(BUSY_TIMEOUT_FALLBACK_SQL);
}

/**
 * 打开并初始化数据库（异步；懒加载 `node:sqlite`，不可用时抛含版本要求的错误）。
 */
export async function openHarnessDatabase({ file = ':memory:', busyTimeoutMs = DEFAULT_BUSY_TIMEOUT_MS } = {}) {
  let sqlite;
  try {
    sqlite = await import('node:sqlite');
  } catch (error) {
    throw new Error(`node:sqlite is unavailable (requires Node >= 22.5): ${error?.message ?? error}`);
  }
  return openHarnessDatabaseSync({ file, DatabaseSync: sqlite.DatabaseSync, busyTimeoutMs });
}
