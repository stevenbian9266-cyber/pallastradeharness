# Technology Stack

> pallastradeharness 真实技术栈（Batch C / C04）。机读契约见 `tech-stack.json`。
> 事实来源：`package.json`、`harness.config.mjs`、`.github/workflows/*`、源码（2026-09-19）。
> 未使用的类别写 `N/A`（保持结构可比）；任何限制/弃用都给出原因。

## Runtime

- Node.js `>=22`（`package.json#engines`；CI 矩阵 Node 22 / 24）；无浏览器运行时依赖

## Language

- JavaScript（ESM，`"type": "module"`）；无 TypeScript 编译步骤（示例项目可用 TS + strip-types）

## Package Manager

- npm（`package-lock.json` 锁定；发布走 npm Trusted Publishing / OIDC + provenance）

## Frontend

- `N/A`（引擎无前端；`docs/` 为 Jekyll 静态文档站，非产品 UI）

## Backend

- `N/A`（无服务端进程；CLI + stdio MCP 为入口）

## Database

- `N/A`（无 SQL / 无数据库；状态与产物为文件：`.harness-state/`、`harness/`、`artifacts/`）

## ORM

- `N/A`

## Cache

- 本地文件缓存（`.harness-cache/`：supervise plan / brain shards 等，可随时删除重建）

## Queue

- `N/A`

## Search

- Project Brain 本地索引检索（`bin/project-brain.mjs`，无外部搜索引擎）

## Object Storage

- `N/A`

## Testing

- `node:test`（内置）；分层脚本：`test:core` / `test:mcp` / `test:e2e` / `test:examples`（Batch A）

## Browser / E2E

- `cli-e2e.test.mjs`（真实 stdio 端到端）；可选 Playwright（`visual-regression.mjs` capture 路径，未启用）

## Build

- `N/A`（无构建步骤；纯 Node ESM 源码直发）

## Lint / Format

- 无独立 linter；由 `supervisor` / `scan-anti-patterns` / `scan-ui-anti-patterns` / `scan-secrets` + lefthook pre-commit 承担

## Deployment

- npm 包发布（`publish.yml`：tag → 测试 → OIDC publish + provenance）；CI 为 GitHub Actions（Node 22/24 × ubuntu/windows/macos）

## Observability

- 本地指标（`bin/metrics.mjs`，artifact 计数/任务统计）+ harness 日志与 TUI dashboard；无外部 APM

## Approved Libraries

| 库 | 用途 | 约束 |
|---|---|---|
| `glob` ^13 | 文件收集（跨平台 glob） | 仅在需要 FS 收集处使用；已有 `glob-utils` 封装 |
| `minimatch` ^10 | 路径/范围匹配（risk、supervisor、standards） | 路径归一化后再匹配 |
| `pngjs` ^7 · `pixelmatch` ^7 | 视觉回归（像素 diff） | 仅 `visual-regression.mjs` 使用 |

## Restricted Technologies

| 技术 | 限制原因 | 替代方案 | 例外条件 |
|---|---|---|---|
| 自引用依赖 `pallastrade-harness` | 会加载旧版发布物（Batch A TASK-A02 决策） | 直接引用本仓库源码 | 需人工 Decision 并证明必要性 |
| 第二套 Task/Gate/Evidence/Skill/Decision 引擎 | 与既有引擎语义冲突（AGENTS.md §4） | 扩展现有模块 | 需 ADR（`ARCHITECTURE_CHANGE`） |
| 新增 YAML 解析依赖 | 模板元数据用 JS/JSON 已足够（Batch B 决策） | JSON / JS 元数据 | 需 Decision 并说明场景 |
| 领域逻辑中的 Cloud 特定分支（`if (cloud)`） | 破坏 Local/Cloud 同源治理（Batch D 约束） | 运行时边界 + Repository Ports | 不允许（Cloud 属 Batch D） |

## Deprecated Technologies

- `N/A`（当前无弃用项；出现时在此登记并给出迁移目标）

## Version Policy

- SemVer；发布由 tag + OIDC workflow 控制（`main` 受 Ruleset 保护，禁直推）
- 普通依赖升级 = `DEPENDENCY_CHANGE`；框架/ORM/数据库/队列/缓存/UI 框架/认证架构变化 = `TECH_STACK_CHANGE`（需 Decision/ADR）
- `package-lock.json` 为保护文件：只允许由 `npm install --package-lock-only` 再生，禁止手改

## Related Decisions

| 决策 / ADR | 主题 | 状态 |
|---|---|---|
| Batch A TASK-A02 | 移除自引用 devDependency（旧版发布物隔离） | ACCEPTED（2026-09-19） |
| Batch B B01/B02 | 模板元数据用 JSON/JS，不引入 YAML 解析器 | ACCEPTED（2026-09-19） |
| RFC-0004 | MCP 工具面冻结与分阶段接入 | ACCEPTED（2026-09-18） |
| RFC-0005 | 托管服务（Cloud Runtime）暂缓 | PROPOSED（未开工） |
