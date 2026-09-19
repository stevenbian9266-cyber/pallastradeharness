# Agent Rules

> pallastradeharness Agent 执行约束（Batch C / C04）。仓库级实现见 `AGENTS.md`；本文件是 Constitution 层规则（可被 Engine 生成/校验的投影）。
> 两条不可协商原则：
> 1. **Developer 不拥有最终验收权**；
> 2. **Task 不得静默修改 Constitution**。

## Task Entry

- 任何变更（除治理准备制品）必须先 `harness task start`（标题带类型前缀），或 `resume` 既有任务
- 禁止无 Task 直接改实现文件（pre-commit 会物理拦截）

## Context Requirement

- 实施前必须构建上下文：`harness brain context --task <id>`（含 Constitution 选择段）
- 禁止未读相关模块/规范即动手；上下文结论需在任务记录中可追溯

## Constitution Requirement

- Task 必须继承当前 Constitution：`task.constitution`（version + tech_stack/architecture/engineering/testing hash + skill hashes）
- **禁止静默修改 Constitution**：制品变化 → `constitution:change`（提案）→ Decision/ADR（如需要）→ Approval（如需要）→ `constitution:apply`（新版本 + Skill Impact）→ 处置受影响 Skill → 继续任务

## Tech Stack Rule

- 禁止静默改变核心技术（框架/ORM/数据库/队列/缓存/UI 框架/认证架构）；`TECH_STACK_CHANGE` 必须先 Decision
- 普通依赖变化记录 `DEPENDENCY_CHANGE`；新增依赖必须登记 tech-stack 制品

## Architecture Rule

- 禁止静默改变架构（模块边界/依赖方向/数据所有权）；`ARCHITECTURE_CHANGE` 必须先 Decision
- 架构 deny 规则违规 = blocking（不得以"临时"名义绕过）

## Reuse Rule

- 实施前跨层检索（gate `search-*` 强制），优先"调用已有 / 扩展已有"
- 禁止新建第二套同类引擎（Task/Gate/Evidence/Skill/Decision 域）

## UI Rule

- 本项目当前无 UI 产品面；若引入界面：先 design-confirmed，必要时 ui-approval 证据

## Implementation Gate

- **Gate preparation 全清后才允许写实现文件**；期间只写治理准备制品（PRD/REQ/设计/requirements）
- 不得绕过 gate（禁止直接 commit 实现变更）

## Review Rule

- 完成前必须有 review 证据（diff 审查 + 规范对照：supervise diff / domain findings）
- **Developer 不拥有最终验收权**——验收按 `acceptance.md` + 人（或独立审查者）判定

## Test Rule

- 按 `testing.md` 选择测试层级；修复必须带复现测试；禁止为通过而删除/弱化断言

## Evidence Rule

- 不得只用文字声明完成；证据必须类型化、新鲜、绑定 HEAD/worktree/hash
- 禁止复用过期证据、伪造来源与 trust level（`source=local_agent` 如实标注）

## Knowledge Rule

- 必须执行 Knowledge Assessment；受影响 Skill 必须处置（UPDATE / REVIEWED_NO_CHANGE）
- doc-impact 未放行的变更不得完成

## Finish Rule

- 必须经 `finish_task` 收尾（禁止手工把状态改成 completed）
- **strictGovernance=true 时**：Context Audit / Requirement Approval / Implementation Plan / Architecture & Tech Stack Impact / UI Approval（如需要）/ Review / Required Tests / Fresh Evidence / AC Coverage / Knowledge / Affected Skills 任一缺失 → `REQUIRED_ACTIONS`，禁止补造历史事实
