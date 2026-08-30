# 交互规范（Interaction Spec）— TASK-20260830144441-f92f27de

> 设计阶段产物 2/4。对应 PRD：`PRD-20260830-other-设计检查机器校验-design-check`

## 1. 核心用户流程（step by step）

1. 开发产出 `docs/designs/<task-id>/` 下 4 个设计文档；
2. 开发执行 `gate:clear --gate <GATE> --clear create-ui-doc`（或任一设计检查项）；
3. 引擎拦截 → 运行 `design:check --task <task-id>` 对应项校验；
4. 校验通过 → clear 成功；校验失败 → 拒绝 + 提示补齐。

## 2. 状态机

| 状态 | 触发 | 行为 | 展示 |
|---|---|---|---|
| 校验通过 | 文档齐全合规 | 允许 clear | `✅ <check-id>: <reason>` |
| 校验失败 | 文档缺失/Part A 缺节/Part B 空 | 拒绝 clear（exit POLICY_FAILURE） | `❌ <check-id>: <reason>` + 提示 `harness design:check` |

## 3. 反馈机制

- 失败时必须给**可执行下一步**（列出缺失文件/缺失小节），不允许只说"不通过"。

## 4. 边界与异常

- 无 taskId：扫描全部任务，任一 fail → exit 1；
- 目录不存在：所有文档项 fail（不 crash）；
- tech-design 存在但内容为空：Part A/B 项 fail。

## 5. 无障碍

不适用（CLI 文本输出，UTF-8 中文）。
