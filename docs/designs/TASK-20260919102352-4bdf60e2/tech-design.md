# 技术设计 — TASK-20260919102352-4bdf60e2（Batch D / D06/D07：Cloud SQLite 存储 + Sqlite Repositories）

上游：指令文档 TASK-D06/D07、`docs/rfc/0006-runtime-boundary.md` §5/§6/§7、`docs/adr/ADR-0002-runtime-boundary.md`（ACCEPTED，D2 = Node 内置 `node:sqlite`，不引原生依赖）。

---

## Part A — 现状识别（Baseline）

### A1 业务系统盘点

| 域 | 现有承载 | 现状行为 | 本任务处置 |
|---|---|---|---|
| 端口定义 | `bin/runtime-ports.mjs`（D02） | 7 个 Repository 端口 + 方法面冻结 + `validatePortImplementation` | **不改**（Sqlite 实现同一方法面） |
| 契约套件 | `bin/repository-contract.mjs`（D03） | 17 个行为用例；不依赖任何具体适配器 | **不改**，本批第二实现（sqlite）复用 |
| Local 存储实现 | `bin/file-repositories.mjs`（D03） | 包装 state-store / gate-commands / evidence / approvals / project-artifacts / constitution / governance | **不改**（行为基准） |
| Provider 端口 | `bin/provider-ports.mjs` · `bin/local-providers.mjs`（D04/D05） | 上下文/快照提供者 | **不改**（Cloud 侧 D08 另实现） |
| Cloud 存储 | —— | **不存在**（`bin/` 内 `sqlite` 仅 12 处注释/测试引用） | **新增**：`bin/sqlite-store.mjs` + `bin/sqlite-repositories.mjs` |

跨层检索结论（详见 REQ Step 0）：`presets/`、`templates/`、`rules/` 0 命中；`docs/` 只有设计（RFC-0006 / ADR-0002 / 指令文档）→ 净新增，无重复实现。

### A2 数据模型识别

| 实体 | 现有契约（File 侧） | Sqlite 承载表 |
|---|---|---|
| Profile | `governance.readProfile` → 对象或 null | `projects` |
| Artifact | `project-artifacts.listArtifacts/getArtifact/upsertArtifact` | `project_artifacts` |
| Constitution 版本 | `constitution.getCurrentConstitutionVersion` | `constitution_versions` |
| Task | `state-store.loadTask/saveTask/listTasks` | `tasks` |
| Gate | `gate-commands.loadLatestGate/gateStatusSnapshot` | `gates` |
| Approval | `approvals.listApprovals/recordApproval/approvalStatuses` | `approvals` |
| Evidence | `evidence.listEvidence/recordEvidence/buildEvidenceBundle` | `evidences` |
| Event | 本地 JSONL（`<state>/events/<taskId>.ndjson`） | `task_events` |
| 预留（D09/D12） | —— | `findings` · `decisions` · `knowledge_assessments` · `task_checkpoints` |

**统一存储形态**：业务字段以 `data_json`（JSON 文本）整存，另抽少量**查询/约束列**（`id` / `task_id` / `status` / `type` / `created_at` / `seq`）。理由：与 File 适配器「整对象读写」语义一致，避免为治理对象做关系规范化带来的语义漂移。

### A3 字段盘点

- 无既有数据迁移（Cloud 从空库开始；**不迁移 Local 状态**——指令 D06 明确要求）。
- 约束列：
  - `tasks(id PK, status TEXT NULL, data_json TEXT NOT NULL, updated_at TEXT NOT NULL)`
  - `task_events(seq INTEGER PK AUTOINCREMENT, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, type TEXT NOT NULL, payload_json TEXT NOT NULL, at TEXT NOT NULL)`
  - `approvals(id TEXT PK, task_id TEXT NULL, type TEXT NOT NULL, summary TEXT, status TEXT, artifact_hash TEXT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL)`
  - `evidences(id TEXT PK, task_id TEXT NULL, evidence_type TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL)`
  - `project_artifacts(id TEXT PK, type TEXT, path TEXT, data_json TEXT NOT NULL, updated_at TEXT NOT NULL)`
  - `projects(id TEXT PK, name TEXT, data_json TEXT NOT NULL, updated_at TEXT NOT NULL)`
  - `constitution_versions(version TEXT PK, data_json TEXT NOT NULL, created_at TEXT NOT NULL)`
  - `gates(id TEXT PK, task_id TEXT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL)`
  - `findings` / `decisions` / `knowledge_assessments` / `task_checkpoints`：`id` + `task_id` + `data_json` + `created_at`（预留）
  - `schema_migrations(version INTEGER PK, name TEXT NOT NULL, applied_at TEXT NOT NULL)`

### A4 代码结构

| 文件 | 现有职责 | 本任务改动 |
|---|---|---|
| `bin/runtime-ports.mjs` · `bin/repository-contract.mjs` · `bin/file-repositories.mjs` | 端口/契约/Local 适配器 | **不改** |
| `bin/sqlite-store.mjs` | — | **新增**（schema/迁移/pragma/事务/打开） |
| `bin/sqlite-repositories.mjs` | — | **新增**（7 端口实现） |
| `bin/sqlite-store.test.mjs` · `bin/sqlite-repositories.test.mjs` | — | **新增**（基建测试 + 契约驱动） |
| `README.md` · `CHANGELOG.md` | 文档 | 同步 Cloud 存储小节（任务 allow list 内） |

---

## Part B — 复用决策矩阵

| 能力需求 | 决策 | 目标 | 依据（已有位置/签名） |
|---|---|---|---|
| Repository 契约验证 | 调用已有 | runRepositoryContractTests | bin/repository-contract.mjs（D03，17 用例） |
| 端口类别清单 | 调用已有 | RUNTIME_PORT_KINDS | bin/runtime-ports.mjs（7 类，覆盖断言用） |
| 测试夹具造 Task | 调用已有 | createContract | bin/contracts.mjs（Task 契约构造） |
| Cloud 存储装配 | 新封装公用 | createSqliteRepositories | 新增 bin/sqlite-repositories.mjs（对齐 createFileRepositories） |
| 建库（异步） | 新封装公用 | openHarnessDatabase | 新增 bin/sqlite-store.mjs（懒加载 node:sqlite） |
| 建库（同步注入） | 新封装公用 | openHarnessDatabaseSync | 新增 bin/sqlite-store.mjs（测试/嵌入） |
| 可用性判定 | 新封装公用 | isSqliteAvailable | 新增 bin/sqlite-store.mjs（engines >=22.0.0 下必须降级） |
| 迁移执行 | 新封装公用 | migrateDatabase | 新增 bin/sqlite-store.mjs（幂等） |
| 短事务 | 新封装公用 | withTransaction | 新增 bin/sqlite-store.mjs（BEGIN IMMEDIATE/ROLLBACK） |
| 表清单 | 新封装公用 | SQLITE_TABLES | 新增 bin/sqlite-store.mjs（指令 D06 清单，测试/文档共用） |
| schema 版本 | 新封装公用 | SQLITE_SCHEMA_VERSION | 新增 bin/sqlite-store.mjs |
| 迁移脚本表 | 新建局部 | MIGRATIONS | 新增 bin/sqlite-store.mjs（仅本模块内部使用） |

> 决策列取值域：调用已有 / 扩展已有 / 新封装公用 / 新建局部。「新封装公用」= 被导出且被 ≥2 文件引用；「新建局部」= 仅 1 文件出现。

---

## Part C — 实施设计

### C1 文件清单（按实施顺序）

1. `bin/sqlite-store.mjs`（D06）：`SQLITE_SCHEMA_VERSION`、`SQLITE_TABLES`、`MIGRATIONS`、`isSqliteAvailable`、`migrateDatabase`、`withTransaction`、`openHarnessDatabaseSync`、`openHarnessDatabase`。
2. `bin/sqlite-repositories.mjs`（D07）：`createSqliteRepositories({ db, config })` → `{ project, artifacts, tasks, gates, approvals, evidence, events }`（含 `kind`）。
3. `bin/sqlite-store.test.mjs`、`bin/sqlite-repositories.test.mjs`。

### C2 关键实现约定

- **兼容下限**：`node:sqlite` 需 Node ≥ 22.5；`openHarnessDatabase` 用动态 `import('node:sqlite')`（懒加载），缺失时抛含版本要求的 `Error`；测试在不可用时整体 skip（AC-010），**不影响 Local 路径**。
- **pragma**：打开即 `journal_mode=WAL`（文件库）/ `foreign_keys=ON` / `busy_timeout`（构造器 `timeout` 选项；旧运行时回退静态字面量 PRAGMA，**不做 SQL 拼接**——避免 STD-SEC-002 注入面）。
- **迁移**：`schema_migrations` 记录版本；每个版本一个事务；重复调用 `applied=0`（幂等）。
- **参数绑定**：`node:sqlite` 不接受 `undefined` 绑定值 → 统一 `?? null`（避免 `ERR_INVALID_ARG_TYPE`）。
- **读取顺序**：任务/制品按 `id`，事件按 `seq`，审批/证据按 `created_at` —— 保证与 File 侧可预期的稳定顺序（契约用例依赖事件顺序）。
- **id 生成**：审批/证据记录用 `node:crypto` 的 `randomUUID()`（Cloud 无文件时间戳语义，且避免同毫秒冲突）。
- **无本机 IO**：两个新模块均不 import `node:fs` / `node:child_process`（AC-009）。
- **写路径不做业务判定**：`save` / `upsert` / `record` / `append` 只落库与返回记录；Task/Gate/Evidence 的治理规则仍在 Core（ARCH-R1/R2）。
- **gate 写路径**：本批不提供（RFC-0006 §4 明确 `gate_create/gate_clear` 政策待 D10/D12）；`loadLatest/statusSnapshot` 的空态与非空态（SQL 播种）均被测。

### C3 风险与回滚

| 风险 | 处置 |
|---|---|
| `node:sqlite` experimental / 版本差异 | 依赖收敛在 `sqlite-store.mjs` 单点；测试 skip 兜底；不引原生依赖 |
| 双轨漂移（File vs Sqlite） | 同一套 17 用例双跑（label=file / label=sqlite），任一漂移立即红 |
| 契约套件被迫感知实现 | 套件不 import 具体适配器（D03 断言继续有效）；fixture 负责环境 |
| 误把 Cloud 做成第二引擎 | 适配器无状态机、无判定；只做读写与归一 |
| 空库/未知 id 语义不一致 | 契约用例覆盖 `get`→null、`list`→数组、事件顺序；另加 SQL 播种非空用例 |

**回滚**：删除新增 4 个文件即可（既有模块零改动、无数据迁移、Cloud 尚未接线）。
