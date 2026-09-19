# REQ — Batch D D06/D07：Cloud SQLite 存储 + Sqlite Repositories

- **任务**：TASK-20260919102352-4bdf60e2（critical / feature）
- **PRD**：`docs/prd/other/PRD-20260919-other-batch-d-d06-d07-cloud-sqlite-repositories.md`
- **上游**：指令文档 TASK-D06/D07、`docs/rfc/0006-runtime-boundary.md`、`docs/adr/ADR-0002-runtime-boundary.md`（ACCEPTED / D2）

## Step 0 — 跨层检索（AGENTS.md §3）

| 层 | 检索词 | 命中 | 结论 |
|---|---|---|---|
| `bin/` | `sqlite`（12 处） | 全部为注释/测试引用（`file-repositories.test.mjs` 反依赖断言、`provider-contract.mjs` 注释、`constitution-compliance.test.mjs` 反例、`wizard.test.mjs` 文案） | **无任何既有 SQLite 实现** → 净新增 |
| `bin/` | `createSqliteRepositories` / `openHarnessDatabase` | 0 | 净新增 |
| `presets/` | `sqlite` | 0 | 无 |
| `templates/` | `sqlite` | 0 | 无 |
| `rules/` | `sqlite` | 0 | 无 |
| `docs/` | `sqlite` / `SQLite` | RFC-0006（端口与 D06/D07 序号）、ADR-0002（D2 决策）、指令文档 TASK-D06/D07、Batch A 依赖审计文档（`node:sqlite` 可用性结论） | 设计已批准，无既有实现 |

**重复实现检查（AP-SEARCH-1/2/3）**：不存在第二套存储引擎；本批不复制 Local 存储语义到 Cloud——只实现端口方法面（ARCH-R1）。

## Step 1 — Skill 咨询

| Skill | 关键结论 | 落地 |
|---|---|---|
| `harness-standards-audit` | 单文件决策点 ≤12；异常路径必须显式（不得吞错）；跨文件重复块会被 STD-CQ-002 抓 | `withTransaction` 显式 ROLLBACK + 重抛；`migrateDatabase` 单层循环；校验器已在 D04/D05 提炼共用，本批不重复实现 |
| `harness-docs` | 引擎变更必须同步 README / CHANGELOG | 本任务 allow list 含 README/CHANGELOG；收尾跑 `docs:check` + `readme:sync --check` + `doc-impact` |
| `harness-skill-author`（约定） | 多实现共享同一测试套件时，fixture 负责环境、套件只断言 | `sqlite-repositories.test.mjs` 复用 D03 `runRepositoryContractTests`，不新增断言分支 |

（本仓无 `<project>-customization` Skill；无 storage/runtime 领域 Skill。）

## Step 2 — 复用决策摘要

- **调用已有**：`runRepositoryContractTests`（D03 契约套件）、`RUNTIME_PORT_KINDS`（端口类别）、`createContract`（测试 fixture 造 Task）。
- **扩展已有**：无（既有模块零改动）。
- **新封装公用**：`createSqliteRepositories`（Cloud 存储装配）、`openHarnessDatabase(Sync)`、`isSqliteAvailable`、`migrateDatabase`、`withTransaction`、`SQLITE_TABLES`、`SQLITE_SCHEMA_VERSION`。
- **新建局部**：`MIGRATIONS`（仅 `sqlite-store.mjs` 内部引用）。

## Step 3 — 需求与验收

FR-001~FR-010、AC-001~AC-010 见 PRD §4/§6（不在本 REQ 重复维护）。

## Step 4 — 风险与缓解

| 风险 | 缓解 |
|---|---|
| `node:sqlite` 在 Node 22.0-22.4 不存在（engines `>=22.0.0`） | 懒加载 + `isSqliteAvailable()` + 测试整体跳过（AC-010）；Local 路径零影响 |
| experimental API 变动（Node 后续版本） | SQLite 依赖收敛在 `sqlite-store.mjs` 单点；适配器只依赖 `db.exec/prepare` 最小面 |
| 双轨漂移（File 与 Sqlite 行为不一致） | 同一套契约用例双跑（AC-003/AC-004），任一侧漂移即红 |
| 误把 Cloud 变成第二套业务引擎 | 适配器只做存储/读取，无 Task/Gate/Evidence 判定（ARCH-R1/R2）；写路径不做状态机 |
| Cloud 模块误用本机 IO | AC-009 静态断言（复用 `CLOUD_FORBIDDEN_IMPORTS` 清单语义） |

## Step 5 — 验证计划

1. `node --test bin/sqlite-store.test.mjs bin/sqlite-repositories.test.mjs`
2. `npm run test:core`（390 基线 + 新增；File 契约用例必须继续通过）
3. `docs:check` / `readme:sync --check` / `doc-impact --base origin/main`
4. `reuse-adherence` 验证器 + `supervise diff`（既定 package-lock 例外 + STD-API-001 误报）
