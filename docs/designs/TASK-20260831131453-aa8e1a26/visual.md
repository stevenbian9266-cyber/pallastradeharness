# 视觉设计 — TASK-20260831131453-aa8e1a26

> 设计阶段产物 **3/4**。对应 PRD：`PRD-20260831-other-引擎-harness-token-优化`；Task：`TASK-20260831131453-aa8e1a26`

## 设计令牌引用

本任务为 CLI 引擎，无前端组件；"视觉"即终端文本输出。沿用既有 CLI 视觉惯例：

- 状态标记：`✅`（成功）/ `❌`（失败/阻断）/ `🔒`（gate）/ `📋`（状态）/ `⏭`（跳过）。
- 前缀对齐：`   ` 两级缩进；`[ ]`/`[x]` 表示 check 状态。
- 计数行格式：`N/M checks cleared`。

## 组件/输出视觉变更

| 输出 | 精简后格式 |
|---|---|
| gate --quiet | `🔒 PRE-CODING GATE — {id}` + `N preparation checks` + `Run: harness gate:status --short` |
| gate:status --short | `{id} | {PREPARATION/IMPLEMENTATION/FINISHED} | {cleared|remaining} | {ok|expired}` |
| gate:clear 回显 | `✅ {checkId}` + `{done}/{total} checks cleared` + `Remaining: {ids}` |
| task list 默认 | 最近 20 行 + `（显示最近 20 条，--all 查看全部）` |
| metrics | 追加 `taskArtifacts` 段（PRD/REQ/designs 计数 + 字节 + estTokens） |

## 响应式/一致性声明

- 所有新输出与既有输出共用相同前缀/标记，无新视觉元素。
- `--json` 输出不做任何视觉加工（机器契约）。
