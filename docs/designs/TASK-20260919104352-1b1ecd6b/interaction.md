# 交互规格 — TASK-20260919104352-1b1ecd6b（D10/D11）

本任务无界面交互；「交互」= **HTTP 端点契约 + JSON-RPC 消息契约 + 鉴权语义**。

## 1. HTTP 端点

| 方法 | 路径 | 鉴权 | 响应 |
|---|---|---|---|
| `GET` | `/health` | 否 | `200` + `{"ok":true,"runtime":"cloud"}` |
| `POST` | `/mcp` | 是（Bearer） | `200` JSON-RPC 响应 / `202` 空体（通知） / `400`（-32700/-32600）/ `401` / `503` |
| 其它路径 | — | — | `404` + `{"error":"not_found"}` |
| 其它方法 | `/mcp` | — | `405` + `{"error":"method_not_allowed"}` |

响应头固定含 `content-type: application/json`（`202` 除外，空体）。

## 2. 鉴权语义（D11）

| 情况 | 状态码 | body `code` |
|---|---|---|
| `HARNESS_API_KEY` 未配置 / 空白 | `503` | `auth_not_configured` |
| 无 `authorization` 头 | `401` | `missing_credentials` |
| 方案不是 `Bearer`（如 `Basic`） | `401` | `invalid_scheme` |
| key 不匹配 | `401` | `invalid_key` |
| key 匹配 | — | 放行（`scheme: 'static_key'`） |

- 比较使用常数时间 API；长度不同也走同一路径（不抛错、不早退泄露）。
- **不做**：用户/租户/试用/过期/密钥库/设备绑定/反共享。
- 响应与日志**不含** key 明文。

## 3. JSON-RPC 契约（与 Local stdio 一致）

| 请求 | 响应 |
|---|---|
| `initialize` | `{ protocolVersion: <MCP_PROTOCOL_VERSION>, capabilities: { tools: { listChanged: false } }, serverInfo: { name, version } }` |
| `ping` | `{}` |
| `notifications/initialized`（无 id） | 无响应（HTTP `202` 空体） |
| `tools/list` | `{ tools: MCP_TOOLS }`（与 Local 严格一致） |
| `tools/call { name, arguments }` | 工具结果信封 `{ content: [...], structuredContent, isError? }` |
| 未知方法 / 未知工具 | JSON-RPC error `-32601` |

## 4. 应用层工具语义

| 工具 | 实现 | 返回 |
|---|---|---|
| `list_tasks` | `tasks.list()`（可按 `status` 过滤，默认上限 20） | `{ count, total, tasks: [{ id, title, status, riskLevel, updatedAt }] }` |
| `get_task` | `tasks.get(task_id)` | task 对象；未知 id → `null`；缺 `task_id` → `cloud_not_implemented`? 否 → `missing_argument` 错误信封 |
| `record_evidence` | D09 边界包装的 `evidence.record` | `{ id, taskId, evidenceType, summary, source: 'local_agent', trust_level: 'cooperative' }` |
| 其它冻结工具（`finish_task` / `gate_clear` / `run_verifier` …） | 未实现 | `isError: true` + `{ code: 'cloud_not_implemented', retryable: false }` |

**关键约束**：应用层不判定业务结果——工具调用只是把请求映射到领域/端口调用；`finish_task` 等未接线工具**不返回成功**（防伪造 PASS / 补造审批）。

## 5. 失败语义

| 场景 | 行为 |
|---|---|
| 请求体不是 JSON | `400` + `-32700`（parse error） |
| 缺 `jsonrpc` / `method` | `400` + `-32600`（invalid request） |
| 适配器/应用层抛错 | `200` + `-32603`（internal error，不泄露堆栈细节以外的敏感信息） |
| SQLite 未打开 / 迁移失败 | 组装期抛错（fail-fast，不启动半可用运行时） |
| 未知工具 | `-32601`（JSON-RPC 层）/ 未实现但已注册 → `cloud_not_implemented`（工具层） |
