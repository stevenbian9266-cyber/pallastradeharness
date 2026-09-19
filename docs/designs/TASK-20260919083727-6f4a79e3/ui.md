# UI 设计 — TASK-20260919083727-6f4a79e3（Batch B Template Registry）

> 适用性：**不适用（N/A）** — 本任务是引擎仓的模板/元数据能力（Registry + Constitution 模板 + Skill 模板），不产出任何前端界面、组件或视觉资产。

## 1. 判定依据

| 维度 | 事实 | 结论 |
|---|---|---|
| 产出物 | `bin/template-registry.mjs`（模块）、`templates/**`（Markdown/JSON 资产） | 无 UI |
| 消费方 | Batch C 的 Constitution 装配、`harness skill new` 渲染、人工审阅 | 非界面 |
| 宿主界面 | 如未来以 TUI/网页展示模板清单，属独立任务 | 本批次不涉及 |

## 2. 替代性人机界面（记录用）

- **文件即界面**：模板以 Markdown/JSON 呈现，审阅即读文件（`templates/constitution/*.md`、`templates/registry.json`）。
- **错误信息即交互**：`validateTemplateRegistry()` 的 errors 是可操作的文本（指出字段 / 冲突 / 缺失路径）。

## 3. 若未来需要 UI（Out of Scope）

- 展示维度：template_id / version / category / owner_role / stale_when / source_path；
- 交互：按类别过滤（B02 `findTemplates` 已提供数据能力）；
- 触发条件：出现"人工可视化审阅模板"需求时另立任务。
