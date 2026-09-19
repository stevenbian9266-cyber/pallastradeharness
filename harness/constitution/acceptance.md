# Acceptance Standard

> pallastradeharness 验收标准（Batch C / C04）。消费方：`finish_task`（strict 模式按本文档收紧；Local 兼容路径保留）。

## General Definition of Done

1. 变更符合已批准的任务/PRD/设计（范围零漂移）
2. 门禁 preparation 全清；`verify-test` 由新鲜类型化证据关闭
3. 受影响测试全绿（含回归）；文档同步门（doc-impact / docs:check / readme:sync）放行
4. 审查完成（review 证据）；blocking finding 已修复或按 Waiver Policy 记录
5. 影响评估（Architecture / Tech Stack Impact）已记录；Constitution 变更走 Change Flow

## Requirement Acceptance

- 每个 AC 必须有可复核验证位置（测试文件+用例名，或命令实测记录）；PRD 未认领 AC 必须为零（ac-trace）
- PRD 变更后：`user-confirmed` 需重新确认（Approval artifact_hash 变化 → STALE，不得复用）

## Architecture Acceptance

- 变更不得违反 `architecture.json`（依赖方向 / deny 规则 / 模块职责）；违反 `dependency_rules.deny` = blocking
- `ARCHITECTURE_CHANGE` 必须先有 Decision/ADR 记录（`harness task impact` 强制）

## Tech Stack Acceptance

- 新增依赖/技术必须登记 `tech-stack.json`；`DEPENDENCY_CHANGE` 记录影响，`TECH_STACK_CHANGE` 走 Decision + Approval
- 未登记依赖经合规审查提示（warning）；使用受限/弃用技术 = blocking

## UI Acceptance

- 本项目无 UI 产品面：`N/A`；若引入界面（TUI/网页文档站）需补齐 design-confirmed + ui-approval 证据链

## Testing Acceptance

- 满足 `testing.md` 的选择规则与证据要求；修复类必须有复现测试
- 无测试场景（如纯文档）必须提供实测命令记录（docs:check 等）替代

## Evidence Acceptance

- 证据类型覆盖任务风险画像（quick: test；standard: test/review/knowledge；critical: +approval）
- 证据必须新鲜（绑定 HEAD/worktree/hash）；`source=local_agent` 时如实标记，不伪装 CI attestation

## Knowledge Acceptance

- Knowledge Assessment 必须完成（updated / reviewed-no-change / not-applicable）
- 受影响 Skill 必须处置（UPDATE 或 REVIEWED_NO_CHANGE）——Constitution 变更版本携带 `skillImpact` 时由 strict finish 强制

## Severity Blocking Policy

| 严重度 | 处理 |
|---|---|
| `blocking`（架构 deny 违规 / 受限技术 / 证据链断裂 / 安全阻断） | 必须修复；不得以"记录已知问题"代替 |
| `warning`（未登记依赖、范围提示） | 记录并跟踪；不阻断完成，但需在完成报告说明 |
| `info` | 仅记录 |

## Waiver Policy

- 允许豁免：低风险 + 有明确后续任务 + 原因是规则本身的已知缺口（如保护文件再生会触发既定 blocking）
- 豁免必须记录：原因 / 批准人（或授权来源）/ 关联证据 id / 到期条件
- 禁止豁免：安全阻断项、证据新鲜度、伪造流程事实类问题
