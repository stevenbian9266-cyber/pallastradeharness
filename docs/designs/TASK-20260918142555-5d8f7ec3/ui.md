# UI 文件（界面结构设计）— TASK-20260918142555-5d8f7ec3

> 设计阶段产物 **1/4**。对应 PRD：`PRD-20260918-other-phase-1-mcp-零安装接入-harness-mcp-bin-root-定位-l1-工具面`；Task：TASK-20260918142555-5d8f7ec3
> 适用性：**不适用（N/A）** — pallastrade-harness 是本地治理引擎（CLI + MCP 服务），本任务不产出任何前端界面；MCP 客户端界面由宿主（VS Code / Cursor / Claude / Codex）提供。

## 1. 页面 / 路由清单

无页面与路由（无 Web 前端、无组件目录）。

## 2. 组件树

无组件。复用决策矩阵（tech-design Part B）不涉及任何 UI 组件。

## 3. 页面状态与数据流

不适用。工具调用的状态流（请求/响应/错误信封）属协议层，见 `interaction.md`。

## 4. 导航与入口

入口为协议层：`initialize → notifications/initialized → tools/list → tools/call`（见 `interaction.md` §1）。

## 5. 一致性声明

N/A：本任务不新增界面元素，无视觉一致性与交互风格风险；工具描述文案风格沿用既有 13 工具的英文短描述惯例。
