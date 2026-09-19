# 技术设计 — TASK-20260919111951-ea475538（Cloud 门禁能力：端口写路径 + gate_create/gate_clear）

上游：`docs/rfc/0006-runtime-boundary.md` §4（政策定稿）、`docs/adr/ADR-0002-runtime-boundary.md`（D1 端口与适配器）。

---

## Part A — 现状识别（Baseline）

### A1 业务系统盘点

| 域 | 现有承载 | 现状行为 | 本任务处置 |
|---|---|---|---|
| 门禁端口 | `bin/runtime-ports.mjs` | `GateRepository: ['loadLatest','statusSnapshot']`（**只读**） | **扩展**：+`save`（方法面变更，需 Decision） |
| File 适配器 | `bin/file-repositories.mjs` | `loadLatest`→`gate-commands.loadLatestGate`；`statusSnapshot`→`gateStatusSnapshot` | **扩展**：+`save`（写 gate 目录，原子写） |
| Sqlite 适配器 | `bin/sqlite-repositories.mjs` | `loadLatest`/`statusSnapshot`（各自实现，读 `gates` 表） | **扩展**：+`save`（按 id upsert） |
| 契约套件 | `bin/repository-contract.mjs` | GateRepository 2 用例（只读断言） | **扩展**：+`save → loadLatest` 往返 + 幂等（同 id 一条） |
| 门禁政策（检查清单） | `bin/config-loader.mjs` `getGateChecks(config, taskType, taskDesc)` | 内置 base + layers 搜索 + 设计阶段项 + 覆盖率门；支持 `disableChecks`（`verify-test` 不可禁） | **复用**（Cloud 不复制清单） |
| 任务类型识别 | `bin/gate-commands.mjs` `detectTaskType` / `TASK_PREFIX_MAP` | 前缀 → 关键词 → 显式 | **复用** |
| 门禁状态机 | `bin/gate-lifecycle.mjs`（**纯模块**，零 import） | `GATE_PHASES` · `checkPhase` · `recomputeGateState` · `pendingChecks` | **复用** |
| 人工门名单 | `bin/mcp.mjs` `HUMAN_WAIT_CHECKS` | `user-confirmed` / `design-confirmed` | **复用** |
| Local 清门 | `bin/gate-commands.mjs#clearGateCheck`（fs + 目录） | 含 human-WAIT 审批绑定等逻辑 | **不改**（Cloud 侧重建，语义对齐） |

跨层检索结论（REQ Step 0）：`buildGateState`/`cloud-gate` 0 命中；政策与状态机均可复用；`clearGateCheck` 为 Local IO 语义，不直接复用。

### A2 数据模型识别

| 实体 | 承载 | 本任务写入 |
|---|---|---|
| Gate 状态 | File：`<paths.gates>/<id>.json`；Sqlite：`gates(id, task_id, data_json, created_at)` | `gate_create` 首次写入；`gate_clear` 每次更新 |

Gate 状态字段（与 Local JSON 对齐）：`schemaVersion` · `id` · `taskType` · `taskDescription` · `taskId` · `createdAt` · `branch` · `head` · `cleared` · `implementationReady` · `checks[{ id, label, phase, status, completedAt?, note? }]`。

### A3 字段盘点

| 字段 | 说明 |
|---|---|
| `save(gateState).id` | 必填（缺失 → `TypeError`） |
| `checks[].phase` | `preparation` \| `verification`（由 `checkPhase` 归一） |
| `checks[].status` | `pending` → `done`（Cloud 清理后） |
| `note` | `gate_clear` 的说明（留痕） |
| `implementationReady` / `cleared` | 由 `recomputeGateState` 计算（不手写） |

### A4 代码结构

| 文件 | 现有职责 | 本任务改动 |
|---|---|---|
| `bin/runtime-ports.mjs` | 端口方法面（冻结） | **改**：GateRepository +`save` |
| `bin/file-repositories.mjs` | Local 适配器 | **改**：+`save` |
| `bin/sqlite-repositories.mjs` | Cloud 适配器 | **改**：+`save` |
| `bin/repository-contract.mjs` | 契约套件（不依赖具体实现） | **改**：+Gate 用例 |
| `bin/cloud-gate.mjs` | — | **新增**（策略与守卫） |
| `bin/cloud-commands.mjs` | Cloud 命令层 | **改**：+`gate_create`/`gate_clear`；`get_next_action` 联动 |
| `bin/cloud-gate.test.mjs` | — | **新增** |
| `bin/cloud-runtime.test.mjs` | Cloud 集成用例 | **扩展**：+4 条门禁集成 |
| `docs/rfc/0006-runtime-boundary.md` · `README.md` · `CHANGELOG.md` | 文档 | 政策定稿说明 + 能力说明 |

---

## Part B — 复用决策矩阵

| 能力需求 | 决策 | 目标 | 依据（已有位置/签名） |
|---|---|---|---|
| 检查项政策（清单） | 调用已有 | getGateChecks | bin/config-loader.mjs |
| 任务类型识别 | 调用已有 | detectTaskType | bin/gate-commands.mjs |
| 门禁阶段常量 | 调用已有 | GATE_PHASES | bin/gate-lifecycle.mjs |
| 门禁状态重算 | 调用已有 | recomputeGateState | bin/gate-lifecycle.mjs |
| 待办检查项 | 调用已有 | pendingChecks | bin/gate-lifecycle.mjs |
| 人工门名单 | 调用已有 | HUMAN_WAIT_CHECKS | bin/mcp.mjs |
| 错误信封 | 调用已有 | toolError | bin/mcp.mjs |
| 契约套件 | 调用已有 | runRepositoryContractTests | bin/repository-contract.mjs |
| 端口方法面 | 扩展已有 | RUNTIME_PORT_METHODS | bin/runtime-ports.mjs（GateRepository +save） |
| File 写路径 | 扩展已有 | createFileRepositories | bin/file-repositories.mjs（gate.save） |
| Sqlite 写路径 | 扩展已有 | createSqliteRepositories | bin/sqlite-repositories.mjs（gate.save） |
| Cloud 建门 | 新封装公用 | buildCloudGate | 新增 bin/cloud-gate.mjs |
| Cloud 清门 | 新封装公用 | clearCloudGateCheck | 新增 bin/cloud-gate.mjs |
| 机器校验项判定 | 新封装公用 | isMachineVerifiedCheck | 新增 bin/cloud-gate.mjs（gate_create 守卫 + gate_clear 守卫共用） |
| 机器校验项后缀 | 新建局部 | MACHINE_VERIFIED_SUFFIX | 新增 bin/cloud-gate.mjs（本模块内部） |

> 决策列取值域：调用已有 / 扩展已有 / 新封装公用 / 新建局部。

---

## Part C — 实施设计

### C1 文件清单（按实施顺序）

1. `bin/runtime-ports.mjs`（+`save`）→ `bin/file-repositories.mjs` / `bin/sqlite-repositories.mjs`（+`save`）。
2. `bin/repository-contract.mjs`（+Gate 用例）。
3. `bin/cloud-gate.mjs`（策略 + 守卫）。
4. `bin/cloud-commands.mjs`（`gate_create` / `gate_clear` + `get_next_action` 联动）。
5. 测试：`bin/cloud-gate.test.mjs`（新）+ `bin/cloud-runtime.test.mjs`（扩展）。
6. 文档：RFC-0006 §4 政策定稿 + README + CHANGELOG。

### C2 关键实现约定

- **端口扩展**：方法面为 `['loadLatest','statusSnapshot','save']`；`save` 缺 `id` 抛 `TypeError`；`loadLatest` 空态语义**不变**（`{ ok:false, code:'NO_ACTIVE_GATES' }`）。
- **File `save`**：`mkdirSync(dir, {recursive:true})` + `atomicWriteJson(join(dir, `${id}.json`), gateState)`；目录取 `resolve(rootDir, config.paths.gates)`（与 Local 一致）。
- **Sqlite `save`**：`INSERT ... ON CONFLICT(id) DO UPDATE`（`task_id` 取 `gateState.taskId ?? null`，`created_at` 取 `createdAt`）。
- **契约用例**：`save → loadLatest` 断言 `ok:true` + `gateState.id` 相等；再 `save` 同 id（改动一个字段）→ `loadLatest` 读到新值且不重复（Sqlite 靠 upsert；File 靠同名覆盖）。
- **Cloud 建门**：`taskType` 由 `detectTaskType({ taskDesc: task.title, explicitType: task.type })` 推导（`null` → `feature`）；`checks` = `getGateChecks(config, taskType, task.title)` → 映射 `{...check, status:'pending'}`；`implementationReady`/`cleared` 由 `recomputeGateState` 计算；`branch`/`head` 从最新提交式 git 快照取（缺失 → null）。
- **Cloud 清门守卫顺序**：`unknown_check` → `check_machine_verified` → `human_approval_required`（无审批）→ `check_already_cleared` → 通过（置 done + `completedAt` + `note` → recompute）。
- **不做**：Cloud 不执行验证器；不批量清理；不改 Local `clearGateCheck`。

### C3 风险与回滚

| 风险 | 缓解 |
|---|---|
| 端口扩展破坏既有适配器 | 契约双跑 + `validatePortImplementation` 断言（AC-001/002） |
| 政策漂移（Cloud 自造检查清单） | 检查项必须来自 `getGateChecks`（AC-003 比对 id 集合） |
| 人工门被裸清 | human-WAIT 需审批（AC-005） |
| 机器项被直清 | `check_machine_verified`（AC-006） |
| "清门=完工"误解 | 文档显式声明；`finish_task` 仍证据判定（D13） |

**回滚**：移除 `save`（三处端口/适配器 + 契约用例）、删除 `cloud-gate.mjs` 与两个工具接线、还原 `get_next_action` 即可（Local 与既有 Cloud 行为不变）。
