/**
 * submitted-providers.mjs — Cloud Provider 实现（Batch D / D08；ADR-0002 D1/D6）
 *
 * 用**提交式上下文**（bin/submitted-context.mjs）实现 D04 冻结的 3 个 Provider 端口：
 *   - 不读本机 FS、不跑 git、不执行 shell（指令 D08 禁止项）；
 *   - 由 bin/provider-contract.mjs 的同一套契约用例驱动（与 Local 实现对照）；
 *   - 只做读取/落库，不做业务判定（ARCH-R1/R2）。
 *
 * 存储：`context_submissions`（项目/任务提交）· `git_snapshots`（git 提交与快照）· `decisions`（决策）。
 */
import { randomUUID } from 'node:crypto';

const parse = row => (row ? JSON.parse(row.data_json) : null);

const GIT_SUBMISSION_KIND = 'GitSnapshotSubmission';
const SNAPSHOT_KIND = 'Snapshot';

/** 用 null 补齐缺失字段（把缺省归一集中在一处，避免调用点堆积 `??` 分支）。 */
function withDefaults(source = {}, fields = []) {
  const out = {};
  for (const field of fields) out[field] = source[field] === undefined ? null : source[field];
  return out;
}

/** 读取字段（对象缺失或字段缺失 → null）。 */
function fieldOf(source, field) {
  if (!source) return null;
  return source[field] === undefined ? null : source[field];
}

/** git 提交的文件清单（缺省为空数组）。 */
function filesOf(submission) {
  return Array.isArray(submission?.changed_files) ? submission.changed_files : [];
}

/** 提交里声明的资产引用（缺省为空数组）。 */
const assetsOf = submission => (Array.isArray(submission?.assets) ? submission.assets : []);

/** 读取最近一次某类提交。 */
function latestSubmission(db, kind) {
  return parse(db.prepare('SELECT data_json FROM context_submissions WHERE kind = ? ORDER BY submitted_at DESC, id DESC LIMIT 1').get(kind));
}

/** 读取最近一次 git 快照提交（changedFiles/diff 的数据源）。 */
function latestGitSubmission(db) {
  return parse(db.prepare('SELECT data_json FROM git_snapshots WHERE kind = ? ORDER BY created_at DESC, id DESC LIMIT 1').get(GIT_SUBMISSION_KIND));
}

const GIT_COLUMNS = Object.freeze(['task_id', 'commit', 'base_commit', 'tree_hash', 'diff_hash', 'workspace_hash']);
const CONTEXT_COLUMNS = Object.freeze(['project_id', 'task_id']);

const INSERT_GIT_ROW_SQL = `INSERT INTO git_snapshots (id, kind, task_id, commit_sha, base_commit, changed_files_json,
  tree_hash, diff_hash, workspace_hash, summary, data_json, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, task_id = excluded.task_id, commit_sha = excluded.commit_sha,
    base_commit = excluded.base_commit, changed_files_json = excluded.changed_files_json,
    tree_hash = excluded.tree_hash, diff_hash = excluded.diff_hash, workspace_hash = excluded.workspace_hash,
    summary = excluded.summary, data_json = excluded.data_json, created_at = excluded.created_at`;

const INSERT_CONTEXT_ROW_SQL = `INSERT INTO context_submissions (id, kind, project_id, task_id, summary, data_json, submitted_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, project_id = excluded.project_id, task_id = excluded.task_id,
    summary = excluded.summary, data_json = excluded.data_json, submitted_at = excluded.submitted_at`;

/** git 行参数（缺省归一集中在 withDefaults）。 */
function gitRowParams(record, { id, kind, at, payload, summary }) {
  const fields = withDefaults(record, GIT_COLUMNS);
  return [id, kind, fields.task_id, fields.commit, fields.base_commit, JSON.stringify(filesOf(record)),
    fields.tree_hash, fields.diff_hash, fields.workspace_hash, summary, payload, at];
}

/** 项目/任务提交行参数。 */
function contextRowParams(record, { id, at, payload, summary }) {
  const fields = withDefaults(record, CONTEXT_COLUMNS);
  return [id, record.kind, fields.project_id, fields.task_id, summary, payload, at];
}

/** 写入 git 行（提交 kind=GitSnapshotSubmission / 快照 kind=Snapshot）。 */
function writeGitRow(db, record, { id, kind, at, payload, summary }) {
  db.prepare(INSERT_GIT_ROW_SQL).run(...gitRowParams(record, { id, kind, at, payload, summary }));
}

/**
 * 落库一条提交（按 kind 路由；同 id 幂等覆盖）。
 * @returns {object} 提交对象（补齐 id）
 */
export function recordSubmission({ db, submission } = {}) {
  if (!db || typeof db.prepare !== 'function') throw new TypeError('recordSubmission requires an open node:sqlite database handle');
  if (!submission?.kind) throw new TypeError('recordSubmission requires submission.kind');
  const id = submission.id ?? `${submission.kind}-${randomUUID()}`;
  const at = submission.submitted_at ?? new Date().toISOString();
  const payload = JSON.stringify({ ...submission, id });
  const summary = fieldOf(submission, 'summary') ?? '';
  if (submission.kind === GIT_SUBMISSION_KIND) {
    writeGitRow(db, submission, { id, kind: GIT_SUBMISSION_KIND, at, payload, summary });
  } else {
    db.prepare(INSERT_CONTEXT_ROW_SQL).run(...contextRowParams(submission, { id, at, payload, summary }));
  }
  return { ...submission, id };
}

/** 写入一条 Cloud 快照行（kind='Snapshot'，与提交区分）。 */
function insertSnapshot(db, snapshot) {
  writeGitRow(db, snapshot, {
    id: snapshot.id,
    kind: SNAPSHOT_KIND,
    at: snapshot.createdAt ?? new Date().toISOString(),
    payload: JSON.stringify(snapshot),
    summary: fieldOf(snapshot, 'summary') ?? '',
  });
}

/**
 * 创建 Cloud（Submitted）Provider 集合：与 createLocalProviders 同形，但数据来自提交。
 * @param {object} options
 * @param {object} options.db 已打开的 node:sqlite 句柄
 * @param {object} [options.config]
 */
export function createSubmittedProviders({ db, config = {} } = {}) {
  if (!db || typeof db.prepare !== 'function') {
    throw new TypeError('createSubmittedProviders requires an open node:sqlite database handle');
  }

  const projectContext = {
    kind: 'ProjectContextProvider',
    profile: () => latestSubmission(db, 'ProjectContextSubmission'),
    index: () => {
      const submission = latestSubmission(db, 'ProjectContextSubmission');
      return { generatedAt: fieldOf(submission, 'submitted_at'), assets: assetsOf(submission) };
    },
    search: (query, top = 10) => ({ indexed: true, query, top, count: 0, results: [] }),
    status: () => ({ indexed: true, assets: assetsOf(latestSubmission(db, 'ProjectContextSubmission')).length, stale: [] }),
  };

  const taskContext = {
    kind: 'TaskContextProvider',
    contextPack: task => {
      const submission = latestSubmission(db, 'TaskContextSubmission');
      const taskId = fieldOf(task, 'id');
      return {
        id: `CTX-${taskId ?? 'unknown'}`,
        taskId,
        assets: assetsOf(submission),
        summary: fieldOf(submission, 'summary') ?? '',
      };
    },
    recordDecision: ({ taskId, title, decision, reason }) => {
      const record = { id: `DEC-${randomUUID()}`, taskId: fieldOf({ taskId }, 'taskId'), title, decision, reason, createdAt: new Date().toISOString() };
      db.prepare('INSERT INTO decisions (id, task_id, data_json, created_at) VALUES (?, ?, ?, ?)')
        .run(record.id, record.taskId, JSON.stringify(record), record.createdAt);
      return record;
    },
  };

  const gitSnapshot = {
    kind: 'GitSnapshotProvider',
    changedFiles: () => ({ files: filesOf(latestGitSubmission(db)), errors: [] }),
    diff: () => ({ diff: '', errors: [], diff_hash: fieldOf(latestGitSubmission(db), 'diff_hash') }),
    showAtRef: () => ({ content: null, error: 'cloud: file content is not submitted' }),
    createSnapshot: input => {
      const submission = latestGitSubmission(db);
      const fields = withDefaults(input, ['taskId', 'branch', 'baseHead']);
      return {
        id: `SNAP-${randomUUID()}`,
        taskId: fields.taskId,
        branch: fields.branch,
        baseHead: fields.baseHead,
        allow: Array.isArray(input.allow) ? input.allow : [],
        changed_files: filesOf(submission),
        tree_hash: fieldOf(submission, 'tree_hash'),
        diff_hash: fieldOf(submission, 'diff_hash'),
        workspace_hash: fieldOf(submission, 'workspace_hash'),
        summary: fieldOf(submission, 'summary') ?? '',
        createdAt: new Date().toISOString(),
      };
    },
    writeSnapshot: snapshot => {
      insertSnapshot(db, snapshot);
      return snapshot;
    },
    readSnapshot: snapshotId => parse(db.prepare('SELECT data_json FROM git_snapshots WHERE id = ?').get(snapshotId)),
    listSnapshots: () => db.prepare('SELECT data_json FROM git_snapshots WHERE kind = ? ORDER BY created_at, id')
      .all(SNAPSHOT_KIND).map(parse),
  };

  return { projectContext, taskContext, gitSnapshot };
}
