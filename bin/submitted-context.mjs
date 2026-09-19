/**
 * submitted-context.mjs — Cloud 提交式上下文契约（Batch D / D08；ADR-0002 D6）
 *
 * 定位：本地 Agent 执行真实 verifier / workspace snapshot 后，向 Cloud **提交结构化摘要 + hash**。
 *   - 默认**不保存**完整源码与完整 diff → `stripSourcePayload` 强制净化并记录 `removed` 审计；
 *   - 三类提交：ProjectContextSubmission / TaskContextSubmission / GitSnapshotSubmission（指令 D08）；
 *   - 纯逻辑（无 IO），供 Cloud Provider 实现（bin/submitted-providers.mjs）与提交入口（D10）共用。
 */

/** 提交种类（冻结）。 */
export const SUBMISSION_KINDS = Object.freeze([
  'ProjectContextSubmission',
  'TaskContextSubmission',
  'GitSnapshotSubmission',
]);

/** Git 快照提交字段（冻结；对齐指令 D05/D08：只传 hash 与文件清单）。 */
export const GIT_SNAPSHOT_FIELDS = Object.freeze([
  'commit',
  'base_commit',
  'changed_files',
  'tree_hash',
  'diff_hash',
  'workspace_hash',
]);

/** 源码/全量 diff 字段（净化时递归删除；JSON 数据无环，故不设深度上限）。 */
export const SOURCE_PAYLOAD_KEYS = Object.freeze([
  'content',
  'source',
  'source_code',
  'code',
  'patch',
  'full_diff',
  'diff',
  'blob',
  'text',
]);

/** 各类提交的必需字段。 */
const REQUIRED_FIELDS = Object.freeze({
  ProjectContextSubmission: Object.freeze(['id', 'summary']),
  TaskContextSubmission: Object.freeze(['task_id', 'summary']),
  GitSnapshotSubmission: GIT_SNAPSHOT_FIELDS,
});

const SUMMARY_MAX = 240;

/**
 * 递归剥离源码 / 全量 diff 字段。
 * @returns {{value: any, removed: string[]}} `removed` 为被剥离字段的路径（如 `files[0].content`）
 */
export function stripSourcePayload(input) {
  const removed = [];

  const walk = (value, path) => {
    if (Array.isArray(value)) return value.map((item, index) => walk(item, `${path}[${index}]`));
    if (value === null || typeof value !== 'object') return value;
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (SOURCE_PAYLOAD_KEYS.includes(key)) {
        removed.push(childPath);
        continue;
      }
      out[key] = walk(item, childPath);
    }
    return out;
  };

  return { value: walk(input, ''), removed };
}

/**
 * 校验提交是否满足一类契约。
 * @returns {{ok: boolean, errors: string[], missing: string[]}}
 */
export function validateSubmission(kind, submission) {
  const required = REQUIRED_FIELDS[kind];
  if (!required) return { ok: false, errors: [`unknown submission kind: ${kind}`], missing: [] };
  if (submission === null || typeof submission !== 'object') {
    return { ok: false, errors: [`${kind} must be an object`], missing: [...required] };
  }
  const missing = required.filter(field => submission[field] === undefined || submission[field] === null);
  const errors = missing.map(field => `${kind}.${field} is required`);
  if (kind === 'GitSnapshotSubmission' && submission.changed_files !== undefined && !Array.isArray(submission.changed_files)) {
    errors.push('GitSnapshotSubmission.changed_files must be an array');
  }
  return { ok: errors.length === 0, errors, missing };
}

/** 提交摘要（≤240 字符；不读取源码/完整 diff 字段）。 */
export function summarizeSubmission(kind, submission = {}) {
  const provided = typeof submission.summary === 'string' ? submission.summary.trim() : '';
  if (provided) return provided.slice(0, SUMMARY_MAX);
  const files = Array.isArray(submission.changed_files) ? submission.changed_files.length : 0;
  const byKind = {
    ProjectContextSubmission: `project ${submission.id ?? 'unknown'} submitted`,
    TaskContextSubmission: `task ${submission.task_id ?? 'unknown'} context submitted`,
    GitSnapshotSubmission: `${files} file(s) changed, commit ${String(submission.commit ?? 'unknown').slice(0, 8)}`,
  };
  return String(byKind[kind] ?? `${kind} submitted`).slice(0, SUMMARY_MAX);
}

/** 构造提交（先净化、再摘要、后校验；失败抛 TypeError）。 */
function buildSubmission(kind, input = {}) {
  const { value, removed } = stripSourcePayload(input);
  const record = { ...value, kind, submitted_at: value.submitted_at ?? new Date().toISOString() };
  record.summary = summarizeSubmission(kind, record);
  if (removed.length > 0) record.removed = removed;
  const result = validateSubmission(kind, record);
  if (!result.ok) throw new TypeError(`invalid ${kind}: ${result.errors.join('; ')}`);
  return Object.freeze(record);
}

/** ProjectContextSubmission 构造。 */
export const buildProjectContextSubmission = input => buildSubmission('ProjectContextSubmission', input);
/** TaskContextSubmission 构造。 */
export const buildTaskContextSubmission = input => buildSubmission('TaskContextSubmission', input);
/** GitSnapshotSubmission 构造。 */
export const buildGitSnapshotSubmission = input => buildSubmission('GitSnapshotSubmission', input);
