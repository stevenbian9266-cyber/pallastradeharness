# PRD — Batch D D12：MCP 工具面兼容 + Project 能力

- **状态**：approved（授权：ADR-0002 ACCEPTED + 用户「继续」）
- **任务**：TASK-20260919105713-71812e8f（critical）
- **上游规格**：`pallastradeharness Phase 1 AI 实施指令.md` TASK-D12；`docs/rfc/0006-runtime-boundary.md` §4/§7；`docs/adr/ADR-0002-runtime-boundary.md`（D1 端口 / D6 提交式上下文）
- **影响面**：Cloud 应用层扩展（新增命令层模块）+ 常量单点化；**Local 运行时零行为改动**

## 1. 背景

D10/D11 交付了 Cloud HTTP 运行时（传输 → 鉴权 → MCP 适配 → 应用层 → SQLite），但应用层只接线了 3 个工具，其余返回 `cloud_not_implemented`。指令 TASK-D12 要求：

- **不破坏 frozen tools**：已有 Tool Name 继续保留（`tools/list` 与 Local 严格一致）；
- **优先复用 Cloud-safe 的现有工具**：`start_task` · `get_task` · `list_tasks` · `risk_check` · `gate_status` · `review_diff` · `record_evidence` · `finish_task` · `get_next_action`；
- **新增必要 Project 能力**：`project_init` · `project_status` · `record_approval` · `get_template`；
- 独立 Tool 还是 Domain Action，按 command registry 设计决定。

可复用的纯逻辑（实查）：`risk-engine.assessRisk({ task, files, diff, declared, config })`（纯函数，输入含文件清单 → 适配提交式快照）、`template-registry.getTemplate(id, version)`（读随包发布的 `templates/registry.json`，非用户项目文件）、`contracts.EVIDENCE_TYPES`、`guide` 的 nextAction 语义（Local 版读本机状态，Cloud 需按端口状态重建）。

## 2. 目标

- **G1**：新增 `bin/cloud-commands.mjs`（Cloud 命令层），实现 12 个工具处理函数；`cloud-application.mjs` 仅做装配与分发表。
- **G2**：`start_task` 落 TaskRepository + Change Plan 检查点（`task_checkpoints`），返回任务与 `next_action`；风险等级由 `assessRisk` 纯引擎推导（不手写判断）。
- **G3**：`finish_task` **严格**：按任务 `requiredEvidence` 校验证据（含 critical → 需 approval），**不满足即拒绝**（不自动转换状态、不补造证据）。
- **G4**：`risk_check` 用提交式 git 快照的 `changed_files` 调 `assessRisk`，必要时按引擎结论升级任务风险等级。
- **G5**：`project_init` / `project_status` / `record_approval` / `get_template` 四个新能力落地（`record_approval` 类型经单点常量校验）。
- **G6**：无法忠实实现的工具显式降级（`review_diff` → `cloud_context_insufficient`：Cloud 默认不存文件内容/全量 diff），其余未接线工具仍 `cloud_not_implemented`。
- **G7**：常量单点化：`APPROVAL_TYPES` 从 `approvals.mjs`（含 fs）上移到 `contracts.mjs`（纯逻辑），Cloud 侧不引入 fs 依赖链。

## 3. 用户场景

1. **Cloud 客户端全流程**：`project_init` → `start_task` → `gate_status` → `risk_check` → `record_evidence`（多次，带边界标记）→ `record_approval` → `finish_task`（严格校验通过 → 任务 completed）。
2. **提前 finish**：证据不足时 `finish_task` 返回 `isError: true` + `evidence_policy_unmet` + `missing: [...]`，任务状态**保持不变**（绝不 legacy 自动流转）。
3. **模板查询**：`get_template { template_id }` 返回随包模板定义；未知 id → `template_not_found`。
4. **`review_diff`**：Cloud 无文件内容 → `cloud_context_insufficient`（明确说明需提交式上下文含内容才可用）。

## 4. 功能需求

| ID | 需求 |
|---|---|
| FR-001 | 新增 `bin/cloud-commands.mjs`：`createCloudCommands({ repositories, evidence, config })` → 12 个 handler 的映射 |
| FR-002 | `start_task`：`{ title, type?, allow?, required_evidence? }` → 生成 Task（`riskLevel` 由 `assessRisk` 推导；`requiredEvidence` 默认取引擎结果）→ TaskRepository.save + `task_checkpoints` 记录 Change Plan → 返回 `{ task, next_action }` |
| FR-003 | `gate_status`：GateRepository `statusSnapshot()`（空态原样返回 `{ ok:false, code }`） |
| FR-004 | `record_approval`：类型必须在 `APPROVAL_TYPES` 内（否则 `invalid_argument`）；经 ApprovalRepository 落库 |
| FR-005 | `project_init`：`{ project_id, name?, artifacts? }` → `projects` 落库 + 可选 `project_artifacts` upsert → 返回 profile |
| FR-006 | `project_status`：`{ profile, constitutionVersion, artifacts, counts: { tasks, evidence, approvals } }`（全部来自端口） |
| FR-007 | `get_template`：`{ template_id, version? }` → `getTemplate`；未找到 → `template_not_found` |
| FR-008 | `get_next_action`：按端口状态推导 `{ action, reason, task_id }`（无任务 → `start_task`；无 gate → `gate_create`；gate 有 prep → `gate_clear`；实现期 → `record_evidence`；证据齐 → `finish_task`） |
| FR-009 | `risk_check`：`{ task_id?, declared? }`；用最新提交式 git 快照 `changed_files` + 任务标题调 `assessRisk`；任务风险等级按引擎结论升级并持久化 |
| FR-010 | `finish_task`：严格证据校验（`requiredEvidence` ∪ critical→`approval`）；不足 → `evidence_policy_unmet` + `missing`（任务状态不变）；满足 → `status='completed'` 持久化并返回 `{ task, finished: true }` |
| FR-011 | `review_diff` → `cloud_context_insufficient`（说明 Cloud 不保存文件内容/全量 diff）；其余未接线工具 → `cloud_not_implemented` |
| FR-012 | `cloud-application.mjs` 改为装配：`createCloudCommands` + 分发表 + `listTools()`/`listImplementedTools()` |
| FR-013 | `APPROVAL_TYPES` 上移至 `bin/contracts.mjs` 并由 `approvals.mjs` 复用（行为不变，单一来源） |

## 5. 非功能需求

- **零依赖 / 零新表**：复用 D06 schema（`tasks` · `task_checkpoints` · `gates` · `approvals` · `evidences` · `projects` · `project_artifacts`）。
- **无本机项目 IO**：Cloud 命令层不 import `node:fs` / `node:child_process`（`get_template` 只读随包模板注册表）。
- **不伪造结果**：任何未实现/上下文不足场景都返回显式错误信封。
- **复杂度**：延续 STD-CQ-001 经验（助手集中 `??`、分发表替代 if 链）。

## 6. 验收标准（AC）

| ID | 验收标准 | 验证方式 |
|---|---|---|
| AC-001 | `tools/list` 仍与 Local `MCP_TOOLS` 完全一致（frozen 不破坏） | `bin/cloud-runtime.test.mjs`（D10 断言保持通过） |
| AC-002 | `start_task` 建任务并落 Change Plan 检查点；`riskLevel`/`requiredEvidence` 来自 `assessRisk` | D12 用例 |
| AC-003 | `gate_status` 空态与有 gate（SQL 播种）两种情况均正确 | D12 用例 |
| AC-004 | `record_approval` 合法类型落库；非法类型 → `invalid_argument` | D12 用例 |
| AC-005 | `project_init` → `project_status` 往返（含 artifacts 计数与 constitution 版本） | D12 用例 |
| AC-006 | `get_template` 命中随包注册表；未知 id → `template_not_found` | D12 用例 |
| AC-007 | `get_next_action` 按状态推进（无任务 → `start_task`；有任务无 gate → `gate_create`） | D12 用例 |
| AC-008 | `risk_check` 依提交快照推导风险并按结论升级任务等级 | D12 用例 |
| AC-009 | `finish_task` 证据不足 → `evidence_policy_unmet` + `missing`，状态不变（**无 legacy 自动流转**） | D12 用例 |
| AC-010 | 证据齐全（含 approval）→ `finish_task` 成功且状态变 `completed` | D12 用例 |
| AC-011 | `review_diff` → `cloud_context_insufficient`；未接线工具 → `cloud_not_implemented` | D12 用例 |
| AC-012 | Cloud 命令层无 `node:fs` / `node:child_process` import；`APPROVAL_TYPES` 单一来源 | D12 用例（静态断言） |

## 7. 架构 / 技术影响

- **架构**：CROSS_MODULE（Cloud 命令层新增；`contracts.mjs` 常量上移；Local 行为不变；工具不判业务 → 判定全部来自纯引擎 `assessRisk` 与端口状态）。
- **技术栈**：NONE（零新依赖）。
- **风险**：Cloud 侧 `finish_task` 语义必须与 Local 治理等价 → 由「证据缺一不可」+ critical 需 approval + 状态不变断言守住（D13 再补 strict 开关与回归）。

## 8. 测试计划

- 扩展 `bin/cloud-runtime.test.mjs`（复用既有 fixture）：新增 12 条 D12 用例（AC-002~AC-012）。
- 回归：`npm run test:core`（当前 456）全绿；D04-D11 用例保持通过。

## 9. 范围外

- D13（Cloud `strictGovernance=true` 显式开关与回归）、D14（真实客户端）。
- `review_diff` 的 Cloud 实现（需提交式上下文携带内容/差异，属后续批次）。
- 其余冻结工具的 Cloud 接线（`gate_create`/`gate_clear`/`run_verifier`/`generate_*` 等，按 RFC-0006 §4 政策待定）。
