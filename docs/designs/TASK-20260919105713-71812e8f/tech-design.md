# 技术设计 — TASK-20260919105713-71812e8f（Batch D / D12：MCP 工具面兼容 + Project 能力）

上游：指令文档 TASK-D12、`docs/rfc/0006-runtime-boundary.md` §4（Cloud 工具面映射）、`docs/adr/ADR-0002-runtime-boundary.md`（D1 端口 / D6 提交式上下文）。

---

## Part A — 现状识别（Baseline）

### A1 业务系统盘点

| 域 | 现有承载 | 现状行为 | 本任务处置 |
|---|---|---|---|
| MCP 工具面 | `bin/mcp.mjs` `MCP_TOOLS`(20) | Local stdio 全量实现；Cloud `tools/list` 已对齐（D10） | **不改**（保持 frozen） |
| Cloud 应用层 | `bin/cloud-application.mjs`（D10） | 仅 `list_tasks`/`get_task`/`record_evidence`，其余 `cloud_not_implemented` | **扩展**：改为装配 + 分发表 |
| 风险引擎 | `bin/risk-engine.mjs` `assessRisk({ task, files, diff, declared, config })` | **纯函数**（输入文件清单/差异文本）→ 天然适配提交式快照 | **复用**（`risk_check`、`start_task`） |
| 模板注册表 | `bin/template-registry.mjs` `getTemplate(id, version)` | 读随包 `templates/registry.json`（非用户项目） | **复用**（`get_template`） |
| 审批常量 | `bin/approvals.mjs` `APPROVAL_TYPES` | 声明+自用；模块含 fs（hash 计算） | **上移**到 `bin/contracts.mjs`（纯），`approvals.mjs` 复用（FR-013） |
| 引导 | `bin/guide.mjs` `nextAction({ rootDir, config })` | Local：读本机 gate/task 文件 | 不可直接复用 → Cloud 按端口状态重建（FR-008） |
| 严格完工 | `bin/fact-gates.mjs` | Local：rootDir 语义 | 不可直接复用 → Cloud 按端口证据齐备性判定（FR-010） |
| Cloud 存储/边界 | `bin/sqlite-repositories.mjs` · `bin/evidence-boundary.mjs`（D07/D09） | 7 端口 + 边界包装 | **复用** |

跨层检索结论（REQ Step 0）：四个新工具名在 `bin/` **0 命中**；`presets/templates/rules` 仅 1 处模板文本提及；`docs/` 2 处设计文档 → 净新增。

### A2 数据模型识别

| 实体 | 承载表（D06 schema，无新增） | 本任务写入 |
|---|---|---|
| Task | `tasks` | `start_task`（新增）· `risk_check`（升级 riskLevel）· `finish_task`（completed） |
| Change Plan 检查点 | `task_checkpoints` | `start_task` 写入（allow/deny/standards/requiredEvidence） |
| Approval | `approvals` | `record_approval` |
| Evidence | `evidences` | `record_evidence`（D10，带边界字段） |
| Project / Artifact | `projects` · `project_artifacts` | `project_init` |
| Gate / 提交快照 | `gates` · `git_snapshots` | 读取（`gate_status` / `risk_check`） |

### A3 字段盘点

| 字段 | 来源 | 说明 |
|---|---|---|
| `requiredEvidence` | `assessRisk().requiredEvidence` | 缺省 `['test']`；Cloud 默认合并 `['review','knowledge']`（与仓库默认一致） |
| `riskLevel` | `assessRisk().level` | `quick`/`standard`/`high`/`critical` |
| `recoveryRequired` | `assessRisk().recoveryRequired` | 记录在 Change Plan 检查点（Cloud 暂不自动建恢复计划，D13 处理） |
| `missing`（错误信封） | `finish_task` | 未满足的证据类型列表 |
| `template.*` | 模板注册表 | `id`/`version`/`category`/`scope`/`status`… |

### A4 代码结构

| 文件 | 现有职责 | 本任务改动 |
|---|---|---|
| `bin/contracts.mjs` | 契约常量（纯） | **扩展**：`APPROVAL_TYPES` 上移 |
| `bin/approvals.mjs` | 审批（Local，含 fs） | **改**：复用 `APPROVAL_TYPES`（行为不变） |
| `bin/cloud-commands.mjs` | — | **新增**（12 个 handler） |
| `bin/cloud-application.mjs` | Cloud 应用层 | **改**：装配 `createCloudCommands` + 分发表 + `listImplementedTools()` |
| `bin/cloud-runtime.test.mjs` | D10 用例 | **扩展**：新增 D12 用例（复用既有 fixture） |
| `README.md` · `CHANGELOG.md` | 文档 | 同步 |

---

## Part B — 复用决策矩阵

| 能力需求 | 决策 | 目标 | 依据（已有位置/签名） |
|---|---|---|---|
| 风险判定 | 调用已有 | assessRisk | bin/risk-engine.mjs（纯函数） |
| 模板查询 | 调用已有 | getTemplate | bin/template-registry.mjs |
| 证据类型清单 | 调用已有 | EVIDENCE_TYPES | bin/contracts.mjs |
| 工具清单 | 调用已有 | MCP_TOOLS | bin/mcp.mjs |
| 错误信封 | 调用已有 | toolError | bin/mcp.mjs（D10 已导出） |
| Cloud 仓储 | 调用已有 | createSqliteRepositories | bin/sqlite-repositories.mjs（D07） |
| 证据边界 | 调用已有 | createBoundaryEvidenceRepository | bin/evidence-boundary.mjs（D09） |
| 审批类型常量 | 扩展已有 | APPROVAL_TYPES | bin/contracts.mjs（本批上移，approvals.mjs 复用） |
| Cloud 命令层 | 新封装公用 | createCloudCommands | 新增 bin/cloud-commands.mjs（返回 12 个 handler 映射） |
| 回退任务解析 | 新建局部 | resolveCloudTask | 新增 bin/cloud-commands.mjs（未找到 → task_not_found 信封） |
| 证据齐备判定 | 新建局部 | missingRequirements | 新增 bin/cloud-commands.mjs（证据 + critical 审批） |
| 默认证据集 | 新建局部 | DEFAULT_REQUIRED_EVIDENCE | 新增 bin/cloud-commands.mjs |
| 任务 id 生成 | 新建局部 | makeTaskId | 新增 bin/cloud-commands.mjs |
| 提交快照文件清单 | 新建局部 | submittedFiles | 新增 bin/cloud-commands.mjs |

> 决策列取值域：调用已有 / 扩展已有 / 新封装公用 / 新建局部。
> 工具 handler 是 `createCloudCommands` 返回对象的方法（非独立导出符号），故不单列矩阵行；其行为见 interaction.md 表。

---

## Part C — 实施设计

### C1 文件清单（按实施顺序）

1. `bin/contracts.mjs`（+`APPROVAL_TYPES`）与 `bin/approvals.mjs`（复用）。
2. `bin/cloud-commands.mjs`（`createCloudCommands` + 12 handler）。
3. `bin/cloud-application.mjs`（装配 + 分发表 + `listImplementedTools`）。
4. `bin/cloud-runtime.test.mjs`（新增 D12 用例）。

### C2 关键实现约定

- **分发表**：`createCloudCommands({ repositories, evidence, config })` 返回 `{ start_task, gate_status, … }` 映射；`cloud-application` 组装 `handlers` = `{...base, ...commands}`，未命中 → `cloud_not_implemented`。
- **严格完工（核心不变式）**：
  ```text
  required = DEFAULT(['test','review','knowledge']) ∪ task.requiredEvidence（去除 'approval'）
  missing  = required 中在 evidences 表无记录的项
           ∪ （riskLevel === 'critical' 且 approvals 表无非-STALE 记录 → ['approval']）
  missing.length > 0 → toolError('evidence_policy_unmet', { missing })，任务不落库改动
  否则 → tasks.save({ ...task, status: 'completed', completedAt })
  ```
  **无 fallback、无自动补证据、无 legacy 流转**；客户端传入的 `required_evidence` 只能**叠加**在基线上。
  审批有效性在 Cloud 语义下为「非 STALE」（Cloud 无文件内容可做 hash 绑定，批准记录为 UNBOUND）。
- **风险推导**：`assessRisk({ task: task.title, files: snapshotFiles, declared: args.declared, config })`；仅当 `level` 高于当前 `riskLevel`（用 `highestRisk` 语义）时更新任务。
- **任务 id 生成**：`TASK-<14 位时间戳>-<uuid 前 8 位>`（与 Local 格式近似，Cloud 无 rootDir 时间戳来源）。
- **字段助手**：`fieldOf` 风格集中 `??`（STD-CQ-001 经验）；参数校验统一走 `requireString(args, field)` 风格助手。
- **模板**：`getTemplate(id, version)` 返回 null → `template_not_found`（附可用示例 id 列表，便于模型自愈）。
- **无本机项目 IO**：命令层不 import `node:fs` / `node:child_process`（AC-012）。

### C3 风险与回滚

| 风险 | 处置 |
|---|---|
| Cloud 完工松于 Local | 严格证据校验 + critical 需 approval + 不足拒绝 + 状态不变断言（AC-009/AC-010） |
| 工具自判结果 | 判定只来自纯引擎与端口数据；无“成功后补数据”路径 |
| 破坏 frozen tools | 不新增工具名；`tools/list` 与 `MCP_TOOLS` 严格相等（AC-001） |
| 常量上移影响 Local | `approvals.mjs` 行为不变 + 既有审批单测保持通过 |
| 复杂度告警 | 分发表 + 助手；单函数决策点 ≤12 |

**回滚**：删除 `bin/cloud-commands.mjs`、还原 `cloud-application.mjs` 与 `contracts/approvals` 常量位置、删除新增用例即可（Local 与 D06-D11 行为不变）。
