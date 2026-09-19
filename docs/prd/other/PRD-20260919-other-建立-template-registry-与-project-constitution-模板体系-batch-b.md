# PRD-20260919-other-建立-template-registry-与-project-constitution-模板体系-batch-b

| 元数据 | 值 |
|---|---|
| 状态 | approved（用户确认依据：`pallastradeharness Phase 1 AI 实施指令.md` §三 批次 B + 对话"继续推进"授权） |
| 创建日期 | 2026-09-19 |
| 来源 | Batch B：Template Registry + Project Constitution（B01-B12） |
| 分类 | other（自动判定） |
| 上游规格 | `harness方案.md` §18-38（设计源）、`pallastradeharness Phase 1 AI 实施指令.md` §三 |
| 关联任务 | TASK-20260919083727-6f4a79e3 / GATE-2026-09-19T08-37-38 |

## 1. 背景

- 模板目前散落在 `templates/` + `presets/skills/` + 内置常量中：Harness **不知道模板**——没有 `template_id / version / owner_role / consumed_by / stale_when` 元数据，无法回答"这个 Task 当时依据哪一版模板"。
- Project Constitution 无正式模板：Project Overview / Tech Stack / Architecture / ADR / Engineering / Testing / Acceptance / Agent Rules 均缺位（Tech Stack、Architecture 的机读契约尤为重要）。
- Skill 内容模板（`presets/skills/*.md`）缺少治理段落（Related Constitution / Required Evidence / Completion Conditions 等），无法成为"Constitution 的可执行投影"。
- 上游批次 A 已完成 Core Stabilization（测试边界 / 依赖审计 / 版本 SoT / 治理基线冻结）。本批次**不触碰** Cloud / SQLite / HTTP / 静态 Key / User-Tenant。

## 2. 目标

1. 定义 `TemplateDefinition` 契约（复用 `bin/contracts.mjs` 契约层，不另造第二套）；
2. 实现最小 Template Registry（`listTemplates` / `getTemplate` / `getLatestTemplate` / `findTemplates` / `validateTemplateRegistry`）——单一事实源、不扫盘发现、`source_path` 可验证、重复 `id+version` 必须失败；
3. 注册现有模板（PRD / tech-design / interaction / ui / visual / 11 个领域 Skill 模板 / ai-hooks / lefthook），逐条给出 owner_role / consumed_by / stale_when；
4. 新增 8 个 Constitution 模板：Project Overview、Tech Stack（+机读契约）、Architecture（+机读契约）、ADR、Engineering Standard、Testing Standard、Acceptance Standard、Agent Rules；
5. 升级 Skill 模板为 14 段治理结构（Purpose → Authority Files），保持既有 Skill 引擎逻辑不变；
6. 本批次**不通过 MCP 暴露** Registry。

## 3. 成功指标

- `validateTemplateRegistry()` 0 errors；注入重复 `(id, version)` 必须失败；
- 现有核心模板 100% 注册，所有 `source_path` / `contract_path` 真实存在；
- 8 个 Constitution 模板可读取（`getTemplate` 非空 + 必需章节齐全）；
- 新渲染的 Skill 含治理段落且无 `{{` 残留；未知领域回退 canonical 模板；
- Local Harness 零回归：`test:core` 全绿 + `docs:check` / `doc-impact` / `readme:sync` 放行。

## 4. 场景

| # | 场景 | 输入 | 期望 |
|---|---|---|---|
| A | 注册表读取 | `listTemplates()` | 全部条目含版本/分类/角色/生命周期元数据 |
| B | 精确取用 | `getTemplate('task-tech-design', '1.0.0')` | 返回定义；未知 id / 未知版本 → null |
| C | 取最新 | `getLatestTemplate('skill-domain-api')` | 最高版本定义 |
| D | 条件检索 | `findTemplates({ category: 'design' })` | 3 个设计文档模板 |
| E | 注册表自检 | `validateTemplateRegistry()` | `ok=true`，路径全部存在 |
| F | 重复冲突 | 注入重复 `(id, version)` | `ok=false`，errors 含 duplicate |
| G | 领域 Skill 渲染 | `resolveSkillBody(api)` | 渲染体含治理段落、无 `{{` 残留 |
| H | 未知领域回退 | `resolveFallbackSkillBody` | 渲染 `templates/skill/SKILL.md`（14 段） |
| I | 机读契约 | 读取 tech-stack/architecture schema | JSON 可解析且含必需键 |

## 5. 功能需求（FR）

- **FR-001 契约**：`contracts.mjs` 新增 `Template` 类型；必填 11 字段（template_id / version / category / scope / source_path / applies_to / required_when / owner_role / consumed_by / stale_when / status）+ 可选 `contract_path`；版本语义 `x.y.z`。
- **FR-002 Registry 实现**：新增 `bin/template-registry.mjs`；数据源 = `templates/registry.json`（单一事实源；不做磁盘扫描发现）；导出 5 个 API + 枚举常量（categories / statuses / scopes / owner_roles）。
- **FR-003 Registry 校验**：必填、枚举、ID 格式（kebab）、版本格式、重复 `(id,version)`、`source_path` 与 `contract_path` 存在性；错误信息可操作。
- **FR-004 现有模板注册（B03）**：PRD、tech-design、interaction、ui、visual、`skill-domain-*` ×11、ai-hooks、lefthook；owner_role 映射：PRD→product_manager、tech-design→tech_lead、interaction→ux_designer、ui/visual→ui_designer、skill→knowledge_owner。
- **FR-005 Constitution 模板（B04-B11）**：8 个文件严格按指令章节清单；Tech Stack 与 Architecture 附**机读契约**（JSON）：`current_technologies / restrictions / change_policy` 与 `modules / dependency_rules / rules / severity`；允许只填适用项（不强迫全字段）。
- **FR-006 Skill 模板升级（B12）**：新增 `templates/skill/SKILL.md`（14 段规范结构）与 `templates/skill/governance-sections.md`（共享治理段落）；11 个领域模板注入 `{{GOVERNANCE_SECTIONS}}`；渲染器支持该占位符；未知领域回退改用 canonical 模板；**不改 Skill Engine 其他逻辑**。
- **FR-007 文档同步**：README、CHANGELOG、`docs/current-governance-baseline.md`（模板基线更新为 Registry 事实）。
- **FR-008 测试**：`bin/template-registry.test.mjs`（≥8 用例）+ `contracts.test.mjs` / `skill-template.test.mjs` 扩展。

## 6. 验收标准（AC）

| AC | 描述 | 测试位置 |
|---|---|---|
| AC-001 | Registry 稳定 ID/Version；`getTemplate` 精确匹配、未知返回 null | `bin/template-registry.test.mjs` |
| AC-002 | `getLatestTemplate` 取最高版本；`findTemplates` 条件检索 | `bin/template-registry.test.mjs` |
| AC-003 | 校验失败模式：重复 `(id,version)` / 缺字段 / 非法枚举 / source 缺失 | `bin/template-registry.test.mjs` |
| AC-004 | 现有模板全部注册且 `source_path` 真实存在 | `bin/template-registry.test.mjs` |
| AC-005 | 8 个 Constitution 模板可读取且必需章节齐全 | `bin/template-registry.test.mjs` |
| AC-006 | 机读契约 JSON 可解析且含必需键 | `bin/template-registry.test.mjs` |
| AC-007 | Skill 渲染含治理段落、无 `{{` 残留；未知领域回退 canonical | `bin/skill-template.test.mjs` |
| AC-008 | `Template` 契约类型校验生效（缺字段报错、合法通过） | `bin/contracts.test.mjs` |
| AC-009 | `test:core` 全量回归 + `docs:check` / `doc-impact` / `readme:sync` | 命令实测 |

## 7. 技术影响

- **Architecture Impact**：`LOCAL`（新增只读模块 + 模板资产；不改 CLI 分发 / 门禁 / 证据语义；Registry 不依赖数据库）。
- **Tech Stack Impact**：`NONE`（零新依赖；机读契约使用 JSON，不引入 YAML 解析器）。
- **In Scope**：B01-B12。**Out of Scope**：MCP 暴露（指令明令暂缓）、Cloud/SQLite/HTTP/静态 Key/User-Tenant、Supervisor 消费 Constitution（Batch C）、Task 冻结 Constitution（Batch C）、`product.md` 模板（C02 清单需要，但不在 B04-B11 清单 → 提请人工决策）。

## 8. 测试计划

- 单测：`bin/template-registry.test.mjs`（读取/检索/校验/失败模式/路径存在性/重复冲突/Constitution 章节/机读契约）；
- 回归：`node --test "bin/*.test.mjs"`（全量）+ `bin/contracts.test.mjs` + `bin/skill-template.test.mjs` + `bin/skill.test.mjs`；
- 设计门：`design:check` + `reuse-adherence`（Part B 矩阵落地校验）；
- 文档门：`docs:check` / `doc-impact` / `readme:sync --check`。

## 9. 文档同步清单

`README.md`、`CHANGELOG.md`、`docs/current-governance-baseline.md`（§7 模板基线 + §9 回归命令）。

