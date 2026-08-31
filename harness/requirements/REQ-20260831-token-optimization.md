# 需求文档 REQ-20260831-token-optimization.md

> 对应 PRD：`docs/prd/other/PRD-20260831-other-引擎-harness-token-优化.md`
> Task: TASK-20260831131453-aa8e1a26 / Gate: GATE-2026-08-31T13-15-00
> 依据：`RESEARCH-20260831-harness-token-optimization.md` §6（引擎侧可实施项）

---

## Step 0：跨层搜索（独立仓结构层）

| 层 | 搜索路径 | 关键词 | 找到的文件 | 是否满足需求？ |
|---|---|---|---|---|
| bin | `bin/` | gate 创建/status/clear、getGateChecks、task list、collectMetrics、PRD 内置模板 | `bin/harness.mjs`（gate/gate:status/gate:clear/metrics 分发）、`bin/config-loader.mjs`（BASE_CHECK_DEFS / DESIGN_STAGE_CHECKS / getGateChecks / DEFAULT_CONFIG）、`bin/task-orchestrator.mjs`（listCommand）、`bin/metrics.mjs`（collectMetrics）、`bin/docs-gen.mjs`（BUILTIN_PRD_TEMPLATE） | ✅ 全部定位 |
| presets | `presets/` | token/输出 | skill-catalog / skills 模板 | 不涉及（无 gate 输出逻辑） |
| templates | `templates/` | prd 模板 | `templates/prd/_TEMPLATE.md`（需精简） | ✅ 需改 |
| rules | `rules/` | token/输出 | base-standards / base-anti-patterns | 不涉及 |
| docs | `docs/` | gate:status / metrics / commands | `docs/commands.md`、`docs/getting-started.md`、`docs/getting-started.en.md` | ⚠️ 需同步 |
| 根 | `CHANGELOG.md` | Unreleased | 发布记录 | ⚠️ 需追加 |

### 搜索结论

- gate 创建输出在 `bin/harness.mjs`（`cmd === 'gate'` 分支）；`gate:status`/`gate:clear` 为独立分支。
- check 集合生成集中在 `getGateChecks(config, taskType)`（config-loader），是 disableChecks / designStage auto 的落点。
- `task list` 在 `task-orchestrator.mjs` 的 `listCommand`，默认全量输出。
- `harness metrics` 在 `metrics.mjs` 的 `collectMetrics`，当前只有计数/时间戳，无产物文档统计。
- PRD 内置模板有两处：`templates/prd/_TEMPLATE.md` + `docs-gen.mjs` 的 `BUILTIN_PRD_TEMPLATE`，需同步精简。

---

## Step 1：Skill 文件咨询

| Skill 文件 | 状态 | 关键结论引用 |
|---|---|---|
| `skills/harness-prd/SKILL.md` | ✅ 已读 | PRD 工作流：一句话 → PRD → 用户确认 → gate → 实施 → AC↔测试映射；模板 `docs/prd/_TEMPLATE.md` |
| `skills/harness-docs/SKILL.md` | （默认已按规范执行） | 代码变更后同步 README/docs；更新后跑 `docs:check` |

---

## 需求标题

harness 引擎 token 优化（输出精简 + 能力分级）：gate 输出精简、task list 裁剪、PRD 模板精简、designStage auto、disableChecks、output 配置段、metrics token 统计。

## 任务类型

功能优化（引擎仓 self-dogfood，无 UI 关键词 → 本任务即 designStage auto 的受益场景）。

## 需求描述

1. **gate 输出精简**（`bin/harness.mjs`）：`gate --quiet` 只输出计数+提示；`gate:status --short` 单行；`gate:clear` 回显精简。
2. **task list 裁剪**（`bin/task-orchestrator.mjs`）：默认最近 20 条 + `--all` + `--status <status>` 过滤。
3. **PRD 模板随包精简**（`templates/prd/_TEMPLATE.md` + `docs-gen.mjs` BUILTIN）：删除 ⚠️ 示例/说明块，保留结构骨架。
4. **designStage 分级**（`bin/config-loader.mjs`）：`enabled: 'auto'` + `uiKeywords`；auto 模式按任务描述命中关键词决定是否插入设计检查（含 reuse-adherence-gate）。
5. **check 可配置化**（`bin/config-loader.mjs`）：`gates.disableChecks.<taskType>` 禁用内置 check（默认空；`verify-test` 不可禁用；`search-*` 不参与禁用）。
6. **output 配置段**（`bin/config-loader.mjs` DEFAULT_CONFIG）：`output.gateListVerbose` / `output.taskListDefaultLimit` / `output.requireSkillRead`，默认值=现状。
7. **metrics token 统计**（`bin/metrics.mjs`）：每任务 PRD/REQ/designs 产物计数 + 字节 + token 估算（保留隐私：无路径/内容）。

## 验收标准（AC，与 PRD 一致）

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

## 文档同步清单

- `docs/commands.md`、`docs/getting-started.md`、`README.md`、`CHANGELOG.md`（Unreleased + 测试数）。
