// 官方预设：nextjs — Next.js / 前端
export default {
  id: 'nextjs',
  name: 'Next.js / frontend (src/)',
  layers: [
    { id: 'app', path: 'src', label: 'App router / components' },
    { id: 'lib', path: 'lib', label: 'Shared logic' },
  ],
  gates: {},
  docImpact: {
    base: 'origin/main',
    rules: [
      { codeGlob: /^src\/.*\.(ts|tsx|js|jsx)$/, docs: ['docs/README.md'], label: 'Source change' },
    ],
  },
};
