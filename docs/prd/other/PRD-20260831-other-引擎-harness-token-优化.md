# PRD-20260831-other-引擎-harness-token-优化

| 元数据 | 值 |
|---|---|
| 状态 | approved |
| 创建日期 | 2026-08-31 |
| 来源 | 优化：harness 引擎 token 优化（输出精简+能力分级） |
| 分类 | other |
| 需求类型 | 优化迭代 |

## 1. 背景与目标

- **一句话需求原文**：结合 `RESEARCH-20260831-harness-token-optimization.md`，对 pallastradeharness 引擎进行优化，在确保监督和约束机制（gate、跨层搜索、反模式拦截、证据验证、知识同步、危险操作拦截）的前提下节省 token。
- **背景**：接入 harness（1.7.0 → 1.8.0）后 AI 编码会话 token 消耗明显增多（估算 3-5 倍）。实测大头 = 每会话固定注入 + AI 读写的文档量 + 任务流程产物 + 命令输出。宿主侧（PallasTrade 仓）优化已于 2026-08-31 实施，本 PRD 仅落地引擎侧可移植优化（研究文档 §6）。
- **目标**：在不削弱约束监督的前提下，实现引擎侧输出精简与能力分级，让普通任务 gate 检查数可配置降档、命令输出默认裁剪、token 消耗可量化回归。
- **成功指标**：研究文档 §7 阶段 D1/D2 全部落地；`node --test` 全量通过；文档同步（README/docs/CHANGELOG）无漂移。

## 2. 用户故事 / 场景

- 作为 AI 编码代理，我希望 `gate`/`gate:status`/`task list` 输出默认更精简，以便每个会话少读几 KB 重复文本。
- 作为轻档项目维护者，我希望通过配置关闭非必要内置 check（如 PRD 工作流），以便轻任务不背重流程。
- 作为非 UI 项目维护者，我希望 `designStage.enabled='auto'` 只在任务命中 UI 关键词时强制设计文档，以便后端任务不产出无意义的设计档。
- 作为治理负责人，我希望 `harness metrics` 能统计每个任务的产物文档数与体积（token 估算），以便优化效果可量化、可回归。

## 3. 功能需求（FR）

- FR-001：`harness gate` 支持 `--quiet`，只输出 check 计数与必读提示（默认全量保留）。
- FR-002：`harness gate:status` 支持 `--short`，单行输出状态。
- FR-003：`gate:clear` 回显精简（变更项 + 剩余计数 + 未清项 id，不重复输出 check 描述）。
- FR-004：`task list` 默认只显示最近 20 条，`--all` 全量，`--status <status>` 过滤。
- FR-005：`config.gates.disableChecks` 允许项目按任务类型禁用内置 check（默认空 = 约束零变化，`verify-test` 不可禁用）。
- FR-006：`config.designStage.enabled` 支持 `'auto'`：任务描述命中 `uiKeywords` 才插入设计检查，否则跳过。
- FR-007：`config.output` 提供 `gateListVerbose` / `taskListDefaultLimit` / `requireSkillRead` 输出级可调项（默认保守保兼容）。
- FR-008：`harness metrics` 输出每任务产物文档数（PRD/REQ/designs）与 token 估算，供量化回归。
- FR-009：PRD 内置模板随包精简（`templates/prd/_TEMPLATE.md` + `docs-gen.mjs` 内置模板）。

## 4. 非功能需求（NFR）

- 默认行为与 1.8.0 完全一致（所有新配置默认值 = 现状）。
- 不削弱约束：`verify-test` 仍证据控制；`search-*` 跨层搜索 check 不可禁用；反模式/证据/知识同步机制不动。

## 5. 验收标准（AC，与测试一一映射）

| AC | 描述 | 测试位置 |
|---|---|---|
| AC-001 | gate --quiet 不输出 check 列表但写 gate 文件 | cli-e2e / 单元 |
| AC-002 | gate:status --short 单行输出且退出码语义不变 | cli-e2e |
| AC-003 | gate:clear 回显含计数与剩余 id | cli-e2e |
| AC-004 | task list 默认 ≤20 条、--all 全量、--status 过滤 | task-orchestrator.test |
| AC-005 | disableChecks 生效且 verify-test 不可禁用 | config-loader.test |
| AC-006 | designStage auto 模式按 uiKeywords 决定是否插入设计检查 | design-scan.test |
| AC-007 | output 配置默认值=现状（gateListVerbose true 等） | config-loader.test |
| AC-008 | metrics 输出每任务产物统计与 token 估算 | metrics.test |
| AC-009 | 内置 PRD 模板精简（无 ⚠️ 示例说明块） | docs-gen / 文件断言 |

## 6. 技术影响

- 涉及文件：`bin/harness.mjs`、`bin/config-loader.mjs`、`bin/task-orchestrator.mjs`、`bin/metrics.mjs`、`bin/docs-gen.mjs`、`templates/prd/_TEMPLATE.md`。
- 涉及测试：`bin/config-loader.test.mjs`、`bin/design-scan.test.mjs`、`bin/metrics.test.mjs`、`bin/task-orchestrator.test.mjs`、`bin/cli-e2e.test.mjs`、`bin/docs-gen.test.mjs`（如存在）。
- 影响面：无破坏性变更；全部新增能力默认关闭/默认值=现状。

## 7. 测试计划

- 新增/更新：config-loader.test（disableChecks / output / auto 判定）、metrics.test（产物统计）、task-orchestrator.test（list 裁剪）、cli-e2e（--quiet / --short）。
- 覆盖 AC 映射：AC-001~AC-009 → 上述测试文件。
- 全量回归：`node --test bin/*.test.mjs`。

## 8. 文档同步清单（知识同步门）

- `README.md`、`docs/commands.md`、`docs/getting-started.md`（新命令/flag）、`CHANGELOG.md`（Unreleased）。
