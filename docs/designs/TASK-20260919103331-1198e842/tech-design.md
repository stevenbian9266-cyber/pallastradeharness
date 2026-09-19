# 技术设计 — TASK-20260919103331-1198e842（Batch D / D08/D09：提交式上下文 Provider + Cloud 证据边界）

上游：指令文档 TASK-D08/D09、`docs/rfc/0006-runtime-boundary.md` §3.2/§5/§6、`docs/adr/ADR-0002-runtime-boundary.md`（ACCEPTED，D1 端口 / D6 提交式上下文）。

---

## Part A — 现状识别（Baseline）

### A1 业务系统盘点

| 域 | 现有承载 | 现状行为 | 本任务处置 |
|---|---|---|---|
| Provider 端口 | `bin/provider-ports.mjs`（D04） | 3 个端口方法面冻结 + `validateProviderImplementation` | **不改**（本批第二实现） |
| Local Provider | `bin/local-providers.mjs`（D05） | 包装 project-brain / git-files / change-snapshot（真实 fs/git） | **不改**（对照基准） |
| Provider 契约套件 | `bin/provider-contract.mjs`（D04） | 12 条行为用例；不依赖具体实现 | **不改**，本批驱动 submitted 实现 |
| Cloud 存储 | `bin/sqlite-store.mjs` · `bin/sqlite-repositories.mjs`（D06/D07） | 12 表 + 7 仓储端口 | **扩展**：迁移 v2 追加 2 表 |
| 证据记录 | `bin/evidence.mjs`（Local，含 git 指纹）· `bin/sqlite-repositories.mjs` evidence 端口 | Local 证据带工作区指纹；Cloud 证据目前**无边界标记** | **新增**：证据边界模块 + 包装器 |
| 提交式上下文 | —— | **不存在**（`bin/` 对 Submission/trust_level/attestation 0 命中） | **新增**：契约 + Provider 实现 |

跨层检索结论（REQ Step 0）：`presets/`、`templates/`、`rules/` 0 命中；`docs/` 仅设计文档 → 净新增。

### A2 数据模型识别

| 实体 | 现有契约 | 本任务处置 |
|---|---|---|
| `ProjectContextSubmission` | —— | 新增（`context_submissions` 表，kind='ProjectContextSubmission'） |
| `TaskContextSubmission` | —— | 新增（同表，kind='TaskContextSubmission'） |
| `GitSnapshotSubmission` | —— | 新增（`git_snapshots` 表：commit/base_commit/changed_files/tree_hash/diff_hash/workspace_hash） |
| `SubmittedSnapshot`（快照读写） | 端口 `createSnapshot/writeSnapshot/readSnapshot/listSnapshots` | 复用 `git_snapshots` 表（与提交同源） |
| `Decision`（Cloud） | 端口 `recordDecision` | 写入既有 `decisions` 表（D06 已建） |
| Evidence 边界标记 | 端口 `record` 输入 | 新增字段 `source` / `trust_level` / `attestation?`（写入 `evidences.data_json`） |

### A3 字段盘点

- **新增字段**（均为 JSON 内字段，不改 D06 既有列）：`source`、`trust_level`、`attestation`（可选）、`diff_hash`、`tree_hash`、`workspace_hash`、`changed_files`、`removed`（净化审计）。
- **被剥离字段**：`content`、`source`、`source_code`、`code`、`patch`、`full_diff`、`diff`、`blob`、`text`（最多 3 层深度）。
- **迁移**：v2 新增 `context_submissions`（id/kind/project_id/task_id/summary/data_json/submitted_at + 索引）与 `git_snapshots`（id/task_id/commit_sha/base_commit/changed_files_json/tree_hash/diff_hash/workspace_hash/summary/data_json/created_at + 索引）。
- 兼容性：旧库（v1）可原位升级到 v2；重复迁移 `applied=0`。

### A4 代码结构

| 文件 | 现有职责 | 本任务改动 |
|---|---|---|
| `bin/sqlite-store.mjs` | D06 迁移 v1 | **扩展**：`MIGRATIONS` 增加 v2、`SQLITE_TABLES` +2、`SQLITE_SCHEMA_VERSION` → 2 |
| `bin/sqlite-store.test.mjs` | D06 断言（长度/版本硬编码 1） | **更新**：改为「包含 D06 核心 12 表 + 长随版本演进」，新增 v2 断言 |
| `bin/submitted-context.mjs` | — | **新增**（契约 + 净化 + 摘要，纯逻辑） |
| `bin/submitted-providers.mjs` | — | **新增**（Cloud Provider 实现 + 提交落库） |
| `bin/evidence-boundary.mjs` | — | **新增**（边界标记 + 校验 + 包装器，纯逻辑） |
| 三个新测试文件 | — | **新增** |
| `README.md` · `CHANGELOG.md` | 文档 | 同步（任务 allow list 内） |

---

## Part B — 复用决策矩阵

| 能力需求 | 决策 | 目标 | 依据（已有位置/签名） |
|---|---|---|---|
| Provider 契约验证 | 调用已有 | runProviderContractTests | bin/provider-contract.mjs（D04，12 用例） |
| 端口实现校验 | 调用已有 | validateProviderImplementation | bin/provider-ports.mjs（D04） |
| Cloud 建库 | 调用已有 | openHarnessDatabaseSync | bin/sqlite-store.mjs（D06） |
| 证据仓储委托 | 调用已有 | createSqliteRepositories | bin/sqlite-repositories.mjs（D07） |
| schema 迁移追加 | 扩展已有 | MIGRATIONS | bin/sqlite-store.mjs（D06 迁移机制，追加 v2） |
| 表清单 | 扩展已有 | SQLITE_TABLES | bin/sqlite-store.mjs（D06 清单，追加 2 表） |
| 提交契约常量 | 新封装公用 | SUBMISSION_KINDS | 新增 bin/submitted-context.mjs |
| git 快照字段契约 | 新封装公用 | GIT_SNAPSHOT_FIELDS | 新增 bin/submitted-context.mjs（对齐指令 D05/D08 字段） |
| 源码剥离审计 | 新封装公用 | stripSourcePayload | 新增 bin/submitted-context.mjs |
| 提交校验 | 新封装公用 | validateSubmission | 新增 bin/submitted-context.mjs |
| 提交摘要 | 新封装公用 | summarizeSubmission | 新增 bin/submitted-context.mjs |
| 项目提交构造 | 新封装公用 | buildProjectContextSubmission | 新增 bin/submitted-context.mjs |
| 任务提交构造 | 新封装公用 | buildTaskContextSubmission | 新增 bin/submitted-context.mjs |
| git 提交构造 | 新封装公用 | buildGitSnapshotSubmission | 新增 bin/submitted-context.mjs |
| 提交落库 | 新封装公用 | recordSubmission | 新增 bin/submitted-providers.mjs |
| Cloud Provider 装配 | 新封装公用 | createSubmittedProviders | 新增 bin/submitted-providers.mjs（对齐 createLocalProviders） |
| 证据边界默认值 | 新封装公用 | EVIDENCE_BOUNDARY_DEFAULTS | 新增 bin/evidence-boundary.mjs |
| 证据来源清单 | 新封装公用 | EVIDENCE_SOURCES | 新增 bin/evidence-boundary.mjs |
| 信任级别清单 | 新封装公用 | TRUST_LEVELS | 新增 bin/evidence-boundary.mjs |
| 边界标记应用 | 新封装公用 | applyEvidenceBoundary | 新增 bin/evidence-boundary.mjs |
| 边界校验 | 新封装公用 | validateEvidenceBoundary | 新增 bin/evidence-boundary.mjs |
| 证据仓储包装 | 新封装公用 | createBoundaryEvidenceRepository | 新增 bin/evidence-boundary.mjs |
| 净化字段清单 | 新封装公用 | SOURCE_PAYLOAD_KEYS | 新增 bin/submitted-context.mjs |
| v2 迁移语句 | 新建局部 | SUBMISSION_MIGRATION_STATEMENTS | 新增 bin/sqlite-store.mjs（仅本模块内部使用） |

> 决策列取值域：调用已有 / 扩展已有 / 新封装公用 / 新建局部。

---

## Part C — 实施设计

### C1 文件清单（按实施顺序）

1. `bin/submitted-context.mjs`（D08 契约层，纯逻辑）。
2. `bin/sqlite-store.mjs` 迁移 v2（`SUBMISSION_MIGRATION_STATEMENTS` + 版本/表清单更新）。
3. `bin/submitted-providers.mjs`（D08 Cloud Provider 实现 + `recordSubmission`）。
4. `bin/evidence-boundary.mjs`（D09）。
5. `bin/submitted-context.test.mjs`、`bin/submitted-providers.test.mjs`、`bin/evidence-boundary.test.mjs`（并更新 `bin/sqlite-store.test.mjs`）。

### C2 关键实现约定

- **净化**：显式键集合 + 递归（深度上限 3，数组逐项）；`removed` 以 `a.b[0].content` 形式记录；净化在前、校验在后（避免源码字段进入校验语义）。
- **摘要**：`summarizeSubmission` 取 `summary` 或由 kind 拼装；截断 ≤240；**不读取**任何源码字段（净化后对象上不存在）。
- **落库**：`recordSubmission({ db, submission })` 按 kind 路由到 `context_submissions` / `git_snapshots`；`INSERT ... ON CONFLICT(id) DO UPDATE`（幂等。
- **Provider 空态**：无提交 → `profile()=null`、`index()={assets:[]}`、`status()={indexed:true,assets:0,stale:[]}`、`changedFiles()={files:[],errors:[]}`（满足 D04 契约断言）。
- **diff 语义**：`diff()` 恒返回 `{ diff: '', errors: [], diff_hash: <提交值或 null> }` —— Cloud **按设计**不持有全量 diff（指令 D08）。
- **证据边界**：`applyEvidenceBoundary` 为纯函数；`source='ci_attested'` 必须有 `attestation` 字符串，否则抛 `TypeError`；`trust_level` 由 source 推导（local_agent/human → cooperative，ci_attested+attestation → verified），显式传入不一致值也抛错。
- **包装器**：`createBoundaryEvidenceRepository(repo)` 保留 `kind`，`record` 打标记后委托，`list`/`bundle` 原样透传（不引入新语义）。
- **无本机 IO**：三个新模块不 import `node:fs` / `node:child_process`（AC-013）。

### C3 风险与回滚

| 风险 | 处置 |
|---|---|
| 提交夹带源码/全量 diff | 强制净化 + `removed` 审计 + 落库后断言表内无源码字段（AC-009） |
| 伪造 CI attestation | 缺少佐证直接抛错；`verified` 仅在有 attestation 时出现（AC-010） |
| Provider 双轨漂移 | Local / Submitted 同一套契约用例双跑（AC-007） |
| schema v2 影响旧库/D07 行为 | 迁移幂等 + D06 核心表断言保留 + 全量回归（AC-012） |
| 边界标记被绕过 | 包装器作为 D10 装配入口；测试覆盖「包装后记录必带标记」（AC-011） |

**回滚**：删除 3 个新模块 + 还原 `sqlite-store.mjs` 迁移段即可（D06/D07 行为不受影响；Cloud 尚未接线）。
