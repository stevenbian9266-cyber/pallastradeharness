# 技术方案（Tech Design）— TASK-20260919083727-6f4a79e3

> 设计阶段产物 **4/4（核心）**。对应 PRD：`PRD-20260919-other-建立-template-registry-与-project-constitution-模板体系-batch-b`；Task：TASK-20260919083727-6f4a79e3
> 前置：Part A 事实来源 = 跨层搜索（bin/presets/templates/rules/docs，2026-09-19）+ `harness design:scan --scope all`（公共符号 195 个）+ 直接源码核对。

## Part A — 现状识别（强制，缺此段方案无效）

### A1 业务系统盘点

| 现有模块/分组 | 边界 | 新功能归属 |
|---|---|---|
| `bin/contracts.mjs` | 契约层：16 种 CONTRACT_TYPES + REQUIRED_FIELDS + 类型特定校验（`validateContract` / `createContract`） | **扩展**：新增 `Template` 类型（B01） |
| `bin/template-registry.mjs` | （不存在） | **新增**：Registry 读取/检索/校验 API（B02） |
| `templates/registry.json` | （不存在） | **新增**：Registry 单一事实源数据（B02/B03） |
| `bin/skill-template.mjs` | 领域 Skill 内容模板加载与渲染（占位符替换） | **扩展**：`{{GOVERNANCE_SECTIONS}}` 注入 + canonical 回退（B12） |
| `bin/skill.mjs` | Skill 骨架生成（有内容模板→渲染；无→内联空骨架） | **修改**：回退链改为 canonical 模板 → 内联骨架（B12） |
| `templates/` / `presets/skills/` | 模板资产（散落，无元数据） | **扩展**：新增 `constitution/`、`skill/`；领域模板注入治理段落（B03-B12） |
| `bin/design-check.mjs` / `bin/reuse-adherence.mjs` | 设计门机器校验（本任务自身需通过） | 复用（不修改） |

### A2 数据模型识别

无数据库、无 `.harness-state` 写入。新增两类**静态资产**：

| 产物 | 归属 | 说明 |
|---|---|---|
| `templates/registry.json` | 仓库资产（随 npm 包分发） | `{ schemaVersion: "1.0", templates: TemplateDefinition[] }`；只读，不扫描磁盘发现 |
| `templates/constitution/tech-stack.schema.json` / `architecture.schema.json` | 仓库资产 | 机读契约（JSON Schema 风格说明），被同目录 md 模板引用 |

### A3 字段盘点

TemplateDefinition（B01，11 必填 + 1 可选）：

| 字段 | 类型 | 约束 | 来源 |
|---|---|---|---|
| `template_id` | string | kebab-case，稳定不复用 | 方案 §18/19 |
| `version` | string | `x.y.z`（语义化） | 方案 §18 |
| `category` | enum | project/product/architecture/engineering/design/quality/operations/agent/task | 指令 §B01 |
| `scope` | enum | project/task/runtime/domain | 方案 §19（`scope: runtime` 先例） |
| `source_path` | string | 包根相对路径，**必须存在** | 方案 §18 |
| `contract_path` | string? | 可选机读契约，存在性校验 | 本任务（B05/B06 机读要求） |
| `applies_to` | string[] | 非空（任务类型/上下文） | 指令 §B01 |
| `required_when` | string | 触发条件（人类可读） | 指令 §B01 |
| `owner_role` | enum | product_manager/tech_lead/ux_designer/ui_designer/knowledge_owner/quality_owner/operations_owner | 指令 §B03 示例 |
| `consumed_by` | string[] | 非空（消费方） | 指令 §B01 |
| `stale_when` | string[] | 非空（失效条件） | 指令 §B01 |
| `status` | enum | active/draft/deprecated | 指令 §B01 |

### A4 代码结构

| 公共方法/符号 | 位置 | 签名/说明 |
|---|---|---|
| `validateContract` / `SCHEMA_VERSION` | `bin/contracts.mjs` | 复用：Registry 校验内部包装 `{ schemaVersion, type: 'Template', ...def }` |
| `renderSkillTemplate` / `resolveSkillBody` / `loadSkillTemplate` | `bin/skill-template.mjs` | 扩展：新增治理段落注入与回退入口 |
| `createSkill` | `bin/skill.mjs` | 修改：回退链接入 canonical 模板 |
| `listTemplates` / `getTemplate` / `getLatestTemplate` / `findTemplates` / `validateTemplateRegistry` | 新增 `bin/template-registry.mjs` | Registry 5 个 API（B02） |
| `resolveFallbackSkillBody` | 新增于 `bin/skill-template.mjs` | canonical 模板渲染（B12） |
| `REGISTRY_FILE`（内部） | 新增于 `bin/template-registry.mjs` | 数据源路径常量（不导出） |

## Part B — 复用决策矩阵

| 能力需求 | 决策 | 目标 | 依据（已有位置/签名） |
|---|---|---|---|
| 契约校验 | 调用已有 | validateContract | bin/contracts.mjs |
| 契约版本常量 | 调用已有 | SCHEMA_VERSION | bin/contracts.mjs |
| 占位符渲染扩展 | 扩展已有 | renderSkillTemplate | bin/skill-template.mjs |
| 领域模板渲染扩展 | 扩展已有 | resolveSkillBody | bin/skill-template.mjs |
| 未知领域回退模板 | 新封装公用 | resolveFallbackSkillBody | bin/skill-template.mjs（被 bin/skill.mjs 与测试引用） |
| Registry 列举 API | 新封装公用 | listTemplates | bin/template-registry.mjs（被测试引用） |
| Registry 精确取用 API | 新封装公用 | getTemplate | bin/template-registry.mjs（被测试引用） |
| Registry 最新版本 API | 新封装公用 | getLatestTemplate | bin/template-registry.mjs（被测试引用） |
| Registry 条件检索 API | 新封装公用 | findTemplates | bin/template-registry.mjs（被测试引用） |
| Registry 注册表自检 API | 新封装公用 | validateTemplateRegistry | bin/template-registry.mjs（被测试引用） |
| 文件存在校验 | 调用已有 | existsSync | bin/config-loader.mjs（同风格广泛引用） |
| 注册表数据源路径 | 新建局部 | REGISTRY_FILE | 仅 bin/template-registry.mjs 内部使用 |

## Part C — 实施落点

### C1 新增/修改文件清单

| 文件路径 | 操作 | 说明 |
|---|---|---|
| `bin/template-registry.mjs` | 新增 | 枚举常量 + 5 API + 校验器（约 160 行） |
| `bin/template-registry.test.mjs` | 新增 | 8-10 用例（AC-001~006） |
| `templates/registry.json` | 新增 | 27 条 TemplateDefinition（B03 注册 + 本批新增模板） |
| `templates/constitution/project-overview.md` 等 8 个 md + 2 个 schema.json | 新增 | B04-B11 |
| `templates/skill/SKILL.md` + `templates/skill/governance-sections.md` | 新增 | B12 |
| `bin/contracts.mjs` + `bin/contracts.test.mjs` | 修改 | `Template` 类型 + fixture |
| `bin/skill-template.mjs` + `bin/skill-template.test.mjs` | 修改 | 治理段落注入 + 回退入口 + 用例 |
| `bin/skill.mjs` | 修改 | 回退链（canonical → 内联骨架） |
| `presets/skills/*.md` × 11 | 修改 | 注入 `{{GOVERNANCE_SECTIONS}}` 占位符（内容不重写） |
| `README.md` / `CHANGELOG.md` / `docs/current-governance-baseline.md` | 修改 | 文档同步（B 批次事实） |

### C2 分层改动

- 契约层：`contracts.mjs` 增加一个类型（无破坏性）；
- 注册表层（新）：数据文件（`templates/registry.json`）→ 校验器 → 查询 API；
- 模板层：新增 Constitution/Skill 模板资产 + 领域模板占位符注入；
- 渲染层：`skill-template.mjs` 仅扩展占位符映射与回退入口。

### C3 依赖与实施顺序

1. B01 契约（contracts）→ 2. B02/B03 Registry 模块 + 数据 + 测试 → 3. B04-B11 模板文件 → 4. B12 Skill 模板 + 渲染接线 → 5. 文档同步 → 6. 全链验证（test:core / design:check / reuse-adherence / docs:check / doc-impact）。

### C4 风险与回滚

- 风险 A：`contracts.test.mjs` 遍历 CONTRACT_TYPES，新增类型必须同步 fixture → 已列入 C1；
- 风险 B：`{{GOVERNANCE_SECTIONS}}` 未替换会污染生成物 → 渲染器注入 + 测试断言"无 `{{` 残留"双保险；治理段落文件缺失时替换为空串（不产生残缺标记）；
- 风险 C：11 个领域模板注入位置不一致 → 统一注入在 intro 引用块之后（`## 核心概念` 之前），逐文件核对；
- 回滚：删除新增文件 + 还原 `registry.json`/占位符即可；引擎逻辑（除渲染扩展）未改动。
