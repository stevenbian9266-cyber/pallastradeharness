# PRD — Cloud 门禁能力（gate_create / gate_clear + GateRepository 可写端口）

- **状态**：approved（授权：ADR-0002 ACCEPTED + 用户「继续」/「选最优方案」）
- **任务**：TASK-20260919111951-ea475538（critical）
- **上游规格**：`docs/rfc/0006-runtime-boundary.md` §4（Cloud 工具面映射：`gate_status（gate_create/gate_clear 视政策）` → NEEDS PORT，政策待定稿）；`docs/adr/ADR-0002-runtime-boundary.md`（D1 端口与适配器）
- **影响面**：端口方法面扩展（正式）+ 两个适配器补实现 + 契约用例扩展 + Cloud 命令层新增 2 个工具

## 1. 背景

Batch D 已交付 Cloud 运行时，但 `gate_create` / `gate_clear` 一直是 `cloud_not_implemented`：

- Cloud 侧只能**读**门禁（`gate_status`），不能建门 → `get_next_action` 永远停在 `gate_create`（流程死路）；
- RFC-0006 §4 明确这两个工具「视政策」，政策未定稿（本任务即定稿）；
- D02 冻结的 `GateRepository` 只有 `loadLatest` / `statusSnapshot`（只读），**没有写路径**。

这不是"临时缺功能"而是**端口面缺一条写入语义**：不补，Cloud 无法跑完「建门 → 清准备项 → 证据 → 完工」的完整治理流程；任何"桩实现"都会成为永久债。

## 2. 目标

- **G1**：**正式扩展端口**：`GateRepository` 增加 `save(gateState)`（方法面冻结在本批更新，需 Decision 留痕）；File 与 Sqlite 两个适配器都实现，并被**同一套契约用例**验证（§D03 双轨防漂移机制继续生效）。
- **G2**：新增 Cloud 门禁策略模块 `bin/cloud-gate.mjs`：建门（检查项来自**既有** `getGateChecks` 与 `detectTaskType`，不重写政策）+ 清门（守卫齐全）。
- **G3**：Cloud 工具接线：`gate_create`、`gate_clear`；`get_next_action` 与真实门禁状态联动（不再死路）。
- **G4**：**治理不变式**（与 Local 一致）：
  - `user-confirmed` / `design-confirmed` 等 **human-WAIT** 检查项**禁止裸清**——Cloud 下必须先有该任务的审批记录（`record_approval`）；
  - **机器校验项**（`verify-test` 及 `*-gate` 后缀）**禁止工具直清**（Cloud 不运行本机验证器；返回 `check_machine_verified`）；
  - 未知检查项 / 重复清理 → 明确错误码。
- **G5**：语义边界显式化并写入文档：Cloud 的门禁是**流程指引**，**完工判定以证据为准**（D13 strict，`finish_task` 不看门禁）——避免"清了门禁 = 完工"的误解。

## 3. 用户场景

1. **完整 Cloud 流程**：`start_task` → `gate_create` → `gate_status`（看到 preparation 待办）→ 逐项 `gate_clear`（附带 `--note`）→ `get_next_action` 变为 `record_evidence` → 证据齐 → `finish_task`。
2. **人工门保护**：客户端直接 `gate_clear user-confirmed` → `human_approval_required`；先 `record_approval`（带 `task_id`）→ 再清成功。
3. **机器门保护**：`gate_clear verify-test` → `check_machine_verified`（提示需验证器/证据路径，Cloud 暂不支持）。
4. **防重复建门**：同一任务已有未完成门禁时再次 `gate_create` → `gate_already_active`（避免门禁刷屏与状态歧义）。
5. **双轨一致**：File 与 Sqlite 适配器都能 `save` 且 `loadLatest` 读回同一状态（契约用例强保证）。

## 4. 功能需求

| ID | 需求 |
|---|---|
| FR-001 | `RUNTIME_PORT_METHODS.GateRepository` 增加 `save`；`runtime-ports.test` 断言更新 |
| FR-002 | File 适配器 `save(gateState)`：写入既有 gate 目录（`config.paths.gates`），文件名 `<gateId>.json`，原子写 |
| FR-003 | Sqlite 适配器 `save(gateState)`：按 id upsert 到 `gates` 表（`task_id` / `data_json` / `created_at`） |
| FR-004 | 契约套件新增 GateRepository 用例：`save → loadLatest` 往返 + 同 id 重复 save 不产生重复门禁 |
| FR-005 | `bin/cloud-gate.mjs`：`buildCloudGate({ task, config, now, git })` —— `taskType` 由 `detectTaskType` 推导；`checks` 来自 `getGateChecks`（保持 pending）；`cleared/implementationReady` 由 `gate-lifecycle.recomputeGateState` 计算 |
| FR-006 | `clearCloudGateCheck({ gateState, checkId, note, hasApproval, now })`：未知项 → `unknown_check`；机器校验项 → `check_machine_verified`；human-WAIT 且无审批 → `human_approval_required`；已清 → `check_already_cleared`；否则置 done + `completedAt` + `note` 并 recompute |
| FR-007 | Cloud 命令 `gate_create`：解析任务（缺 `task_id` 取最近任务）→ 若已有未完成门禁 → `gate_already_active`；否则建门并 `save` → 返回 `{ gateId, phase, remainingPreparation, remainingVerification, next_action }` |
| FR-008 | Cloud 命令 `gate_clear`：载入门禁（默认最新）→ 守卫清理 → `save` → 返回 `{ gateId, cleared: checkId, remainingPreparation, remainingVerification }`；守卫失败返回对应错误信封（不落库） |
| FR-009 | `get_next_action`：门禁存在且 preparation 未清完 → `gate_clear`（附 `remaining`）；清完 → `record_evidence` / `finish_task`（既有逻辑） |
| FR-010 | 文档：RFC-0006 §4 政策定稿说明 + README/CHANGELOG；明确「门禁=流程指引，完工=证据判定」 |

## 5. 非功能需求

- **复用优先**：检查项定义、任务类型识别、门禁状态机全部来自既有模块（`config-loader.getGateChecks` / `gate-commands.detectTaskType` / `gate-lifecycle.*`），Cloud 侧不复制政策。
- **零新表 / 零新依赖**：复用 D06 的 `gates` 表与既有目录约定。
- **双轨一致**：端口扩展后 File 与 Sqlite 行为必须一致（契约用例强约束）。
- **无本机 IO 直连**：Cloud 门禁模块不 import `node:fs` / `node:child_process`。

## 6. 验收标准（AC）

| ID | 验收标准 | 验证方式 |
|---|---|---|
| AC-001 | 端口方法面含 `save`；两个适配器 `validatePortImplementation` 通过 | `runtime-ports.test.mjs` · `file-repositories.test.mjs` · `sqlite-repositories.test.mjs` |
| AC-002 | 契约用例 `save → loadLatest` 在 **File 与 Sqlite 双适配器** 均通过；同 id 重复 save 只有一条 | 契约套件（label=file / label=sqlite） |
| AC-003 | `buildCloudGate` 检查项来自 `getGateChecks`（数量与 id 集合一致）、初始状态全 pending、`taskType` 由前缀正确推导 | `cloud-gate.test.mjs` |
| AC-004 | 清准备项成功（含 `note` 与 `completedAt`），`recomputeGateState` 生效（全部 prep 清完 → `implementationReady: true`） | `cloud-gate.test.mjs` |
| AC-005 | human-WAIT：无审批 → `human_approval_required`；有审批 → 清理成功 | `cloud-gate.test.mjs` + `cloud-runtime.test.mjs` |
| AC-006 | 机器校验项 → `check_machine_verified`；未知项 → `unknown_check`；重复清理 → `check_already_cleared` | `cloud-gate.test.mjs` |
| AC-007 | `gate_create` 落库（Sqlite 读回一致）；重复建门 → `gate_already_active` | `cloud-runtime.test.mjs` |
| AC-008 | `gate_clear` 经真实工具链清理后 `gate_status` 反映剩余项；`get_next_action` 由 `gate_create` 推进到 `gate_clear`/`record_evidence` | `cloud-runtime.test.mjs` |
| AC-009 | Cloud 门禁模块无本机 IO import；`save` 不改变既有只读语义（`loadLatest` 空态仍 `{ ok:false, code }`） | `cloud-gate.test.mjs` + 契约用例 |

## 7. 架构 / 技术影响

- **架构**：端口方法面**扩展**（ARCHITECTURE_CHANGE）→ 需 Decision 留痕（本任务内执行 `brain decision`）；不新增第二引擎，检查政策全部复用。
- **技术栈**：NONE。
- **风险**：端口面扩展影响 D03/D07 契约（已由双适配器契约覆盖）；Cloud 误判"清门=完工"（已由文档 + D13 strict 隔断）。

## 8. 测试计划

- 扩展：`runtime-ports.test` · `file-repositories.test` / `sqlite-repositories.test`（契约新增用例）· `cloud-runtime.test`（4 条集成）。
- 新增：`bin/cloud-gate.test.mjs`（6 条策略/守用例）。
- 回归：`npm run test:core`（当前 480）全绿。

## 9. 范围外

- Cloud 侧 `run_verifier`（机器校验项在 Cloud 由证据路径满足，验证器执行待后续批次）。
- `gate_clear` 的批量清理（一次一项，与 Local 一致）。
- Local 门禁实现改动（零改动）。
