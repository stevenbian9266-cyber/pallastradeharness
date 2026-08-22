# Tier A Reference Projects (fixtures)

首批 Tier A（一等支持）语言的最小参考项目。每个 fixture 展示该技术栈如何接入
Harness：`harness.config.mjs`（layers/verifiers）、README 接入步骤、最小源码。

| Fixture | 语言/框架 | 验证方式 |
|---|---|---|
| [`node-ts/`](./node-ts/) | Node.js + TypeScript | `node --test`（引擎 CI 实际运行） |
| [`rails/`](./rails/) | Ruby on Rails | 结构示例（需 Ruby 环境运行） |
| [`java/`](./java/) | Java + Maven | 结构示例（需 JDK/Maven 运行） |

Tier B/C 语言不承诺完整 preset/验证器，仅保证插件合同（见 `docs/rules.md`）。
