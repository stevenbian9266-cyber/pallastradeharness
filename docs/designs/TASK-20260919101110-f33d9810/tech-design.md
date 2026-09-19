# 技术设计 — TASK-20260919101110-f33d9810（Batch D / D04/D05：Context 与 GitSnapshot Provider 抽象）

上游：`docs/rfc/0006-runtime-boundary.md` §3.2/§5/§7、`docs/adr/ADR-0002-runtime-boundary.md`（ACCEPTED，D1 端口 + 适配器渐进抽取、D6 提交式上下文）。

---

## Part A — 现状识别（Baseline）

### A1 业务系统盘点

| 域 | 现有承载 | 现状行为 | 本任务处置 |
|---|---|---|---|
| 项目画像/知识索引 | `bin/project-brain.mjs`：`buildProjectProfile` / `indexKnowledge` / `searchKnowledge` / `brainStatus` | 直接读写 `.harness-state/brain/*`，消费方为 `mcp.mjs`、`command-registry.mjs` | 包装为 `ProjectContextProvider`（调用已有，零改动） |
| 任务上下文包 | `bin/project-brain.mjs`：`buildContextPack` / `recordDecision` | 同上 | 包装为 `TaskContextProvider`（调用已有） |
| Git 重活 | `bin/git-files.mjs`：`getChangedFiles` / `getDiff` / `showFileAtRef` | 直接 `git` 子进程；59 处调用、13 个模块 | 包装为 `GitSnapshotProvider`（调用已有） |
| 变更快照 | `bin/change-snapshot.mjs`：`createSnapshot` / `writeSnapshot` / `readSnapshot` / `listSnapshots` | 快照 JSON 落盘 `.harness-state/snapshots` | 同上（包装） |

跨层检索结论（详见 REQ Step 0）：`presets/`、`templates/`、`rules/` 三个层 **0 命中**；`docs/` 仅 RFC-0006 的设计描述；`bin/` 内不存在任何 provider/端口抽象（0 命中）→ **净新增**，无重复实现。

### A2 数据模型识别

| 实体 | 现有契约 | 字段要点 |
|---|---|---|
| `ProjectProfile` | `project-brain.buildProjectProfile` | `id/name/repository/worktreeId/generatedAt/stacks/layers/commands` |
| `ContextPack` | `project-brain.buildContextPack` | `id` + `assets[]`（`{id,path,sha256,kind,reason}`） |
| `Decision` | `project-brain.recordDecision` | `id/taskId/title/decision/reason/createdAt` |
| `ChangeSnapshot` | `change-snapshot.createSnapshot` | `schemaVersion/id/taskId/branch/baseHead/allow/manifest/hash` |

**本任务不新增实体、不改契约**（适配器透传原对象）。

### A3 字段盘点

- 本任务无数据模型变更 → 无字段新增/删除/迁移。
- 端口**方法名**是唯一需要冻结的「字段」：见 Part B 决策列与 interaction.md §1。
- 缺失归一策略：`search`/`status` 未索引返回既有空态对象（不改成 null）；`readSnapshot` 不存在仍抛错（不静默）。

### A4 代码结构

| 文件 | 现有职责 | 本任务改动 |
|---|---|---|
| `bin/project-brain.mjs` | 上下文/索引/决策真实实现 | **不改** |
| `bin/git-files.mjs` | git 查询 | **不改** |
| `bin/change-snapshot.mjs` | 快照生成/落盘（criticalPaths） | **不改** |
| `bin/mcp.mjs` / `bin/command-registry.mjs` | 上下文消费方 | **不改** |
| `bin/runtime-ports.mjs` | D02/D03 存储端口定义（复用其 `CLOUD_FORBIDDEN_IMPORTS` 校验思想） | **不改** |
| `bin/provider-ports.mjs` | — | **新增**（端口定义，纯逻辑） |
| `bin/local-providers.mjs` | — | **新增**（本机适配器） |
| `bin/provider-contract.mjs` | — | **新增**（契约测试套件） |
| `bin/provider-ports.test.mjs` / `bin/local-providers.test.mjs` | — | **新增**（单测 + 契约驱动） |

---

## Part B — 复用决策矩阵

| 能力需求 | 决策 | 目标 | 依据（已有位置/签名） |
|---|---|---|---|
| 项目画像 | 调用已有 | buildProjectProfile | bin/project-brain.mjs |
| 知识索引重建 | 调用已有 | indexKnowledge | bin/project-brain.mjs |
| 知识检索 | 调用已有 | searchKnowledge | bin/project-brain.mjs |
| 索引状态 | 调用已有 | brainStatus | bin/project-brain.mjs |
| 任务上下文包 | 调用已有 | buildContextPack | bin/project-brain.mjs |
| 决策落盘 | 调用已有 | recordDecision | bin/project-brain.mjs |
| 变更文件清单 | 调用已有 | getChangedFiles | bin/git-files.mjs |
| 统一 diff | 调用已有 | getDiff | bin/git-files.mjs |
| 指定版本文件读取 | 调用已有 | showFileAtRef | bin/git-files.mjs |
| 快照对象生成 | 调用已有 | createSnapshot | bin/change-snapshot.mjs |
| 快照落盘 | 调用已有 | writeSnapshot | bin/change-snapshot.mjs |
| 快照读回 | 调用已有 | readSnapshot | bin/change-snapshot.mjs |
| 快照列举 | 调用已有 | listSnapshots | bin/change-snapshot.mjs |
| 端口 kind 清单 | 新封装公用 | PROVIDER_PORT_KINDS | 新增 bin/provider-ports.mjs（对齐 RUNTIME_PORT_KINDS；被实现/测试多文件引用） |
| 端口方法面 | 新封装公用 | PROVIDER_PORT_METHODS | 新增 bin/provider-ports.mjs（对齐 RUNTIME_PORT_METHODS；被实现/测试多文件引用） |
| 本机 Provider 装配 | 新封装公用 | createLocalProviders | 新增 bin/local-providers.mjs（对齐 createFileRepositories） |
| Provider 契约测试 | 新封装公用 | runProviderContractTests | 新增 bin/provider-contract.mjs（对齐 runRepositoryContractTests） |

> 决策列取值域：调用已有 / 扩展已有 / 新封装公用 / 新建局部。本批**无「扩展已有」**行（既有模块零改动）。
> 校验器 `validateProviderImplementation` / `isProviderImplementation` 与 `validatePortImplementation` / `isPortImplementation` **同款语法**（同一套校验器形态）；为避免重复代码，实现层将提炼共用校验器（见 C2），故不在本矩阵单列「新建局部」。

---

## Part C — 实施设计

### C1 文件清单（按实施顺序）

1. `bin/provider-ports.mjs`（纯逻辑，无 IO）：`PROVIDER_PORT_KINDS`、`PROVIDER_PORT_METHODS`、`validateProviderImplementation`、`isProviderImplementation`。
2. `bin/local-providers.mjs`（装配 + 包装）：`createLocalProviders({ rootDir, config })` → `{ projectContext, taskContext, gitSnapshot }`。
3. `bin/provider-contract.mjs`（测试套件）：`runProviderContractTests({ kind, makeProvider, label })`。
4. `bin/provider-ports.test.mjs`、`bin/local-providers.test.mjs`。

### C2 关键实现约定

- **方法面**：与 interaction.md §1 表格逐条一致；`Object.freeze` 嵌套冻结。
- **共用校验器**（避免 STD-CQ-002 重复块）：`bin/provider-ports.mjs` 的 `validateProviderImplementation` 复用 `bin/runtime-ports.mjs` 提炼的通用方法面校验器（同款错误文案，noun 区分 port/provider），而不是把 D02 的 6 行校验再写一遍。
- **参数风格**：工厂绑定 `rootDir/config`；方法只收业务参数（`base`、`task`、`query`…），Cloud 实现无需知道本地路径概念。
- **返回值透传**：适配器不做字段映射（D08 实现同一形状即可）。
- **异常**：适配器不 try/catch（不吞异常）。
- **fixture 契约**（契约套件）：`makeProvider()` 返回 `{ provider, seedFile?(relPath, content) }`；Git 端口要求 fixture 提供可用 `git` 仓库（`git init` + 初始 commit），`seedFile` 写入并提交。
- **契约用例**（每 kind ≥2）：
  - `ProjectContextProvider`：`profile()` 返回带字符串 `id` 的对象；`status()` 返回带布尔 `indexed` 的对象；`search()` 返回含 `results` 数组的对象；`index()` 返回含 `assets` 数组的对象。
  - `TaskContextProvider`：`contextPack(task)` 返回含 `assets` 数组的对象；`recordDecision({...})` 返回带字符串 `id` 的对象。
  - `GitSnapshotProvider`：`changedFiles('HEAD')` 信封含 `files` 数组；`diff('HEAD')` 信封含字符串 `diff`；`seedFile` 后 `showAtRef('HEAD', 文件).content` 含内容；`createSnapshot` → `writeSnapshot` → `readSnapshot` 同 id → `listSnapshots` 含该 id。

### C3 风险与回滚

| 风险 | 处置 |
|---|---|
| 契约用例对 git 环境敏感（CI/Windows 差异） | 只用临时仓库 + `HEAD` 相对断言；不依赖 `origin/main`、不依赖网络 |
| 适配器行为漂移（误加/误改字段） | 契约测试断言形状；D08 复用同一套件 |
| 端口面冻结过早导致 D08 需要扩方法 | 方法面取最小可用集；扩展需走 Decision（brain decision）留痕 |
| Cloud 模块误 import 本机实现 | D10 白名单测试复用本仓 `CLOUD_FORBIDDEN_IMPORTS` 思想（D02/D03 已建） |

**回滚**：删除新增 5 个文件即可（既有模块零改动，无迁移、无数据变更；`git revert` 单提交）。
