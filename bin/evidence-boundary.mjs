/**
 * evidence-boundary.mjs — Cloud 证据边界（Batch D / D09；ADR-0002 D6）
 *
 * Local：真实 Verifier 执行 + 真实 Workspace Snapshot；
 * Cloud：Agent 本地执行 → 提交 Evidence，因此**必须**标注边界：
 *   source = local_agent · trust_level = cooperative
 * 并且**不得伪装成 CI attestation**（声称 ci_attested 必须携带 attestation 佐证）。
 *
 * 纯逻辑模块：默认值、推导与校验；包装器 `createBoundaryEvidenceRepository` 供 D10 装配使用。
 */

/** 允许的证据来源（冻结）。 */
export const EVIDENCE_SOURCES = Object.freeze(['local_agent', 'human', 'ci_attested']);

/** 允许的信任级别（冻结）。 */
export const TRUST_LEVELS = Object.freeze(['cooperative', 'verified']);

/** 默认边界（Cloud 记录证据时的缺省标注）。 */
export const EVIDENCE_BOUNDARY_DEFAULTS = Object.freeze({
  source: 'local_agent',
  trust_level: 'cooperative',
});

/**
 * 由来源推导信任级别。
 * `ci_attested` 必须携带 attestation 佐证，否则抛错（不伪装 CI attestation）。
 */
export function resolveTrustLevel(source, attestation) {
  if (source === 'ci_attested') {
    if (typeof attestation === 'string' && attestation.trim().length > 0) return TRUST_LEVELS[1];
    throw new TypeError('ci_attested requires an attestation string (cloud must not fake CI attestation)');
  }
  return TRUST_LEVELS[0];
}

/**
 * 为证据记录打边界标记（返回新对象；不修改入参）。
 * @returns {object} 含 `source` / `trust_level` 的记录
 */
export function applyEvidenceBoundary(input = {}) {
  const source = input.source ?? EVIDENCE_BOUNDARY_DEFAULTS.source;
  if (!EVIDENCE_SOURCES.includes(source)) throw new TypeError(`unknown evidence source: ${source}`);
  const trustLevel = resolveTrustLevel(source, input.attestation);
  if (input.trust_level !== undefined && input.trust_level !== trustLevel) {
    throw new TypeError(`trust_level "${input.trust_level}" conflicts with source "${source}" (expected ${trustLevel})`);
  }
  const record = { ...input, source, trust_level: trustLevel };
  if (source !== 'ci_attested') delete record.attestation;
  return record;
}

/**
 * 校验一条证据是否带有合法边界标记。
 * @returns {{ok: boolean, errors: string[], missing: string[]}}
 */
export function validateEvidenceBoundary(record) {
  if (record === null || typeof record !== 'object') {
    return { ok: false, errors: ['evidence record must be an object'], missing: ['source', 'trust_level'] };
  }
  const missing = ['source', 'trust_level'].filter(field => record[field] === undefined || record[field] === null);
  const errors = missing.map(field => `evidence.${field} is required`);
  if (record.source !== undefined && !EVIDENCE_SOURCES.includes(record.source)) {
    errors.push(`unknown evidence source: ${record.source}`);
  }
  if (record.trust_level !== undefined && !TRUST_LEVELS.includes(record.trust_level)) {
    errors.push(`unknown trust_level: ${record.trust_level}`);
  }
  return { ok: errors.length === 0, errors, missing };
}

/**
 * 包装 EvidenceRepository：`record` 自动打边界标记；`list` / `bundle` 原样透传。
 */
export function createBoundaryEvidenceRepository(repo) {
  if (!repo || typeof repo.record !== 'function') {
    throw new TypeError('createBoundaryEvidenceRepository requires an EvidenceRepository');
  }
  return {
    kind: repo.kind ?? 'EvidenceRepository',
    list: taskId => repo.list(taskId),
    record: input => repo.record(applyEvidenceBoundary(input)),
    bundle: task => repo.bundle(task),
  };
}
