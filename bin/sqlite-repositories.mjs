/**
 * sqlite-repositories.mjs — Sqlite 仓储适配器（Batch D / D07；ADR-0002 D1/D2）
 *
 * 与 bin/file-repositories.mjs **同形**：同一组 kind、同一方法面、同一缺失归一。
 *   - 只做存储读写与归一，不做任何业务判定（ARCH-R1/R2）；
 *   - 由 bin/repository-contract.mjs 的同一套契约用例驱动（与 File 适配器对照）；
 *   - 不含本机 IO 依赖（无 node:fs / node:child_process）。
 *
 * 存储形态：业务对象整存于 `data_json`，另抽少量约束列（id / task_id / type / status / seq）。
 */
import { randomUUID } from 'node:crypto';
import { migrateGateState } from './gate-lifecycle.mjs';

const parseRow = row => (row ? JSON.parse(row.data_json) : null);

/** 读取单行 data_json（不存在 → null）。 */
function readOne(db, sql, ...params) {
  return parseRow(db.prepare(sql).get(...params));
}

/** 读取多行 data_json（按给定 SQL 顺序）。 */
function readMany(db, sql, ...params) {
  return db.prepare(sql).all(...params).map(row => parseRow(row));
}

/** 命令句柄：`run` 参数里的 undefined 在 node:sqlite 会抛错 → 统一归一为 null。 */
const emptyToNull = value => value ?? null;

/**
 * 创建 Sqlite 仓储集合。
 * @param {object} options
 * @param {object} options.db 已打开并迁移的 node:sqlite DatabaseSync 句柄
 * @param {object} [options.config]
 */
export function createSqliteRepositories({ db, config = {} } = {}) {
  if (!db || typeof db.prepare !== 'function') {
    throw new TypeError('createSqliteRepositories requires an open node:sqlite database handle');
  }

  const artifacts = {
    kind: 'ArtifactRepository',
    list: () => readMany(db, 'SELECT data_json FROM project_artifacts ORDER BY id'),
    get: artifactId => readOne(db, 'SELECT data_json FROM project_artifacts WHERE id = ?', artifactId),
    upsert(input = {}) {
      if (!input.id) throw new TypeError('ArtifactRepository.upsert requires id');
      const record = {
        ...input,
        id: input.id,
        type: input.type ?? null,
        path: input.path ?? null,
        updatedAt: new Date().toISOString(),
      };
      db.prepare(`INSERT INTO project_artifacts (id, type, path, data_json, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET type = excluded.type, path = excluded.path,
          data_json = excluded.data_json, updated_at = excluded.updated_at`)
        .run(record.id, record.type, record.path, JSON.stringify(record), record.updatedAt);
      return record;
    },
    refresh: () => artifacts.list(),
  };

  const tasks = {
    kind: 'TaskRepository',
    list: () => readMany(db, 'SELECT data_json FROM tasks ORDER BY id'),
    get: taskId => readOne(db, 'SELECT data_json FROM tasks WHERE id = ?', taskId),
    save(task = {}) {
      if (!task.id) throw new TypeError('TaskRepository.save requires task.id');
      db.prepare(`INSERT INTO tasks (id, status, data_json, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET status = excluded.status, data_json = excluded.data_json,
          updated_at = excluded.updated_at`)
        .run(task.id, emptyToNull(task.status), JSON.stringify(task), new Date().toISOString());
      return task;
    },
  };

  const gates = {
    kind: 'GateRepository',
    loadLatest: () => loadLatestGate(db),
    statusSnapshot: () => statusSnapshot(db),
    save(gateState) {
      if (!gateState?.id) throw new TypeError('GateRepository.save requires gateState.id');
      db.prepare(`INSERT INTO gates (id, task_id, data_json, created_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET task_id = excluded.task_id, data_json = excluded.data_json`)
        .run(gateState.id, emptyToNull(gateState.taskId), JSON.stringify(gateState),
          gateState.createdAt ?? new Date().toISOString());
      return gateState;
    },
  };

  const approvals = {
    kind: 'ApprovalRepository',
    list: () => readMany(db, 'SELECT data_json FROM approvals ORDER BY created_at, id'),
    record(input = {}) {
      const record = buildApprovalRecord(input);
      insertApproval(db, record);
      return record;
    },
    statuses: () => readMany(db, 'SELECT data_json FROM approvals ORDER BY created_at, id'),
  };

  const evidence = {
    kind: 'EvidenceRepository',
    list: taskId => readMany(db, 'SELECT data_json FROM evidences WHERE task_id = ? ORDER BY created_at, id', taskId),
    record(input = {}) {
      const record = {
        ...input,
        id: `EVD-${randomUUID()}`,
        taskId: input.task?.id ?? input.taskId ?? null,
        evidenceType: input.evidenceType ?? null,
        summary: input.summary ?? '',
        createdAt: new Date().toISOString(),
      };
      delete record.task;
      db.prepare(`INSERT INTO evidences (id, task_id, evidence_type, data_json, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run(record.id, record.taskId, emptyToNull(record.evidenceType), JSON.stringify(record), record.createdAt);
      return record;
    },
    bundle: task => ({ taskId: task?.id ?? null, evidence: evidence.list(task?.id ?? null) }),
  };

  const events = {
    kind: 'EventRepository',
    append(taskId, event = {}) {
      const record = { at: new Date().toISOString(), ...event };
      db.prepare('INSERT INTO task_events (task_id, type, payload_json, at) VALUES (?, ?, ?, ?)')
        .run(taskId, emptyToNull(record.type), JSON.stringify(record), record.at);
      return record;
    },
    list: taskId => db.prepare('SELECT payload_json FROM task_events WHERE task_id = ? ORDER BY seq')
      .all(taskId).map(row => JSON.parse(row.payload_json)),
  };

  const project = {
    kind: 'ProjectRepository',
    getProfile: () => readOne(db, 'SELECT data_json FROM projects ORDER BY updated_at DESC, id LIMIT 1'),
    listArtifacts: () => artifacts.list(),
    getConstitutionVersion: () => readOne(db, 'SELECT data_json FROM constitution_versions ORDER BY created_at DESC, version DESC LIMIT 1'),
  };

  return { project, artifacts, tasks, gates, approvals, evidence, events };
}

/** 构造 Approval 记录（字段缺省归一集中在此，使 `record` 方法保持零分支）。 */
function buildApprovalRecord(input) {
  return {
    id: `APR-${randomUUID()}`,
    taskId: input.taskId ?? null,
    type: input.type ?? null,
    summary: input.summary ?? '',
    status: input.status ?? 'UNBOUND',
    artifact_hash: input.artifact_hash ?? null,
    createdAt: new Date().toISOString(),
  };
}

/** 写入 Approval 行（单语句写 = 天然原子）。 */
function insertApproval(db, record) {
  db.prepare(`INSERT INTO approvals (id, task_id, type, summary, status, artifact_hash, data_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(record.id, record.taskId, emptyToNull(record.type), record.summary, record.status, record.artifact_hash,
      JSON.stringify(record), record.createdAt);
}

/** Gate 侧组装：无记录 → 与 File 适配器同形的 `{ ok: false, code }`。 */
function loadLatestGate(db) {
  const row = db.prepare('SELECT id, data_json FROM gates ORDER BY created_at DESC, id DESC LIMIT 1').get();
  if (!row) return { ok: false, code: 'NO_ACTIVE_GATES' };
  return { ok: true, gateId: row.id, gateState: migrateGateState(JSON.parse(row.data_json)) };
}

/** Gate 状态快照：空库直接返回空态；有记录时给出 phase 与待办检查（compute 见下）。 */
function statusSnapshot(db) {
  const loaded = loadLatestGate(db);
  if (!loaded.ok) return loaded;
  const gateState = loaded.gateState;
  const pending = (phase) => (gateState.checks || [])
    .filter(check => (check.phase ?? 'preparation') === phase && check.status !== 'done' && check.status !== 'cleared')
    .map(check => check.id);
  const phase = gateState.cleared
    ? 'finished'
    : gateState.implementationReady ? 'implementation' : 'preparation';
  return {
    ok: true,
    gateId: loaded.gateId,
    phase,
    remainingPreparation: pending('preparation'),
    remainingVerification: pending('verification'),
  };
}
