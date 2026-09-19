# 交互设计 — TASK-20260919083727-6f4a79e3（Batch B Template Registry）

> 适用性：**部分适用** — 无 UI 交互；存在"人/Agent ↔ 模板体系"的程序化交互契约（本文件固化该契约）。

## 1. 交互主体与路径

| 主体 | 入口 | 交互 | 结果 |
|---|---|---|---|
| 引擎模块（Batch C） | `bin/template-registry.mjs` 导出 API | `listTemplates()` / `getTemplate(id[,version])` / `getLatestTemplate(id)` / `findTemplates(criteria)` | 返回定义对象 / 数组 / `null` |
| 维护者 / CI | `validateTemplateRegistry()` | 静态自检（枚举/格式/重复/路径存在） | `{ ok, errors, warnings }`（errors 非空即失败） |
| Skill 生成流程 | `resolveSkillBody()` / `resolveFallbackSkillBody()` | 加载领域模板 + 注入 `{{GOVERNANCE_SECTIONS}}` → 渲染 | 完整 SKILL.md 文本（无残留 `{{`） |
| 人工审阅 | 直接读 `templates/**` 与 `templates/registry.json` | 阅读 / 评审 | 模板是否足够具体（人工门） |

## 2. 契约细节

- **幂等**：同一输入重复调用返回等值结果（纯函数，Registry 数据只读）。
- **失败语义**：查不到 → `null`（不抛出）；数据损坏（registry.json 不可解析）→ 抛出并附文件路径（fail-loud）。
- **占位符语义**：未知占位符保持原样由调用方发现；`{{GOVERNANCE_SECTIONS}}` 在加载治理段落失败时替换为空串（保证不产生残缺标记）。
- **顺序稳定**：`listTemplates()` 按 `template_id` 升序返回（可重复 diff）。

## 3. 边界与不做的事

- 本批次不提供 CLI 子命令、不提供 MCP 工具（指令 B02 明令"暂时不要通过 MCP 暴露"）；
- 不写盘、不改动 `.harness-state`（Registry 是**只读事实源**）。
