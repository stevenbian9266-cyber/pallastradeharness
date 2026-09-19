/**
 * approvals.mjs — Approval Artifact Hash（Batch C / C11）
 *
 * 定位：审批 = 对**某一版制品内容**的确认（方案 §44/§94/§95）。
 *   - 形状：{ id, taskId, type, artifact_hash, files, summary, approved_at, status }
 *   - `artifact_hash` 为被确认文件的聚合哈希；文件变化 → `STALE`，不得复用；
 *   - 兼容现有 `user-confirmed` / `design-confirmed` 人工门：清理检查项时自动记录（gate-commands 调用）。
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { APPROVAL_TYPES } from './contracts.mjs';
import { atomicWriteJson } from './state-store.mjs';
import { collectGlob } from './glob-utils.mjs';
import { constitutionDir, hashFiles } from './project-artifacts.mjs';

export { APPROVAL_TYPES };
export const APPROVAL_STATUSES = Object.freeze(['VALID', 'STALE', 'UNBOUND']);

export function approvalsPath(rootDir, config) {
  return resolve(constitutionDir(rootDir, config), 'approvals.json');
}

function normalizeRel(path) {
  return String(path).replaceAll('\\', '/').replace(/^\.\//, '');
}

function readAll({ rootDir, config }) {
  const path = approvalsPath(rootDir, config);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    return Array.isArray(parsed?.approvals) ? parsed.approvals : [];
  } catch {
    throw new TypeError(`approvals file is not valid JSON: ${path}`);
  }
}

function writeAll({ rootDir, config, approvals }) {
  const path = approvalsPath(rootDir, config);
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteJson(path, { schemaVersion: '1.0', type: 'ApprovalStore', approvals });
  return path;
}

/** 由 glob 收集 → 过滤 → 相对路径清单。 */
function collectRel({ rootDir, pattern, filter = () => true }) {
  return collectGlob(rootDir, pattern)
    .filter(abs => filter(abs))
    .map(abs => normalizeRel(relative(rootDir, abs)))
    .sort();
}

/** requirement 审批绑定文件：关联 PRD + 认领该 Task 的 REQ 文档。 */
export function requirementApprovalFiles({ rootDir, config, task }) {
  const files = [];
  if (task?.linkedPrd) {
    files.push(...collectRel({ rootDir, pattern: 'docs/prd/**/*.md', filter: abs => abs.includes(task.linkedPrd) }));
  }
  if (task?.id) {
    files.push(...collectRel({
      rootDir,
      pattern: 'harness/requirements/REQ-*.md',
      filter: abs => { try { return readFileSync(abs, 'utf-8').includes(task.id); } catch { return false; } },
    }));
  }
  return [...new Set(files)].sort();
}

/** ui 审批绑定文件：该任务的 4 个设计产物。 */
export function designApprovalFiles({ rootDir, config, task }) {
  if (!task?.id) return [];
  return collectRel({ rootDir, pattern: `docs/designs/${task.id}/**/*.md` });
}

/**
 * 记录一次审批（幂等键：taskId + type + artifact_hash）。
 * @returns {object} Approval 记录
 */
export function recordApproval({
  rootDir, config, taskId, type, summary = '', files = [], now = new Date().toISOString(),
}) {
  if (!APPROVAL_TYPES.includes(type)) throw new TypeError(`unknown approval type: ${type} (available: ${APPROVAL_TYPES.join(', ')})`);
  const relFiles = [...new Set(files.map(normalizeRel))].sort();
  const artifactHash = relFiles.length > 0 ? hashFiles({ rootDir, files: relFiles }) : null;
  const approvals = readAll({ rootDir, config });
  const existing = approvals.find(item => item.taskId === taskId && item.type === type && item.artifact_hash === artifactHash && item.status !== 'STALE');
  if (existing) return existing;
  const record = {
    id: `APR-${Date.now().toString(36)}`,
    taskId: taskId || null,
    type,
    artifact_hash: artifactHash,
    files: relFiles,
    summary: summary || '',
    approved_at: now,
    status: relFiles.length > 0 ? 'VALID' : 'UNBOUND',
  };
  approvals.push(record);
  writeAll({ rootDir, config, approvals });
  return record;
}

export function listApprovals({ rootDir, config }) {
  return readAll({ rootDir, config });
}

/** 逐个复算绑定 hash → 实时状态（记录状态不覆盖，漂移即时可见）。 */
export function approvalStatuses({ rootDir, config }) {
  return readAll({ rootDir, config }).map(record => {
    if (!record.artifact_hash || !Array.isArray(record.files) || record.files.length === 0) {
      return { ...record, status: 'UNBOUND' };
    }
    const current = hashFiles({ rootDir, files: record.files });
    return { ...record, status: current === record.artifact_hash ? 'VALID' : 'STALE', current_hash: current };
  });
}

/** 有效的（非 STALE）审批；可按 taskId / type 过滤。 */
export function validApprovals({ rootDir, config, taskId = null, type = null }) {
  return approvalStatuses({ rootDir, config }).filter(record =>
    record.status === 'VALID'
    && (taskId === null || record.taskId === taskId)
    && (type === null || record.type === type));
}
