// 官方预设：rails — Rails 后端
export default {
  id: 'rails',
  name: 'Rails backend (app/)',
  layers: [
    { id: 'app', path: 'app', label: 'Application code' },
    { id: 'lib', path: 'lib', label: 'Library code' },
    { id: 'db', path: 'db', label: 'Database' },
  ],
  gates: {},
  docImpact: {
    base: 'origin/main',
    rules: [
      { codeGlob: /^app\/models\/.*\.rb$/, docs: ['docs/README.md'], label: 'Model change' },
    ],
  },
};
