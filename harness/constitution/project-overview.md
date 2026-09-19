# Project Overview

> pallastradeharness 的真实 Constitution 制品（Batch C / C04，Brownfield Discovery）。
> 事实来源：`README.md`、`AGENTS.md`、`package.json`、`docs/rfc/0001-0005`、`harness方案.md`（2026-09-19 提取）。
> 填写原则：无法从代码/文档确认的项写 `UNKNOWN` 或 `TO_BE_DECIDED`，不臆造。

## Project Identity

- 名称 / 代码库：`pallastrade-harness`（GitHub `stevenbian9266-cyber/pallastradeharness`）
- 形态：CLI + MCP 服务（引擎 / library-sdk 混合；npm 包 `pallastrade-harness`）
- 生命周期阶段：`ACTIVE`（1.10.0；Phase 1 治理能力建设期）
- 许可证 / 归属：MIT · 个人维护（`UNKNOWN`：团队规模与 SLA）

## Business Purpose

- 解决的问题：AI Agent 参与软件开发时，缺少**确定性的治理与证据**——门禁、规范、监督、证据、恢复、知识同步散落在人治与提示词里。
- 价值主张：把"什么时候允许改代码 / 改了算什么证据 / 谁能验收"变成**可执行、可复核、可移植**的本地优先引擎；对 Cloud 形态（RFC-0005）是同一套治理语义的复用。
- 非目标（business 层）：不做 IDE/Agent 本体；不做通用 CI 平台；不做托管代码仓库。

## Target Users

| 用户类型 | 特征 | 关键诉求 | 使用方式 |
|---|---|---|---|
| 用 AI 写代码的个人开发者 | Claude Code / Codex / Cursor / Copilot 用户 | 改代码前有门禁、完成后有可复核证据 | `npx harness` / MCP 客户端 |
| 小团队 Tech Lead | 需要在 AI 协作下守住规范与架构 | 规范可执行、偏离可发现、知识不腐化 | `harness gate` / `supervise` / `standards` |
| 未来的托管服务客户（RFC-0005） | 不想自建治理流程 | 零安装接入（MCP HTTP + Key） | `mcp.pallastrade.cn`（未上线） |

## Core Capabilities

- Task 生命周期 + 风险分级 + 分阶段 Gate（preparation / implementation / verification）
- 机器可读 Standards + Development Supervisor（范围/依赖/架构边界/复杂度）
- Typed Evidence + Verifier Registry + Recovery（证据绑定 HEAD/worktree/hash）
- Knowledge Loop + Project Brain（doc-impact / 知识同步 / 上下文包）
- PRD 工作流 / 设计阶段治理 / Skills 体系 / 模板与 Constitution（Batch B/C）
- MCP 全量接入（L1 20 工具）与 Agent 适配器能力登记
- 边界：以上均**本地优先**（文件 + Git），不依赖服务端

## Current Scope

- 已交付：v1.10.0 全部能力 + Batch A（Core Stabilization）+ Batch B（Template Registry / Constitution 模板）+ Batch C（Constitution 集成，本批次）
- 建设中：Phase 1 收尾（3 个 dogfooding Task）→ Phase 2（MCP L2 域）/ Phase 3（HTTP MCP 多根）
- 规划中：托管服务 M1-M5（RFC-0005，**未批准开工**）

## Out of Scope

- Cloud Runtime（SQLite / HTTP MCP / 静态 Key / User-Tenant）——Batch D 才允许开始
- 重写既有 Task/Gate/Evidence/Skill/Supervisor 引擎
- 为 Cloud 复制一套业务规则；在领域逻辑中散落 `if (cloud)` 分支
- 引入第二套核心技术（第二套 Task/Gate/Evidence 引擎、未经 Decision 的新框架）

## Critical Business Flows

| 流程 | 触发 | 关键步骤 | 失败影响 | 涉及模块 |
|---|---|---|---|---|
| 受治理的变更闭环 | 任意代码变更 | task start → brain context → risk → gate → 实施 → verify → evidence → finish | 变更不可复核、知识腐化 | `task-orchestrator` / `gate-commands` / `evidence` |
| 知识同步 | 代码/文档变更 | doc-impact → 同步 README/CHANGELOG/文档 → docs:check | 文档漂移、AI 上下文失真 | `doc-impact` / `docs-check` / `readme-sync` |
| Constitution 治理（Batch C 起） | 长期 Artifact 变化 | drift → change → proposal → decision → 新版本 → skill impact | "依据哪一版规范开发"不可回答 | `constitution` / `constitution-change` / `approvals` |
| 收尾验收 | 任务完成 | 事实门 → strict finish（可选）→ evidence verify | 假完成、伪造流程事实 | `fact-gates` / `evidence` / `task-orchestrator` |
| 发布 | tag | CI 合同测试 → readme 同步 → OIDC publish → provenance | 供应链可信度受损 | `.github/workflows/*` / `readme-sync` |

## Key Terminology

| 术语 | 含义 | 使用边界 |
|---|---|---|
| Task | 受治理的变更单元（唯一入口） | 不得脱离 Task 直接改文件（除治理自身准备的制品） |
| Gate | 分阶段检查清单（preparation/verification） | human-WAIT 项禁止机器裸清；verify-test 只能由证据关闭 |
| Evidence | 类型化、绑定 HEAD/worktree 的完成证据 | 不得只用文字声明完成；不得复用过期证据 |
| Constitution | 长期 Artifact 集合 + 版本（Batch C 起） | 不得静默修改；必须走 Change Flow |
| Approval | 对某一版制品内容的确认（绑定 artifact_hash） | hash 变化即 STALE，不得复用 |
| Impact | 架构/技术栈影响等级（Batch C 起） | CHANGE 级必须伴随 Decision |

## Business Constraints

- 合规 / 许可：MIT；依赖需可审计（供应链 provenance）
- 数据与隐私：本地优先；不做数据采集（metrics 仅本地）
- 运行环境约束：Node ≥ 22；Windows/macOS/Linux 矩阵；离线可用
- 成本约束：无服务端常驻成本（Cloud 为可选增值，RFC-0005 未开工）

## Related Constitution

- 产品/业务规则：`TO_BE_DECIDED`（引擎无独立业务规则文档；如需独立 `product` 制品待人工确认）
- 技术栈：`tech-stack.md` / `tech-stack.json`
- 架构：`architecture.md` / `architecture.json`
- 工程规范：`engineering.md`
- 测试规范：`testing.md`
- 验收规范：`acceptance.md`
- Agent 规则：`agent-rules.md`
