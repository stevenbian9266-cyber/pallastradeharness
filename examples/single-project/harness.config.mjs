export default {
  schemaVersion: '1.0',
  name: 'single-project-example',
  layers: [
    { id: 'app', path: 'src' },
    { id: 'test', path: 'test' },
  ],
  standards: {
    includeBundled: true,
    sources: ['harness/standards/**/*.json'],
  },
  brain: {
    sources: ['README.md', 'docs/**/*.md', 'src/**/*.{js,mjs,ts}'],
    exclude: ['**/.env*', '**/secrets/**'],
  },
  risk: {
    criticalPaths: ['src/auth/**', '**/migrations/**'],
    standardPaths: ['src/**'],
  },
  paths: {
    state: '.harness-state',
    evidence: 'artifacts/harness/evidence',
  },
};

