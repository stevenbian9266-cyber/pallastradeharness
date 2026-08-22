// harness.config.mjs — pallastradeharness 独立仓配置（引擎仓 self-dogfood）
// 引擎通用机制见本仓 bin/config-loader.mjs；本文件声明独立仓自身结构。
export default {
  schemaVersion: '1.0',
  name: 'pallastradeharness',

  // ① 层定义：gate 跨层搜索（引擎仓的"层"= 引擎自身模块分组）
  layers: [
    { id: 'bin',       path: 'bin',       label: 'Engine source (CLI + modules)' },
    { id: 'presets',   path: 'presets',   label: 'Framework presets' },
    { id: 'templates', path: 'templates', label: 'Doc/code templates' },
    { id: 'rules',     path: 'rules',     label: 'Rule baselines' },
    { id: 'docs',      path: 'docs',      label: 'Documentation' },
  ],

  // ② gate 配置（内置基础 check 自动合并，此处只追加项目专属）
  gates: {
    expiryHours: {
      feature: 48, bugfix: 24, style: 8,
      audit: 24, research: 24, docs: 24, refactor: 24, security: 24, test: 24,
    },
    checkDefs: {},
  },

  // ③ 知识同步规则（doc-impact）— 镜像 AGENTS.md §6
  docImpact: {
    base: 'origin/main',
    rules: [
      { codeGlob: /^bin\/.*\.mjs$/, docs: ['README.md', 'docs/getting-started.md'], anyOf: true, label: 'Engine code change → README sync' },
      { codeGlob: /^docs\/rfc\//, docs: ['AGENTS.md'], label: 'RFC change → AGENTS reference sync' },
      { codeGlob: /^package\.json$/, docs: ['CHANGELOG.md', 'README.md'], anyOf: true, label: 'Manifest change → changelog sync' },
    ],
  },

  // ④ 覆盖率（node:test 引擎测试；阈值后续批次完善）
  coverage: {
    thresholds: {},
    targets: [],
  },

  // ⑤ 扫描器规则文件
  scanners: {
    antiPatterns: 'harness/policies/anti-patterns.json',
  },

  // ⑥ eval / scenarios
  scenarios: 'harness/scenarios/scenarios.json',

  // ⑦ check profiles（引擎仓用 node:test 驱动）
  profiles: {
    quick: {
      timeout: 180,
      checks: ['engine-test', 'docs-check', 'anti-patterns'],
    },
    full: {
      timeout: 900,
      checks: ['quick', 'engine-test-full', 'generated-check'],
    },
  },

  // ⑧ doctor 检查项
  doctor: {
    requiredDirs: ['bin', 'docs', 'presets', 'templates', 'rules'],
    requiredFiles: ['AGENTS.md', 'harness.config.mjs', 'lefthook.yml'],
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

  // ⑩ 机器可读规范与开发监督器
  standards: {
    includeBundled: true,
    sources: ['harness/standards/**/*.json'],
  },
  supervisor: {
    mode: 'guard',
    plansDir: '.harness-cache/plans',
    generatedFiles: [],
    protectedFiles: ['**/package-lock.json'],
    dependencyFiles: ['**/package.json'],
    testFiles: ['**/*.test.*', '**/fixtures/**'],
    ruleDefinitionFiles: ['**/risk-engine.*', '**/domain-supervisors.*', '**/scan-*', '**/policies/**', '**/rules/**'],
    complexity: { maxDecisionPoints: 12, duplicateBlockLines: 6 },
    boundaries: [],
    maxFiles: 10000,
    shardSize: 500,
  },
  brain: {
    sources: [
      'AGENTS.md',
      'README.md',
      'docs/**/*.{md,mdx,json,yaml,yml}',
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
      '**/*auth*',
      '**/*secret*',
      '**/*deploy*',
      '**/*payment*',
      '.github/workflows/**',
      'bin/evidence.mjs',
      'bin/gate-lifecycle.mjs',
      'bin/harness.mjs',
      'bin/change-snapshot.mjs',
    ],
    standardPaths: ['bin/**', 'presets/**', 'templates/**', 'rules/**', '**/package.json', '**/*config*', '**/*schema*'],
  },
  evidence: {
    autoVerify: true,
    maxOutputBytes: 262144,
  },
  plugins: {
    apiVersion: '1.0',
    strict: false,
  },
};
