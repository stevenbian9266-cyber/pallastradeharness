---
layout: default
title: AI 开发生命周期
---
# AI 开发生命周期

Harness 1.0 把一次 AI 开发工作建模为可恢复、可审计的状态机，而不是一次临时对话。

```text
created → planned → implementing → verifying → completed
                    ↘ blocked / abandoned
```

每个 Task 绑定仓库、分支、worktree、基线提交、允许范围、风险等级和所需证据。跨会话继续时，`task resume` 会先检查这些身份，避免在错误分支或另一个 worktree 中继续修改。

## 标准流程

1. `task start` 建立任务身份，`brain context` 只加载与任务相关且非敏感的最小上下文。
2. `risk check` 结合声明、路径、语义和任务文本确定 Quick / Standard / Critical；自动判断只能升级。
3. Task 绑定 Gate 完成前置理解后，`supervise plan` 固化允许/禁止范围和适用规范。
4. 实施中用 `checkpoint` 保存进度，`supervise diff/review` 检查计划漂移和领域约束。
5. `evidence run/record` 记录 test、review、approval、knowledge 等证据；证据绑定 HEAD、worktree 与文件哈希。
6. `knowledge verify` 强制每个受影响知识资产标记为 `updated`、`reviewed-no-change` 或 `not-applicable`。
7. Critical 任务必须先创建并验证人工恢复计划。`evidence verify` 才能自动清除 task-bound Gate 的 `verify-test`。
8. `task finish` 再次校验证据、新鲜度和工作区身份，生成可交付的 handoff/bundle。

## 风险与最低证据

| 等级 | 最低证据 | 额外约束 |
|---|---|---|
| Quick | test | 仍需证据与当前代码状态一致 |
| Standard | test、review、knowledge | 需要领域监督与知识闭环 |
| Critical | test、review、approval、knowledge | 必须有显式恢复计划；Harness 不自动执行破坏性恢复 |

## 跨 Agent 协作

`adapter generate` 只管理带标记的策略块，不覆盖用户内容；`task handoff` 输出目标、决策、进度、证据缺口与下一步。MCP 暴露白名单生命周期能力，不提供任意命令执行，调用者应通过 `evidence run` 记录明确的验证命令。

## 状态与隐私

运行态默认保存在 `.harness-state/` 并应被 gitignore。Project Brain 默认排除 `.env`、密钥、凭据和 secrets 路径；知识索引保存摘要与内容地址缓存，而不是把敏感内容复制到共享证据包。

