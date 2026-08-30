# UI 文件（界面结构设计）— TASK-20260830144441-f92f27de

> 设计阶段产物 1/4。对应 PRD：`PRD-20260830-other-设计检查机器校验-design-check`

## 1. 页面 / 路由清单

本次是**纯 CLI 引擎功能**（无 Web UI）：界面 = 命令行输出。

| 界面 | 入口 | 新增/改动 | 归属业务模块 |
|---|---|---|---|
| `design:check` 结果输出 | `harness design:check [--task <id>]` | 新增 | 设计阶段治理 |
| `gate:clear` 拒绝提示 | `harness gate:clear --clear create-ui-doc …` | 改造（新增拦截提示） | Gate 生命周期 |

## 2. 组件树

不适用（CLI）。输出组件 = 控制台行：`✅/❌ <check-id>: <reason>`。

## 3. 页面状态与数据流

| 状态/数据 | 类型 | 来源 |
|---|---|---|
| 6 项设计检查结果 | 对象 `{ [checkId]: {pass, reason} }` | `checkDesignArtifacts`（纯函数） |
| 校验失败数 | number | 结果汇总 |

## 4. 导航与入口

- `design:check` 挂在已有 `design:` 命令分支（冒号子命令套路）。

## 5. 一致性声明

与 `reuse-adherence` 输出风格一致（`✅/❌` 前缀 + 原因），无差异。
