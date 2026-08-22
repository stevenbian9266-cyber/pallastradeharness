// harness.config.mjs — Java + Maven 参考项目配置（Tier A）
export default {
  schemaVersion: '1.0',
  name: 'java-example',

  layers: [
    { id: 'main', path: 'src/main/java', label: 'Java main sources' },
    { id: 'test', path: 'src/test/java', label: 'JUnit tests' },
  ],

  gates: {
    expiryHours: { feature: 48, bugfix: 24, style: 8, audit: 24, research: 24, docs: 24, refactor: 24, security: 24, test: 24 },
    checkDefs: {},
  },

  docImpact: { base: 'origin/main', rules: [] },
  scanners: { antiPatterns: 'harness/policies/anti-patterns.json' },
  scenarios: 'harness/scenarios/scenarios.json',

  evidence: {
    autoVerify: true,
    maxOutputBytes: 262144,
    verifiers: {
      unit: { type: 'test', command: ['mvn', '-q', 'test'], cwd: '.', timeoutMs: 300000, profiles: ['quick', 'standard', 'critical'] },
    },
  },

  paths: { gates: 'harness/gates', requirements: 'harness/requirements', evidence: 'artifacts/harness-evidence', prd: 'docs/prd', state: '.harness-state' },
  doctor: { requiredDirs: ['src'], requiredFiles: ['pom.xml'], composeCandidates: [] },
};
