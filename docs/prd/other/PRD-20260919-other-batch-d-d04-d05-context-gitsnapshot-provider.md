# PRD — Batch D D04/D05：Context / GitSnapshot Provider 抽象

- **状态**：approved（授权：ADR-0002 ACCEPTED + 用户「自主决定」）
- **任务**：TASK-20260919101110-f33d9810（critical）
- **上游规格**：`docs/rfc/0006-runtime-boundary.md` §3.2 / §5 / §7；`docs/adr/ADR-0002-runtime-boundary.md` D1、D6
- **语言/栈**：Node ESM（零依赖）；影响面 = 新增可复用层，**既有调用点零改动**

## 1. 背景

D02/D03 已把 7 个**存储端口**（Project/Artifact/Task/Gate/Approval/Evidence/Event）从治理内核中抽出，并以 File 适配器 + 可复用契约测试锁定行为。RFC-0006 的架构图还列出第二组端口——**Provider Ports**：

```
Provider Ports: ProjectContextProvider · TaskContextProvider · GitSnapshotProvider
```

它们承载的两块能力目前直接耦合在本机实现里：

| 能力 | 现有本机实现 | 现状问题 |
|---|---|---|
| 项目/任务上下文 | `bin/project-brain.mjs`（`buildProjectProfile` / `indexKnowledge` / `buildContextPack` / `brainStatus` / `searchKnowledge` / `recordDecision`） | 消费方（`mcp.mjs`、`command-registry.mjs`）直接 import 具体函数；Cloud 侧（D08 提交式上下文）无法替换实现 |
| Git 快照 | `bin/git-files.mjs`（`getChangedFiles` / `getDiff` / `showFileAtRef`）+ `bin/change-snapshot.mjs`（`createSnapshot` / `writeSnapshot` / `readSnapshot` / `listSnapshots`） | 59 处调用点散布在 13 个模块；Cloud 侧必须用「提交式快照」实现同一语义 |

本任务（D04/D05）交付**端口定义 + 本机适配器 + 契约测试**，为 D08（`SubmittedContext` / `SubmittedGitSnapshot`）铺路。**不改任何既有调用点**——与 D02/D03 相同的「只加不改」策略。

## 2. 目标

- **G1**：冻结三组 Provider 端口的方法面（方法名 + 语义 + 缺失值归一），作为 Cloud 适配器（D08）与治理内核之间的唯一契约。
- **G2**：提供本机适配器 `createLocalProviders({ rootDir, config })`，逐方法包装既有函数，**行为零变化**。
- **G3**：提供可复用契约测试 `runProviderContractTests`，同一套行为断言将同时驱动 Local（本批）与 Submitted/Sqlite（D08/D07）实现，防双轨漂移。
- **G4**：端口定义模块保持**纯逻辑**（不 import `node:fs` / `node:child_process`），并由测试守护。

## 3. 用户场景

1. **本机 CLI/MCP（不变）**：`harness brain context`、`harness supervise diff` 等仍走既有路径；本批交付层暂不接线（D12 起在 Cloud 装配处使用）。
2. **Cloud 侧装配（D08 起）**：`buildCloudRuntime` 用 `createSubmittedProviders(submission)` 实现同一 `PROVIDER_PORT_METHODS` 面；治理内核代码不需要任何 `if (cloud)` 分支（ADR-0002 D1 / ARCH-R4）。
3. **回归保障**：任何适配器实现（Local / Submitted / Sqlite）都必须通过同一份契约用例，否则 `test:core` 失败。

## 4. 功能需求

| ID | 需求 |
|---|---|
| FR-001 | 定义 `PROVIDER_PORT_KINDS`（3 个）与冻结的 `PROVIDER_PORT_METHODS`（每端口方法清单） |
| FR-002 | 提供 `validateProviderImplementation(kind, impl)` / `isProviderImplementation(kind, impl)`，可检出缺失方法、非函数成员、未知端口 |
| FR-003 | `createLocalProviders({ rootDir, config })` 返回 `{ projectContext, taskContext, gitSnapshot }`，每个对象带 `kind` 字段 |
| FR-004 | Local 适配器逐方法包装既有函数（project-brain / git-files / change-snapshot），**不新增业务规则** |
| FR-005 | `runProviderContractTests({ kind, makeProvider, label })` 对任意实现跑同一套行为断言（fixture 负责环境准备） |
| FR-006 | 端口定义模块不得 import `node:fs` / `node:child_process`（Cloud 白名单测试复用同一清单） |
| FR-007 | GitSnapshotProvider 支持快照落盘/读回/列举的往返（`createSnapshot` → `writeSnapshot` → `readSnapshot` → `listSnapshots`） |

## 5. 非功能需求

- **零依赖**：只用 Node 内置 + 既有模块。
- **零行为变化**：不修改 `project-brain.mjs` / `git-files.mjs` / `change-snapshot.mjs` / `mcp.mjs`。
- **可测试**：契约测试在临时 git 仓库内可离线运行，不依赖 `origin/main`。
- **可移植**：不得 import `bin/` 之外的相对路径；不得依赖仓库自身状态。

## 6. 验收标准（AC）

| ID | 验收标准 | 验证方式 |
|---|---|---|
| AC-001 | 3 个端口 kind 冻结，方法清单不可变（frozen）且每个端口 ≥2 个方法 | `bin/provider-ports.test.mjs` |
| AC-002 | `validateProviderImplementation` 对合法实现返回 ok；对缺方法、非对象、未知 kind、kind 不符返回失败并给出 missing 列表 | `bin/provider-ports.test.mjs` |
| AC-003 | 三个 Local 适配器全部通过 `validateProviderImplementation` | `bin/local-providers.test.mjs` |
| AC-004 | 契约测试模块不含任何具体实现 import（本机/Submitted/Sqlite） | `bin/local-providers.test.mjs`（静态断言） |
| AC-005 | 每个端口在契约套件内至少 2 个行为用例通过（Local 实现） | `bin/local-providers.test.mjs` |
| AC-006 | 端口定义模块无 `node:fs` / `node:child_process` import | `bin/provider-ports.test.mjs`（静态断言） |

## 7. 架构 / 技术影响

- **架构**：CROSS_MODULE（新增可复用层；不改既有模块；不新增第二引擎 ARCH-R1）。
- **技术栈**：NONE（零新依赖）。
- **风险**：Provider 抽象不彻底 → 由契约测试 + Cloud 模块 import 白名单测试（D08/D10）兜底。

## 8. 测试计划

- 新增单测：`bin/provider-ports.test.mjs`、`bin/local-providers.test.mjs`。
- 回归：`npm run test:core`（当前 375）必须全绿。
- 契约：3 端口 × 用例集，均使用临时目录 + `git init` fixture，离线可复现。

## 9. 范围外

- D06/D07（SQLite + Sqlite Repositories）、D08（提交式上下文/快照实现）、D09-D14。
- 把现有调用点切到 Provider 端口（D12 装配阶段再切，本批不接线）。
