// 官方预设：single — 单层应用
export default {
  id: 'single',
  name: 'Single app (src/)',
  layers: [
    { id: 'app', path: 'src', label: 'App source' },
    { id: 'test', path: 'test', label: 'Tests' },
  ],
  gates: {},
  docImpact: { base: 'origin/main', rules: [] },
};
