#!/usr/bin/env node
/**
 * config-loader.mjs — 通用 harness 配置加载器
 *
 * 从项目根向上查找 harness.config.mjs / harness.config.json（兼容旧 harness/config.json），
 * 深合并 DEFAULT_CONFIG，提供 schema 校验与 gate check 生成工具。
 *
 * 设计原则（见 docs/standards/harness-standalone-roadmap.md §6）：
 *   - 引擎默认值 = "单层普通项目也能跑的最小可用配置"，无 PallasTrade 痕迹
 *   - 项目通过 harness.config.mjs 覆盖声明自身结构（layers / gates / docImpact / ...）
 *   - 规则数据（anti-patterns.json / scenarios.json）留在项目内，配置只存路径引用
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

// ────────────────────────────────────────────────────────────────
// DEFAULT_CONFIG — 通用默认值
// ────────────────────────────────────────────────────────────────
export const DEFAULT_CONFIG = {
  name: 'project',

  // ① 层定义：gate 跨层搜索来源。单层项目配 [{ id: 'app', path: 'src' }]
  layers: [
    { id: 'app', path: 'app', label: 'App' },
    { id: 'src', path: 'src', label: 'Source' },
  ],

  // ② gate 配置
  gates: {
    expiryHours: {
      feature: 48, bugfix: 24, style: 8,
      audit: 24, research: 24, docs: 24, refactor: 24, security: 24, test: 24,
    },
    // 项目追加的 check（合并进内置基础 check 集）
    checkDefs: {},
  },

  // ③ 知识同步规则（doc-impact）— 默认空数组不炸
  docImpact: {
    base: 'origin/main',
    rules: [],
  },

  // ④ 覆盖率
  coverage: {
    thresholds: {},
    targets: [],
  },

  // ⑤ 扫描器规则文件路径
  scanners: {
    antiPatterns: 'harness/policies/anti-patterns.json',
  },

  // ⑥ eval / scenarios
  scenarios: 'harness/scenarios/scenarios.json',

  // ⑦ check profiles
  profiles: {},

  // ⑧ doctor 检查项
  doctor: {
    requiredDirs: [],
    requiredFiles: [],
    composeCandidates: [],
  },

  // ⑨ 状态/产物路径
  paths: {
    gates: 'harness/gates',
    requirements: 'harness/requirements',
    evidence: 'artifacts/harness-evidence',
    prd: 'docs/prd',
  },

  // ⑩ generated:check 生成命令（默认空 = 跳过）
  generatedCheck: {
    checks: [],
  },
};

// ────────────────────────────────────────────────────────────────
// Gate check 生成工具
// ────────────────────────────────────────────────────────────────
export function getLayerSearchChecks(layers) {
  return (layers || []).map(layer => ({
    id: `search-${layer.id}`,
    label: `Cross-layer: Search ${layer.path}/`,
  }));
}

export const BASE_VERIFY_CHECK = {
  id: 'verify-test',
  label: 'Verify: screenshot/log/DB — see TR-006 (no-test-needed only for docs)',
};

// 内置各任务类型的基础 check（不含 search — 由 getGateChecks 统一插入）
const BASE_CHECK_DEFS = {
  feature: [
    { id: 'read-skill-customization', label: 'Read Skill: <project>-customization/SKILL.md (always)' },
    { id: 'read-skill-domain', label: 'Read Skill: domain-specific SKILL.md(s)' },
  ],
  bugfix: [
    { id: 'read-skill-domain', label: 'Read Skill: domain-specific SKILL.md(s)' },
  ],
  style: [],
  audit: [
    { id: 'read-skill-domain', label: 'Read Skill: domain-specific SKILL.md(s)' },
  ],
  research: [
    { id: 'read-skill-domain', label: 'Read Skill: domain-specific SKILL.md(s)' },
  ],
  docs: [],
  refactor: [],
  security: [
    { id: 'read-skill-security', label: 'Read Skill: <project>-security/SKILL.md' },
  ],
  test: [],
};

/**
 * 生成某任务类型的完整 gate check 列表
 * = layers 搜索 check + 内置基础 check + 配置追加 check + verify-test
 */
export function getGateChecks(config, taskType) {
  const layers = config.layers || DEFAULT_CONFIG.layers;
  const searchChecks = getLayerSearchChecks(layers);
  const base = BASE_CHECK_DEFS[taskType] || BASE_CHECK_DEFS.feature;
  const extra = config.gates?.checkDefs?.[taskType] || [];
  return [...searchChecks, ...base, ...extra, BASE_VERIFY_CHECK];
}

// ────────────────────────────────────────────────────────────────
// 查找与加载
// ────────────────────────────────────────────────────────────────
export function findConfigPath(startDir = process.cwd()) {
  let dir = resolve(startDir);
  for (;;) {
    for (const name of ['harness.config.mjs', 'harness.config.json', 'harness/config.json']) {
      const p = resolve(dir, name);
      if (existsSync(p)) return p;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function resolveProjectRoot(startDir = process.cwd()) {
  const cfg = findConfigPath(startDir);
  if (cfg) return dirname(cfg);
  // 独立 npm 包：无配置时回退到用户当前目录（npx harness 在项目根运行）
  return process.cwd();
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, override) {
  if (override === undefined || override === null) return base;
  if (Array.isArray(base) || Array.isArray(override)) return override;
  if (isPlainObject(base) && isPlainObject(override)) {
    const out = { ...base };
    for (const [k, v] of Object.entries(override)) {
      out[k] = deepMerge(base[k], v);
    }
    return out;
  }
  return override;
}

export function validateConfig(cfg) {
  const errors = [];
  if (cfg.name !== undefined && typeof cfg.name !== 'string') errors.push('name must be a string');
  if (!Array.isArray(cfg.layers) || cfg.layers.length === 0) errors.push('layers must be a non-empty array');
  for (const l of cfg.layers || []) {
    if (!l.id || !l.path) errors.push(`layer missing id or path: ${JSON.stringify(l)}`);
  }
  if (!cfg.paths || typeof cfg.paths.gates !== 'string') errors.push('paths.gates must be a string');
  if (cfg.docImpact && !Array.isArray(cfg.docImpact.rules)) errors.push('docImpact.rules must be an array');
  if (cfg.gates && !isPlainObject(cfg.gates)) errors.push('gates must be an object');
  if (cfg.profiles && !isPlainObject(cfg.profiles)) errors.push('profiles must be an object');
  return errors;
}

/**
 * 加载项目配置（默认值 + 文件配置深合并 + schema 校验）
 * 进程内 memo：同一进程重复调用直接复用（高频命令/独立入口共享）。
 * @returns {{ config, sourcePath: string|null, usedDefaults: string[] }}
 */
let _memo = null;
let _memoRoot = null;

export async function loadConfig({ rootDir } = {}) {
  const start = rootDir || process.cwd();
  if (_memo && _memoRoot === start) return _memo;

  const cfgPath = findConfigPath(start);
  let fileConfig = {};
  let sourcePath = null;
  const usedDefaults = [];

  if (cfgPath) {
    sourcePath = cfgPath;
    try {
      if (cfgPath.endsWith('.mjs')) {
        const mod = await import(`${pathToFileURL(cfgPath).href}?t=${Date.now()}`);
        fileConfig = mod.default || {};
      } else {
        fileConfig = JSON.parse(readFileSync(cfgPath, 'utf-8'));
      }
    } catch (e) {
      console.error(`❌ Failed to load harness config ${cfgPath}: ${e.message}`);
      process.exit(1);
    }
  } else {
    usedDefaults.push('ALL (no config file found — using engine defaults)');
  }

  const config = deepMerge(structuredClone(DEFAULT_CONFIG), fileConfig);
  const errors = validateConfig(config);
  if (errors.length > 0) {
    console.error(`❌ Invalid harness config:\n  - ${errors.join('\n  - ')}`);
    process.exit(1);
  }

  const result = { config, sourcePath, usedDefaults };
  _memo = result;
  _memoRoot = start;
  return result;
}
