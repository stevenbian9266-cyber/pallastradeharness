# REQ — Batch D D12：MCP 工具面兼容 + Project 能力

- **任务**：TASK-20260919105713-71812e8f（critical / feature）
- **PRD**：`docs/prd/other/PRD-20260919-other-batch-d-d12-mcp-compatibility.md`
- **上游**：指令文档 TASK-D12、`docs/rfc/0006-runtime-boundary.md` §4、`docs/adr/ADR-0002-runtime-boundary.md`

## Step 0 — 跨层检索（AGENTS.md §3）

| 层 | 检索词 | 命中 | 结论 |
|---|---|---|---|
| `bin/` | `project_init` / `project_status` / `record_approval` / `get_template` | **0** | 四个新能力为净新增（无同名 CLI/工具实现） |
| `bin/` | 可复用纯逻辑 | `risk-engine.assessRisk`（纯：输入 files/diff/declared/config）· `template-registry.getTemplate`（读随包 `templates/registry.json`）· `contracts.EVIDENCE_TYPES` · `fact-gates`（Local：rootDir 语义，不可直接复用）· `guide.nextAction`（Local：rootDir 语义） | 复用 `assessRisk` 与模板注册表；Local 版 guide/fact-gates 不可直接复用，Cloud 侧按端口状态重建 |
| `bin/` | `APPROVAL_TYPES` | 仅 `approvals.mjs` 声明与自用（1 处引用） | 可安全上移到 `contracts.mjs`（纯）实现单点化 |
| `bin/command-registry.mjs` | 工具元数据 | 每个命令带 `mcp { exposure: full/readonly/excluded/deferred, tier, tool, action }`；`FROZEN_MCP_TOOL_NAMES`(36) | 复用冻结名单；D12 保持独立 Tool 形态（与 Local `MCP_TOOLS` 一致），不引入新 Action 层 |
| `presets/` · `templates/` · `rules/` | 新工具关键词 | 1（模板文本提及 record_approval） | 无实现 |
| `docs/` | 新工具关键词 | 2（RFC-0006 / 指令文档） | 仅设计 |

**重复实现检查（AP-SEARCH-1/2/3）**：不存在第二套工具引擎；Cloud 复用同一 MCP 协议层与同一结果信封，仅新增命令实现。

## Step 1 — Skill 咨询

| Skill | 关键结论 | 落地 |
|---|---|---|
| `harness-standards-audit` | 决策点 ≤12（`??` 的第二个 `?` 计 1）；跨文件重复块 STD-CQ-002；异常路径必须显式 | 命令层每个 handler 保持小函数；分发表 + 助手（`fieldOf` 风格）；未实现/不足场景显式 `toolError` |
| `harness-docs` | 引擎变更必须同步 README / CHANGELOG | 收尾跑三门 |
| `harness-skill-author`（约定） | 领域常量单一来源 | `APPROVAL_TYPES` 上移 `contracts.mjs`，`approvals.mjs` 复用 |

## Step 2 — 复用决策摘要

- **调用已有**：`assessRisk` · `getTemplate` · `EVIDENCE_TYPES` · `MCP_TOOLS` · `toolError`/`content` · `createSqliteRepositories` · `createBoundaryEvidenceRepository` · `APPROVAL_TYPES`（上移后）。
- **扩展已有**：`contracts.mjs` 新增 `APPROVAL_TYPES`；`approvals.mjs` 改为复用；`cloud-application.mjs` 改为装配 + 分发表。
- **新封装公用**：`createCloudCommands` 及其 handler 集（`start_task`/`gate_status`/`record_approval`/`project_init`/`project_status`/`get_template`/`get_next_action`/`risk_check`/`finish_task`）。
- **新建局部**：`DEFAULT_REQUIRED_EVIDENCE`、`CLOUD_NEXT_ACTIONS`（仅命令层内部使用）。

## Step 3 — 需求与验收

FR-001~FR-013、AC-001~AC-012 见 PRD §4/§6（不在本 REQ 重复维护）。

## Step 4 — 风险与缓解

| 风险 | 缓解 |
|---|---|
| Cloud `finish_task` 松于 Local（治理退化） | 严格证据校验 + critical 需 approval + 不足即拒绝 + 状态不变断言（AC-009） |
| 工具自行判定业务结果 | 风险等级只来自 `assessRisk`；完成与否只来自证据齐备判定；两者均无「成功后自动补数据」 |
| 破坏 frozen tools | `tools/list` 与 `MCP_TOOLS` 严格相等（AC-001，D10 断言保持） |
| Cloud 引入 fs 依赖链 | 命令层静态断言（AC-012）；模板注册表为随包资源 |
| 复杂度告警 | 分发表 + 助手；`??` 集中到 `fieldOf` 类助手 |

## Step 5 — 验证计划

1. `node --test bin/cloud-runtime.test.mjs`（含新增 D12 用例）
2. `npm run test:core`（456 基线 + 新增）
3. `docs:check` / `readme:sync --check` / `doc-impact --base origin/main`
4. `reuse-adherence` 验证器 + `supervise diff`（既定 package-lock 例外 + STD-API-001 误报）
