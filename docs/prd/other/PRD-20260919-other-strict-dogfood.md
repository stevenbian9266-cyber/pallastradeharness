# PRD — 本仓启用 strict 严格治理 self-dogfood（strictGovernance=true + 生命周期补 impact + CLI 阻断验证）

> **状态**：approved（授权：用户「自主决定」+「选最优方案，不要临时的」）
> **创建**：2026-09-19 ｜ **分类**：other（治理元变更）｜ **任务**：TASK-20260919113354-6b2096bb
> **关联**：`docs/current-governance-baseline.md` · `docs/adr/ADR-0002-runtime-boundary.md`（附注：本仓 strict 延后项）· `skills/harness-prd/SKILL.md`

## 1. 背景

pallastrade-harness 的定位是「**本仓即试验田**」：仓库承诺"每一次变更都走引擎自己的治理"（`AGENTS.md` 开篇）。但事实是：

1. 本仓 `harness.config.mjs` **未声明** `governance.strictGovernance`，引擎默认 `false` → `task finish` 走兼容路径（不校验事实门），本仓**从未真正 dogfood 严格治理**。
2. Batch C（C12/C14）交付了事实门与严格收尾：`strictGovernance=true` 时 `finish_task` 不得补造事实，缺失项以 `REQUIRED_ACTIONS`（含可执行命令）输出——**该能力只有单元测试覆盖（`bin/fact-gates.test.mjs`），没有一次真实 CLI 闭环**。
3. 严格收尾的必需事实之一是 `task.impact`（Architecture / Tech Stack Impact），而 `AGENTS.md` §2 的强制生命周期**没有 `task impact` 这一步**，用户面文档（README / getting-started / commands）也从未记载——即"开了 strict 就会卡住"的断链风险。

结论：本仓当前处于"**声称 dogfood、实则跑兼容路径**"的不一致状态。本 PRD 将其改为真实一致，并用真实 CLI 证明严格治理**既能阻断、也能放行**。

## 2. 目标

- **G1**：本仓声明并长期运行严格治理（`harness.config.mjs` → `governance.strictGovernance: true`）。
- **G2**：补齐生命周期断链——`task impact`（架构/技术栈影响评估）进入强制步骤，并被文档化（AGENTS.md + 用户面文档）。
- **G3**：以真实 CLI e2e 证明严格治理闭环：**缺事实 → 阻断（REQUIRED_ACTIONS）→ 补齐事实 → 放行（completed）**。
- **G4**：本仓声明有测试守卫，防止被静默改回非严格（防回退）。
- **G5**：Local 兼容路径（未声明 strict 的项目）**行为零变化**。

成功指标：`node --test bin/*.test.mjs` 全绿；新增 e2e 覆盖上述 AC；`docs:check` / `doc-impact` 全绿；本任务自身在 strict 生效后仍走完整流程并 `completed`（自证）。

## 3. 用户场景

**场景 A（正常）**：维护者在本仓接到需求 → `task start` → context → gate → 实施 → 记录 `task impact` → 证据齐备 → `task finish` 一次性通过。

**场景 B（边界）**：维护者忘记 `task impact` / `brain context` → `task finish` **立刻被阻断**，输出 `REQUIRED_ACTIONS` 逐项给出可执行命令（不是模糊报错），照做即可放行。

**场景 C（异常/误配）**：有人把本仓配置改回 `false`（或删除声明）→ 守卫测试立即失败，变更无法通过 `test:core`。

**场景 D（消费方）**：下游项目**未**声明 strict → 收尾仍走兼容路径，不受本变更影响。

## 4. 功能需求

- **FR-001**：`harness.config.mjs` 声明 `governance: { strictGovernance: true }`，并注释说明语义与后果（缺事实 → `REQUIRED_ACTIONS`）。
- **FR-002**（守卫）：`test:core` 中存在断言「本仓配置声明严格治理」的测试，防止静默回退。
- **FR-003**（生命周期）：`AGENTS.md` §2 强制生命周期加入 `task impact --architecture <v> --tech-stack <v>` 步骤，并说明严格治理语义。
- **FR-004**（用户面文档）：`README.md` / `docs/getting-started.md` 记载如何启用严格治理（配置键、两种写法、`task impact` 步骤、`REQUIRED_ACTIONS` 语义）。
- **FR-005**（CLI 闭环验证）：`bin/cli-e2e.test.mjs` 新增 e2e：
  1. strict 配置下未记录事实 → `task finish` 退出码非 0、输出 `REQUIRED_ACTIONS`、含 `context_audit` / `architecture_impact` / `tech_stack_impact` / `review` / `knowledge`，任务状态保持 `implementing`；
  2. 记录 `task impact` + `brain context` + 注册验证器证据 + review/knowledge 并 `evidence verify` → `task finish` 成功；
  3. 默认（非 strict）配置下同一场景**不**出现 strict 阻断。
- **FR-006**（文档一致性）：`docs/current-governance-baseline.md` 与 `docs/roadmap.md` 反映"本仓已启用 strict"这一现状。
- **FR-007**（影响评估语义）：`task impact` 的 CHANGE 级（`ARCHITECTURE_CHANGE` / `TECH_STACK_CHANGE`）必须伴随 Decision，否则拒绝——本任务须按此规则记录自身 impact。

## 5. 非功能需求

- **不改引擎实现**：本任务不新增/修改 `bin/` 引擎实现模块（只扩展测试）；严格收尾实现（`fact-gates.mjs` / `task-orchestrator.mjs`）复用既有能力。
- **零新增依赖**：`package.json` 依赖面不变。
- **可回退**：回退 = 删除 `harness.config.mjs` 中的声明（守卫测试会同时失败，提示这是有意变更、需走治理）。
- **诚实性**：不允许"绕过 strict"的临时手段（如伪造 impact、跳过证据）。

## 6. 验收标准（AC）

| AC | 内容 | 判定方式 |
|---|---|---|
| AC-001 | 本仓配置声明 `governance.strictGovernance === true` | 守卫用例（读仓库 `harness.config.mjs`） |
| AC-002 | strict + 缺事实 → `task finish` 退出码非 0，输出 `Strict finish blocked — REQUIRED_ACTIONS` 且含 `context_audit`/`architecture_impact`/`tech_stack_impact`/`review`/`knowledge`，任务状态不变 | e2e「阻断」用例 |
| AC-003 | 补齐事实（context + impact + 验证器证据 + review/knowledge + `evidence verify`）后 `task finish` 成功（`completed`） | e2e「放行」用例 |
| AC-004 | `task impact --architecture ARCHITECTURE_CHANGE` 无 Decision 被拒；带 `--decision` 成功并写入 `task.impact` | e2e「影响评估」用例 |
| AC-005 | 默认（非 strict）配置下同场景无 strict 阻断（输出为证据类失败原因） | e2e「兼容路径」用例 |
| AC-006 | `AGENTS.md` §2 生命周期含 `task impact`，且文档声明严格治理 | 守卫用例（读 `AGENTS.md`） |

## 7. 架构 / 技术影响

- **架构影响**：`LOCAL` —— 仅本仓配置 + 文档 + 测试；引擎模块结构与依赖面不变（无新模块、无跨模块接线）。
- **技术栈影响**：`NONE` —— 无依赖变更（零依赖策略维持）。
- **治理影响**：**治理模式变更**（本仓由兼容路径切到严格路径），属关键风险路径 → 引擎将任务风险推导为 `critical`（需 recovery + 审批证据）。

## 8. 测试计划

1. 新增 e2e（`bin/cli-e2e.test.mjs`，复用既有 `run`/`git` 脚手架，不复制助手）：覆盖 AC-001/AC-002/AC-003（含 AC-004 路径）/AC-005/AC-006。
2. 全量回归：`node --test bin/*.test.mjs`。
3. 静态门：`docs:check` / `readme:sync --check` / `doc-impact --base origin/main` / `reuse-adherence`。
4. **自证**：本任务自身在 strict 生效后完成 `task finish`（"新的严格路径能跑通当前工作流"的活证明）。

## 9. 范围外

- 不把 strict 设为**所有项目的默认值**（新项目默认仍非严格；Cloud 恒严格是独立决策，见 ADR-0002 D5）。
- 不新增严格治理检查项或修改事实门集合（属引擎能力变更，另开任务）。
- 不处理 `docs/roadmap.md` 中其他后续候选（部署构件 / `review_diff` 提交内容通道）。
