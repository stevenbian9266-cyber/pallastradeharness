# PRD — Batch D D06/D07：Cloud SQLite 存储 + Sqlite Repositories（双适配器契约）

- **状态**：approved（授权：ADR-0002 ACCEPTED + 用户「自主决定」/「继续」）
- **任务**：TASK-20260919102352-4bdf60e2（critical）
- **上游规格**：`pallastradeharness Phase 1 AI 实施指令.md` TASK-D06 / TASK-D07；`docs/rfc/0006-runtime-boundary.md` §5/§6/§7；`docs/adr/ADR-0002-runtime-boundary.md` D2
- **语言/栈**：Node ESM + 内置 `node:sqlite`（**零新依赖**）；影响面 = 新增 Cloud 存储层，**Local 运行时零改动**

## 1. 背景

D02/D03 冻结了 7 个 Runtime Ports 并以 File 适配器包装既有 Local 存储；D04/D05 补齐了 Provider 端口。Cloud Runtime 目前仍缺**存储实现**：RFC-0006 §5 明确 Cloud Adapters = `SqliteProjectRepository …（SQLite）`，§7 将 D06/D07 定义为「SQLite + Sqlite Repositories + 双适配器契约测试」。

指令文档 TASK-D06 要求至少 12 张表（projects / project_artifacts / constitution_versions / tasks / task_checkpoints / task_events / gates / approvals / findings / evidences / decisions / knowledge_assessments），并满足 WAL、`foreign_keys=ON`、`busy_timeout`、短事务、迁移支持；TASK-D07 要求 7 个 Sqlite Repository **通过同一套契约测试**与 File Adapter 对照验证（指令原文：「这是非常重要的」）。

约束（本批不做什么）：**不迁移 Local Harness 到 SQLite**（Local 继续 File/Git/Shell）；Local 与 Cloud 使用**不同 Storage Adapter**，只有端口面相同。

## 2. 目标

- **G1**：Cloud SQLite schema + 迁移 + 事务基建（`bin/sqlite-store.mjs`），可重复、幂等、离线。
- **G2**：7 个 Sqlite Repository（`bin/sqlite-repositories.mjs`）满足 D02 冻结的 `RUNTIME_PORT_METHODS` 方法面。
- **G3**：**同一套** `runRepositoryContractTests` 同时驱动 File（D03，已有）与 Sqlite（本批）适配器；任何一侧行为漂移都会让 `test:core` 失败。
- **G4**：Cloud 模块保持「无本机 IO」——不 import `node:fs` / `node:child_process`（`CLOUD_FORBIDDEN_IMPORTS`）。
- **G5**：可用性降级：`node:sqlite` 需要 Node ≥ 22.5；仓库 engines 仍为 `>=22.0.0`，故必须**懒加载**并在不可用时跳过 Sqlite 测试（Local 路径不受影响）。

## 3. 用户场景

1. **Cloud HTTP 运行时（D10/D12）**：`openHarnessDatabase({ file })` → `createSqliteRepositories({ db, config })` → 治理内核通过端口读写任务/证据/审批/事件，无需知道 SQLite 存在。
2. **本机（不变）**：`createFileRepositories` 继续服务 CLI/MCP；本次改动不触碰任何既有文件读取路径。
3. **回归**：任一适配器行为漂移（例如 `get` 改为抛错、事件顺序反转、`list` 返回非数组）→ 契约用例失败。
4. **迁移**：数据库升级时 `migrateDatabase` 只应用缺失版本，重复调用不重复执行（幂等）。

## 4. 功能需求

| ID | 需求 |
|---|---|
| FR-001 | `SQLITE_TABLES` + `MIGRATIONS`：至少 12 张表（指令 D06 清单）+ 迁移版本表 `schema_migrations` |
| FR-002 | `migrateDatabase(db)`：只应用缺失版本、事务包裹、返回 `{ applied, version }`；重复调用 `applied = 0` |
| FR-003 | `openHarnessDatabaseSync({ file, DatabaseSync })` / `openHarnessDatabase({ file })`：建库即应用 `journal_mode=WAL`、`foreign_keys=ON`、`busy_timeout` |
| FR-004 | `withTransaction(db, fn)`：`BEGIN IMMEDIATE` / `COMMIT` / 异常 `ROLLBACK` 后重抛（短事务） |
| FR-005 | `isSqliteAvailable()`：基于 `process.versions.node` 判定 ≥ 22.5（不抛错） |
| FR-006 | `createSqliteRepositories({ db, config })` 返回与 File 适配器同形的 7 个端口（`kind` 字段一致） |
| FR-007 | 缺失/s 空态归一与 File 适配器一致：`get` 类未知 id → null；`list` 类 → 数组（空库返回空数组）；`loadLatest/statusSnapshot` 空库 → `{ ok: false, code: 'NO_ACTIVE_GATES' }` |
| FR-008 | 写路径：`tasks.save` / `artifacts.upsert` / `approvals.record` / `evidence.record` / `events.append` 落库并返回记录 |
| FR-009 | Cloud 模块不得 import `node:fs` / `node:child_process` |
| FR-010 | Sqlite 测试在 `node:sqlite` 不可用时整体跳过（不是失败），且 Local 全量测试不受影响 |

## 5. 非功能需求

- **零依赖**：仅 `node:sqlite`（内置）。
- **幂等/可重复**：同一 DB 文件重复打开、重复迁移安全；测试使用临时文件 DB（WAL 语义可验证）。
- **可测试**：契约用例与 File 侧逐一对应；额外用 SQL 播种验证非空路径（gate/profile/constitution）。
- **不增耦合**：`sqlite-store.mjs` 不依赖任何领域模块；`sqlite-repositories.mjs` 只依赖 store + `node:crypto`。

## 6. 验收标准（AC）

| ID | 验收标准 | 验证方式 |
|---|---|---|
| AC-001 | 7 个 Sqlite 端口实现全部通过 `validatePortImplementation` | `bin/sqlite-repositories.test.mjs` |
| AC-002 | 契约套件覆盖全部 7 个 `RUNTIME_PORT_KINDS`（无遗漏 kind） | `bin/sqlite-repositories.test.mjs` |
| AC-003 | Sqlite 适配器通过**与 File 相同**的全部契约用例（label='sqlite'） | `bin/sqlite-repositories.test.mjs`（`runRepositoryContractTests`） |
| AC-004 | 契约套件本身不 import 任何具体适配器（File/Sqlite 都不 import） | `bin/repository-contract.mjs`（D03 断言，保持通过） |
| AC-005 | 12 张表全部存在；迁移幂等（第二次 `applied=0`） | `bin/sqlite-store.test.mjs` |
| AC-006 | pragma 生效：文件库 `journal_mode=wal`、`foreign_keys=1`、`busy_timeout` 已配置（构造器 `timeout` 选项，旧运行时回退静态 PRAGMA 5000） | `bin/sqlite-store.test.mjs` |
| AC-007 | `withTransaction` 异常回滚（写入不落库）并重抛原错误 | `bin/sqlite-store.test.mjs` |
| AC-008 | 非空路径：SQL 播种 gate/profile/constitution 后读取结果正确（`ok:true` / 对象 / 版本） | `bin/sqlite-repositories.test.mjs` |
| AC-009 | Cloud 两个模块均不 import `node:fs` / `node:child_process` | `bin/sqlite-repositories.test.mjs`（静态断言） |
| AC-010 | `node:sqlite` 不可用环境下跳过 Sqlite 测试且 `isSqliteAvailable() === false` | `bin/sqlite-store.test.mjs`（条件断言） |

## 7. 架构 / 技术影响

- **架构**：CROSS_MODULE（新增 Cloud 存储层；不改既有模块；不新建第二套 Task/Gate/Evidence 引擎——写路径只做存储，不做业务判定，ARCH-R1/R2）。
- **技术栈**：`node:sqlite`（ADR-0002 D2 已批准；**不引入** `better-sqlite3`）。
- **风险**：`node:sqlite` 处于 experimental（API 可能变动）→ 收敛在 `sqlite-store.mjs` 一处，可替换。

## 8. 测试计划

- 新增 `bin/sqlite-store.test.mjs`（基建：可用性/pragma/表/迁移幂等/事务回滚）。
- 新增 `bin/sqlite-repositories.test.mjs`（契约套件 17 用例 + 4 项 AC）。
- 回归：`npm run test:core`（当前 390）必须全绿；File 侧契约用例保持通过（防双轨漂移）。

## 9. 范围外

- D08/D09（提交式上下文、证据边界）、D10-D14（HTTP 运行时、静态 Key、MCP 兼容、Cloud strict、真客户端）。
- Cloud 侧 gate/profile/constitution **写路径**（本批只读 + 其它实体写路径；见 RFC-0006 §4 `gate_create/gate_clear` 政策待 D10/D12 定稿）。
- `findings` / `decisions` / `knowledge_assessments` / `task_checkpoints` 表仅建表（D09/D12 写入）。
