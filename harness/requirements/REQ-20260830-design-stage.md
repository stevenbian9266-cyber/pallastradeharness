# 需求文档 REQ-20260830-design-stage.md

> 对应 PRD：`docs/prd/other/PRD-20260830-other-编程环节设计产物治理-design-stage.md`
> Task: TASK-20260830140023-f4011735 / Gate: GATE-2026-08-30T14-00-35
> 对应设计文档：`harness持续治理机制设计(1).md` §19 深化（PRD 确认后 → 设计阶段 → 编程）

---

## Step 0：跨层搜索（独立仓结构层）

| 层 | 搜索路径 | 关键词 | 找到的文件 | 是否满足需求？ |
|---|---|---|---|---|
| bin | `bin/` | feature gate check, verifier, 冒号子命令, completeVerificationGate, glob | `bin/config-loader.mjs`（BASE_CHECK_DEFS.feature + getGateChecks 条件检查范式 + verifiers）、`bin/harness.mjs`（`cmd.startsWith('baseline:')` 冒号套路 + verify 分发）、`bin/evidence.mjs`（completeVerificationGate baseline/coverage/visual 自动满足范式）、`bin/glob-utils.mjs`、`bin/ac-trace.mjs`（表格/正文解析范式） | ✅ 全部复用点已定位 |
| presets | `presets/` | — | 框架预设 | 不涉及 |
| templates | `templates/` | prd 模板 | `templates/prd/`（PRD 模板可插拔机制） | ✅ designs 模板沿用同机制 |
| rules | `rules/` | — | — | 不涉及 |
| docs | `docs/` | commands, getting-started | `docs/commands.md`、`docs/getting-started.md` | ⚠️ 需同步 |
| 根 | `CHANGELOG.md` | Unreleased | 已有 P0-P4 记录 | ⚠️ 需追加 P5 |

### 搜索结论

- feature gate 基础检查在 `BASE_CHECK_DEFS.feature`（config-loader）；条件检查（coverage-gate/visual-regression/baseline-gate）在 `getGateChecks` 追加——设计检查项应插在 `user-confirmed` 之后（preparation）。
- `reuse-adherence-gate` 完全复用 `baseline-gate` 范式：配置启用 → gate 加 verification 检查 → evidence.mjs 由新鲜 `verifierId==='reuse-adherence'` 证据自动满足。
- `design:scan` 用 `cmd === 'design' || cmd.startsWith('design:')` 冒号套路；glob 复用 `glob-utils.mjs`。
- 模板可插拔：`templates/designs/*.md` 内置；项目可用 `docs/designs/_TEMPLATE*` 覆盖（对齐 PRD 模板机制）。

---

## Step 1：Skill 文件咨询

| Skill 文件 | 状态 | 关键结论引用 |
|---|---|---|
| `skills/harness-prd/SKILL.md` | ✅ 已读 | PRD 工作流：一句话 → PRD → 用户确认 → gate → 实施 → AC↔测试映射 |
| `skills/harness-docs/SKILL.md` | ✅ 已读 | 代码变更后同步知识文档；更新后跑 `docs:check` |
| `skills/harness-test/SKILL.md` | ✅ 已读 | 验证器证据满足 verification gate 的范式 |

---

## 需求标题

编程环节设计产物治理（design stage）：PRD 确认后强制产出 UI/交互/视觉/技术方案，技术方案强制现状识别 + 复用决策矩阵。

## 任务类型

功能优化（引擎仓 self-dogfood：补齐"PRD 确认 → 设计阶段 → 编程"的治理闭环）。

## 需求描述

1. **`templates/designs/`** 4 个模板：`ui.md`（页面/组件树/数据流）、`interaction.md`（流程/状态机/反馈/边界/a11y）、`visual.md`（设计令牌引用/组件视觉/响应式/一致性声明）、`tech-design.md`（Part A 现状识别 4 节 + Part B 复用决策矩阵 + Part C 实施落点）。
2. **feature gate 设计检查项**（preparation，插在 `user-confirmed` 之后，`config.designStage.enabled` 时启用）：`create-ui-doc` / `create-interaction-spec` / `create-visual-spec` / `create-tech-design` / `tech-design-has-baseline` / `tech-design-has-reuse-matrix` / `design-confirmed`（WAIT）。
3. **`bin/design-scan.mjs`**：`harness design:scan --scope business|data|code|all` → 现状结构化 JSON（业务模块 / 数据模型+字段 / 公共符号+位置）。
4. **`bin/reuse-adherence.mjs`**：解析 tech-design.md 复用矩阵 → 静态校验四类决策（调用已有/扩展已有/新封装公用/新建局部）→ pass/fail/warning（warning 不阻断）。
5. **接线**：`reuse-adherence` 验证器 + `reuse-adherence-gate`（verification，启用时）；`config.designStage`（enabled/designsDir）。

## 验收标准（AC，与 PRD 一致）

| AC | 描述 | 测试位置 |
|---|---|---|
| AC-001 | templates/designs/ 4 模板存在，tech-design 含 Part A/B/C | design-scan.test / 文件存在断言 |
| AC-002 | feature gate 含 7 设计检查项且顺序正确；enabled=false 不含 | config-loader 用例 |
| AC-003 | design:scan --scope code 输出导出符号+文件 | design-scan.test |
| AC-004 | design:scan --scope data 输出模型/字段 | design-scan.test |
| AC-005 | reuse-adherence 四类决策 pass/fail/warning 判定 | reuse-adherence.test |
| AC-006 | enabled 时 gate 含 reuse-adherence-gate | config-loader 用例 |
| AC-007 | reuse-adherence-gate 由验证器证据自动满足 | evidence 用例 |

## 文档同步清单

- `docs/commands.md`、`docs/getting-started.md`、`README.md`、`CHANGELOG.md`（Unreleased + 测试数）。
