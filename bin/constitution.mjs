/**
 * constitution.mjs — ConstitutionVersion（Batch C / C02 + C05 + C06）
 *
 * 定位：由当前长期制品 hash 构成的**不可变版本**（方案 §17）。
 *   - version = `constitution-<sha12>`（内容决定 → 天然不可变、可比较）；
 *   - `lockConstitutionVersion` 写 `harness/constitution/versions/<version>.json` + current 指针；
 *   - drift 存在时拒绝 lock（必须先走 C09 变更流）；
 *   - 另提供 Task 冻结快照（C05）与 Context 选择（C06）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { createContract } from './contracts.mjs';
import { atomicWriteJson } from './state-store.mjs';
import { collectGlob } from './glob-utils.mjs';
import {
  constitutionDir, hashContent, hashFile, readArtifactManifest, refreshArtifacts, saveRefreshedArtifacts,
} from './project-artifacts.mjs';

const CORE_ARTIFACT_SLOTS = ['project_overview', 'product', 'tech_stack', 'architecture', 'engineering', 'testing', 'acceptance', 'design', 'agent_rules', 'skills'];
const OPTIONAL_SLOTS = new Set(['product', 'design']);

/** Context 选择的相关性关键词（C06）。 */
const CONTEXT_KEYWORDS = {
  project_overview: ['项目', 'project', 'overview', '背景', '定位'],
  product: ['产品', '业务', '需求', 'product', 'business'],
  tech_stack: ['依赖', 'dependency', '技术', 'tech', 'package', '库', 'library', '框架', 'framework', '升级', 'version'],
  architecture: ['架构', 'architecture', '模块', 'module', '边界', 'boundary', '接口', '重构', 'refactor'],
  engineering: ['规范', '复用', '命名', '工程', '目录', '代码', 'code'],
  testing: ['测试', 'test', 'bug', '修复', '断言', 'spec', 'coverage'],
  acceptance: ['验收', '完成', 'finish', '接受', 'acceptance'],
  agent_rules: ['规则', 'agent', '任务', 'task'],
  design: ['设计', 'design', 'ui', '交互', '视觉'],
};

export function versionsDir(rootDir, config) {
  return resolve(constitutionDir(rootDir, config), 'versions');
}

export function currentPath(rootDir, config) {
  return resolve(constitutionDir(rootDir, config), 'current.json');
}

export function skillGlobs(config) {
  return config?.constitution?.skillsGlobs || ['skills/**/SKILL.md', 'ai/skills/**/SKILL.md'];
}

/** skills 计算制品：`{ '<rel path>': 'sha256:…' }`（排序保证确定性）。 */
export function skillsHashes({ rootDir, config }) {
  const abs = skillGlobs(config).flatMap(pattern => collectGlob(rootDir, pattern));
  const map = {};
  for (const path of [...new Set(abs)].sort()) {
    const rel = relative(rootDir, path).replaceAll('\\', '/');
    map[rel] = hashFile({ rootDir, path: rel });
  }
  return map;
}

/**
 * 计算当前制品集合对应的 ConstitutionVersion（不落盘）。
 * @returns {{version: string, artifacts: object[], skills: object, slots: object, drift: object[]}}
 */
export function computeConstitutionVersion({ rootDir, config }) {
  const { artifacts, drift } = refreshArtifacts({ rootDir, config });
  const skills = skillsHashes({ rootDir, config });
  const slots = {};
  for (const id of CORE_ARTIFACT_SLOTS) {
    if (id === 'skills') {
      slots[id] = Object.keys(skills).length > 0 ? 'present' : 'missing';
      continue;
    }
    slots[id] = artifacts.some(artifact => artifact.id === id)
      ? 'present'
      : (OPTIONAL_SLOTS.has(id) ? 'not_applicable' : 'missing');
  }
  const payload = [
    ...artifacts.map(artifact => `${artifact.id}:${artifact.content_hash}`),
    ...Object.entries(skills).map(([path, hash]) => `skills:${path}:${hash}`),
  ].sort().join('\n');
  return {
    version: `constitution-${hashContent(payload).slice('sha256:'.length, 'sha256:'.length + 12)}`,
    artifacts: artifacts.map(artifact => ({ id: artifact.id, path: artifact.path, hash: artifact.content_hash, status: artifact.status })),
    skills,
    slots,
    drift,
  };
}

export function getCurrentConstitutionVersion({ rootDir, config }) {
  const path = currentPath(rootDir, config);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    throw new TypeError(`current constitution pointer is not valid JSON: ${path}`);
  }
}

export function listConstitutionVersions({ rootDir, config }) {
  const dir = versionsDir(rootDir, config);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(name => name.endsWith('.json')).sort();
}

/**
 * 锁定当前制品为新版本（不覆盖已有快照；drift 未清理时拒绝）。
 * @returns {{ok: false, code: string, [k: string]: any} | {ok: true, version: string, path: string, snapshot: object}}
 */
export function lockConstitutionVersion({ rootDir, config, viaProposal = null, extras = null, now = new Date().toISOString() }) {
  const computed = computeConstitutionVersion({ rootDir, config });
  if (computed.artifacts.length === 0) {
    return { ok: false, code: 'NO_ARTIFACTS', message: 'no Constitution artifacts registered yet（先注册制品再锁定版本）' };
  }
  if (computed.drift.length > 0) {
    return { ok: false, code: 'DRIFT_REQUIRED', message: 'artifact drift detected — 先走 constitution:change 变更流再锁定新版本', drift: computed.drift };
  }
  const path = resolve(versionsDir(rootDir, config), `${computed.version}.json`);
  if (existsSync(path)) {
    return { ok: false, code: 'ALREADY_LOCKED', message: `version already locked (immutable): ${computed.version}`, version: computed.version, path: relative(rootDir, path).replaceAll('\\', '/') };
  }
  const snapshot = createContract('ConstitutionVersion', {
    version: computed.version,
    created_at: now,
    artifacts: computed.artifacts.map(artifact => ({ id: artifact.id, hash: artifact.hash, status: artifact.status })),
    items: computed.artifacts,
    slots: computed.slots,
    skills: computed.skills,
    via_proposal: viaProposal,
    ...(extras || {}),
  });
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteJson(path, snapshot);
  saveRefreshedArtifacts({ rootDir, config });
  atomicWriteJson(currentPath(rootDir, config), {
    version: computed.version,
    path: `harness/constitution/versions/${computed.version}.json`,
    locked_at: now,
    via_proposal: viaProposal,
  });
  return { ok: true, version: computed.version, path: relative(rootDir, path).replaceAll('\\', '/'), snapshot };
}

function loadVersionSnapshot({ rootDir, config, version }) {
  const path = resolve(versionsDir(rootDir, config), `${version}.json`);
  if (!existsSync(path)) throw new TypeError(`constitution version not found: ${version}`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/** 读取指定版本快照（含 skillImpact 等 extras；不存在 → null）。 */
export function getConstitutionVersionSnapshot({ rootDir, config, version }) {
  if (!version) return null;
  const path = resolve(versionsDir(rootDir, config), `${version}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/** 比较两个版本的制品差异（C02：能比较两个版本差异）。 */
export function diffConstitutionVersions({ rootDir, config, from, to }) {
  const a = loadVersionSnapshot({ rootDir, config, version: from });
  const b = loadVersionSnapshot({ rootDir, config, version: to });
  const mapA = new Map(a.artifacts.map(item => [item.id, item.hash]));
  const mapB = new Map(b.artifacts.map(item => [item.id, item.hash]));
  const added = [...mapB.keys()].filter(id => !mapA.has(id));
  const removed = [...mapA.keys()].filter(id => !mapB.has(id));
  const changed = [...mapB.keys()]
    .filter(id => mapA.has(id) && mapA.get(id) !== mapB.get(id))
    .map(id => ({ id, from: mapA.get(id), to: mapB.get(id) }));
  return { from, to, added, removed, changed };
}

/** Task 冻结快照（C05）：Task 创建时冻结"依据哪一版 Constitution"。 */
export function buildConstitutionSnapshot({ rootDir, config }) {
  const manifest = readArtifactManifest({ rootDir, config });
  if (manifest.artifacts.length === 0) return null;
  const current = getCurrentConstitutionVersion({ rootDir, config });
  const byId = Object.fromEntries(manifest.artifacts.map(artifact => [artifact.id, artifact.content_hash]));
  return {
    constitution_version: current?.version || null,
    tech_stack_hash: byId.tech_stack || null,
    architecture_hash: byId.architecture || null,
    engineering_hash: byId.engineering || null,
    testing_hash: byId.testing || null,
    applicable_skill_hashes: skillsHashes({ rootDir, config }),
    artifact_count: manifest.artifacts.length,
  };
}

/** Context Pack 的 Constitution 选择（C06：按任务相关性，不无限增长）。 */
export function selectConstitutionContext({ rootDir, config, task = null, limit = null }) {
  const { artifacts } = refreshArtifacts({ rootDir, config });
  if (artifacts.length === 0) return [];
  const text = `${task?.title || ''} ${(task?.goals || []).join(' ')} ${(task?.linkedPrd || '')}`.toLowerCase();
  const terms = text.split(/[^a-z0-9\u4e00-\u9fa5_-]+/).filter(term => term.length >= 2);
  const scored = artifacts.map(artifact => {
    const keywords = CONTEXT_KEYWORDS[artifact.id] || [];
    const keywordHits = keywords.filter(keyword => text.includes(keyword.toLowerCase())).length;
    const termHits = terms.filter(term => artifact.id.includes(term)).length;
    return { artifact, score: keywordHits * 2 + termHits + (artifact.id === 'project_overview' ? 1 : 0) };
  }).sort((a, b) => b.score - a.score || a.artifact.id.localeCompare(b.artifact.id));
  const max = limit ?? config?.brain?.maxConstitutionAssets ?? 3;
  return scored.slice(0, max).map(({ artifact, score }) => ({
    id: artifact.id,
    path: artifact.path,
    hash: artifact.content_hash,
    status: artifact.status,
    reason: score > 1 ? 'task relevance' : 'constitution baseline',
  }));
}

// ── CLI：见 bin/constitution-cli.mjs（本模块保持无环：constitution ← constitution-change）──
