# UI 设计 — TASK-20260919113354-6b2096bb（本仓 strict 严格治理 dogfood）

> 本任务**无图形界面**。此处的"UI"= **CLI 输出契约**（终端里给人看的文字），故保留本节以承载
> 「失败时用户看到什么、该做什么」这一人机接口设计。

## 1. 无 GUI 声明

无浏览器/桌面界面：本任务只涉及配置文件声明、文档与 CLI e2e 测试。

## 2. CLI 输出契约（阻断态）

`task finish` 在 strict 模式下缺事实时输出（既有实现，本任务用 e2e 冻结其形状）：

```text
❌ Strict finish blocked — REQUIRED_ACTIONS (N):
   • [context_audit] Context Audit 缺失（无 Context Pack 记录）
     → harness brain context --task TASK-xxx
   • [architecture_impact] Architecture Impact 未记录
     → harness task impact --task TASK-xxx --architecture <NONE|LOCAL|CROSS_MODULE|ARCHITECTURE_CHANGE> --tech-stack <NONE|DEPENDENCY_CHANGE|TECH_STACK_CHANGE>
   …
```

设计要点：

1. **每条缺项必须带可执行命令**（`→` 后为可复制命令）——避免"报错但不知道怎么修"。
2. **退出码非 0**（`POLICY_FAILURE`），使 CI / hook 能阻断。
3. **不改变任务状态**（仍是 `implementing`）——阻断不等于失败作废。
4. **不得出现"自动补造事实"的文案或行为**（strict 的核心承诺）。

## 3. CLI 输出契约（放行态）

```text
✅ Task TASK-xxx completed with verified evidence.
```

## 4. 放行前后的状态可视化

| 阶段 | `task finish` 退出码 | 任务状态 | 用户下一步 |
|---|---|---|---|
| 缺事实（strict） | 1 | implementing | 按 `REQUIRED_ACTIONS` 逐条补齐 |
| 事实齐备（strict） | 0 | completed | 提交/发布 |
| 缺事实（非 strict，兼容） | 1 | implementing | 既有证据类提示（`Task cannot finish: …`） |

## 5. 验收相关性

- AC-002 断言阻断态文案与缺项集合；AC-003 断言放行态；AC-005 断言兼容态**不**出现 strict 文案。
