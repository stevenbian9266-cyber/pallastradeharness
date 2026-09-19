# 交互设计 — TASK-20260919084823-c0b3bcb3（Batch C Constitution 集成）

> 适用性：**部分适用** — 无 UI 交互；定义"开发者 / Agent ↔ Constitution 治理"的程序化交互契约。

## 1. 交互路径

| 主体 | 入口 | 交互 | 结果 |
|---|---|---|---|
| 开发者 | `harness constitution:status` | 查看 current version / drift / stale 审批 / 待处置 skills | 文本 / `--json` |
| 开发者 | `harness constitution:lock` | 锁定当前制品为新 version（无 drift 时） | 快照文件 + version |
| 开发者 | `harness constitution:change --reason <t>` → `constitution:apply --proposal <id>` | 变更流（含 Decision/Approval 可选） | 新 version + skill impact + proposal CLOSED |
| Agent / 任务流 | `harness task start` | 自动冻结 constitution 快照 | `task.constitution` 字段 |
| Agent / 任务流 | `harness task impact --architecture <v> --tech-stack <v>` | 记录影响评估（CHANGE 级需 Decision） | `task.impact` 字段 |
| Agent / 任务流 | `harness task facts` | 查看事实门（4 facts） | 事实清单 |
| 收尾 | `harness task finish` | strict 模式下校验事实完整性 | 缺失 → `REQUIRED_ACTIONS`（exit 非 0） |
| 审查 | `supervise diff` | 自动追加 ARCHITECTURE/TECH_STACK 合规 findings | findings（blocking 按 severity） |

## 2. 契约细节

- **幂等**：`lock` 对同一制品集重复执行返回既有 version（不写第二份快照）——**但不允许静默覆盖**；
- **不可变**：version 文件存在即拒绝重写（状态机只前进）；
- **失败语义**：缺制品 → 明确提示；drift 未走变更流 → `lock` 拒绝并给出 change flow 指引；
- **兼容**：Local 默认 `strictGovernance=false` 行为与今天完全一致；strict 只增不减校验。

## 3. 边界

- 不新增 MCP 工具（冻结面不动；Cloud 属 Batch D）；
- 不删除 / 不弱化 Local `gate:clear`；
- Approval 兼容现有 `user-confirmed` / `design-confirmed`（记录方式为**叠加**，不替换）。
