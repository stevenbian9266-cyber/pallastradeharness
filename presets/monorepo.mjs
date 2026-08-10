// 官方预设：monorepo — 多包仓库
export default {
  id: 'monorepo',
  name: 'Monorepo (apps/ + packages/)',
  layers: [
    { id: 'apps', path: 'apps', label: 'Applications' },
    { id: 'packages', path: 'packages', label: 'Shared packages' },
  ],
  gates: {},
  docImpact: { base: 'origin/main', rules: [] },
};
