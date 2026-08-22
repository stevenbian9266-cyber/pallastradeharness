# REQ-20260822-guided-ux-p1-3

- **任务**: 优化：实施 Harness 引导式体验（P1 第三批：Tier A 参考项目 fixtures）
- **Gate**: GATE-2026-08-22T15-39-40
- **Task**: TASK-20260822153934-3ef14d43
- **日期**: 2026-08-22
- **类型**: 功能优化（参考项目）
- **权威方案**: `harness优化升级实施方案-20260820.md` §6.7（支持等级与参考项目）
- **承上**: P0 全部 + P1 前两批完成

## 需求描述

HTH-018（Tier A 参考项目）：为 Node/TypeScript、Rails、Java/Maven 三个 Tier A 语言各维护一个最小参考项目（fixture），展示该技术栈如何接入 Harness（layers/verifiers/profiles 配置），供 Go/No-Go 门禁与 nightly 验证使用。

## 变更范围

| 文件 | 变更 |
|---|---|
| `examples/node-ts/` | 最小 TS 项目：package.json + src + 测试 + harness.config.mjs + README |
| `examples/rails/` | 最小 Rails 项目：Gemfile + 模型 + spec + harness.config.mjs + README |
| `examples/java/` | 最小 Java/Maven：pom.xml + App + JUnit + harness.config.mjs + README |
| `examples/README.md` | Tier A 参考项目说明 |
| `bin/examples.test.mjs` | 新增：fixture 配置可加载 + Lite gate 可开 |

## 跨层搜索结论

新增 `examples/` 目录（参考项目），不涉及引擎 `bin/` 逻辑变更，无重复实现。

## Skill 咨询（已读，承上批）

| Skill 文件 | 状态 | 关键结论引用 |
|---|---|---|
| `harness-prd/SKILL.md` | ✅ 已读 | 已确认 PRD 的 FR-011 延续（支持等级） |
| `harness-docs/SKILL.md` | ✅ 已读 | 参考项目需 README 说明 |
| `pallastrade-customization/SKILL.md` | ✅ 已读 | 无冲突 |

## 技术方案（初步）

1. 每个 fixture 含：`harness.config.mjs`（适配技术栈 layers + verifiers）、README（接入步骤）、最小源码/测试。
2. `bin/examples.test.mjs`：对三个 fixture 验证——`loadConfig` 成功、layers 正确、`getGateChecks`（--lite 语义）不含 PRD 检查。
3. Rails/Java 因无本地环境不实际运行测试（README 说明），node-ts fixture 提供 `node --test` 可跑的测试。

## 风险点

- fixture 不应引入真实依赖（避免锁死环境）——只用声明式结构 + 最小测试
- examples/ 不被引擎测试扫描误包含（node --test bin/*.test.mjs 只扫 bin/）
