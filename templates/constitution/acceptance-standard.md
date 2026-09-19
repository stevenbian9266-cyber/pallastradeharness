# Acceptance Standard

> Project Constitution 模板（Batch B / B10）。定位：定义"什么算完成"与"谁能放行"。
> 消费方：`finish_task`（Batch C 起按本文档收紧；Local 兼容路径保留，Strict 模式不得补造事实）。

## General Definition of Done

- 通用完成判据（全部满足才可 `finish_task`）：
  1. 变更符合已批准的 Task / PRD / 计划；
  2. 必备证据齐全且新鲜（绑定当前 HEAD）；
  3. 受影响测试通过（含回归）；
  4. 知识同步完成（doc-impact / 受影响文档）；
  5. 审查完成（review 证据），无未处置的 blocking finding（或已按 Waiver Policy 记录）。

## Requirement Acceptance

- 需求验收：每个 AC 必须有可复核的验证位置（测试 / 命令 / 人审截图）：
- 需求变更后的重验收规则：

## Architecture Acceptance

- 架构验收：变更不得违反 `architecture.md`（模块边界 / 依赖方向 / 禁止模式）：
- 触发 `ARCHITECTURE_CHANGE` 时必须先有 Decision / ADR 与批准：

## Tech Stack Acceptance

- 技术栈验收：新增技术必须登记进 `tech-stack.md`：
- `DEPENDENCY_CHANGE` 与 `TECH_STACK_CHANGE` 的分级处理与审批：

## UI Acceptance

- UI 验收（若适用）：设计确认（design-confirmed）/ UI 批准（ui-approval）证据要求：
- 视觉回归基线要求：

## Testing Acceptance

- 测试验收：满足 `testing-standard.md` 的选择规则与证据要求：
- 允许的例外（无测试场景）与所需替代证据：

## Evidence Acceptance

- 证据验收：类型（test/review/approval/knowledge…）、来源（本机执行 / Agent 提交）、trust level 标注：
- 禁止：仅文字声明完成、复用过期证据、伪造 CI attestation：

## Knowledge Acceptance

- 知识验收：完成 Knowledge Assessment（updated / reviewed-no-change / not-applicable）：
- 受影响 Skill 的 stale 处置（UPDATE 或 REVIEWED_NO_CHANGE）：

## Severity Blocking Policy

| 严重度 | 处理 |
|---|---|
| `blocking` / `error`（安全、契约、架构阻断） | 必须修复后才可完成；不得豁免完成 |
| `warning` | 记录并跟踪；不阻断，但需在完成报告说明 |
| `info` | 仅记录 |

## Waiver Policy

- 允许豁免的情形（低风险 + 有明确后续任务）：
- 豁免必须记录：原因 / 批准人 / 关联证据 / 到期条件：
- 禁止豁免：安全阻断项、证据链完整性、伪造事实类问题：
