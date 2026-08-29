/**
 * governance.mjs — 治理版本与项目画像（设计文档 §15 总前置条件）
 *
 * 项目开始前必须先配置治理（project.yaml），达到 governance_ready 后
 * 锁定治理版本（governance-0.1.0），任务记录所用治理版本（§15.9）。
 *
 * 状态机只前进：已锁定的版本不可覆盖。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const GOVERNANCE_REQUIRED = Object.freeze([
  'name',
  'mode',
  'status',
  'risk_domains',
  'skills',
  'prd_category',
  'coding_policy',
  'style_policy',
]);

export const VALID_MODES = Object.freeze(['greenfield', 'existing']);
export const VALID_STATUS = Object.freeze(['governance_setup_required', 'governance_ready', 'awaiting_product_decision']);

export const STATUS_MESSAGES = Object.freeze({
  governance_setup_required: '项目还没有确定基本工作规则，还不能开始编码',
  governance_ready: '治理已就绪，可以进入需求/任务/编码流程',
  awaiting_product_decision: '还有关键业务决定未确认，不能开始编码',
});

export function validateProfile(profile) {
  const errors = [];
  if (!profile || typeof profile !== 'object') return ['profile must be an object'];
  if (!profile.name || typeof profile.name !== 'string') errors.push('name (string) required');
  if (profile.mode && !VALID_MODES.includes(profile.mode)) errors.push(`mode must be ${VALID_MODES.join('|')}, got ${profile.mode}`);
  if (profile.status && !VALID_STATUS.includes(profile.status)) errors.push(`status must be ${VALID_STATUS.join('|')}, got ${profile.status}`);
  if (profile.risk_domains !== undefined && !Array.isArray(profile.risk_domains)) errors.push('risk_domains must be an array');
  if (profile.skills !== undefined && !Array.isArray(profile.skills)) errors.push('skills must be an array');
  if (profile.governance_version !== undefined && typeof profile.governance_version !== 'string') errors.push('governance_version must be a string');
  return errors;
}

/** governance_ready：必填字段齐全 + status=governance_ready + 无阻塞冲突 */
export function governanceReady(profile) {
  const missing = [];
  if (!profile) return { ready: false, missing: ['profile'] };
  for (const field of GOVERNANCE_REQUIRED) {
    const value = profile[field];
    if (value == null || (Array.isArray(value) && value.length === 0) || value === '') missing.push(field);
  }
  if (profile.status !== 'governance_ready') missing.push('status=governance_ready');
  if (profile.blocking_conflicts && profile.blocking_conflicts > 0) missing.push('blocking_conflicts=0');
  return { ready: missing.length === 0, missing };
}

export function profilePath(rootDir, config) {
  return resolve(rootDir, config?.governance?.profileFile || 'harness/project.yaml');
}

export function versionsDir(rootDir, config) {
  return resolve(rootDir, config?.governance?.versionsDir || 'harness/governance/versions');
}

export function readProfile({ rootDir, config }) {
  const path = profilePath(rootDir, config);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
}

export function writeProfile({ rootDir, config, profile }) {
  const errors = validateProfile(profile);
  if (errors.length > 0) throw new TypeError(`Invalid governance profile: ${errors.join('; ')}`);
  const path = profilePath(rootDir, config);
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(profile, null, 2)}\n`);
  return profile;
}

/** 锁定治理版本：生成快照 + 回写 profile.governance_version；已存在版本拒绝覆盖 */
export function lockVersion({ rootDir, config, profile, version = null }) {
  const next = version || profile?.governance_version || 'governance-0.1.0';
  const dir = versionsDir(rootDir, config);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${next}.json`);
  if (existsSync(file)) throw new TypeError(`Version already locked: ${next}（状态机只前进，禁止覆盖）`);
  const snapshot = { ...profile, governance_version: next, locked_at: new Date().toISOString() };
  writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`);
  const updated = writeProfile({ rootDir, config, profile: snapshot });
  return { version: next, path: file, profile: updated };
}

export function listVersions({ rootDir, config }) {
  const dir = versionsDir(rootDir, config);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.json')).sort();
}

// ── CLI ──────────────────────────────────────────────────────────
import { getArg, hasArg } from './cli-utils.mjs';

function initCommand({ rootDir, config, args, json }) {
  const name = getArg(args, '--name');
  if (!name) {
    console.error('governance:init requires --name <项目名> [--mode greenfield|existing]');
    process.exitCode = 2;
    return;
  }
  const profile = {
    name,
    mode: getArg(args, '--mode') || 'greenfield',
    status: 'governance_setup_required',
    risk_domains: [],
    skills: [],
    prd_category: null,
    coding_policy: null,
    style_policy: null,
    blocking_conflicts: 0,
  };
  try {
    writeProfile({ rootDir, config, profile });
    if (json) console.log(JSON.stringify(profile, null, 2));
    else console.log(`✅ 项目画像已创建: ${profilePath(rootDir, config)}\n   项目还没有确定基本工作规则，还不能开始编码（governance:status 查看缺口）`);
  } catch (e) {
    console.error(`❌ governance:init: ${e.message}`);
    process.exitCode = 2;
  }
}

function statusCommand({ rootDir, config, json }) {
  const profile = readProfile({ rootDir, config });
  if (!profile) {
    if (json) console.log(JSON.stringify({ ready: false, missing: ['profile'], profile: null }, null, 2));
    else console.log('🔴 项目还没有项目画像（harness/project.yaml 缺失）——先运行 `harness governance:init --name <项目名>`');
    process.exitCode = 0;
    return;
  }
  const { ready, missing } = governanceReady(profile);
  if (json) {
    console.log(JSON.stringify({ ready, missing, status: profile.status, governance_version: profile.governance_version || null }, null, 2));
  } else if (ready) {
    console.log(`✅ 治理已就绪（${profile.governance_version || '未锁定'}）——可以进入需求/任务/编码流程`);
  } else {
    console.log(`🟡 ${STATUS_MESSAGES[profile.status] || profile.status}`);
    console.log(`   待补齐: ${missing.join(', ')}`);
    console.log('   补全后运行 `harness governance:version` 锁定治理版本');
  }
}

function versionCommand({ rootDir, config, args, json }) {
  const profile = readProfile({ rootDir, config });
  if (!profile) {
    console.error('❌ governance:version: 项目画像缺失——先运行 `harness governance:init --name <项目名>`');
    process.exitCode = 2;
    return;
  }
  const { ready, missing } = governanceReady(profile);
  if (!ready) {
    console.error(`❌ governance:version: 治理未就绪，禁止锁定（§15.10 前置条件）——待补齐: ${missing.join(', ')}`);
    process.exitCode = 2;
    return;
  }
  try {
    const result = lockVersion({ rootDir, config, profile, version: getArg(args, '--version') });
    if (json) console.log(JSON.stringify(result, null, 2));
    else console.log(`✅ 治理版本已锁定: ${result.version} → ${result.path}`);
  } catch (e) {
    console.error(`❌ governance:version: ${e.message}`);
    process.exitCode = 2;
  }
}

export function runGovernance({ rootDir, args, config }) {
  const subcommand = args[0] || 'status';
  const json = hasArg(args, '--json') || getArg(args, '--format') === 'json';
  if (subcommand === 'init') return initCommand({ rootDir, config, args, json });
  if (subcommand === 'status') return statusCommand({ rootDir, config, json });
  if (subcommand === 'version') return versionCommand({ rootDir, config, args, json });
  if (subcommand === 'versions') {
    if (json) console.log(JSON.stringify(listVersions({ rootDir, config }), null, 2));
    else console.log(listVersions({ rootDir, config }).join('\n') || '○ 尚未锁定任何治理版本');
    return;
  }
  console.error('Usage: harness governance:init|status|version|versions [--json]');
  process.exitCode = 2;
}
