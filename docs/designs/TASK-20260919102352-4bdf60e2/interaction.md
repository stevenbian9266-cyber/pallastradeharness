# 交互规格 — TASK-20260919102352-4bdf60e2（D06/D07 Cloud SQLite）

本任务无界面交互；这里的「交互」= **Cloud 存储的打开/迁移/读写契约**。契约一经冻结，D08/D10/D12 的 Cloud 装配必须按此处调用。

## 1. 打开与迁移（D06）

```js
import { openHarnessDatabase, isSqliteAvailable } from './sqlite-store.mjs';

if (isSqliteAvailable()) {
  const db = await openHarnessDatabase({ file: '/var/lib/harness/harness.sqlite' });
  // 打开即完成：pragma 设置 + 迁移到 SQLITE_SCHEMA_VERSION
}
```

| 调用 | 语义 | 不可用/异常 |
|---|---|---|
| `isSqliteAvailable()` | 同步布尔（`process.versions.node` ≥ 22.5） | 不抛错 |
| `openHarnessDatabase({ file, busyTimeoutMs })` | 动态 import `node:sqlite` → 打开 → pragma → 迁移 | `node:sqlite` 缺失 → 抛 `Error`（文案含所需 Node 版本） |
| `openHarnessDatabaseSync({ file, DatabaseSync, busyTimeoutMs })` | 同上但注入构造器（测试/嵌入用） | 构造器缺失 → `TypeError` |
| `migrateDatabase(db)` | 应用缺失版本，返回 `{ applied, version }` | SQL 失败 → 回滚并重抛 |
| `withTransaction(db, fn)` | `BEGIN IMMEDIATE` → `fn()` → `COMMIT` | `fn` 抛错 → `ROLLBACK` 后重抛原错误 |

**pragma 契约**：文件库 `journal_mode = wal`；`foreign_keys = 1`；`busy_timeout` 经**构造器 `timeout` 选项**设置（旧运行时回退静态 `PRAGMA busy_timeout = 5000`）——SQL 一律静态字面量，不做字符串拼接。

## 2. 表与语义映射（D06 → D07）

| 表 | 承载端口方法 | 说明 |
|---|---|---|
| `projects` | `ProjectRepository.getProfile` | 无行 → null（Cloud bootstrap 写入，属 D10） |
| `project_artifacts` | `ProjectRepository.listArtifacts` · `ArtifactRepository.list/get/upsert` | 制品清单（与 File 侧 `project-artifacts` 同义） |
| `constitution_versions` | `ProjectRepository.getConstitutionVersion` | 无行 → null |
| `tasks` | `TaskRepository.list/get/save` | `data_json` 存完整 Task；`save` = upsert |
| `task_checkpoints` | （保留，D12 写） | 提交式上下文/检查点 |
| `task_events` | `EventRepository.append/list` | 顺序 = 自增 `seq`；读取返回 `{ at, ...event }` |
| `gates` | `GateRepository.loadLatest/statusSnapshot` | 无行 → `{ ok: false, code: 'NO_ACTIVE_GATES' }` |
| `approvals` | `ApprovalRepository.list/record/statuses` | 记录含 `id/taskId/type/summary/status` |
| `evidences` | `EvidenceRepository.list/record/bundle` | `list(taskId)` 按任务过滤 |
| `findings` · `decisions` · `knowledge_assessments` | （保留，D09/D12 写） | 仅建表 |

## 3. 端口方法交互（与 File 适配器逐条对齐）

| 方法 | 输入 | 输出 | 空态 |
|---|---|---|---|
| `tasks.list()` | — | Task[] | `[]` |
| `tasks.get(id)` | taskId | Task \| null | `null` |
| `tasks.save(task)` | Task | 同一 Task | — |
| `gates.loadLatest()` | — | `{ok:false, code}` \| `{ok:true, gateId, gateState}` | `{ok:false, code:'NO_ACTIVE_GATES'}` |
| `gates.statusSnapshot()` | — | 同 `loadLatest`，非空时附 `phase/remaining*` | 同左 |
| `approvals.list()` | — | Approval[] | `[]` |
| `approvals.record({taskId,type,summary})` | 记录字段 | Approval（含 `id`） | — |
| `approvals.statuses()` | — | Approval[]（含实时 `status`） | `[]` |
| `evidence.list(taskId)` | taskId | Evidence[] | `[]`（未知任务同样 `[]`） |
| `evidence.record({task,evidenceType,summary})` | 记录字段 | Evidence（含 `id`） | — |
| `evidence.bundle(task)` | Task | `{ taskId, evidence: Evidence[] }` | 空数组 |
| `artifacts.list()` | — | Artifact[] | `[]` |
| `artifacts.get(id)` | artifactId | Artifact \| null | `null` |
| `artifacts.upsert({id,type,path,...})` | 制品字段 | Artifact（含 `id`） | — |
| `artifacts.refresh()` | — | `list()` 结果（Cloud 无本机文件可重算 hash） | `[]` |
| `project.getProfile()` | — | Profile \| null | `null` |
| `project.listArtifacts()` | — | Artifact[] | `[]` |
| `project.getConstitutionVersion()` | — | Version \| null | `null` |
| `events.append(taskId, event)` | 事件对象 | `{ at, ...event }` | — |
| `events.list(taskId)` | taskId | 事件数组（seq 顺序） | `[]` |

## 4. 失败语义

| 场景 | 行为 |
|---|---|
| 未知 taskId 读证据/事件 | 返回 `[]`（不抛错） |
| 未知 id 读任务/制品 | 返回 `null`（不抛错） |
| 缺主键写入（如 `upsert` 无 `id`） | 抛 `TypeError`（fail-loud，不静默丢数据） |
| 事务内异常 | 回滚 + 重抛（不吞错，不半写） |
| 数据库文件不可写 | 由 `node:sqlite` 抛错，直接冒泡（Cloud 层再按 HTTP 语义映射） |
