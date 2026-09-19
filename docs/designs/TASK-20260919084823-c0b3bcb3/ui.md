# UI 设计 — TASK-20260919084823-c0b3bcb3（Batch C Constitution 集成）

> 适用性：**不适用（N/A）** — 引擎仓运行时治理能力（契约 / 制品 / 版本 / 审批 / 事实门 / 严格收尾），无前端界面。

## 判定依据

| 维度 | 事实 | 结论 |
|---|---|---|
| 产出物 | 6 个 `bin/*.mjs` 模块 + 制品 JSON/MD + CLI 子命令 | 无 UI |
| 交互面 | 命令行输出（`constitution:status` 等）与错误信息 | 终端文本 |
| 宿主界面 | 无 | — |

## 替代性"界面"约定（记录用）

- `constitution:status` 输出：current version / 制品数 / drift 列表 / stale 审批数 / 待处置 skills；
- `REQUIRED_ACTIONS` 输出：每条缺失事实附可执行命令（人可照着补，无需理解内部模型）。
