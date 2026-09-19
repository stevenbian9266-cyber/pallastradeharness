/**
 * constitution-change.mjs — Constitution Change Flow / Skills Staleness（Batch C / C09 + C10）
 *
 * 统一流程（指令 C09）：
 *   CHANGE_REQUIRED → Change Proposal → Decision / ADR → Approval if required
 *   → Update Artifact → New Constitution Version → Skill Impact → Resume Task
 *
 * 守卫：制品 drift 未走变更流时，`constitution:lock` 拒绝（禁止 Developer 静默改 Constitution 后继续）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { atomicWriteJson } from './state-store.mjs';
import { collectGlob } from './glob-utils.mjs';
import { constitutionDir, refreshArtifacts, saveRefreshedArtifacts } from './project-artifacts.mjs';
import { getConstitutionVersionSnapshot, getCurrentConstitutionVersion, lockConstitutionVersion, skillGlobs } from './constitution.mjs';

export const SKILL_DISPOSITIONS = Object.freeze(['UPDATE', 'REVIEWED_NO_CHANGE']);

export function changesDir(rootDir, config) {
  return resolve(constitutionDir(rootDir, config), 'changes');
}

export function dispositionsPath(rootDir, config) {
  return resolve(constitutionDir(rootDir, config), 'skill-dispositions.json');
}

/** 当前 drift（制品内容 ≠ 清单记录）。 */
export function detectConstitutionDrift({ rootDir, config }) {
  return refreshArtifacts({ rootDir, config }).drift;
}

/** 打开变更提案（CHANGE_REQUIRED 的载体）。 */
export function openChangeProposal({ rootDir, config, reason, now = new Date().toISOString() }) {
  if (!reason) throw new TypeError('change proposal requires a reason（harness constitution:change "<原因>"）');
  const drift = detectConstitutionDrift({ rootDir, config });
  const stamp = now.replace(/[-:T.Z]/g, '').slice(0, 14);
  const proposal = {
    schemaVersion: '1.0',
    type: 'ConstitutionChangeProposal',
    id: `CHG-${stamp}-${Math.random().toString(16).slice(2, 8)}`,
    status: 'OPEN',
    reason,
    drift,
    created_at: now,
  };
  const path = resolve(changesDir(rootDir, config), `${proposal.id}.json`);
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteJson(path, proposal);
  return proposal;
}

function proposalPath(rootDir, config, proposalId) {
  return resolve(changesDir(rootDir, config), `${proposalId}.json`);
}

export function listChangeProposals({ rootDir, config }) {
  const dir = changesDir(rootDir, config);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(name => name.endsWith('.json')).sort()
    .map(name => JSON.parse(readFileSync(resolve(dir, name), 'utf-8')));
}

/**
 * 应用变更提案：接受当前制品为新基线 → 锁定新 Constitution Version → 计算 Skill Impact → 关闭提案。
 * @returns {{ok: true, version: string, skillImpact: object[], proposal: object} | {ok: false, code: string, message?: string}}
 */
export function applyChangeProposal({ rootDir, config, proposalId, decision = null, approve = false, now = new Date().toISOString() }) {
  if (!proposalId) return { ok: false, code: 'USAGE', message: 'apply requires a proposal id（CHG-…）' };
  const path = proposalPath(rootDir, config, proposalId);
  if (!existsSync(path)) return { ok: false, code: 'NOT_FOUND', message: `change proposal not found: ${proposalId}` };
  const proposal = JSON.parse(readFileSync(path, 'utf-8'));
  if (proposal.status !== 'OPEN') return { ok: false, code: 'NOT_OPEN', message: `proposal ${proposalId} is ${proposal.status}` };
  const changedIds = [...new Set([...(proposal.drift || []).map(item => item.id), ...saveRefreshedArtifacts({ rootDir, config }).drift.map(item => item.id)])];
  const skillImpact = assessSkillImpact({ rootDir, config, changedIds });
  const lock = lockConstitutionVersion({
    rootDir, config, viaProposal: proposalId,
    extras: { skillImpact: skillImpact.map(item => item.skill) },
    now,
  });
  if (!lock.ok) return lock;
  proposal.status = 'CLOSED';
  proposal.closed_at = now;
  proposal.decision = decision;
  proposal.approved = approve === true;
  proposal.version = lock.version;
  proposal.changed_artifacts = changedIds;
  proposal.skill_impact = skillImpact.map(item => item.skill);
  atomicWriteJson(path, proposal);
  return { ok: true, version: lock.version, skillImpact, proposal };
}

/**
 * Skill Impact（C10）：声明了 `relatedConstitution` 的 Skill 取交集；
 * 未声明的 Skill 视为依赖全部核心制品（默认保守）。
 */
export function assessSkillImpact({ rootDir, config, changedIds = [] }) {
  const files = [...new Set(skillGlobs(config).flatMap(pattern => collectGlob(rootDir, pattern)))].sort();
  return files.map(abs => {
    const rel = relative(rootDir, abs).replaceAll('\\', '/');
    let content = '';
    try { content = readFileSync(abs, 'utf-8'); } catch { content = ''; }
    const declared = content.match(/relatedConstitution:\s*\[([^\]]*)\]/);
    const related = declared
      ? declared[1].split(',').map(item => item.trim().replace(/['"]/g, '')).filter(Boolean)
      : null;
    const affected = related
      ? changedIds.some(id => related.includes(id))
      : changedIds.length > 0;
    return { skill: rel, related: related || '(all)', affected };
  }).filter(item => item.affected);
}

function readDispositions({ rootDir, config }) {
  const path = dispositionsPath(rootDir, config);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    return Array.isArray(parsed?.dispositions) ? parsed.dispositions : [];
  } catch {
    throw new TypeError(`skill dispositions file is not valid JSON: ${path}`);
  }
}

export function listSkillDispositions({ rootDir, config }) {
  return readDispositions({ rootDir, config });
}

/** 记录 Skill 处置（UPDATE / REVIEWED_NO_CHANGE）——绑定当次 Constitution Version。 */
export function recordSkillDisposition({ rootDir, config, skill, status, reason = '', now = new Date().toISOString() }) {
  if (!skill) throw new TypeError('skill is required');
  if (!SKILL_DISPOSITIONS.includes(status)) {
    throw new TypeError(`status must be one of: ${SKILL_DISPOSITIONS.join(', ')}`);
  }
  const current = getCurrentConstitutionVersion({ rootDir, config });
  const dispositions = readDispositions({ rootDir, config });
  const record = {
    skill,
    status,
    reason,
    constitution_version: current?.version || null,
    recorded_at: now,
  };
  const path = dispositionsPath(rootDir, config);
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteJson(path, { schemaVersion: '1.0', type: 'SkillDispositionStore', dispositions: [...dispositions, record] });
  return record;
}

/** 待处置 Skill：当前版 Skill Impact 中尚无同版本处置记录的条目（C10 / strict finish 消费）。 */
export function pendingSkillDispositions({ rootDir, config }) {
  const current = getCurrentConstitutionVersion({ rootDir, config });
  const snapshot = getConstitutionVersionSnapshot({ rootDir, config, version: current?.version });
  const impacts = Array.isArray(snapshot?.skillImpact) ? snapshot.skillImpact : [];
  if (impacts.length === 0) return [];
  const dispositions = readDispositions({ rootDir, config });
  return impacts.filter(skill => !dispositions.some(record => record.skill === skill && record.constitution_version === current.version));
}
