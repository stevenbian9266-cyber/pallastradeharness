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
  // 机器可读规范
  standards: { includeBundled: true, sources: ['harness/standards/**/*.json'] },
  // 开发监督器
  supervisor: {
    mode: 'guard', // assist | guard | strict
    plansDir: '.harness-cache/plans',
    generatedFiles: ['src/types/generated/**'],
    protectedFiles: ['**/db/schema.rb', '**/Gemfile.lock'],
    dependencyFiles: ['**/package.json', '**/Gemfile', '**/requirements*.txt'],
    complexity: { maxDecisionPoints: 12, duplicateBlockLines: 6 },
    boundaries: [
      { id: 'ui-server', from: 'src/ui/**', denyImports: ['../server/**'] },
    ],
  },
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
| `standards.includeBundled` | boolean | 是否加载包内 `base-standards.json`；`init` 复制规范后会设为 false，避免重复 |
| `standards.sources` | string[] | 项目规范 JSON glob；项目同 ID 规范可覆盖内置 starter |
| `supervisor.mode` | string | `assist` 只报告、`guard` 阻塞 error/critical、`strict` 强化 review 阻塞 |
| `supervisor.plansDir` | string | Change Plan 运行时目录，默认 `.harness-cache/plans` |
| `supervisor.generatedFiles` | string[] | 只能由生成器修改的文件 glob |
| `supervisor.protectedFiles` | string[] | Change Plan 默认 deny 范围 |
| `supervisor.dependencyFiles` | string[] | 触发 Technology Choice Review 的依赖清单 |
| `supervisor.complexity` | object | 新增/修改代码的决策点与重复块基线；不以历史债务阻断任务 |
| `supervisor.boundaries` | array | `{ id, from, denyImports }` 架构依赖边界 |
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
| `verify-test` | verification 阶段的验证/测试证据；不再阻塞开始编码，但未完成会阻塞提交 |

未显式声明 `phase` 的项目 check 默认为 `preparation`；验证类 check 可声明 `phase: 'verification'`。项目用 `gates.checkDefs.<type>` 追加 check（id 前缀 `plugin-` 由插件注册）。旧 Gate 通过 `npx harness gate:migrate --dry-run` 预览、`npx harness gate:migrate` 迁移。

## 规范对象

每条 Standard 必须包含 `schemaVersion/type/id/category/title/authority/scope/severity/enforcement`，并建议提供 `evidence/fix/exception/knowledgeImpact`。完整示例和执行等级见[规范与开发监督](standards-supervisor.md)。

## 校验

```bash
npx harness config:check
```
