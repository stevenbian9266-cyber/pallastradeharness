# REQ — Cloud 门禁能力（gate_create / gate_clear + GateRepository 可写端口）

- **任务**：TASK-20260919111951-ea475538（critical / feature）
- **PRD**：`docs/prd/other/PRD-20260919-other-cloud-gate-capability.md`
- **上游**：`docs/rfc/0006-runtime-boundary.md` §4（政策定稿）、`docs/adr/ADR-0002-runtime-boundary.md`（D1）

## Step 0 — 跨层检索（AGENTS.md §3）

| 层 | 检索词 | 命中 | 结论 |
|---|---|---|---|
| `bin/` | `buildGateState` / `cloud-gate` | **0** | Cloud 侧门禁策略净新增 |
| `bin/` | `clearGateCheck` | `gate-commands.mjs:268`（Local，fs + 目录状态）| **不可复用**（Local IO 语义）→ Cloud 侧重建，但状态机复用 `gate-lifecycle` |
| `bin/runtime-ports.mjs` | `GateRepository` | `['loadLatest','statusSnapshot']`（**只读**）| 需正式扩展 `save`（AC-001） |
| `bin/config-loader.mjs` | 检查项政策 | `getGateChecks(config, taskType, taskDesc)`（导出）· `getLayerSearchChecks` | **复用**（Cloud 不复制检查清单） |
| `bin/gate-commands.mjs` | 任务类型识别 | `detectTaskType({ taskDesc, explicitType })` · `TASK_PREFIX_MAP` | **复用** |
| `bin/gate-lifecycle.mjs` | 门禁状态机 | `GATE_PHASES` · `checkPhase` · `recomputeGateState` · `pendingChecks`（纯模块，零 import） | **复用** |
| `bin/mcp.mjs` | human-WAIT 名单 | `HUMAN_WAIT_CHECKS`（已导出） | **复用** |
| `presets/` · `templates/` · `rules/` | `gate_create` / `gate_clear` | 0 | 无 |
| `docs/` | Cloud 门禁政策 | 6 处（RFC-0006 §4 政策待定稿 + 指令 + 审计报告） | 本任务定稿 |

**重复实现检查（AP-SEARCH-1/2/3）**：不存在第二套门禁引擎；Cloud 只补**写路径**与工具接线，政策与状态机全部复用。

## Step 1 — Skill 咨询

| Skill | 关键结论 | 落地 |
|---|---|---|
| `harness-standards-audit` | 决策点 ≤12（`??` 计 1）；异常路径必须显式；端口面变更需留痕 | 守卫用显式错误码；`brain decision` 记录端口扩展 |
| `harness-docs` | 端口/政策变更必须同步文档 | RFC-0006 §4 政策定稿说明 + README/CHANGELOG |
| `harness-skill-author`（约定） | 多适配器共享契约套件 | 契约用例覆盖 `save`（File + Sqlite 双跑） |

## Step 2 — 复用决策摘要

- **调用已有**：`getGateChecks`（检查政策）· `detectTaskType`（类型识别）· `GATE_PHASES`/`recomputeGateState`/`pendingChecks`（状态机）· `HUMAN_WAIT_CHECKS`（人工门名单）· `toolError`（信封）· `createSqliteRepositories`/`createFileRepositories`（端口实现）· `runRepositoryContractTests`（契约套件）。
- **扩展已有**：`RUNTIME_PORT_METHODS.GateRepository`（+`save`）· File 适配器（+`save`）· Sqlite 适配器（+`save`）· 契约套件（+1 用例）· `cloud-commands.mjs`（+`gate_create`/`gate_clear`，`get_next_action` 联动）。
- **新封装公用**：`buildCloudGate` · `clearCloudGateCheck`。
- **新建局部**：`MACHINE_VERIFIED_SUFFIX` · `isMachineVerifiedCheck`。

## Step 3 — 需求与验收

FR-001~FR-010、AC-001~AC-009 见 PRD §4/§6（不在本 REQ 重复维护）。

## Step 4 — 风险与缓解

| 风险 | 缓解 |
|---|---|
| 端口面扩展破坏既有适配器 | 契约套件双跑 + `validatePortImplementation` 更新（AC-001/AC-002） |
| Cloud 自造检查清单（政策漂移） | 检查项必须来自 `getGateChecks`（AC-003 断言 id 集合一致） |
| 人工门被工具裸清 | human-WAIT 需审批记录（AC-005），与 Local 语义对齐 |
| 机器校验项被直清 | `check_machine_verified`（AC-006） |
| "清门=完工"误解 | 文档显式声明 + `finish_task` 仍走证据判定（D13 strict 不变） |

## Step 5 — 验证计划

1. `node --test bin/cloud-gate.test.mjs bin/cloud-runtime.test.mjs bin/file-repositories.test.mjs bin/sqlite-repositories.test.mjs bin/runtime-ports.test.mjs`
2. `npm run test:core`（480 基线 + 新增）
3. `docs:check` / `readme:sync --check` / `doc-impact --base origin/main`
4. `reuse-adherence` 验证器 + `supervise diff`
