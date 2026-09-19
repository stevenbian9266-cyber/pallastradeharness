/**
 * sqlite-store.test.mjs — Cloud SQLite 基建验证（Batch D / D06，PRD AC-005/AC-006/AC-007/AC-010）
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  SQLITE_SCHEMA_VERSION,
  SQLITE_TABLES,
  isSqliteAvailable,
  migrateDatabase,
  openHarnessDatabase,
  openHarnessDatabaseSync,
  withTransaction,
} from './sqlite-store.mjs';

let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  DatabaseSync = null;
}

const SKIP = typeof DatabaseSync === 'function' ? false : 'node:sqlite unavailable (requires Node >= 22.5)';

/** D06 核心 12 表（后续迁移只允许追加，不允许删减）。 */
const D06_CORE_TABLES = [
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
];

/** 临时目录中的文件库（可验证 WAL 等文件级 pragma）。 */
function makeFileDatabase() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-sqlite-store-'));
  const db = openHarnessDatabaseSync({ file: join(rootDir, 'harness.sqlite'), DatabaseSync });
  return { rootDir, db, cleanup: () => { try { db.close(); } catch { /* closed */ } rmSync(rootDir, { recursive: true, force: true }); } };
}

test('AC-010: isSqliteAvailable() 不抛错且与 node:sqlite 可用性一致', () => {
  const available = isSqliteAvailable();
  assert.equal(typeof available, 'boolean');
  assert.equal(available, typeof DatabaseSync === 'function');
});

test('AC-005: 12 张业务表 + 迁移版本表全部建立（含后续迁移追加表）', { skip: SKIP }, () => {
  const { db, cleanup } = makeFileDatabase();
  try {
    const names = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name));
    for (const table of SQLITE_TABLES) assert.ok(names.has(table), `missing table: ${table}`);
    for (const table of D06_CORE_TABLES) assert.ok(SQLITE_TABLES.includes(table), `D06 core table must stay: ${table}`);
    assert.ok(SQLITE_TABLES.length >= 13, '12 business tables + schema_migrations');
    assert.ok(SQLITE_SCHEMA_VERSION >= 1);
  } finally {
    cleanup();
  }
});

test('AC-005: 迁移幂等（重复调用 applied=0）', { skip: SKIP }, () => {
  const { db, cleanup } = makeFileDatabase();
  try {
    const again = migrateDatabase(db);
    assert.equal(again.applied, 0);
    assert.equal(again.version, SQLITE_SCHEMA_VERSION);
    const rows = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
    const expected = Array.from({ length: SQLITE_SCHEMA_VERSION }, (_, index) => index + 1);
    assert.deepEqual(rows.map(row => Number(row.version)), expected);
  } finally {
    cleanup();
  }
});

test('AC-006: pragma 生效（journal_mode=wal / foreign_keys=1 / busy_timeout）', { skip: SKIP }, () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-sqlite-pragma-'));
  const db = openHarnessDatabaseSync({ file: join(rootDir, 'harness.sqlite'), DatabaseSync, busyTimeoutMs: 4321 });
  try {
    assert.equal(String(db.prepare('PRAGMA journal_mode').get().journal_mode).toLowerCase(), 'wal');
    assert.equal(Number(db.prepare('PRAGMA foreign_keys').get().foreign_keys), 1);
    const busyTimeout = Number(db.prepare('PRAGMA busy_timeout').get().timeout);
    assert.ok(
      busyTimeout === 4321 || busyTimeout === 5000,
      `busy_timeout must be configured（构造器选项 4321 或回退默认 5000）, got ${busyTimeout}`,
    );
    assert.throws(
      () => db.prepare('INSERT INTO task_events (task_id, type, payload_json, at) VALUES (?, ?, ?, ?)')
        .run('TASK-NOPE', 'x', '{}', new Date().toISOString()),
      /FOREIGN KEY/i,
    );
  } finally {
    try { db.close(); } catch { /* closed */ }
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('AC-007: withTransaction 异常回滚且重抛原错误', { skip: SKIP }, () => {
  const { db, cleanup } = makeFileDatabase();
  try {
    const insert = taskId => db.prepare(`INSERT INTO tasks (id, status, data_json, updated_at) VALUES (?, ?, ?, ?)`)
      .run(taskId, 'planned', '{}', new Date().toISOString());
    const boom = new Error('transaction aborted');
    assert.throws(() => withTransaction(db, () => {
      insert('TASK-TX-1');
      throw boom;
    }), /transaction aborted/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n, 0, 'rolled back write must not persist');

    withTransaction(db, () => insert('TASK-TX-2'));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n, 1, 'committed write must persist');
  } finally {
    cleanup();
  }
});

test('FR-003: openHarnessDatabase 懒加载 node:sqlite（不可用则抛含版本要求的错误）', async () => {
  if (typeof DatabaseSync !== 'function') {
    await assert.rejects(() => openHarnessDatabase({ file: ':memory:' }), /node:sqlite is unavailable.*22\.5/);
    return;
  }
  const db = await openHarnessDatabase({ file: ':memory:' });
  try {
    const names = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name));
    assert.ok(names.has('tasks'));
  } finally {
    try { db.close(); } catch { /* closed */ }
  }
});
