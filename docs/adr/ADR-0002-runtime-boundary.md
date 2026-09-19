# ADR-0002: Runtime Boundary 与 Cloud Runtime 抽取

> 由 Project Constitution 模板（`templates/constitution/adr.md`）生成；机读决策仍走既有 `record_decision`（不建第二套 Decision Engine）。
> 配套分析：`docs/rfc/0006-runtime-boundary.md`（D01 审计与矩阵）。

## Status

- **ACCEPTED**（2026-09-19）——人工授权：对话「自主决定」= 接受 D1-D6 全部决策；并授权三项附注决策：
  1. `strict:true` **不在批次中途启用**，延至 D13（Cloud Strict Finish）专门的 dogfood 轮；
  2. `product.md` 模板缺失保持现状（C04 已在 Constitution 记为 `not_applicable`），不补；
  3. 接受 Cloud 运行时 Node 版本门槛（≥22.5 带 `--experimental-sqlite` / ≥23.4 免 flag），**不引入** `better-sqlite3` 等原生依赖。
- 实施记录：D02/D03（Runtime Ports + File 适配器 + 契约测试）TASK-20260919100403-2ff1efa5；后续 D04-D14 按 RFC-0006 §7 逐步推进。

## Context

- Batch A/B/C 已完成：Core 稳定、Template Registry 与 Constitution 模板、Constitution 集成进治理内核（Task 冻结/事实门/Strict/审批/Skill 失效）。
- `harness/constitution/architecture.json#known_debt` 已登记：**Core 与 Local I/O（rootDir/fs/git）高耦合**（计划：Batch D Repository Ports 增量抽取）。
- 现状（D01 实测）：78 模块中 68 依赖 `node:fs`、13 依赖 `child_process`、16 涉及 Git；仅 8 个纯逻辑模块。
- 目标结构（指令 §二）：Governance Core + Local Runtime（File/Git/Shell）+ Cloud Runtime（SQLite/HTTP MCP/Submitted Context），共享同一套治理语义。
- 硬约束：禁止 Big Bang；Local 必须继续工作；Cloud 禁止 fs/git/shell；HTTP 不直连 SQLite；MCP 不自行决定 PASS；领域逻辑禁 `if (cloud)`（ARCH-R4）。

## Problem

如何**在不重写**现有引擎的前提下抽取运行时边界，使 Cloud 复用同一套治理语义（而非复制一套业务规则）？
同时必须在三种技术选择上定策：SQLite 引入方式（依赖 vs Node 内置）、HTTP 传输形态、静态 Key 的鉴权范围。

## Decision

| # | 决策 | 内容 |
|---|---|---|
| **D1** | **端口 + 适配器渐进抽取** | 新增 Repository/Provider 端口（Project/Artifact/Task/Gate/Approval/Evidence/Event + Context/GitSnapshot）；Local 以 File* 适配器**包装**现有 `state-store`/`.harness-state`/`harness/gates` 行为（零行为变化）；Cloud 提供 Sqlite*/Submitted* 实现。**不移动 `bin/`，不做一次性重构**；抽取按 D02→D14 顺序推进，每步以 `test:core` 全绿 + 端口契约测试为门槛。 |
| **D2** | **SQLite 采用 Node 内置 `node:sqlite`**（零新依赖） | Cloud 运行时前置 Node ≥22.5（需 `--experimental-sqlite`）或 ≥23.4/24（免 flag，实测 24.12 可用、标记 experimental）；**Local 运行时版本要求不变**（engines ≥22.0.0）。SQL 只出现在 Sqlite Adapter 层，便于日后替换。 |
| **D3** | **HTTP 传输 = MCP Streamable HTTP（v0）** | 独立入口（`harness-mcp --http` 形态在 D10 定稿），`POST /mcp`；v0 **不做 SSE**（GET 返回 405）；请求体上限与状态码映射沿用 RFC-0005 §3.2；MCP transport 不得决定业务 Gate/Task/最终状态（ARCH-R2）。 |
| **D4** | **静态 Key 范围 = 最小** | 仅 `HARNESS_API_KEY` 环境变量 + `Authorization: Bearer` 校验；**不做** User/Tenant/试用/过期/Key 数据库/设备绑定/反共享（后续阶段另行 ADR）。 |
| **D5** | **Cloud `strictGovernance=true` 恒强制** | Cloud `finish_task` 不得回落 Local legacy 自动补链；缺事实返回 `REQUIRED_ACTIONS`，禁止补造审批/Review/Test/Knowledge 事实（与 C14 一致）。 |
| **D6** | **Cloud 边界 = 提交式上下文 + 协作级证据** | Cloud 不读项目文件、不跑 Git、不执行 shell；只接收结构化提交（摘要 + hash）；证据标注 `source=local_agent`、`trust_level=cooperative`，不伪装 CI attestation。 |

**本仓 dogfooding 附注（待人工确认）**：是否借 Batch D 轮次顺带将本仓 `harness.config.mjs` 的 `strict:false` 启用为 `true`，以真实跑通一次 strict 收尾（Batch C 遗留决策）。

## Alternatives

| 方案 | 未采纳原因 |
|---|---|
| Big Bang 重写并拆独立 Cloud 仓 | 违反"禁止 Big Bang / 不得删除 Local 兼容能力"总控约束；无法保证 Local 继续工作 |
| `better-sqlite3`（原生依赖） | 引入原生编译依赖与供应链面；Node 已内置 SQLite，可用零依赖达成 |
| 先做 HTTP 再做端口抽取 | 会让 transport 自然直连文件/状态层，形成两套业务路径（违反 Cloud 禁 fs 与 ARCH-R2/R4） |
| v0 同时支持 SSE + POST 双传输 | 增加协议面与安全面；RFC-0005 已定 v0 不做 SSE |
| 为 Cloud 复制一套 Task/Gate/Evidence 引擎 | 明确禁止（第二套引擎）；且必然双轨漂移 |

## Consequences

**正面**
- Local 行为零变化（适配器包装），Cloud 复用同一套治理语义与契约测试；
- 端口层使 SQLite/HTTP 成为可替换细节（node:sqlite experimental 风险被隔离在 Adapter 内）；
- 同一套契约测试同时驱动 File/Sqlite 适配器，杜绝双轨漂移。

**负面 / 代价**
- 过渡期内 File 与 Sqlite 两套适配器并存（维护面增加）；
- 部分模块需要"纯化"（如 fact-gates 的文件探测、guide 的 nextAction 读取）；
- Cloud 运行时受 Node 版本门槛约束（22.5+/23.4+）。

## Risks

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 端口抽象不彻底，Cloud 侧泄漏 fs/git/shell | 中 | 违反边界，Cloud 不可部署 | Cloud 模块 import 白名单测试 + 代码审查项 |
| Local 回归 | 中 | 引擎自身不可用 | 每步全量回归；适配器只包装不重写 |
| `node:sqlite` 变更（experimental） | 低 | Cloud 存储层返工 | SQL 收敛于 Adapter；版本门槛文档化 |
| 冻结 MCP 工具名被破坏 | 低 | 客户端兼容性 | 工具面契约测试（现有 20 + 新增） |

## Migration

1. D02/D03：端口 + File 适配器（行为零变化）→ 全量绿；
2. D04/D05：Context/GitSnapshot Provider；
3. D06/D07：SQLite + Sqlite Adapters + **双适配器契约测试**；
4. D08/D09：提交上下文与证据边界；
5. D10-D12：HTTP 运行时、静态 Key、MCP 兼容；
6. D13/D14：Cloud strict 强制 + 真实客户端验证。
每步均以 `test:core` 全绿 + 当步契约测试为完成门槛（D01 矩阵 §7）。

## Rollback

端口与适配器均为**新增层**；回滚 = 移除新增模块与入口，Local 路径恢复为现状（无数据迁移、无破坏性变更）。Cloud 侧如需下线，SQLite 文件与应用层模块可整体移除。

## Constitution Impact

- **architecture**：新增 Runtime Boundary 章节（端口/适配器/Cloud 边界）与模块清单变更 → 需要新版本；
- **tech-stack**：新增 Cloud 运行时技术（`node:sqlite`、HTTP MCP 入口），并登记其状态与版本门槛 → 需要新版本；
- **工程/测试规范**：增加"双适配器契约测试"要求（testing-standard 的 Test Selection Rules 需增补）；
- 实施路径：批准后按 C09 Change Flow 执行（变更提案 → 应用 → 新 Constitution Version → Skill 影响处置）。

## Skills Impact

- 预计受影响：`harness-docs`（文档同步范围扩大）、`harness-standards-audit`（新增运行时边界规范）→ 需 `UPDATE` 或 `REVIEWED_NO_CHANGE` 显式处置（C10 机制）；
- 新增 Cloud 领域 Skill：暂不新建（Batch D 交付后按 `harness skill audit` 判定）。

## Related Task

- 分析任务：`TASK-20260919095414-c09a8d82`（D01：本 ADR + RFC-0006）
- 后续实施：D02-D14（各自独立 Task；D02 起逐个建立）

## Approval

- **已批准（ACCEPTED，2026-09-19）**。授权来源：用户对话「自主决定」（= 接受 D1-D6 与三项附注决策，见 Status）；实施任务 TASK-20260919100403-2ff1efa5（critical，含审批证据）。
- 后续变更（如启用 strict、新增端口方法）需重新走 Decision / 变更流。
