// 官方预设：pallastrade — PallasTrade Commerce 参考配置
// 供自托管电商/多层框架项目参考（源自 PallasTrade 实际配置）。
export default {
  id: 'pallastrade',
  name: 'PallasTrade Commerce (layered framework reference)',
  layers: [
    { id: 'backend-app', path: 'backend/app', label: 'App (your code)' },
    { id: 'core', path: 'backend/gems/core/app', label: 'Core framework models' },
    { id: 'api', path: 'backend/gems/api/app', label: 'API framework endpoints' },
    { id: 'admin', path: 'backend/gems/admin/app', label: 'Admin framework UI' },
    { id: 'storefront', path: 'storefront/src', label: 'Storefront' },
    { id: 'platform', path: 'platform/packages', label: 'Platform' },
  ],
  gates: {
    checkDefs: {
      feature: [
        { id: 'create-req-doc', label: 'Create requirements doc' },
        { id: 'user-confirmed', label: 'User confirmed requirements doc (WAIT)' },
      ],
    },
  },
  docImpact: {
    base: 'origin/main',
    rules: [
      { codeGlob: /^backend\/app\/models\/.*\.rb$/, docs: ['docs/README.md'], label: 'Model change' },
      { codeGlob: /^storefront\/src\/(components|app)\/.*\.tsx$/, docs: ['docs/README.md'], label: 'Storefront change' },
    ],
  },
};
