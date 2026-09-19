# REQ — Batch D D13：Cloud Strict Governance 强制

- **任务**：TASK-20260919110529-abfac7d9（critical / feature）
- **PRD**：`docs/prd/other/PRD-20260919-other-batch-d-d13-cloud-strict.md`
- **上游**：指令文档 TASK-D13、`docs/rfc/0006-runtime-boundary.md` §5、`docs/adr/ADR-0002-runtime-boundary.md`

## Step 0 — 跨层检索（AGENTS.md §3）

| 层 | 检索词 | 命中 | 结论 |
|---|---|---|---|
| `bin/` | `strictGovernance` / `CLOUD_STRICT_GOVERNANCE` | `fact-gates.mjs`（Local：`strictGovernanceEnabled` + `evaluateStrictFinish`，**import node:fs / state-store → 不可进 Cloud 链**）；`task-orchestrator`（finish 分支） | 需新建纯策略模块承载 Cloud 语义 |
| `bin/` | `cloudStrictPolicy` / `assertCloudStrictGovernance` | 0 | 净新增 |
| `bin/` | Cloud 运行时守卫 | `cloud-application.mjs`（装配，可加守卫）· `cloud-commands.mjs`（`finish_task`，可加运行期复查）· `http-transport.mjs`（`/health`，可合并 info） | 扩展点已明确 |
| `presets/` · `templates/` · `rules/` | `strictGovernance` | presets/rules 0；templates 仅模板文本提及 | 无实现 |
| `docs/` | `strictGovernance` | RFC-0006 §5、ADR-0002 附注、指令 TASK-D13 | 仅设计 |

**重复实现检查（AP-SEARCH-1/2/3）**：不存在第二套 Cloud 策略实现；本批新增纯策略模块，Local 的 `strictGovernanceEnabled` 保持原样（仅键位对齐，逻辑不复制）。

## Step 1 — Skill 咨询

| Skill | 关键结论 | 落地 |
|---|---|---|
| `harness-standards-audit` | 决策点 ≤12；显式异常路径；安全规则对"静默降级"敏感 | 策略模块单函数单职责；守卫用显式 throw / toolError（不静默） |
| `harness-docs` | 引擎变更必须同步 README / CHANGELOG | 收尾跑三门 |
| `harness-skill-author`（约定） | 判定单一来源 | strict 结论只从 `cloudStrictPolicy` 取（装配/命令层不各自判断） |

## Step 2 — 复用决策摘要

- **调用已有**：`toolError`（`bin/mcp.mjs`）· `createCloudCommands`（D12）· `createHttpHandler`（D10）· `strictGovernanceEnabled`（仅测试中用于键位对齐断言）。
- **扩展已有**：`cloud-application.mjs`（装配守卫）· `cloud-commands.mjs`（运行期复查）· `cloud-runtime.mjs` + `http-transport.mjs`（暴露 `strictGovernance`）。
- **新封装公用**：`CLOUD_STRICT_GOVERNANCE` · `cloudStrictPolicy` · `assertCloudStrictGovernance` · `strictFlagDisabled`。
- **新建局部**：无（策略模块全部导出，便于装配/命令/测试共用）。

## Step 3 — 需求与验收

FR-001~FR-008、AC-001~AC-009 见 PRD §4/§6（不在本 REQ 重复维护）。

## Step 4 — 风险与缓解

| 风险 | 缓解 |
|---|---|
| Cloud 静默退回 legacy 自动流转 | 双层守卫（装配 fail-fast + 运行期复查）+ AC-008 全工具扫描回归 |
| 策略与 Local 键位漂移 | 复用同一键名（`strictGovernance` / `governance.strictGovernance`），AC-004 断言键位一致 |
| 误把 Local strict 实现搬进 Cloud 链 | 策略模块静态断言无本机 IO（AC-009）；Local `fact-gates` 不动 |
| 守卫让合法部署无法启动 | 仅"显式 false"触发；未配置视为 Cloud 强制严格（AC-001） |

## Step 5 — 验证计划

1. `node --test bin/cloud-policy.test.mjs bin/cloud-runtime.test.mjs`
2. `npm run test:core`（466 基线 + 新增）
3. `docs:check` / `readme:sync --check` / `doc-impact --base origin/main`
4. `reuse-adherence` 验证器 + `supervise diff`（既定 package-lock 例外 + STD-API-001 误报）
