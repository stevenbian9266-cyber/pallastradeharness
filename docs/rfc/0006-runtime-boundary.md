---
layout: default
title: "RFC-0006: Runtime Boundary — Cloud 提取审计与矩阵"
---
# RFC-0006: Runtime Boundary — Cloud 提取审计与矩阵

> **状态**：DRAFT（决策提案见 `docs/adr/ADR-0002-runtime-boundary.md`，**待人工批准**）
> **范围**：Batch D / TASK-D01 —— **只分析，不编码**
> **上游**：`docs/rfc/0004-mcp-mechanism.md`、`docs/rfc/0005-hosted-service.md`、`harness方案.md` §69/§86/§120-122、`pallastradeharness Phase 1 AI 实施指令.md` §五
> **目标结构**：Governance Core + Local Runtime + Cloud Runtime（同一套治理语义）

## 1. 约束（来自永久总控指令）

- 禁止 Big Bang Rewrite；采用 **incremental extraction**（禁止一次重构整个 `bin/`）。
- **Local Harness 必须继续工作**（Local tests 必须继续通过）；不迁移 Local 到 SQLite；Local 与 Cloud 使用不同 Storage Adapter。
- Cloud **禁止**：`readFile(rootDir)` / `git diff(rootDir)` / `run shell(rootDir)`。
- 禁止：HTTP handler → direct SQLite；MCP tool → 直接决定 PASS；领域逻辑散落 `if (cloud)`（对应本仓架构规则 **ARCH-R4**）。
- MCP 已冻结的工具名不得破坏（RFC-0004）。

## 2. 现状盘点（2026-09-19，真实源码扫描）

| 维度 | 事实 |
|---|---|
| 模块总量（`bin/*.mjs` 非测试） | **78** |
| 直接依赖 `node:fs` | **68 / 78** |
| 直接依赖 `node:child_process`（13） | ac-trace · baseline · change-snapshot · domain-supervisors · eval-llm · evidence · gate-commands · generated-check · git-files · harness · hooks · state-store · tui |
| Git 相关（16） | ac-trace · change-snapshot · doc-impact · docs-gen · domain-supervisors · evidence · gate-commands · generated-check · git-files · harness · knowledge-loop · mcp · recovery · standards · state-store · supervisor |
| 纯逻辑（无 fs/child，8） | ac-semantic · cli-utils · command-registry · constitution-cli · contracts · gate-lifecycle · risk-engine · verifier |
| `rootDir` 引用密度 Top10 | skill-audit 75 · evidence 70 · harness 65 · supervisor 49 · project-brain 48 · task-orchestrator 47 · eval-ai 36 · mcp 36 · constitution 35 · scan 35 |
| MCP 工具面直接依赖（`mcp.mjs`，16） | project-brain · risk-engine · task-orchestrator · evidence · git-files · standards · supervisor · domain-supervisors · state-store · gate-commands · guide · verifier · standards-gen · skill · docs-gen · version |

**结论**：治理语义（Task/Risk/Gate/Constitution/Evidence 判定）与 Local I/O（rootDir/fs/git/shell）**高度耦合**——这正是 `harness/constitution/architecture.json#known_debt` 已登记的第一项债务（计划：Batch D Repository Ports 增量抽取）。

## 3. 四象限矩阵（KEEP CORE / LOCAL ONLY / NEEDS PORT / CLOUD NEW）

### 3.1 KEEP CORE —— 纯治理语义，Cloud 直接复用（零改动或仅纯化）

| 组件 | 说明 |
|---|---|
| `contracts.mjs` / `template-registry.mjs` | 契约校验与模板注册表（纯读） |
| `gate-lifecycle.mjs` / `risk-engine.mjs` / `command-registry.mjs` / `cli-utils.mjs` / `version.mjs` | 状态推导、风险分级、命令政策、参数工具 |
| `ac-semantic.mjs` | 断言/mock 语义评估（纯函数） |
| `fact-gates.mjs` | 事实门推导与 strict 评估（仅余一处 Context Pack 文件探测 → 端口化后纯化） |
| `supervisor.mjs` / `domain-supervisors.mjs` / `constitution-compliance.mjs` | **给定上下文即可审查**的部分（diff 文本 + 规范 + 机读制品 → findings） |

### 3.2 NEEDS PORT —— 逻辑复用，I/O 必须经端口（D02 目标）

| 域 | 现有模块 | 端口（D02） |
|---|---|---|
| Task/Gate | `task-orchestrator.mjs` · `gate-commands.mjs` | `TaskRepository` · `GateRepository` |
| 状态/路径/原子写 | `state-store.mjs` | `File*` 适配器（现行为） + `Sqlite*` 实现 |
| Evidence | `evidence.mjs`（含 git 指纹） | `EvidenceRepository` + `GitSnapshotProvider` |
| Constitution/审批 | `constitution.mjs` · `project-artifacts.mjs` · `approvals.mjs` · `constitution-change.mjs` | `ArtifactRepository` · `ConstitutionRepository`（含版本） · `ApprovalRepository` |
| 上下文 | `project-brain.mjs` | `ProjectContextProvider` · `TaskContextProvider`（D04） |
| Git 快照 | `git-files.mjs` · `change-snapshot.mjs`(本地部分) | `GitSnapshotProvider`（Local=真 Git / Cloud=Submitted，D05） |
| 引导 | `guide.mjs`（nextAction 纯逻辑） | 端口化后 Cloud 复用 |
| MCP 装配 | `mcp.mjs`（协议层 + 工具 handler） | 协议层保留；handler **只调用域函数/端口**（ARCH-R2） |

### 3.3 LOCAL ONLY —— 保留本地（不进 Cloud 运行时）

| 类别 | 模块 |
|---|---|
| 执行/验证器 | `verifier.mjs` · `baseline.mjs` · `coverage.mjs` · `visual-regression.mjs` · `generated-check.mjs` · `ac-trace.mjs` |
| 本地入口与工具 | `harness.mjs`（CLI） · `mcp-server.mjs`（stdio） · `init.mjs` · `onboard.mjs` · `wizard.mjs` · `tui.mjs` · `hooks.mjs` · `hook-agent.mjs` · `agent-adapters.mjs` · `plugins.mjs` · `ci.mjs` |
| 本地知识/资产工具 | `skill*.mjs` · `standards*.mjs` · `docs-gen.mjs` · `docs-check.mjs` · `readme-sync.mjs` · `design-*.mjs` · `reuse-adherence.mjs` · `doc-impact.mjs` · `knowledge-loop.mjs` · `metrics.mjs` · `scan*.mjs` · `eval-*.mjs` |

### 3.4 CLOUD NEW —— 新增（运行时边界之外）

| 组件 | 说明 | 对应任务 |
|---|---|---|
| HTTP Transport | MCP Streamable HTTP（`POST /mcp`；v0 不做 SSE，GET 405）——约定已定于 RFC-0005 §3.2 | D10 |
| Static Key Auth | `HARNESS_API_KEY` + `Authorization: Bearer`；**不做** User/Tenant/试用/过期/Key 库/设备/反共享 | D11 |
| SQLite Storage | Node 内置 `node:sqlite`（WAL / foreign_keys=ON / busy_timeout / 短事务 / 迁移） | D06 |
| Sqlite Repositories | 7 个（Project/Artifact/Constitution/Task/Gate/Approval/Evidence/Event） | D07 |
| Submitted Context | `ProjectContextSubmission` / `TaskContextSubmission` / `GitSnapshotSubmission`（只存结构化摘要 + hash，默认不存源码/全量 diff） | D08 |
| Cloud Evidence Boundary | `source=local_agent`、`trust_level=cooperative`；不伪装 CI attestation | D09 |
| Cloud App Layer | HTTP → 鉴权 → MCP 适配 → 应用层 → 治理内核 → SQLite（禁止跨层直连） | D10/D12 |
| 部署构件 | RFC-0005 §5 隔离部署（M4/M5，本批次外） | M4/M5 |

## 4. Cloud 工具面映射（D12）

| 工具 | 现状承载 | 处置 |
|---|---|---|
| `start_task` / `get_task` / `list_tasks` | task-orchestrator + state-store | NEEDS PORT（TaskRepository） |
| `risk_check` | risk-engine（纯） + git-files（指纹） | KEEP CORE + SubmittedGitSnapshot |
| `gate_status` | gate-commands | NEEDS PORT（GateRepository 只读快照） |
| `gate_create` | gate-lifecycle 建门 + GateRepository | ✅ 已接线（Cloud 门禁能力）：检查项取 `getGateChecks`、任务类型取 `detectTaskType`；同一任务已有未清门 → `gate_already_active` |
| `gate_clear` | gate-lifecycle 守卫 + GateRepository | ✅ 已接线（Cloud 门禁能力）：`unknown_check` / `check_machine_verified` / `human_approval_required` / `check_already_cleared` 四道守卫，拒绝时不落库 |
| `review_diff` | supervisor / domain-supervisors | KEEP CORE（上下文注入） |
| `record_evidence` | evidence | NEEDS PORT + D09 边界标注 |
| `finish_task` | task-orchestrator + evidence/fact-gates | NEEDS PORT；**Cloud 恒 strict=true**（D13） |
| `get_next_action` | guide | KEEP CORE（纯化后） |
| 新增：`project_init` / `project_status` / `record_approval` / `get_template` | CLOUD NEW + template-registry/constitution/approvals | 独立 Tool 或 Domain Action 依 command-registry 决定（D12 时定稿） |

### 4.1 门禁政策定稿（Cloud 门禁能力）

- **门禁是流程指引，完工是证据判定**：`gate_create` / `gate_clear` 只推进准备/验证检查项；`finish_task` 的放行仍由证据策略（critical 另需非 STALE 审批）独立判定——清完门禁不等于完工。
- **状态单一来源**：门禁状态一律由 `recomputeGateState` 从检查项派生，Cloud 侧不维护影子状态（`gate_status` 直读端口快照）。
- **机器校验项不可工具化**：`verify-test` 与 `*-gate` 后缀检查项只能由 `verify` 系列命令产出证据后清除，避免"自证清白"。
- **人工门不可绕过**：human-WAIT 检查项要求存在一条非 STALE 审批（approvals 表）；未 `record_approval` 的清除请求返回 `human_approval_required` 且拒绝态不落库。
- **端口面扩展**：`GateRepository` 由只读扩展为 `loadLatest` / `statusSnapshot` / `save`，File 与 Sqlite 适配器同步实现并共用同一契约套件（防双适配器漂移）。

## 5. 端口与适配器（D02-D05 目标）

```text
Governance Core（纯语义）
   ↑ 只依赖端口接口
Repository Ports: ProjectRepository · ArtifactRepository · TaskRepository · GateRepository
                  ApprovalRepository · EvidenceRepository · EventRepository
Provider Ports:   ProjectContextProvider · TaskContextProvider · GitSnapshotProvider

Local Adapters:  FileProjectRepository …（包装 state-store / .harness-state / harness/gates / 现文件）
Cloud Adapters:  SqliteProjectRepository …（SQLite） + SubmittedGitSnapshot / SubmittedContext
```

契约测试（D07 关键交付）：**同一套行为测试同时驱动 File Adapter 与 Sqlite Adapter**（防双轨漂移）。

## 6. 存储与边界细节

- **SQLite（D06）**：`projects` `project_artifacts` `constitution_versions` `tasks` `task_checkpoints` `task_events` `gates` `approvals` `findings` `evidences` `decisions` `knowledge_assessments`；WAL、`foreign_keys=ON`、`busy_timeout`、短事务、schema 迁移支持（表结构沿用 RFC-0005 §4.1）。
- **Node 版本门槛（新事实）**：`node:sqlite` 于 Node 22.5 引入（需 `--experimental-sqlite`），23.4+ 免 flag（24.x 实测可用，仍标记 experimental）。→ **Local 运行时不受影响**；Cloud 运行时要求 Node ≥22.5（带 flag）或 ≥23.4（免 flag）。
- **提交式上下文（D08）**：Cloud 只接收结构化摘要与 hash（commit/base_commit/changed_files/tree_hash/diff_hash/workspace_hash 等），默认不保存完整源码与完整 diff。
- **证据边界（D09）**：Cloud 证据必须标注 `source=local_agent`、`trust_level=cooperative`；不得伪装 CI attestation。

## 7. 实施序（D02→D14）与回归门槛

| 阶段 | 内容 | 回归门槛 |
|---|---|---|
| D02/D03 | 端口 + File 适配器（**行为零变化**） | `test:core` 全绿 + 契约测试 |
| D04/D05 | Context / GitSnapshot Provider 抽象 | 同上 |
| D06/D07 | SQLite + Sqlite Repositories + 双适配器契约测试 | 契约测试 + 全量 |
| D08/D09 | 提交上下文 + 证据边界 | 契约测试 |
| D10/D11 | HTTP 运行时 + 静态 Key | HTTP e2e（真客户端 D14） |
| D12 | MCP 兼容（复用冻结工具 + 新增 Project 工具） | 工具面兼容测试 |
| D13 | Cloud `strictGovernance=true` | strict 回归测试 |
| D14 | 真实客户端测试（tools/list、tools/call、project init、task start/status、evidence、finish） | 真实客户端证据 |

## 8. 风险与开放问题

| # | 风险 / 问题 | 处置 |
|---|---|---|
| 1 | 端口抽象不彻底 → Cloud 侧泄漏 fs/git/shell | 端口契约测试 + Cloud 模块 import 白名单测试 |
| 2 | Local 回归 | 适配器只包装、不改行为；每步跑全量 |
| 3 | `node:sqlite` experimental 状态 | 明确版本门槛；SQL 层收敛在 Sqlite Adapter，可替换 |
| 4 | 双轨（File/Sqlite）行为漂移 | 同一套契约测试（D07 硬要求） |
| 5 | MCP 冻结名破坏 | 兼容性契约测试 |
| 6 | Cloud 证据可信度 | cooperative 明示 + 不伪装 attestation；后续可加签名/CI 路径 |
| 7 | **开放问题（人工决策）**：是否在 Batch D 内顺带启用本仓 `strict:true`（Batch C 遗留） | 见 ADR-0002 决策 D6 |
