// harness.config.mjs — Node.js + TypeScript 参考项目配置（Tier A）
export default {
  schemaVersion: '1.0',
  name: 'node-ts-example',

  layers: [
    { id: 'app', path: 'src', label: 'TypeScript source' },
  ],

  gates: {
    expiryHours: { feature: 48, bugfix: 24, style: 8, audit: 24, research: 24, docs: 24, refactor: 24, security: 24, test: 24 },
    checkDefs: {},
  },

  docImpact: { base: 'origin/main', rules: [] },

  scanners: { antiPatterns: 'harness/policies/anti-patterns.json' },
  scenarios: 'harness/scenarios/scenarios.json',

  // Tier A 验证器：node --test（glob 展开由引擎处理）
  evidence: {
    autoVerify: true,
    maxOutputBytes: 262144,
    verifiers: {
      unit: { type: 'test', command: ['node', '--test', '**/*.test.mjs'], cwd: '.', timeoutMs: 120000, profiles: ['quick', 'standard', 'critical'] },
    },
  },

  paths: { gates: 'harness/gates', requirements: 'harness/requirements', evidence: 'artifacts/harness-evidence', prd: 'docs/prd', state: '.harness-state' },
  doctor: { requiredDirs: ['src'], requiredFiles: ['package.json'], composeCandidates: [] },
};
