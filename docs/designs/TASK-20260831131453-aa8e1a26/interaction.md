# 交互设计 — TASK-20260831131453-aa8e1a26

> 设计阶段产物 **2/4**。对应 PRD：`PRD-20260831-other-引擎-harness-token-优化`；Task：`TASK-20260831131453-aa8e1a26`

## 交互流程

1. AI 运行 `harness gate --task "…" --quiet` → 输出 "N checks（见 gate 文件）" 而非逐条列表。
2. AI 运行 `harness gate:status --short` → 单行 `{gateId} {phase} {remaining} {cleared?}`。
3. AI 运行 `harness task list` → 最近 20 条；`--all` 全量；`--status active` 只显示活动任务。
4. AI 运行 `harness metrics` → 聚合 + 每任务产物文档数与 token 估算。

## 状态机（gate 生命周期不变）

PREPARATION →（全部 preparation done）→ IMPLEMENTATION →（证据验证完成）→ FINISHED。`--quiet`/`--short` 只改变展示，不改变状态机。

## 反馈与边界

- `--quiet` 时若 PREPARATION 未清仍必须 exit 1（约束不因输出精简而放松）。
- `--short` 在过期/无 gate 时仍 exit 1。
- `task list --status <非法值>`：无匹配时输出 "No tasks."（不报错）。
- `disableChecks` 禁用 `verify-test` 时拒绝（约束保护）。

## 可访问性

- CLI 文本输出保持单字节对齐（对齐/换行不破坏）。
- JSON 输出（`--json`）不受精简影响（机器可读契约不变）。

## 边界/异常

- gate 文件不存在 → 提示与现状一致。
- metrics 无任务 → 产物统计为空数组，不抛错。
