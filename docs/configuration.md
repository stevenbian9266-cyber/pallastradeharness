---
layout: default
title: 配置参考
---
# 配置参考（`harness.config.mjs`）

引擎通用，项目通过配置声明自身结构。所有字段可选（有引擎默认值）。

```js
export default {
  name: 'my-project',
  // 层定义：gate 跨层搜索来源
  layers: [{ id: 'app', path: 'app' }, { id: 'web', path: 'src' }],
  // 门禁：追加项目特定 check
  gates: { checkDefs: { feature: [{ id: 'my-check', label: '...' }] } },
  // 知识同步规则（改了什么 → 必须同步什么文档）
  docImpact: {
    base: 'origin/main',
    rules: [{ codeGlob: /^src\/.*\.ts$/, docs: ['docs/README.md'], label: '...' }],
  },
  // 覆盖率
  coverage: { thresholds: {}, targets: [] },
  // 扫描器规则文件
  scanners: { antiPatterns: 'harness/policies/anti-patterns.json' },
  // 状态/产物路径
  paths: { gates: 'harness/gates', requirements: 'harness/requirements', prd: 'docs/prd' },
  // 插件
  plugins: { checks: [], scanners: [], presets: [] },
};
```

## 字段详解

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | string | 项目名（报告/日志用） |
| `layers` | array | 跨层搜索的层定义。gate 的 cross-layer search check 按此生成 |
| `gates.checkDefs` | object | 按任务类型追加 check：`{ feature: [], bugfix: [], ... }`。内置 check 见下文 |
| `docImpact.rules` | array | 每条 `{ codeGlob: RegExp, docs: string[], label: string }`。`--base` 指定对比分支 |
| `coverage` | object | 覆盖率阈值与目标文件 |
| `scanners.antiPatterns` | string | 反模式规则 JSON 路径 |
| `paths` | object | gate/需求文档/PRD 的落盘路径 |
| `plugins` | object | 代码级插件（check/scanner/preset） |

## 内置 check（feature 类示例）

| check id | 说明 |
|---|---|
| `cross-layer-search` | 跨层搜索证据 |
| `read-skill` | 阅读领域 Skill |
| `read-skill-prd` | 阅读 PRD Skill |
| `create-prd-doc` | 创建 PRD 文档 |
| `create-req-doc` | 创建需求文档 |
| `req-doc-has-skill-table` | 需求文档含 Skill 证据表 |
| `user-confirmed` | 用户显式确认 |
| `verify-test` | 验证/测试证据 |

> 完整 checkDefs 见 `config-loader.mjs` 的 `DEFAULT_GATE_CHECKS`。项目可用 `gates.checkDefs.<type>` 追加自己的 check（id 前缀 `plugin-` 由插件注册）。

## 校验

```bash
npx harness config:check
```
