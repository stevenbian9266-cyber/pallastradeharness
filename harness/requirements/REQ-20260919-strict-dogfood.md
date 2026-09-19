# REQ — 本仓启用 strict 严格治理 self-dogfood（strictGovernance=true + 生命周期补 impact + CLI 阻断验证）

> Task: TASK-20260919113354-6b2096bb ｜ PRD: `docs/prd/other/PRD-20260919-other-strict-dogfood.md` ｜ Gate: GATE-2026-09-19T11-34-04
> 风险等级：critical（治理模式变更命中关键风险路径）

## Step 0 — 跨层检索（AGENTS.md §3）

| 层 | 检索词 | 命中 | 结论 |
|---|---|---|---|
| `bin/` | `strictGovernance` | `fact-gates.mjs:23`（`strictGovernanceEnabled`）· `task-orchestrator.mjs:294`（`finishCommand` strict 分支） | **能力已存在**，本任务不新增引擎实现 |
| `bin/` | `evaluateStrictFinish` | `fact-gates.mjs:79`（12 项事实检查 + `REQUIRED_ACTIONS`） | **复用**（只补 CLI 级证据） |
| `bin/` | `task impact` | `task-orchestrator.mjs:330`（`impactCommand`，CHANGE 级需 Decision） | **复用**（补进强制生命周期） |
| `bin/` | CLI e2e 脚手架 | `cli-e2e.test.mjs`（`run` / `git` 助手 + 临时项目 + 真实 gate 流转） | **复用**（扩展本文件，不新建重复助手） |
| `presets/` | `strict` | 0（`single`/`monorepo`/`nextjs`/`rails` 只定义 `docImpact`） | 新项目默认仍**非严格**（本任务不改默认） |
| `templates/` | `strict` | `templates/constitution/agent-rules.md:72`（已记载 strict 语义与 `REQUIRED_ACTIONS`） | **文档已存在**，缺的是本仓运行面文档 |
| `rules/` | `strict` | 0（`base-standards.json` 仅 `knowledgeImpact` 字段） | 无 |
| `docs/` | `task impact` | 仅历史 design/PRD（`docs/designs/TASK-20260919084823-c0b3bcb3/interaction.md` 等） | **用户面文档缺口** → 本任务补 README/getting-started/AGENTS |
| `docs/` | `strictGovernance` | `docs/current-governance-baseline.md:177`（默认 false；Cloud 强制 true） | 需更新为"本仓已启用" |

## Step 1 — Skill 咨询

| Skill | 关键结论 | 落地 |
|---|---|---|
| `harness-prd` | 一句话需求 → 完整 PRD（背景/目标/FR/AC/测试计划）→ 用户确认 → 实施 → `prd verify` | 本 REQ 的 PRD 已按模板扩充；收尾跑 `prd verify --id` 校验 AC↔测试映射 |
| `harness-docs` | 代码/配置变更必须同步受影响知识文档，`doc-impact` 放行 + `docs:check` 断链校验 | README / getting-started / baseline / roadmap / CHANGELOG 同步 |
| `harness-standards-audit` | 规范/事实变更需可证据化（authority + evidence 字段） | 严格治理的"权威文件"= `bin/fact-gates.mjs`；证据 = e2e 退出码与输出 |
| `harness-skill-author` | 概念先行、陷阱具体 | 文档写"开了 strict 会卡在哪、怎么解"，不做泛泛描述 |

## Step 2 — 复用决策摘要

| 能力需求 | 决策 | 目标 |
|---|---|---|
| 严格收尾判定 | 调用已有 | `evaluateStrictFinish`（`bin/fact-gates.mjs`） |
| strict 开关判定 | 调用已有 | `strictGovernanceEnabled`（`bin/fact-gates.mjs`） |
| 影响评估记录 | 调用已有 | `task impact`（`bin/task-orchestrator.mjs`） |
| CLI 端到端脚手架 | 调用已有 | `run` / `git`（`bin/cli-e2e.test.mjs`） |
| 本仓 strict 声明 | 新配置声明 | `harness.config.mjs`（`governance.strictGovernance: true`） |
| 阻断/放行 e2e | 新封装公用 | 新用例（`bin/cli-e2e.test.mjs`） |

## Step 3 — 需求与验收

- FR-001/002 → **AC-001**（配置声明 + 守卫测试）
- FR-005.1 → **AC-002**（阻断：`REQUIRED_ACTIONS` + 状态不变）
- FR-005.2 → **AC-003**（补齐事实后放行：`completed`）
- FR-007 → **AC-004**（CHANGE 级 impact 需 Decision）
- FR-005.3 / G5 → **AC-005**（非 strict 兼容路径零变化）
- FR-003/004/006 → **AC-006**（文档含 `task impact` 且声明严格治理）

## Step 4 — 风险与缓解

| 风险 | 缓解 |
|---|---|
| 开启 strict 后本仓自身流程被卡死（无法完成日常任务） | 本任务**自证**：在 strict 生效后完成自身收尾；`REQUIRED_ACTIONS` 每项带可执行命令 |
| 声明被静默改回非严格（回归为"假 dogfood"） | AC-001 守卫用例进 `test:core` |
| 只改配置不给文档 → 使用者/Agent 反复被阻断 | AC-006 + README/getting-started 明确步骤 |
| 误把 strict 变成全局默认，影响下游项目 | 范围外声明：不改 `presets/` 与 `DEFAULT_CONFIG`；AC-005 断言兼容路径不变 |
| 影响评估被随意标 `NONE` 以绕过 | 任务自身按真实级别记录（`LOCAL`/`NONE` + reason），并在 review 证据中说明判定依据 |

## Step 5 — 验证计划

1. `node --test bin/cli-e2e.test.mjs`（新增用例，覆盖 AC-001..AC-006）
2. `npm run test:core`（全量回归，含既有 `fact-gates` / `task-orchestrator` 单测）
3. `node bin/harness.mjs prd verify --id PRD-20260919-other-strict-dogfood`（AC↔测试映射）
4. `docs:check` / `readme:sync --check` / `doc-impact --base origin/main` / `reuse-adherence`
5. 自证：`task impact` → `task finish`（strict 生效下通过）

## Step 6 — 文档同步清单

| 文档 | 更新内容 |
|---|---|
| `AGENTS.md` §2 | 强制生命周期加入 `task impact`；说明 strict 语义 |
| `README.md` | 「严格治理（strict）」小节：如何启用、阻断语义、`task impact` 步骤 |
| `docs/getting-started.md` | 同上（操作视角） |
| `docs/current-governance-baseline.md` | 本仓已启用 strict（默认值说明保留） |
| `docs/roadmap.md` | 批次状态新增 Batch E 行 + 后续候选更新 |
| `CHANGELOG.md` | `[Unreleased]` 条目 |
