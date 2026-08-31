# UI 设计 — TASK-20260831131453-aa8e1a26

> 设计阶段产物 **1/4**。对应 PRD：`PRD-20260831-other-引擎-harness-token-优化`；Task：`TASK-20260831131453-aa8e1a26`

## 页面/界面范围

本任务为 CLI 引擎优化，无图形界面。涉及的用户可见"界面"是 **CLI 命令输出**（terminal 文本）。

## 界面清单与变更

| 界面 | 现状 | 变更 |
|---|---|---|
| `harness gate` 输出 | 全量 check 列表 | 新增 `--quiet`：仅计数 + 必读提示（默认保持全量） |
| `harness gate:status` 输出 | 多行详细 | 新增 `--short`：单行状态 |
| `harness gate:clear` 输出 | 重复 check 描述 | 精简：变更项 + 剩余计数 + 未清项 id |
| `harness task list` 输出 | 全量任务行 | 默认最近 20 条 + `--all` + `--status` |
| `harness metrics` 输出 | 计数/时间戳 | 增加产物文档数 + token 估算 |

## 数据流

CLI 参数（`--quiet`/`--short`/`--all`/`--status`）→ 命令分支读取 → 输出裁剪逻辑 → 终端。

## 交互与状态

- `gate --quiet`：仍写 gate 文件、仍 exit 1（PREPARATION 未清）；仅少打印 check 列表。
- `gate:status --short`：退出码语义与多行版完全一致（0=有效，1=过期/无 gate）。
- 所有新 flag 默认关闭 → 既有脚本/CI 输出不受影响。
