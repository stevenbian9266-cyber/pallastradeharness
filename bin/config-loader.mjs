#!/usr/bin/env node
/**
 * config-loader.mjs — 通用 harness 配置加载器
 *
 * 从项目根向上查找 harness.config.mjs / harness.config.json（兼容旧 harness/config.json），
 * 深合并 DEFAULT_CONFIG，提供 schema 校验与 gate check 生成工具。
 *
 * 设计原则（见 docs/standards/harness-standalone-roadmap.md §6）：
 *   - 引擎默认值 = "单层普通项目也能跑的最小可用配置"，无任何项目特定痕迹
 *   - 项目通过 harness.config.mjs 覆盖声明自身结构（layers / gates / docImpact / ...）
 *   - 规则数据（anti-patterns.json / scenarios.json）留在项目内，配置只存路径引用
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ConfigError } from './cli-utils.mjs';
import { GATE_PHASES } from './gate-lifecycle.mjs';

// ────────────────────────────────────────────────────────────────
// DEFAULT_CONFIG — 通用默认值
// ────────────────────────────────────────────────────────────────
export const DEFAULT_CONFIG = {
  schemaVersion: '1.0',
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
    uiAntiPatterns: 'harness/policies/ui-anti-patterns.json',
  },

  // ⑥ eval / scenarios
  scenarios: 'harness/scenarios/scenarios.json',

  // ⑧' visualRegression — 视觉回归（设计文档 §18.4）
  visualRegression: {
    enabled: false,
    url: null,
    viewports: ['1280x800'],
    baselineDir: 'artifacts/visual-baseline',
    maxDiffRatio: 0.001,
  },

  // ⑧'' governance — 治理版本与项目画像（设计文档 §15 总前置条件）
  governance: {
    profileFile: 'harness/project.yaml',
    versionsDir: 'harness/governance/versions',
  },

  // ⑧''' qualityBaseline — 存量项目质量基线 / no_regression（设计文档 §14.5）
  qualityBaseline: {
    enabled: false,
    testCommand: ['node', '--test', '--test-reporter=tap', '**/*.test.mjs'],
  },

  // ⑧'''' designStage — 设计阶段治理（PRD 确认后 → UI/交互/视觉/技术方案 → design-confirmed）
  designStage: {
    enabled: true,
    designsDir: 'docs/designs',
  },

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
    state: '.harness-state',
  },

  // ⑩ generated:check 生成命令（默认空 = 跳过）
  generatedCheck: {
    checks: [],
  },

  // ⑪ 机器可读规范与开发监督器
  standards: {
    includeBundled: true,
    sources: ['harness/standards/**/*.json'],
  },
  // ⑫ Skills 自动治理（v1.3.0）
  //    catalogSources — 项目级领域目录（glob，可多个）；内置基线 presets/skill-catalog.json 自动合并
  //    freshnessDays  — L4 元数据过期阈值（frontmatter lastReviewedAt 距今超此天数提示复审）
  skills: {
    catalogSources: ['harness/catalog/*.json'],
    freshnessDays: 90,
  },
  supervisor: {
    mode: 'guard',
    plansDir: '.harness-cache/plans',
    generatedFiles: [],
    protectedFiles: ['**/db/schema.rb', '**/Gemfile.lock'],
    dependencyFiles: ['**/package.json', '**/Gemfile', '**/requirements*.txt'],
    testFiles: ['**/*.test.*', '**/*.spec.*', '**/test/**', '**/tests/**', '**/spec/**', '**/fixtures/**'],
    ruleDefinitionFiles: ['**/risk-engine.*', '**/domain-supervisors.*', '**/scan-*', '**/check-*/**', '**/policies/**', '**/rules/**'],
    complexity: { maxDecisionPoints: 12, duplicateBlockLines: 6 },
    boundaries: [],
    maxFiles: 10000,
    shardSize: 500,
  },
  brain: {
    sources: [
      'AGENTS.md',
      'CLAUDE.md',
      '.github/copilot-instructions.md',
      'README.md',
      'docs/**/*.{md,mdx,json,yaml,yml}',
      'ai/skills/**/SKILL.md',
      'harness/**/*.{md,json,yaml,yml}',
    ],
    exclude: [
      '**/node_modules/**',
      '**/.git/**',
      '**/.env*',
      '**/*secret*',
      '**/artifacts/**',
      'harness/gates/**',
      '.harness-state/**',
      '.harness-cache/**',
    ],
    maxAssetBytes: 524288,
    maxContextAssets: 20,
    maxAssets: 10000,
    shardSize: 500,
  },
  risk: {
    criticalPaths: [
      '**/db/migrate/**', '**/*payment*', '**/*auth*', '**/*permission*',
      '**/*secret*', '**/*deploy*', '**/.github/workflows/**', '**/Dockerfile*',
    ],
    standardPaths: ['**/*api*/**', '**/package.json', '**/Gemfile', '**/*config*', '**/*schema*'],
  },
  evidence: {
    autoVerify: true,
    maxOutputBytes: 262144,
    // 验证器注册表（HTH-005）：满足 Gate 的证据必须来自已注册验证器。
    // 项目可在 harness.config.mjs 覆盖/扩展；定义变化会使旧证据失效。
    verifiers: {
      unit: {
        type: 'test',
        command: ['node', '--test', '**/*.test.mjs'],
        cwd: '.',
        timeoutMs: 300000,
        profiles: ['quick', 'standard', 'critical'],
      },
      docs: {
        type: 'test',
        command: ['npx', 'harness', 'docs:check'],
        cwd: '.',
        timeoutMs: 120000,
        profiles: ['quick', 'standard', 'critical'],
      },
      coverage: {
        type: 'test',
        command: ['npx', 'harness', 'coverage', '--enforce'],
        cwd: '.',
        timeoutMs: 180000,
        profiles: ['quick', 'standard', 'critical'],
      },
      baseline: {
        type: 'test',
        command: ['npx', 'harness', 'baseline:check'],
        cwd: '.',
        timeoutMs: 600000,
        profiles: ['quick', 'standard', 'critical'],
      },
      'reuse-adherence': {
        type: 'test',
        command: ['npx', 'harness', 'reuse-adherence'],
        cwd: '.',
        timeoutMs: 120000,
        profiles: ['quick', 'standard', 'critical'],
      },
    },
  },
  plugins: {
    apiVersion: '1.0',
    strict: false,
  },
};

// ────────────────────────────────────────────────────────────────
// Gate check 生成工具
// ────────────────────────────────────────────────────────────────
export function getLayerSearchChecks(layers) {
  return (layers || []).map(layer => ({
    id: `search-${layer.id}`,
    label: `Cross-layer: Search ${layer.path}/`,
    phase: GATE_PHASES.PREPARATION,
  }));
}

export const BASE_VERIFY_CHECK = {
  id: 'verify-test',
  label: 'Verify: screenshot/log/DB — see TR-006 (no-test-needed only for docs)',
  phase: GATE_PHASES.VERIFICATION,
};

// 内置各任务类型的基础 check（不含 search — 由 getGateChecks 统一插入）
const BASE_CHECK_DEFS = {
  feature: [
    { id: 'read-skill-customization', label: 'Read Skill: <project>-customization/SKILL.md (always)' },
    { id: 'read-skill-domain', label: 'Read Skill: domain-specific SKILL.md(s)' },
    // v1.4.0：PRD 工作流默认启用（所有项目 feature 类 gate 强制 一句话→PRD→确认→实施）
    { id: 'read-skill-prd', label: 'Read Skill: harness-prd/SKILL.md (PRD workflow)' },
    { id: 'create-prd-doc', label: 'Create PRD doc: docs/prd/PRD-*.md' },
    { id: 'create-req-doc', label: 'Create requirements doc: harness/requirements/REQ-*.md' },
    { id: 'req-doc-has-skill-table', label: 'REQ doc includes Skill consultation evidence table' },
    { id: 'user-confirmed', label: 'User confirmed PRD/requirements (WAIT — do not proceed)' },
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

// 设计阶段检查项（设计阶段治理：PRD 确认后 → 4 设计产物 → design-confirmed）
// 仅 feature 类且 designStage.enabled 时插入（插在 user-confirmed 之后）
const DESIGN_STAGE_CHECKS = [
  { id: 'create-ui-doc', label: 'Create UI doc: docs/designs/<task>/ui.md' },
  { id: 'create-interaction-spec', label: 'Create interaction spec: docs/designs/<task>/interaction.md' },
  { id: 'create-visual-spec', label: 'Create visual spec: docs/designs/<task>/visual.md' },
  { id: 'create-tech-design', label: 'Create tech design: docs/designs/<task>/tech-design.md' },
  { id: 'tech-design-has-baseline', label: 'Tech design includes baseline scan (business/data/fields/code)' },
  { id: 'tech-design-has-reuse-matrix', label: 'Tech design includes reuse decision matrix' },
  { id: 'design-confirmed', label: 'User confirmed design docs (WAIT — do not proceed)' },
];

/**
 * 生成某任务类型的完整 gate check 列表
 * = layers 搜索 check + 内置基础 check + 配置追加 check + verify-test
 */
export function getGateChecks(config, taskType) {
  const layers = config.layers || DEFAULT_CONFIG.layers;
  const searchChecks = getLayerSearchChecks(layers);
  const base = BASE_CHECK_DEFS[taskType] || BASE_CHECK_DEFS.feature;
  const extra = config.gates?.checkDefs?.[taskType] || [];
  // 按 id 去重（内置 base 优先；项目 config 若重复配置同 id 不重复出现）
  const seen = new Set();
  const merged = [...base, ...extra].filter(c => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
  const withPhase = merged.map(check => ({
    ...check,
    phase: check.phase || GATE_PHASES.PREPARATION,
  }));
  // 设计阶段检查项：feature 类且 designStage.enabled 时插入 user-confirmed 之后
  if (taskType === 'feature' && config.designStage?.enabled !== false) {
    const designChecks = DESIGN_STAGE_CHECKS.map(c => ({ ...c, phase: GATE_PHASES.PREPARATION }));
    const idx = withPhase.findIndex(c => c.id === 'user-confirmed');
    if (idx >= 0) withPhase.splice(idx + 1, 0, ...designChecks);
    else withPhase.push(...designChecks);
  }
  // §19.3：项目声明覆盖率阈值时追加 coverage-gate（verification），由 coverage 验证器证据自动满足
  const hasCoverageThresholds = config.coverage?.thresholds && Object.keys(config.coverage.thresholds).length > 0;
  const coverageChecks = hasCoverageThresholds
    ? [{ id: 'coverage-gate', label: 'Coverage gate: registered verifier meets thresholds (design §19.3)', phase: GATE_PHASES.VERIFICATION }]
    : [];
  // §18.4：项目启用视觉回归时追加 visual-regression（verification），由截图/ui-approval 证据自动满足
  const visualChecks = config.visualRegression?.enabled === true
    ? [{ id: 'visual-regression', label: 'Visual regression: golden screenshot baseline & pixel diff (design §18.4)', phase: GATE_PHASES.VERIFICATION }]
    : [];
  // §14.5：项目启用质量基线时追加 baseline-gate（verification），由 baseline 验证器证据自动满足
  const baselineChecks = config.qualityBaseline?.enabled === true
    ? [{ id: 'baseline-gate', label: 'No-regression baseline gate: no new failures (design §14.5)', phase: GATE_PHASES.VERIFICATION }]
    : [];
  // 设计阶段治理：feature 类且 designStage.enabled 时追加 reuse-adherence-gate（verification），
  // 由 reuse-adherence 验证器证据自动满足（技术方案复用决策落地校验）
  const reuseChecks = taskType === 'feature' && config.designStage?.enabled !== false
    ? [{ id: 'reuse-adherence-gate', label: 'Reuse adherence: tech-design reuse matrix verified (design stage)', phase: GATE_PHASES.VERIFICATION }]
    : [];
  return [...searchChecks, ...withPhase, ...coverageChecks, ...visualChecks, ...baselineChecks, ...reuseChecks, BASE_VERIFY_CHECK];
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
  if (cfg.schemaVersion !== undefined && cfg.schemaVersion !== '1.0') errors.push('schemaVersion must be 1.0');
  if (cfg.name !== undefined && typeof cfg.name !== 'string') errors.push('name must be a string');
  if (!Array.isArray(cfg.layers) || cfg.layers.length === 0) errors.push('layers must be a non-empty array');
  for (const l of cfg.layers || []) {
    if (!l.id || !l.path) errors.push(`layer missing id or path: ${JSON.stringify(l)}`);
  }
  if (!cfg.paths || typeof cfg.paths.gates !== 'string') errors.push('paths.gates must be a string');
  if (cfg.docImpact && !Array.isArray(cfg.docImpact.rules)) errors.push('docImpact.rules must be an array');
  if (cfg.gates && !isPlainObject(cfg.gates)) errors.push('gates must be an object');
  if (cfg.profiles && !isPlainObject(cfg.profiles)) errors.push('profiles must be an object');
  if (cfg.standards && !Array.isArray(cfg.standards.sources)) errors.push('standards.sources must be an array');
  if (cfg.supervisor && !isPlainObject(cfg.supervisor)) errors.push('supervisor must be an object');
  if (!cfg.paths || typeof cfg.paths.state !== 'string') errors.push('paths.state must be a string');
  if (cfg.brain && !Array.isArray(cfg.brain.sources)) errors.push('brain.sources must be an array');
  if (cfg.risk && !isPlainObject(cfg.risk)) errors.push('risk must be an object');
  if (cfg.evidence && !isPlainObject(cfg.evidence)) errors.push('evidence must be an object');
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
      throw new ConfigError(`Failed to load harness config ${cfgPath}: ${e.message}`, { cause: e });
    }
  } else {
    usedDefaults.push('ALL (no config file found — using engine defaults)');
  }

  const config = deepMerge(structuredClone(DEFAULT_CONFIG), fileConfig);
  const errors = validateConfig(config);
  if (errors.length > 0) {
    throw new ConfigError(`Invalid harness config:\n  - ${errors.join('\n  - ')}`);
  }

  const result = { config, sourcePath, usedDefaults };
  _memo = result;
  _memoRoot = start;
  return result;
}
