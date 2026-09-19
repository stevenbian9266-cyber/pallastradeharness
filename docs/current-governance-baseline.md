---
layout: default
title: 当前治理基线（Current Governance Baseline）
---
# 当前治理基线

> **冻结时间**：2026-09-19 · **引擎版本**：1.10.0（`package.json#version` 为唯一产品版本事实源）
> **用途**：未来回归检查的对照基线（Batch A TASK-A04 产出）。
> **提取原则**：所有内容从当前源码提取，不重新定义产品。若源码与本文档不一致，以源码为准并更新本文档。
> **回归方法**：见文末「§9 回归校验命令」。

## 1. Task 状态机

来源：`bin/task-orchestrator.mjs`（`TERMINAL` / `TRANSITIONS`）、`bin/contracts.mjs`（`TASK_STATUSES`）

**状态集合（11）**：`draft` `planned` `approved` `implementing` `reviewing` `verifying` `completed` `paused` `blocked` `cancelled` `superseded`

**终态（TERMINAL，3）**：`completed` `cancelled` `superseded`

**允许迁移**：

| 当前状态 | 可迁移到 |
|---|---|
| `draft` | `planned` `cancelled` |
| `planned` | `approved` `implementing` `paused` `cancelled` `superseded` |
| `approved` | `implementing` `paused` `cancelled` `superseded` |
| `implementing` | `reviewing` `paused` `blocked` `cancelled` `superseded` |
| `reviewing` | `implementing` `verifying` `paused` `blocked` `cancelled` |
| `verifying` | `implementing` `completed` `blocked` `cancelled` |
| `paused` | `implementing` `cancelled` `superseded` |
| `blocked` | `implementing` `cancelled` `superseded` |
| `completed` / `cancelled` / `superseded` | （终态，无出边） |

**兼容语义（Local legacy，非 Strict）**：`finishVerifiedTask` 允许 `planned/approved → implementing → reviewing → verifying → completed` 的自动补链（`bin/task-orchestrator.mjs`）。该兼容行为**不是**新增事实来源，Cloud/Strict 模式必须另行收紧。

## 2. Gate 阶段与检查生命周期

来源：`bin/gate-lifecycle.mjs`、`bin/gate-commands.mjs`、`bin/config-loader.mjs`、`bin/design-check.mjs`、`bin/mcp.mjs`

**阶段（GATE_PHASES，4）**：`preparation` → `implementation` → `verification` → `finished`

推导规则：
- `implementationReady = preparation 全部 done`
- `cleared = preparation 全部 done 且 verification 全部 done`
- `phase = cleared ? finished : implementationReady ? implementation : preparation`

**check 相位**：显式 `check.phase`；否则 `verify-test` → `verification`，其余 → `preparation`。check 状态只有 `done` / 未完成（无 waived 状态）。

**内置检查项（按任务类型，`BASE_CHECK_DEFS`）**：

| 任务类型 | 基础 preparation 检查 |
|---|---|
| feature | `read-skill-customization` `read-skill-domain` `read-skill-prd` `create-prd-doc` `create-req-doc` `req-doc-has-skill-table` `user-confirmed`（+ designStage 生效时追加 7 项设计检查） |
| bugfix / audit / research | `read-skill-domain` |
| security | `read-skill-security` |
| style / docs / refactor / test | （无） |

所有类型统一追加：`search-<layer>`（跨层搜索，按 `config.layers`） + `verify-test`（verification，证据控制）。

**硬约束**：
- `verify-test` 不可手动清除、不可通过 `gates.disableChecks` 禁用；只能由新鲜类型化证据关闭（`harness evidence verify`）。
- human-WAIT 检查（`user-confirmed` `design-confirmed`）禁止通过 MCP 裸清（`HUMAN_WAIT_CHECKS`，RFC-0004 D5）。
- 设计检查中的机器校验项（`MACHINE_DESIGN_CHECKS`，6）：`create-ui-doc` `create-interaction-spec` `create-visual-spec` `create-tech-design` `tech-design-has-baseline` `tech-design-has-reuse-matrix`——`gate:clear` 时先跑机器校验，未通过拒绝。
- 项目级门禁期限（本仓 `harness.config.mjs`）：feature 48h · bugfix 24h · style 8h · 其余 24h。

## 3. MCP 公开工具面（L1，20 个）

来源：`bin/mcp.mjs`（`MCP_TOOLS`）、`bin/command-registry.mjs`（`FROZEN_MCP_TOOLS`，冻结 36 名）

```text
get_project_context  start_task        resume_task        get_applicable_standards
get_change_plan      risk_check        record_decision    record_evidence
review_diff          finish_task       generate_standards generate_skill
generate_docs        gate_create       gate_status        gate_clear
run_verifier         get_next_action   get_task           list_tasks
```

约定：
- 工具名已冻结（RFC-0004），变更须视为 breaking-change migration。
- 业务失败统一错误信封：`isError:true` + `{code, message, hint?, nextAction?}`。
- `record_evidence` 不暴露任意命令执行；`run_verifier` 只执行注册表白名单验证器。
- stdio 入口 `harness-mcp`（`--root` > `HARNESS_ROOT` > roots 协商 > cwd）；客户端接入配置由 `harness mcp:config` 生成（默认 spec = `<包名>@<major.minor>`，随 `package.json` 推导）。

## 4. Evidence 类型（11）

来源：`bin/contracts.mjs`（`EVIDENCE_TYPES`）

```text
command  test  build  screenshot  dom  log  database  review  approval  ui-approval  knowledge
```

证据必须绑定 HEAD/worktree/hash 才算「新鲜」；`verify-test` 只接受注册验证器（`bin/verifier.mjs`）产生的类型化证据。默认注册验证器：`unit`（`node --test **/*.test.mjs`）、`docs`、`coverage`、`baseline`、`reuse-adherence`（按项目配置覆盖/扩展；验证器定义变化会使旧证据失效）。

## 5. 风险等级（3）

来源：`bin/risk-engine.mjs`

| 等级 | 阶段（stages） | 必需证据 | 恢复计划 |
|---|---|---|---|
| `quick` | context → implementation → verification | `test` | 否 |
| `standard` | context → risk → standards → plan → implementation → review → verification → knowledge | `test` `review` `knowledge` | 否 |
| `critical` | context → risk → standards → design → approval → plan → implementation → review → verification → knowledge → recovery | `test` `review` `approval` `knowledge` | **必须** |

**评估输入（取最高）**：用户声明（declared）· 变更路径（`config.risk.criticalPaths` / `standardPaths`）· diff 语义（`CRITICAL_SEMANTICS`：破坏性 SQL 语句、批量删除操作、危险权限变更与强制推送、动态求值调用、密钥形态字面量——具体正则以 `bin/risk-engine.mjs` 为准）· 任务描述关键词（`CRITICAL_TOKENS` / `STANDARD_TOKENS`）。

**不变量**：风险只能升高不可隐式降低（`mergeRisk`，需 `--override` + `--reason` 显式降级）。

## 6. Standards 基线

来源：`rules/base-standards.json`、`rules/base-anti-patterns.json`、`bin/contracts.mjs`

- **机器可读规范**：28 条，覆盖 13 个类别（`STANDARD_CATEGORIES`）：architecture · technology-selection · code-quality · database · api · security · ui-style · interaction · accessibility · testing · documentation · knowledge · deployment
- **执行等级（ENFORCEMENT_LEVELS，6）**：documented · advisory · review-required · verified · blocking · critical
- **反模式规则（5）**：STARTER-001 inline style（warning）· STARTER-002 硬编码十六进制色（warning）· STARTER-003 console.log/debug（error）· STARTER-004 TODO/FIXME（warning）· STARTER-005 疑似密钥（error）
- 本仓加载路径：内置 bundles + `config.standards.sources` = `harness/standards/**/*.json`（本仓当前无项目级规范目录，使用内置基线）

标准 ID 清单（28）：

```text
STD-SCOPE-001  STD-GEN-001    STD-ARCH-001   STD-ARCH-002   STD-TECH-001
STD-CQ-001     STD-CQ-002     STD-DB-001     STD-TEST-001   STD-KNOW-001
STD-UI-001     STD-INT-001    STD-API-001    STD-SEC-001    STD-A11Y-001
STD-DOC-001    STD-DEPLOY-001 STD-DB-002     STD-DB-003     STD-API-002
STD-SEC-002    STD-UI-002     STD-INT-002    STD-A11Y-002   STD-KNOW-002
STD-REVIEW-001 STD-REVIEW-002 STD-REVIEW-003
```

## 7. 模板基线

> Batch B 后更新：模板体系已引入 **Template Registry**（此前为散落文件）。

### 7.1 Template Registry（Batch B 起）

来源：`templates/registry.json`（数据）+ `bin/template-registry.mjs`（读取/校验）+ `bin/contracts.mjs`（`Template` 契约）

- **API（5）**：`listTemplates` · `getTemplate(id[,version])` · `getLatestTemplate(id)` · `findTemplates(criteria)` · `validateTemplateRegistry()`
- **枚举**：categories 9（project / product / architecture / engineering / design / quality / operations / agent / task）· scopes 4（project / task / runtime / domain）· statuses 3（active / draft / deprecated）· owner_roles 7（product_manager / tech_lead / ux_designer / ui_designer / knowledge_owner / quality_owner / operations_owner）
- **TemplateDefinition 必填字段（11）**：template_id · version · category · scope · source_path · applies_to · required_when · owner_role · consumed_by · stale_when · status（+ 可选 `contract_path`）
- **注册范围（27 条）**：task-* ×5 · skill-template + skill-domain-* ×11 · ops-* ×2 · Constitution ×8
- **硬约束**：不扫描磁盘发现（单一数据文件）· 重复 `id+version` 必失败 · `source_path` / `contract_path` 必须真实存在 · 不依赖数据库 · 暂不通过 MCP 暴露

### 7.2 Constitution 模板（templates/constitution/）

| 模板 | 路径 | 机读契约 |
|---|---|---|
| Project Overview | `templates/constitution/project-overview.md` | — |
| Tech Stack | `templates/constitution/tech-stack.md` | `tech-stack.schema.json`（current_technologies / restrictions / change_policy） |
| Architecture | `templates/constitution/architecture.md` | `architecture.schema.json`（modules / dependency_rules / rules / severity） |
| ADR | `templates/constitution/adr.md` | 关联既有 `record_decision`（不建第二套 Decision Engine） |
| Engineering Standard | `templates/constitution/engineering-standard.md` | — |
| Testing Standard | `templates/constitution/testing-standard.md` | 内容权威源 = `presets/skills/testing.md`（避免两份测试真相） |
| Acceptance Standard | `templates/constitution/acceptance-standard.md` | — |
| Agent Rules | `templates/constitution/agent-rules.md` | — |

### 7.3 Task Runtime / Skill 模板

| 模板 | 路径 | 用途 |
|---|---|---|
| PRD | `templates/prd/_TEMPLATE.md` | PRD 骨架（`harness prd new`） |
| UI 设计 | `templates/designs/ui.md` | 设计阶段 UI 文档 |
| 交互设计 | `templates/designs/interaction.md` | 设计阶段交互文档 |
| 视觉设计 | `templates/designs/visual.md` | 设计阶段视觉文档 |
| 技术方案 | `templates/designs/tech-design.md` | 三段式（Part A 现状 / Part B 复用矩阵 / Part C 落点） |
| Skill（canonical） | `templates/skill/SKILL.md` + `templates/skill/governance-sections.md` | 14 段治理结构 + 共享治理段落 |
| AI Hooks | `templates/ai-hooks/hooks.json` + `block_destructive_db.sh` + `warn_on_secrets.sh` | 危险命令/密钥拦截钩子 |
| Git Hooks | `templates/lefthook.yml` | pre-commit 门禁 |

领域 Skill 内容模板（11）：`presets/skills/*.md`（api / data-model / payment / security / deployment / testing / frontend-style / i18n / events / observability / performance），渲染时注入 `{{GOVERNANCE_SECTIONS}}`。

### 7.4 Constitution 实例与治理（Batch C 起）

- 本仓实例：`harness/constitution/`（7 制品：project-overview / tech-stack（+机读 json）/ architecture（+机读 json）/ engineering / testing / acceptance / agent-rules；`product` 槽位 `not_applicable`）
- 首版版本：`constitution-3868e8d717ea`（`harness/constitution/versions/`；内容哈希决定，不可覆盖）
- 模块：`bin/project-artifacts.mjs`（清单/hash/drift）· `bin/constitution.mjs`（版本/current/diff/冻结快照/Context 选择）· `bin/constitution-change.mjs`（Change Flow + Skill Impact/处置）· `bin/approvals.mjs`（`artifact_hash` 绑定 + STALE）· `bin/fact-gates.mjs`（4 事实门 + `evaluateStrictFinish`）· `bin/constitution-compliance.mjs`（architecture/tech-stack 合规域）
- 事实门名称：`REQUIREMENT_APPROVED` · `UI_APPROVED` · `PLAN_READY` · `TESTS_PASS`
- 严格收尾证据判定：`review` / `test` / `knowledge` 按**新鲜有效证据记录**（`verifyTaskEvidence` 的 `validTypes`）判定；无记录时仍报缺项（门槛不降），`quick` 任务补齐后即可收尾
- Impact 枚举：Architecture `NONE|LOCAL|CROSS_MODULE|ARCHITECTURE_CHANGE` · Tech Stack `NONE|DEPENDENCY_CHANGE|TECH_STACK_CHANGE`
- 开关：`config.strictGovernance` / `config.governance.strictGovernance`（**引擎默认 false**；**本仓已启用 `true`**，见 `harness.config.mjs` + `AGENTS.md` §2.1 + `bin/cli-e2e.test.mjs` self-dogfood 守卫用例；Cloud 运行时恒 true，不可关闭）

## 8. Skill 基线

来源：`skills/`、`presets/skill-catalog.json`、`presets/skills/`、`bin/skill-audit.mjs`、`bin/skill.mjs`

- **仓库内置 Skill（4，`skills/harness-*`）**：`harness-docs`（知识文档起草）· `harness-prd`（PRD 工作流）· `harness-skill-author`（领域 Skill 编写）· `harness-standards-audit`（机器可读规范审计）
- **内置元领域目录（11，`presets/skill-catalog.json`）**：api · data-model · payment · security · deployment · testing · frontend-style · i18n · events · observability · performance（每项含 detect 规则 dirs/fileGlobs/keywords、minScore、authorityGlobs、priority）
- **领域 Skill 模板（11，`presets/skills/*.md`）**：与上表一一对应
- **生命周期机制**：`harness skill new`（生成草稿 + 注册索引）→ `harness skill check`（结构 + 索引一致性 + 可选 `--freshness` 权威路径存在性）→ `harness skill audit`（四层审计：frontmatter 结构 / 权威路径失效 / 内容指纹漂移 / `lastReviewedAt` 新鲜度默认 90 天 → `MISSING` / `STALE` / `OK`）
- Skill frontmatter 当前字段：`name` `description`（+ 审计使用的可选 `lastReviewedAt` 等元数据）

## 9. 回归校验命令

| 校验对象 | 命令 |
|---|---|
| 核心测试（测试边界见 §Batch A） | `npm run test:core`（= `node --test "bin/*.test.mjs"`） |
| MCP 测试子集 | `npm run test:mcp` |
| 示例项目测试（自带 strip-types 环境） | `npm run test:examples` |
| MCP 工具面数量与冻结契约 | `node --test bin/mcp.test.mjs`（断言 20 个工具名 = 冻结清单） |
| 版本单一事实源 | `node --test bin/version.test.mjs` |
| 状态机/迁移表 | `node --test bin/task-orchestrator.test.mjs` |
| Gate 阶段与推导 | `node --test bin/gate-lifecycle.test.mjs bin/gate-commands.test.mjs` |
| 证据类型与契约 | `node --test bin/contracts.test.mjs bin/evidence.test.mjs` |
| 风险等级与画像 | `node --test bin/risk-engine.test.mjs` |
| 规范类别执行等级 | `node --test bin/standards.test.mjs` |
| 模板注册表 | `node --test bin/template-registry.test.mjs`（27 条定义 / 路径存在性 / 失败模式） |
| Constitution 版本/变更/审批/事实门 | `node --test bin/constitution.test.mjs bin/constitution-change.test.mjs bin/approvals.test.mjs bin/fact-gates.test.mjs bin/project-artifacts.test.mjs bin/constitution-compliance.test.mjs` |
| Constitution 现状 | `node bin/harness.mjs constitution:status` |
| Skill 模板治理段落 | `node --test bin/skill-template.test.mjs` |
| 文档一致性 | `node bin/harness.mjs docs:check` |

> 维护要求：任何改变本文档所列事实的变更，必须同步更新本文档（它是回归对照面，不是产品定义）。
