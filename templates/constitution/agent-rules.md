# Agent Rules

> Project Constitution 模板（Batch B / B11）。定位：Agent（AI / 自动化执行者）在本项目的**强制行为约束**。
> 与仓库级约定（如 `AGENTS.md`）关系：仓库级文件是本地化实现；本模板是 Constitution 层规则，可由 Engine 生成/校验。
> 两条不可协商原则（必须原样保留在生成物中）：
> 1. **Developer 不拥有最终验收权**；
> 2. **Task 不得静默修改 Constitution**。

## Task Entry

- 任何变更前必须：创建或恢复 Task（`task start` / `resume`），不得脱离 Task 直接改文件；
- Task 标题必须带类型前缀（修复 / 优化 / 新增 / 重构 / 文档 / 审计 / 测试 / 安全 / 样式 / 研究）。

## Context Requirement

- 实施前必须读取相关上下文（Project Brain / Context Pack / 相关文件），并在报告中引用其结论；
- 禁止"未读相关模块就动手"。

## Constitution Requirement

- Task 必须继承当前 Constitution（`constitution_version` 及其 artifact hash）；
- **禁止静默修改 Constitution**：需要变更时走 `CHANGE_REQUIRED → Change Proposal → Decision/ADR → Approval → Update Artifact → New Constitution Version → Skill Impact`。

## Tech Stack Rule

- 禁止静默改变核心技术（框架 / ORM / 数据库 / 队列 / 缓存 / UI 框架 / 认证架构）；
- 新增技术必须登记并触发 `TECH_STACK_CHANGE` 流程。

## Architecture Rule

- 禁止静默改变架构（模块边界 / 依赖方向 / 数据所有权）；
- 架构违规不得以"临时"名义绕过；必须修复或走 Decision 流程。

## Reuse Rule

- 实施前必须跨层检索现有实现，优先复用（调用已有 → 扩展已有）；
- 不得新建第二套同类引擎（Task/Gate/Evidence/Skill/Decision 域尤其严格）。

## UI Rule

- 涉及界面的变更必须先获得设计确认（design-confirmed），必要时提供 ui-approval 证据；
- 不得引入未登记的设计令牌 / 视觉基线偏移。

## Implementation Gate

- **只有 Gate preparation 全清后才允许写实现文件**；
- 禁止绕过门禁直接提交（pre-commit 会物理拦截）。

## Review Rule

- 完成前必须有 review 证据（diff 审查 / 规范对照）；
- **Developer 不拥有最终验收权**——验收由 Acceptance Standard + 人（或独立审查者）判定。

## Test Rule

- 按 `testing-standard.md` 选择测试；修复类变更必须带复现测试；
- 禁止为通过检查而删除/弱化测试。

## Evidence Rule

- 不得只用文字声明完成；必须提供类型化、新鲜的证据（绑定 HEAD / 注册验证器）；
- 证据必须真实：不得复用过期证据、不得伪造来源与 trust level。

## Knowledge Rule

- 必须执行 Knowledge Assessment 并处置受影响 Skill（UPDATE / REVIEWED_NO_CHANGE）；
- doc-impact 未放行的变更不得完成。

## Finish Rule

- 必须通过 `finish_task` 收尾（不得手工改状态为 completed）；
- Strict 模式下：缺失任一必需事实（审批 / 计划 / 影响评估 / 测试 / 证据 / AC 覆盖 / 知识评估）即返回 `REQUIRED_ACTIONS`，禁止补造历史事实。
