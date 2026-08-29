# 需求文档 REQ-20260828-wizard.md

> 对应 PRD：`docs/prd/other/PRD-20260828-other-从零项目10步向导-17-7.md`
> Task: TASK-20260828165316-84f673ed / Gate: GATE-2026-08-28T16-53-23
> 对应设计文档：`harness持续治理机制设计(1).md` §17.7

---

## Step 0：跨层搜索（独立仓结构层）

| 层 | 搜索路径 | 关键词 | 找到的文件 | 是否满足需求？ |
|---|---|---|---|---|
| bin | `bin/` | governance, prd category, CLI | `bin/governance.mjs`（validateProfile/writeProfile/lockVersion/governanceReady，已实现）、`bin/harness.mjs`（CLI 分发 + prd new 的分类关键词）、`bin/cli-utils.mjs` | ✅ 复用 governance 全部能力 |
| presets | `presets/` | — | 框架预设 | 不涉及 |
| templates | `templates/` | — | — | 不涉及 |
| rules | `rules/` | — | — | 不涉及 |
| docs | `docs/` | commands, getting-started | `docs/commands.md`、`docs/getting-started.md` | ⚠️ 需同步 |
| 根 | `CHANGELOG.md` | Unreleased | 已有 §15/§18/§19/§17 记录 | ⚠️ 需追加 |

### 搜索结论

- `governance.mjs` 已提供画像校验/写入/版本锁定 → 向导只需"答案 → 画像"映射 + 步骤存储。
- `harness.mjs` prd new 已有分类关键词（workflow/crud 等）可复用于 `derivePrdCategory`。
- 答案存储放 `.harness-state/wizard/answers.json`（复用 statePaths）。

---

## Step 1：Skill 文件咨询

| Skill 文件 | 状态 | 关键结论引用 |
|---|---|---|
| `skills/harness-prd/SKILL.md` | ✅ 已读 | PRD 工作流；分类判定 |
| `skills/harness-docs/SKILL.md` | ✅ 已读 | 代码变更后同步知识文档；更新后跑 `docs:check` |
| `skills/harness-skill-author/SKILL.md` | ✅ 已读（引擎仓无业务定制冲突） | 产出机器可读、可审计 |

---

## 需求标题

从零项目 10 步向导（设计文档 §17.7）。

## 任务类型

功能优化（引擎仓 self-dogfood：落地 §17.7 旗舰向导，基于 §15 治理版本骨架）。

## 需求描述

1. **`bin/wizard.mjs`**：`WIZARD_STEPS`（10 步，步骤 7/9 多选）；`wizardAnswersToProfile`（答案→完整画像，派生 prd_category/risk_domains/skills）；`validateAnswers`；`loadAnswers/saveAnswers/clearAnswers`（`.harness-state/wizard/answers.json`）。
2. **CLI**：`harness wizard init|step|status|from|finish|reset`；finish 复用 `governance.lockVersion`。
3. **测试**：`bin/wizard.test.mjs`（映射/校验/应用/锁定/CLI 冒烟）；全量 `node --test`。
4. **知识同步**：commands / getting-started / README / CHANGELOG。

## 技术方案（初步）

- 答案 → 画像映射：`{ purpose, business, product, tech, data, auth, code }` 为自由文本；`risk_domains`/`skills` 为多选数组；`prd_category` 由 product 关键词派生（workflow/crud/consumer 等）。
- 画像写入复用 `governance.writeProfile`；finish 复用 `governance.lockVersion`。
- 非交互测试路径：`wizard from --file <json>` 批量应用 → `wizard finish`。
