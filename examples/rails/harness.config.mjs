// harness.config.mjs — Ruby on Rails 参考项目配置（Tier A）
export default {
  schemaVersion: '1.0',
  name: 'rails-example',

  layers: [
    { id: 'app', path: 'app', label: 'Rails app' },
    { id: 'spec', path: 'spec', label: 'RSpec tests' },
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
      unit: { type: 'test', command: ['bundle', 'exec', 'rspec', '--format', 'progress'], cwd: '.', timeoutMs: 300000, profiles: ['quick', 'standard', 'critical'] },
    },
  },

  paths: { gates: 'harness/gates', requirements: 'harness/requirements', evidence: 'artifacts/harness-evidence', prd: 'docs/prd', state: '.harness-state' },
  doctor: { requiredDirs: ['app'], requiredFiles: ['Gemfile'], composeCandidates: [] },
};
