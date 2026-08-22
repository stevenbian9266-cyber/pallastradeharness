# 需求文档 REQ-20260822-external-validation-p2-2.md

> 对应方案：`harness优化升级实施方案-20260820.md` → HTH-020（两轮小白可用性试点）+ HTH-022（双语核心文档与 2.0 beta 发布）
> Task: TASK-20260822160004-17232094 / Gate: GATE-2026-08-22T16-00-08

---

## Step 0：跨层搜索（独立仓结构层）

| 层 | 搜索路径 | 关键词 | 找到的文件 | 是否满足需求？ |
|---|---|---|---|---|
| docs | `docs/` | pilot, metrics, rfc, release | `docs/rfc/0001-threat-model.md`、`docs/rfc/0002-change-snapshot.md`、`docs/getting-started.md`、`docs/roadmap.md` | ⚠️ 无试点包、无英文核心文档、无 Go/No-Go 报告，均需新建 |
| bin | `bin/` | metrics | `bin/metrics.mjs`（本地指标 + export，HTH-019） | ✅ 试点指标源已具备 |
| presets | `presets/` | brain-eval | `presets/brain-eval/default.json` | ✅ 评测基线已具备 |
| templates | `templates/` | — | 无 | 不涉及 |
| rules | `rules/` | — | 无 | 不涉及 |
| 根 | `.github/workflows/` | publish, release | `publish.yml`（npm OIDC trusted publishing） | ✅ 发布通道已具备 |
| 根 | `CHANGELOG.md` | 1.7.0 | 已记录 1.7.0 Trust Kernel | 需追加本批内容 |

### 搜索结论

- HTH-020：无试点材料 → 新建 `docs/pilot/`（指南/指标表/访谈/问题报告模板）。实际 ≥10 用户试点需外部执行，本批交付"可执行试点包"。
- HTH-022：无英文核心文档、无 Go/No-Go 报告 → 新建 `README.en.md`、`docs/getting-started.en.md`、`docs/rfc/0003-release-gate.md`；按 §7.4 逐项评估并记录发布决策。

---

## Step 1：Skill 文件咨询

| Skill 文件 | 状态 | 关键结论引用 |
|---|---|---|
| `ai/skills/pallastrade-customization/SKILL.md` | ✅ 已读 | 决策树：先评估已有能力（metrics/评测集已就绪），再决定新建 |
| `ai/skills/harness-standards-audit/SKILL.md`（域 skill） | ✅ 已读 | 产出必须机器可读、可审计；Go/No-Go 报告逐项附证据来源 |

---

## 需求标题

外部验证收尾：小白可用性试点包（HTH-020）+ 双语核心文档与 2.0 beta 发布决策（HTH-022）。

## 任务类型

功能优化（方案既定任务 HTH-020 / HTH-022）

## 需求描述

1. **HTH-020 试点包**（`docs/pilot/`）：试点指南（目标画像、3 个任务、执行流程）、指标记录表（完成率/首次可信提交/显式命令数/复制 ID/求助/误阻断/绕过/可信理解）、访谈提纲、问题报告模板（分级）。
2. **HTH-022**：
   - 双语核心文档：`README.en.md` + `docs/getting-started.en.md`（核心生命周期同步，不追求全量翻译）
   - Go/No-Go 报告 `docs/rfc/0003-release-gate.md`：按 §7.4 八项条件逐项对照实际证据，结论可审计
   - 版本决策：依据报告记录发布决策（继续 beta 或打 tag）；更新 `CHANGELOG.md` + `docs/roadmap.md`

## 技术方案（初步）

- 新建 `docs/pilot/`（4 个 markdown），`README.en.md`、`docs/getting-started.en.md`、`docs/rfc/0003-release-gate.md`
- Go/No-Go 证据来源：P0/P1/P2 实施记录（git log + 测试 197/197）、Ruleset 状态（gh api）、Tier A fixtures（examples/）、nightly 状态
- 更新 `CHANGELOG.md`（Unreleased）与 `docs/roadmap.md`（1.7.0 完成 + beta 决策）
- 文档型任务 → 验证用 `docs:check` + 链接完整性

## 风险点

- 试点实际执行需外部用户 → 本批交付试点包并记录"待外部执行"结论
- 发布动作外部可见 → 按 Go/No-Go 报告决策，未达标不强行发布正式版

## 验收标准（对齐方案）

- [ ] 试点包 4 件套齐全（指南/指标表/访谈/问题报告模板）
- [ ] 英文核心文档可读、链接有效（docs:check 通过）
- [ ] Go/No-Go 报告逐项附证据、结论可审计
- [ ] 版本决策已记录（CHANGELOG + roadmap 同步）
