<!--
  共享治理段落（Batch B / B12）。由 bin/skill-template.mjs 注入到标注了治理段落占位符的 Skill 模板。
  说明：Skill 是 Project Constitution 的"可执行投影"。其中 Workflow / Common Mistakes / Authority Files
  三个语义段由使用方模板自身的「常用操作 / 常见问题与陷阱 / 本项目权威文件」章节承载（本文件不重复定义）。
  目标链路：Project Constitution → Skill → Agent Execution。
-->

## Purpose

- 本 Skill 提供 `{{SKILL_TITLE}}` 领域的执行能力：<补全：产出的价值与边界（做什么 / 不做什么）>
- 上位规则：Project Constitution 的对应 Artifact 优先于本 Skill 的具体描述

## Applies When

- 任务涉及 `{{SKILL_TITLE}}` 相关的代码 / 配置 / 文档 / 数据时
- <补全：本领域触发关键词与典型任务形态>

## Do Not Use When

- 任务与该领域无关（避免无谓加载与误用领域规则）
- <补全：易混淆领域的边界（应改用哪个 Skill / 文档）>

## Required Context

- 本 Skill 的 Authority Files（field-level 细节的唯一来源）
- Project Constitution：`tech-stack` / `architecture` / `engineering-standard` / `testing-standard`
- 当前 Task 的 Change Plan 与 Gate 检查项（`harness gate:status`）

## Related Constitution

- `tech-stack.md` — 本领域允许 / 限制 / 弃用的技术
- `architecture.md` — 模块边界、依赖方向与数据所有权
- `engineering-standard.md` — 复用、命名、错误处理与禁止模式
- `testing-standard.md` — 测试层级选择与证据要求
- 冲突处理：Constitution 更新 → 本 Skill 应标记 `STALE` → 执行 `UPDATE` 或 `REVIEWED_NO_CHANGE`

## Reuse Requirements

- 实施前必须跨层检索现有实现（bin / presets / templates / rules / docs 或项目对应层），优先"调用已有 / 扩展已有"
- <补全：本领域可复用的既有模块、工具与约定>

## Forbidden Actions

- 禁止绕过 Gate / 证据链直接声明完成
- 禁止为通过检查而删除或弱化测试
- 禁止静默改变技术栈 / 架构 / 公共契约（必须走 Decision 流程）
- <补全：本领域特有的禁止项（危险操作 / 数据破坏 / 安全红线）>

## Validation

- <补全：本领域验证命令（静态检查 / 单测 / 契约校验）与预期输出>
- 验证失败时不得降级断言或跳过检查；修复实现或修正错误的期望

## Required Tests

- <补全：本领域必须新增 / 更新的测试层级（unit / integration / e2e）与用例方向>
- 修复类变更必须附带复现测试（先红后绿）

## Required Evidence

- `test` — 本领域验证器输出（绑定 HEAD，经注册验证器执行）
- `review` — 与 Constitution / 本 Skill 逐条对照的审查结论
- `knowledge` — 受影响文档与 Skill 的同步评估（updated / reviewed-no-change / not-applicable）

## Completion Conditions

- Gate preparation 全清；`verify-test` 由新鲜类型化证据关闭
- 本 Skill 的 Validation / Required Tests / Required Evidence 全部满足
- <补全：本领域特定完成条件（如数据迁移演练、兼容性确认）>
