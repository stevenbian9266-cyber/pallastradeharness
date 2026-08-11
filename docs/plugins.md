---
layout: default
title: 插件开发
---
# 插件开发（插件协议）

通过统一接口扩展 harness，**无需改引擎**。两种加载方式：

1. **文件级**：项目 `harness/plugins/*.mjs`（推荐，随仓库分发）
2. **配置级**：`harness.config.mjs` → `plugins: { checks, scanners, presets }`

## Check 插件（进入 gate 检查清单 + `harness check` 执行）

```js
// harness/plugins/my-check.mjs
export default {
  checks: [
    {
      id: 'no-todos',                       // gate 中显示为 plugin-no-todos
      label: 'No TODO/FIXME comments',
      run: async ({ rootDir, config, files }) => {
        const hits = [];
        // ... 检查 (files) 变更文件 ...
        return hits.length
          ? { pass: false, evidence: hits.join(', ') }
          : { pass: true, evidence: 'clean' };
      },
    },
  ],
};
```

## Scanner 插件（`harness check` 执行，违规 → 失败）

```js
export default {
  scanners: [
    {
      id: 'no-console',
      glob: '**/*.{ts,js}',
      run: async ({ rootDir, files }) => {
        const violations = [];
        // ... 扫描变更文件，返回 ["path:line: msg", ...]
        return violations;
      },
    },
  ],
};
```

## Preset（可被 `harness init --preset <id>` 引用）

```js
export default {
  presets: [
    { id: 'my-stack', name: 'My stack', layers: [{ id: 'src', path: 'src' }] },
  ],
};
```

## 验证插件

```bash
npx harness plugins:list      # 看插件是否被加载
npx harness check --profile quick   # 插件 check/scanner 会被执行
```

> 完整示例见仓库 `harness/plugins/example.mjs`。通用插件建议贡献到上游（见 [贡献指南](contributing.md)）。
