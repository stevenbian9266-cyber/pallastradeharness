# 交互规格 — TASK-20260919105713-71812e8f（D12）

本任务无界面交互；「交互」= **Cloud 工具调用契约**（与 Local 同名工具保持一致语义，差异显式化）。

## 1. 工具面（保持 frozen，不新增工具名）

| 类别 | 工具 | Cloud 行为 |
|---|---|---|
| 复用（已接线） | `get_task` · `list_tasks` · `record_evidence` | D10 已交付（`record_evidence` 带 D09 边界标记） |
| 本批接线 | `start_task` · `gate_status` · `record_approval` · `project_init` · `project_status` · `get_template` · `get_next_action` · `risk_check` · `finish_task` | 见下表 |
| 显式降级 | `review_diff` | `cloud_context_insufficient`（Cloud 不保存文件内容/全量 diff） |
| 未接线 | 其余（`gate_create` · `gate_clear` · `run_verifier` · `generate_*` …） | `cloud_not_implemented` |

## 2. 工具参数与返回（本批接线部分）

| 工具 | 参数 | 成功返回（structuredContent） | 失败信封 |
|---|---|---|---|
| `start_task` | `{ title, type?, allow?, required_evidence? }` | `{ task, changePlan, next_action: 'gate_create' }` | `missing_argument`（缺 title） |
| `gate_status` | `{}` | GateRepository 快照（空态 `{ ok:false, code:'NO_ACTIVE_GATES' }`） | — |
| `record_approval` | `{ task_id, type, summary? }` | `{ id, taskId, type, summary, status, createdAt }` | `missing_argument` / `invalid_argument`（类型不在 `APPROVAL_TYPES`） |
| `project_init` | `{ project_id, name?, artifacts? }` | `{ profile, artifacts }` | `missing_argument`（缺 project_id） |
| `project_status` | `{}` | `{ profile, constitutionVersion, artifacts, counts: { tasks, evidence, approvals } }` | — |
| `get_template` | `{ template_id, version? }` | 模板定义（含 `id`/`version`/`category`…） | `missing_argument` / `template_not_found` |
| `get_next_action` | `{ task_id? }` | `{ action, reason, task_id }` | — |
| `risk_check` | `{ task_id?, declared? }` | `{ risk, task }`（`risk` = `assessRisk` 结果，含 `level`/`requiredEvidence`/`recoveryRequired`） | `missing_argument`（无任务且无 task_id） |
| `finish_task` | `{ task_id? }` | `{ task, finished: true }` | `missing_argument` / `evidence_policy_unmet`（附 `missing: [...]`） |

## 3. 语义要点

- **`start_task`**：`riskLevel` 与 `requiredEvidence` **全部来自** `assessRisk({ task: title, files: [], config })`；Change Plan（allow/deny/standards）作为检查点写入 `task_checkpoints`，不在 Cloud 侧做本机标准选择。
- **`finish_task`（严格）**：所需证据 = `task.requiredEvidence`（缺省 `['test','review','knowledge']`，**不会被客户端调低**）∪（critical → 一条非 STALE 审批）；证据逐类查 `evidences` 表，审批查 `approvals` 表；**缺一即拒**，任务状态不变（无 legacy 自动流转、不补造）。
- **`risk_check`**：文件清单取最新提交式 git 快照（`git_snapshots` kind=GitSnapshotSubmission）的 `changed_files`；引擎结论高于当前任务等级时升级并持久化。
- **`get_next_action`**：纯状态推导（无任务 → `start_task`；有任务无 gate → `gate_create`；gate 未清完 → `gate_clear`；否则 → `record_evidence` / `finish_task`）。
- **`get_template`**：读随包发布的 `templates/registry.json`（**非**用户项目文件），Cloud 侧不引入项目 IO。

## 4. 失败语义

| 场景 | 行为 |
|---|---|
| 缺必填参数 | `toolError('missing_argument', …, { argument })` |
| 参数非法（审批类型等） | `toolError('invalid_argument', …)` |
| 未找到资源（模板/任务） | `toolError('template_not_found' / 'task_not_found', …)` |
| 证据不足 | `toolError('evidence_policy_unmet', …, { missing })`，任务状态不变 |
| 上下文不足（`review_diff`） | `toolError('cloud_context_insufficient', …, { tool })` |
| 未接线 | `toolError('cloud_not_implemented', …, { tool })` |
