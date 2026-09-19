# System Architecture

> pallastradeharness 真实架构（Batch C / C04）。机读契约见 `architecture.json`。
> 定位：本文件 = Source of Truth；Supervisor 通过 `bin/constitution-compliance.mjs` 消费机读形态（Batch C / C13）。
> 事实来源：`bin/` 模块清单、`AGENTS.md`、RFC-0004（2026-09-19 提取）。

## Architecture Summary

单层 Node ESM 引擎：**CLI/MCP 入口 → 治理域模块 → 文件状态层**。零服务端、零数据库；所有状态以文件 + Git 快照承载，治理语义（Task/Gate/Evidence/Constitution）由纯逻辑模块实现，可被 Local 与未来 Cloud 运行时复用。

## System Context

- 上游：AI Agent（Copilot / Claude Code / Codex / Cursor）与人类开发者
- 下游：项目仓库（Git）、本地文件系统（状态/产物）、npm registry（发布）、GitHub Actions（CI）
- 外部集成边界：MCP 客户端（stdio）、Git 二进制、可选 Playwright

## Architecture Style

modular（模块族 + 单向依赖）。选择理由：能力域清晰、可增量扩展（Batch 化）、便于未来抽取 Cloud Runtime 而不重写领域逻辑。

## Modules

| 模块 id | 名称 | 路径（代表文件） | 层 |
|---|---|---|---|
| cli | 入口与分发 | `bin/harness.mjs` · `bin/mcp-server.mjs` | 入口 |
| contracts | 契约层 | `bin/contracts.mjs` · `bin/template-registry.mjs` | 基础 |
| state | 状态与快照 | `bin/state-store.mjs` · `bin/change-snapshot.mjs` | 基础 |
| task | Task/Risk/Gate | `bin/task-orchestrator.mjs` · `bin/risk-engine.mjs` · `bin/gate-commands.mjs` · `bin/gate-lifecycle.mjs` | 治理 |
| constitution | Constitution 治理 | `bin/constitution.mjs` · `bin/constitution-change.mjs` · `bin/project-artifacts.mjs` · `bin/approvals.mjs` · `bin/fact-gates.mjs` | 治理 |
| assets | 模板/规范/Skill/文档生成 | `bin/template-registry.mjs` · `bin/skill*.mjs` · `bin/standards*.mjs` · `bin/docs-gen.mjs` · `bin/design-*.mjs` · `bin/reuse-adherence.mjs` | 治理 |
| supervision | 监督与扫描 | `bin/supervisor.mjs` · `bin/domain-supervisors.mjs` · `bin/constitution-compliance.mjs` · `bin/review.mjs` · `bin/scan-*.mjs` | 监督 |
| evidence | 证据与恢复 | `bin/evidence.mjs` · `bin/verifier.mjs` · `bin/recovery.mjs` · `bin/baseline.mjs` | 验证 |
| knowledge | 知识与上下文 | `bin/project-brain.mjs` · `bin/knowledge-loop.mjs` · `bin/doc-impact.mjs` · `bin/docs-check.mjs` · `bin/metrics.mjs` | 知识 |
| integration | 集成与适配 | `bin/mcp.mjs` · `bin/hooks.mjs` · `bin/agent-adapters.mjs` · `bin/capability-registry.mjs` · `bin/plugins.mjs` · `bin/ci.mjs` | 集成 |

## Module Responsibilities

- `cli`：参数解析、命令分发、退出码；不承载业务规则
- `contracts`：数据合同与校验（Task/Gate/Evidence/Template/ProjectArtifact/ConstitutionVersion…）
- `state`：原子写、任务/证据存取、变更快照与指纹
- `task`：状态机、风险分级、门禁检查与阶段推导
- `constitution`：制品清单/版本/变更流/审批绑定/事实门（Local 文件实现）
- `assets`：模板注册、Skill 生成、规范注册表、设计门与复用校验
- `supervision`：diff 审查（范围/依赖/域规则/宪法合规）
- `evidence`：验证器注册、证据新鲜度、恢复计划
- `knowledge`：知识索引/上下文包/文档同步/指标
- `integration`：MCP 协议、Agent Hook、插件与适配器登记

## Layers

- 入口层（cli）→ 治理域层（task/constitution/assets/supervision/evidence/knowledge）→ 基础层（contracts/state）
- 依赖方向单向：入口可调用任意域；域之间只允许调用基础层与其自身依赖；**禁止反向依赖与循环**

## Dependency Direction

- 允许：`cli → *`、`task → contracts/state`、`constitution → contracts/state/assets(只读模板注册表)`、`supervision → assets/compliance`、`evidence → state/verifier`
- 禁止：循环依赖；`bin/` 单文件内联复制其他模块的校验逻辑；MCP transport 决定业务状态

## Data Ownership

| 数据 | 拥有模块 | 只读方 | 说明 |
|---|---|---|---|
| Task 状态 | `task`（state 落盘） | 其他全部 | 唯一写入口 task-orchestrator |
| Gate 状态 | `task`（gate-commands） | MCP/CLI 展示 | verify-test 只能由证据关闭 |
| Evidence | `evidence` | 收尾/报告 | 绑定 HEAD/worktree/hash |
| Constitution 制品与版本 | `constitution` | supervision/context | 变更必须走 Change Flow |
| Approvals | `constitution`（approvals.mjs） | fact-gates/strict | 绑定 artifact_hash |

## API Boundaries

- CLI：`harness <command>[:<subcommand>]`（命令注册表为单一事实源）
- MCP：L1 20 工具（冻结名，RFC-0004）；不新增第二套协议面
- 公开子路径导出：`contracts` / `standards` / `supervisor` / `gate-lifecycle` 等（package.json exports）

## Shared Infrastructure

- `state-store`（原子写/读写 JSON）、`glob-utils`（文件收集）、`cli-utils`（参数/退出码）、`change-snapshot`（指纹）

## Core Data Flows

| 流程 | 入口 | 路径 | 产物 |
|---|---|---|---|
| 治理变更闭环 | `harness task start` | cli → task → state → gate → evidence | Task/Gate/Evidence 文件 |
| MCP 调用 | MCP client | mcp-server → mcp → 域模块 | 结构化工具结果 |
| Supervisor 审查 | `harness supervise diff` | supervisor → domain-supervisors → compliance/standards | findings/blocking 计数 |
| Constitution 变更 | `harness constitution:change` | cli → constitution-change → project-artifacts → versions | 新版本 + skill impact |

## Auth Boundary

- Local：无认证（本机文件权限即边界）；Cloud（未实现）：静态 Key + 租户隔离属 Batch D

## External Integration Boundary

- Git：通过 `git-files.mjs`（只读 diff/文件列表）；失败时语义降级为错误返回（不静默）
- npm registry：仅发布路径（CI）；运行时不联网
- 可选 Playwright：缺失时 `validation_unavailable`（exit 2），不伪装成功

## Error Handling

- 领域函数返回结构化 `{ok, code, message}` 或抛 `TypeError`；CLI 映射退出码（0/1/2）
- 禁止静默吞错：未知错误不得折叠为空结果（AGENTS.md §4）

## Transaction Boundary

- 单文件原子写（`atomicWriteJson/Text`：临时文件 + rename）；跨文件操作（如 lock：快照 + current + manifest）以"先写快照再写指针"的顺序保证可恢复

## Performance Constraints

- 核心测试套件（327+ 用例）单机 < 60s；单命令启动 < 1s（纯 Node，无构建）
- 大仓库：supervisor/brain 支持 shard（`config.supervisor.shardSize` / `brain.shardSize`）

## Security Constraints

- 不执行任意命令作为证据（Verifier Registry 白名单；`run_verifier` 仅注册表）
- 密钥扫描（`scan-secrets`）+ 危险命令 Hook；证据绑定快照防"验证后修改"
- MCP：human-WAIT 检查禁止裸清；工具面冻结

## Forbidden Patterns

- 第二套 Task/Gate/Evidence/Skill/Decision 引擎
- MCP transport 自行决定业务 Gate/Task 最终状态
- 领域逻辑中的 Cloud 特定分支（`if (cloud)`）
- 手改保护文件（`package-lock.json`）与生成物
- `.catch(() => [])` 式未知错误折叠

## Known Architecture Debt

| 债务 | 影响 | 计划 |
|---|---|---|
| Core 与 Local I/O（rootDir/fs/git）高耦合 | Cloud 抽取成本（Batch D 任务） | Batch D：Repository Ports + Context Provider 增量抽取 |
| `bin/` 为单层目录（60+ 模块） | 导航成本 | 接受（禁止为目录美观搬迁，AGENTS.md §4.7） |
| Supervisor findings 未持久化关联 | Blocking Findings 跨流程追溯弱 | 后续批次（方案 §66 的 Blocking Findings clear 待接入 strict） |

## Related ADR

| ADR | 主题 | 状态 |
|---|---|---|
| ADR-0001（拟） | Constitution 采用文件型制品 + 内容哈希版本（Batch C 设计决策） | ACCEPTED（本批次 tech-design） |
| RFC-0002 | ChangeSnapshot 数据合同 | ACCEPTED |
| RFC-0004 | MCP 全量机制接入 | ACCEPTED |
