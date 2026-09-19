# 需求文档 REQ-20260919-batch-b-template-registry.md

> 对应 PRD：`docs/prd/other/PRD-20260919-other-建立-template-registry-与-project-constitution-模板体系-batch-b.md`
> Task: TASK-20260919083727-6f4a79e3 / Gate: GATE-2026-09-19T08-37-38
> 上游：`pallastradeharness Phase 1 AI 实施指令.md` §三（Batch B）；`harness方案.md` §18-38（设计源）

---

## Step 0：跨层搜索（独立仓结构层）

| 层 | 搜索路径 | 关键词 | 找到的文件 | 是否满足需求？ |
|---|---|---|---|---|
| bin | `bin/` | `template_id` / `registry` / `TemplateDefinition` | `contracts.mjs`（16 契约类型，无 Template）、`command-registry.mjs`、`capability-registry.mjs`（注册表先例）、`skill-template.mjs`（渲染）、`skill.mjs`（骨架回退） | ❌ Registry 净新增；契约/渲染可复用 |
| presets | `presets/` | `skill-catalog` / 模板元数据 | `skill-catalog.json`（11 元领域**检测**目录）、`presets/skills/*.md`（11 内容模板） | ⚠️ 只解决"生成什么"，无 registry 元数据 |
| templates | `templates/` | `constitution` / `registry.json` | `prd/_TEMPLATE.md`、`designs/*4`、`ai-hooks/*`、`lefthook.yml` | ❌ 无 constitution/；Registry 需新建 |
| rules | `rules/` | `STD-TECH` / `STD-ARCH` | `base-standards.json`（28 条，含 STD-TECH-001 / STD-ARCH-001/002） | ✅ 选型/架构治理已有机读规则，模板与之衔接 |
| docs | `docs/` + 根 | `Template Registry` / `Constitution` | `harness方案.md` §18-38（设计源）、`RCF-0004`、`current-governance-baseline.md` §7（"当前没有 Template Registry"） | ✅ 规格已定，事实基线需回写 |

### 搜索结论

- Registry + Constitution 模板为**净新增**；契约层（`contracts.mjs`）、模板渲染（`skill-template.mjs`）、Skill 骨架（`skill.mjs`）、设计门（`design-check` / `reuse-adherence`）均可复用/小步扩展；
- `presets/skills/*.md` 是**内容模板**（由 `skill-catalog.json` 检测驱动生成），需要注册进 Registry 并补齐治理段落（B12）；
- 机读契约按指令要求使用 **JSON**（不引入 YAML 依赖，覆盖方案中的 `.yaml` 建议）。

---

## Step 1：Skill 文件咨询

| Skill 文件 | 状态 | 关键结论引用 |
|---|---|---|
| `skills/harness-skill-author/SKILL.md` | ✅ 已读 | Skill 输出结构 = frontmatter + 核心概念/常用操作/常见问题与陷阱/权威文件；完成标准 = `skill check` 通过 + 索引注册 + 人确认（B12 在此基础上增加治理段落，不推翻） |
| `skills/harness-standards-audit/SKILL.md` | ✅ 已读 | 机器可读规范走 Standard schema；engineering.md = 项目原则、standards.json = 机器规则（模板与规则分工） |
| `skills/harness-docs/SKILL.md` | ✅ 已读 | 变更后同步知识文档并跑 `docs:check`；`doc-impact` 放行；人确认后写回 |
| `skills/harness-prd/SKILL.md` | ✅ 已读 | PRD 命名 `PRD-{YYYYMMDD}-{category}-{slug}`、AC→测试映射、确认后进入 gate |

---

## 需求标题

Template Registry（B01-B03）+ Project Constitution 模板体系（B04-B11）+ Skill 模板升级（B12）。

## 任务类型

新增（feature，引擎仓 self-dogfood）。

## 需求描述（FR）

1. **FR-001**：`contracts.mjs` 新增 `Template` 契约类型（11 必填字段 + 可选 `contract_path`；版本 `x.y.z`；数组字段校验）。
2. **FR-002**：新增 `bin/template-registry.mjs`：`listTemplates` / `getTemplate(id, version?)` / `getLatestTemplate(id)` / `findTemplates(criteria)` / `validateTemplateRegistry({ definitions?, engineRoot? })`；数据源 `templates/registry.json`；不做磁盘扫描发现；不依赖数据库。
3. **FR-003**：校验覆盖：必填 / 枚举（category/scope/status/owner_role）/ ID 格式 / 版本格式 / 重复 `(id,version)` / `source_path` 与 `contract_path` 存在性。
4. **FR-004**：注册现有模板 27 条（PRD / tech-design / interaction / ui / visual / skill-domain-*×11 / skill-template 规范模板 / ai-hooks / lefthook），含 owner_role / consumed_by / stale_when。
5. **FR-005**：新增 `templates/constitution/` 8 个模板（project-overview / tech-stack / architecture / adr / engineering-standard / testing-standard / acceptance-standard / agent-rules），tech-stack 与 architecture 附机读契约 JSON。
6. **FR-006**：Skill 模板升级：`templates/skill/SKILL.md`（14 段）+ `templates/skill/governance-sections.md`（共享治理段落）+ 11 个领域模板注入 `{{GOVERNANCE_SECTIONS}}` + 渲染器支持 + 未知领域回退 canonical；除模板加载外不改 Skill 引擎。
7. **FR-007**：文档同步（README / CHANGELOG / current-governance-baseline）。
8. **FR-008**：`bin/template-registry.test.mjs`（≥8 用例）+ `contracts.test.mjs` / `skill-template.test.mjs` 扩展。

## 验收标准（AC，与 PRD 一致）

| AC | 描述 | 测试位置 |
|---|---|---|
| AC-001 | 稳定 ID/Version；精确取用与未知返回 null | `bin/template-registry.test.mjs` |
| AC-002 | 最新版本与条件检索 | `bin/template-registry.test.mjs` |
| AC-003 | 校验失败模式（重复/缺字段/枚举/路径缺失） | `bin/template-registry.test.mjs` |
| AC-004 | 现有模板全部注册且路径存在 | `bin/template-registry.test.mjs` |
| AC-005 | Constitution 模板可读取且章节齐全 | `bin/template-registry.test.mjs` |
| AC-006 | 机读契约 JSON 必需键 | `bin/template-registry.test.mjs` |
| AC-007 | Skill 渲染治理段落 / 无残留占位符 / canonical 回退 | `bin/skill-template.test.mjs` |
| AC-008 | `Template` 契约校验生效 | `bin/contracts.test.mjs` |
| AC-009 | 全量回归 + 文档三门 | 命令实测 |

## 文档同步清单

`README.md`、`CHANGELOG.md`、`docs/current-governance-baseline.md`。
