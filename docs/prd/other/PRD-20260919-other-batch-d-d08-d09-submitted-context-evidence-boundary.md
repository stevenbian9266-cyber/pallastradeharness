# PRD — Batch D D08/D09：提交式上下文 Provider + Cloud 证据边界

- **状态**：approved（授权：ADR-0002 ACCEPTED + 用户「继续」）
- **任务**：TASK-20260919103331-1198e842（critical）
- **上游规格**：`pallastradeharness Phase 1 AI 实施指令.md` TASK-D08 / TASK-D09；`docs/rfc/0006-runtime-boundary.md` §3.2/§5/§6/§7；`docs/adr/ADR-0002-runtime-boundary.md`（D1 端口、D6 提交式上下文）
- **语言/栈**：Node ESM + 内置 `node:sqlite`（零新依赖）；影响面 = 新增 Cloud 侧实现，**Local 运行时零改动**

## 1. 背景

D06/D07 已交付 Cloud 存储底座（SQLite 12 表 + 7 仓储端口）；D04/D05 冻结了 3 个 Provider 端口，但 Cloud 侧尚无实现。指令文档要求：

- **TASK-D08**：Cloud **禁止** `readFile(rootDir)` / `git diff(rootDir)` / `run shell(rootDir)`；定义 `ProjectContextSubmission` / `TaskContextSubmission` / `GitSnapshotSubmission`；**只保存必要结构化内容、hash、summary**，默认不保存完整源码与完整 diff。
- **TASK-D09**：Cloud 证据必须标注 `source = local_agent`、`trust_level = cooperative`，**不得伪装成 CI attestation**。

这两块合成一条链路：本地 Agent 执行真实 verifier / workspace snapshot → 提交结构化摘要 + hash → Cloud 侧以提交内容实现 Provider 端口；Cloud 记录证据时强制打边界标记。

跨层检索（详见 REQ Step 0）：`bin/`、`presets/`、`templates/`、`rules/` 对 `Submission` / `trust_level` / `attestation` **0 命中** → 净新增。

## 2. 目标

- **G1**：提交契约 + 净化（`bin/submitted-context.mjs`）：schema 校验、只留 hash/summary、**剥离源码与全量 diff**（可审计 `removed` 列表）。
- **G2**：Cloud Provider 实现（`bin/submitted-providers.mjs`）：`createSubmittedProviders({ db, config })` 实现 D04/D05 冻结的 3 个端口方法面，全部由提交内容驱动。
- **G3**：**契约一致**：同一套 `runProviderContractTests`（D04）驱动 Local（已接入）与 Submitted（本批）实现。
- **G4**：证据边界（`bin/evidence-boundary.mjs`）：默认 `source=local_agent` / `trust_level=cooperative`；声称 `ci_attested` 而无 attestation 佐证 → **拒绝**（不伪装）。
- **G5**：schema 迁移 v2：新增 `context_submissions`、`git_snapshots` 两表（迁移机制复用 D06）。
- **G6**：Cloud 模块继续无本机 IO（不 import `node:fs` / `node:child_process`）。

## 3. 用户场景

1. **本地 Agent 提交**：执行完测试/构建后，把 `buildGitSnapshotSubmission({ commit, base_commit, changed_files, tree_hash, diff_hash, workspace_hash })` 提交到 Cloud；**diff 正文与源码不进入提交**。
2. **Cloud 侧读取**：`gitSnapshot.changedFiles('HEAD')` 返回提交的变更清单；`diff('HEAD')` 只返回 **空 diff + diff_hash**（Cloud 不持有全量 diff，属设计约束而非缺陷）。
3. **Cloud 证据**：`record_evidence` 写入的记录带 `source=local_agent` / `trust_level=cooperative`；若某次调用声称 `ci_attested` 但没带 attestation → 抛错，避免伪造 CI 证明。
4. **回归**：Provider 契约用例双跑（local / submitted），任一侧漂移即红。

## 4. 功能需求

| ID | 需求 |
|---|---|
| FR-001 | `SUBMISSION_KINDS`（3）与 `GIT_SNAPSHOT_FIELDS`（`commit`/`base_commit`/`changed_files`/`tree_hash`/`diff_hash`/`workspace_hash`）冻结 |
| FR-002 | `stripSourcePayload(value)`：递归剥离源码/全量 diff 字段（`content`/`source`/`source_code`/`code`/`patch`/`full_diff`/`diff`/`blob`/`text`），返回 `{ value, removed }`（removed = 被剥离的路径列表） |
| FR-003 | `validateSubmission(kind, submission)`：必需字段校验（project: `id`+`summary`；task: `task_id`+`summary`；git: `commit`+`base_commit`+`changed_files`+三个 hash） |
| FR-004 | `build*Submission(input)`：净化 → 校验（失败抛 `TypeError`）→ 生成带 `kind`/`summary`/`submitted_at` 的冻结提交对象 |
| FR-005 | `summarizeSubmission(kind, submission)`：生成 ≤240 字符摘要，**不含源码/完整 diff** |
| FR-006 | `createSubmittedProviders({ db, config })` 返回 `{ projectContext, taskContext, gitSnapshot }`（带 `kind`），通过 `validateProviderImplementation` |
| FR-007 | `recordSubmission({ db, submission })`：按 id upsert 到 `context_submissions` / `git_snapshots`；同一 id 重复提交覆盖（幂等） |
| FR-008 | `gitSnapshot.diff()` 只返回 `{ diff: '', errors: [], diff_hash }`（Cloud 不存全量 diff）；`showAtRef` 返回 `{ content: null, error }` |
| FR-009 | `applyEvidenceBoundary(input)`：默认 `source=local_agent`/`trust_level=cooperative`；`ci_attested` 无 `attestation` → 抛 `TypeError`；带 attestation → `trust_level=verified` |
| FR-010 | `validateEvidenceBoundary(record)`：检查 `source`/`trust_level` 合法性与缺失 |
| FR-011 | `createBoundaryEvidenceRepository(repo)`：包装 EvidenceRepository，`record` 自动打边界；`list`/`bundle` 透传 |
| FR-012 | schema 迁移 v2：`context_submissions` + `git_snapshots` + 索引；`SQLITE_SCHEMA_VERSION` 递增，旧库可升级（迁移幂等） |

## 5. 非功能需求

- **零依赖**：只用 Node 内置 + 既有模块。
- **零本机 IO**：Cloud 三模块（submitted-context / submitted-providers / evidence-boundary）不 import `node:fs` / `node:child_process`。
- **可测试**：提交契约纯函数；Provider 契约用例复用 D04 套件；证据边界纯函数 + 薄包装。
- **不破坏既有**：D06 的 12 表与 D07 的 7 仓储行为不变；`test:core` 全量绿。

## 6. 验收标准（AC）

| ID | 验收标准 | 验证方式 |
|---|---|---|
| AC-001 | `SUBMISSION_KINDS`（3）与 `GIT_SNAPSHOT_FIELDS`（6）冻结且内容正确 | `bin/submitted-context.test.mjs` |
| AC-002 | `stripSourcePayload` 剥离顶层与嵌套源码/全量 diff，并准确报告 `removed` 路径 | `bin/submitted-context.test.mjs` |
| AC-003 | `validateSubmission` 对三类提交的缺失字段给出 `missing`；合法提交 ok | `bin/submitted-context.test.mjs` |
| AC-004 | `build*Submission` 非法输入抛 `TypeError`；合法输入产物含 `kind`/`summary`/`submitted_at` 且无源码字段 | `bin/submitted-context.test.mjs` |
| AC-005 | 摘要 ≤240 字符且不含提交中的源码/完整 diff 文本 | `bin/submitted-context.test.mjs` |
| AC-006 | 3 个 Submitted Provider 全部通过 `validateProviderImplementation` | `bin/submitted-providers.test.mjs` |
| AC-007 | Submitted Provider 通过与 Local **相同**的 `runProviderContractTests`（label='submitted'） | `bin/submitted-providers.test.mjs` |
| AC-008 | 提交→读取链路：项目/任务/git 提交后 `profile/status/search/contextPack/changedFiles` 反映提交内容 | `bin/submitted-providers.test.mjs` |
| AC-009 | Cloud 不保存完整 diff/源码：`diff().diff === ''` 且携带 `diff_hash`；提交表内无源码字段 | `bin/submitted-providers.test.mjs` |
| AC-010 | 证据边界默认值与伪造防护（`ci_attested` 无 attestation → 抛错） | `bin/evidence-boundary.test.mjs` |
| AC-011 | 包装后的 EvidenceRepository 记录带边界标记，`list`/`bundle` 行为不变 | `bin/evidence-boundary.test.mjs` |
| AC-012 | 迁移 v2：新表存在、旧库可原位升级、重复迁移 `applied=0` | `bin/sqlite-store.test.mjs`（更新）+ `bin/submitted-providers.test.mjs` |
| AC-013 | Cloud 三模块不 import `node:fs` / `node:child_process` | `bin/submitted-providers.test.mjs`（静态断言） |

## 7. 架构 / 技术影响

- **架构**：CROSS_MODULE（Cloud 侧新增 3 模块 + schema v2；既有模块零改动；不新增第二引擎）。
- **技术栈**：NONE（复用 `node:sqlite`）。
- **风险**：提交内容被误当完整上下文 → 以「hash + summary + 净化审计」显式约束；Provider 契约双跑防漂移。

## 8. 测试计划

- 新增 `bin/submitted-context.test.mjs`、`bin/submitted-providers.test.mjs`、`bin/evidence-boundary.test.mjs`。
- 更新 `bin/sqlite-store.test.mjs`（`SQLITE_TABLES` 长度与 schema 版本断言改为随版本演进，仍校验 D06 核心 12 表）。
- 回归：`npm run test:core`（当前 417）必须全绿；D04/D05/D06/D07 契约用例保持通过。

## 9. 范围外

- D10/D11（HTTP 运行时 + 静态 Key：提交入口与鉴权接线）、D12（MCP 兼容）、D13（Cloud strict）、D14（真客户端）。
- 提交内容的**传输**（HTTP 报文形状）与签名/CI attestation 校验链（RFC-0006 风险表 6：后续可加签名；本批只做「不伪装」）。
- Local 侧采集器（从本机 fs/git 生成提交数据）——Local 已有真实能力，采集属 D10 装配。
