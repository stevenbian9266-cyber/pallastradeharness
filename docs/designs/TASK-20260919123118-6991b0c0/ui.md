# UI 设计 — TASK-20260919123118-6991b0c0（harness 托管 MCP 本地构建与离线部署）

> 本任务**无图形界面**。此处"UI" = **运维可见面**：CLI/容器/nginx 三类终端与 HTTP 端点回显。

## 1. 无 GUI 声明

本任务交付部署资产与 HTTP 服务入口，不涉及浏览器界面（站点页面属 RFC-0005 M5，范围外）。

## 2. 服务启动回显（`harness-mcp --http`）

```text
harness-mcp (http) listening on http://127.0.0.1:3110
  db: /data/harness-cloud.db | strictGovernance: true | auth: HARNESS_API_KEY
```

约定：单行可 grep（`listening on`）；失败时 `❌ harness-mcp: <原因>` 且退出码非 0（缺 Key / Node 无 sqlite / DB 不可写）。

## 3. HTTP 端点回显（与 nginx / 监控共用）

| 端点 | 方法 | 回显 |
|---|---|---|
| `/healthz`、`/readyz`、`/health` | GET | `{"ok":true,"runtime":"cloud","strictGovernance":true}`（200） |
| `/mcp` | POST（Bearer） | JSON-RPC 2.0 结果；未鉴权 `401 {"error":"missing_credentials"}` |
| 其他路径 | 任意 | `404 {"error":"not_found"}` |

## 4. 部署脚本回显

- 本机构建：`✅ built harness-mcp:1.10.0-5356d3d (61.2 MB)` → `✅ saved artifacts/dist/harness-mcp-1.10.0-5356d3d.tar.gz (+ manifest)`
- 上传+激活：`✅ uploaded (1 file, 58.3 MB)` → 服务器侧 `✅ image loaded` → `✅ app healthy (12s)` → `✅ https://mcp.pallastrade.cn/healthz`
- 回滚：`❌ health check failed after 60s — rolling back to <prev-tag>` → `✅ rolled back`（退出码非 0）

## 5. 视觉一致性约定

| 元素 | 约定 |
|---|---|
| 成功/失败 | `✅` / `❌` 前缀（与引擎其余输出一致） |
| 颜色 | 不引入 ANSI 颜色（容器/CI 日志可读） |
| 关键值 | 单行内呈现（tag、端口、路径、耗时），便于运维 grep 与截图存档 |
| 资源上限 | 不在回显里展示 Key 值（只显示 `auth: HARNESS_API_KEY`） |
