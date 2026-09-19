# PRD — Batch D D10/D11：HTTP MCP 运行时 + 静态 Key 鉴权

- **状态**：approved（授权：ADR-0002 ACCEPTED + 用户「继续」）
- **任务**：TASK-20260919104352-1b1ecd6b（critical）
- **上游规格**：`pallastradeharness Phase 1 AI 实施指令.md` TASK-D10 / TASK-D11；`docs/rfc/0006-runtime-boundary.md` §4/§5/§7；`docs/adr/ADR-0002-runtime-boundary.md`（D1 端口 / D3 Streamable HTTP v0 / D4 静态 Key 最小）
- **语言/栈**：Node ESM + 内置 `node:http` + `node:crypto`（零新依赖）；影响面 = 新增 Cloud 运行时，**Local 运行时零改动**

## 1. 背景

D06-D09 已交付 Cloud 存储（SQLite 12+2 表）、Sqlite 仓储端口、提交式上下文 Provider 与证据边界。缺的是**运行时**：指令 TASK-D10 要求独立 Cloud Runtime 且**分层固定**：

```
HTTP Transport → Static Key Auth → MCP Adapter → Application / Command Layer → Governance Core → SQLite
```

两条硬禁止：
- `HTTP handler → direct SQLite`（HTTP 层不得直连存储）；
- `MCP tool → directly decide PASS`（工具不得自行判定业务通过/完成）。

TASK-D11 限定鉴权范围：Phase 1 只用 `HARNESS_API_KEY` + `Authorization: Bearer …`；**不做** User / Tenant / Trial / Expiry / Key database / Device / Anti-sharing。

跨层检索（REQ Step 0）：`bin/` 对 `node:http` / `createServer` / `HARNESS_API_KEY` / `Bearer` **0 命中**（仅 wizard 文案误命中）；`presets/`、`templates/`、`rules/` 0 命中；`docs/` 16 处均为设计文档 → 净新增。

## 2. 目标

- **G1**：5 个分层模块（transport / auth / adapter / application / composition root），依赖方向单向，**可静态断言**。
- **G2**：HTTP JSON-RPC e2e（`initialize` / `ping` / `tools/list` / `tools/call`）在纯函数式 `handleRequest` 上可测（无需真实端口），另提供 `startCloudRuntime` 真实监听。
- **G3**：`tools/list` 与 Local **完全一致**（同一 `MCP_TOOLS`），冻结工具名不破坏（D12 兼容基础）。
- **G4**：未在 Cloud 实现的工具返回 `cloud_not_implemented` 错误信封（诚实降级，**绝不伪造 PASS 或补造证据**）。
- **G5**：静态 Key 鉴权（`HARNESS_API_KEY` + Bearer，常数时间比较），未配置/缺失/错误分别 503/401/401，且**鉴权失败不进入应用层**。
- **G6**：`record_evidence` 走 D09 证据边界包装（自动 `source=local_agent` / `trust_level=cooperative`）。

## 3. 用户场景

1. **Cloud 客户端（D14 真客户端）**：`POST /mcp` 带 `Authorization: Bearer <key>` → `initialize` 握手 → `tools/list` 看到 20 个冻结工具 → `tools/call` 调 `list_tasks` / `get_task` / `record_evidence`。
2. **未实现工具**：客户端调 `finish_task` → 得到 `isError: true` + `code: cloud_not_implemented`（模型可自愈，运维可观测），**而不是**假的“任务已完成”。
3. **鉴权**：未带 header → 401；key 错误 → 401；`HARNESS_API_KEY` 未配置 → 503（部署错误，不是客户端错误）。
4. **审计**：Cloud 记录的证据自动带边界标记，出现 `ci_attested` 声明而无佐证则直接报错。

## 4. 功能需求

| ID | 需求 |
|---|---|
| FR-001 | `bin/static-key-auth.mjs`：`API_KEY_ENV` / `BEARER_PREFIX` / `readApiKey(env)` / `authorizeRequest({ headers, env })` → `{ ok:true, scheme:'static_key' }` 或 `{ ok:false, status, code, message }` |
| FR-002 | key 比较使用 `node:crypto` 常数时间比较；空/空白 key 视为未配置；仅支持 `Bearer` 方案；**无** user/tenant/expiry 字段 |
| FR-003 | `bin/mcp-jsonrpc.mjs`：`createJsonRpcAdapter({ application, serverInfo })` → `handle(request)`；支持 `initialize` / `ping` / `notifications/initialized` / `tools/list` / `tools/call`；未知方法/工具 → 错误码 `-32601` |
| FR-004 | `tools/call` 结果若是工具结果信封（含 `content`）则原样返回，否则用 `content()` 包装（与 Local stdio 语义一致） |
| FR-005 | `bin/cloud-application.mjs`：`createCloudApplication({ db, config, env })` → `{ listTools(), callTool(name, args) }`；`listTools()` 返回冻结的 `MCP_TOOLS` |
| FR-006 | 应用层实现 `list_tasks`（TaskRepository.list，默认上限 20、可按 status 过滤）、`get_task`（需 `task_id`，未知 id → null 结果）、`record_evidence`（经 `createBoundaryEvidenceRepository` 打边界标记） |
| FR-007 | 其余工具返回 `toolError('cloud_not_implemented', …)`（不伪造成功、不代填审批/证据） |
| FR-008 | `bin/http-transport.mjs`：`createHttpHandler({ authorize, adapter })` → `handleHttpRequest({ method, path, headers, body })` → `{ status, headers, body }`；`GET /health` → 200（免鉴权）；`POST /mcp` → 鉴权 → JSON-RPC；非 `/mcp` 路径 404；非 POST 405 |
| FR-009 | JSON 解析失败 → 400 + JSON-RPC `-32700`；请求体非法（缺 jsonrpc/method）→ 400 + `-32600`；适配器抛错 → 200 + `-32603`（带 error 对象）；通知（无 id）→ 202 空体 |
| FR-010 | `bin/http-transport.mjs` 提供 `startHttpServer({ handler, port, host })`（`node:http` 监听，返回 `{ server, url, close }`） |
| FR-011 | `bin/cloud-runtime.mjs`：`createCloudRuntime({ db, config, env })` 组装全部层（应用 → 适配器 → 传输）；`startCloudRuntime({ db, config, env, port, host })` 真实监听 |
| FR-012 | 分层可断言：`http-transport.mjs` / `mcp-jsonrpc.mjs` 不得 import `sqlite-repositories` / `sqlite-store` / 领域模块（防 `HTTP → direct SQLite`、防传输层判业务） |
| FR-013 | `bin/mcp.mjs` 导出 `content` 与 `toolError`（供 Cloud 复用同一结果信封，避免复制协议语义） |

## 5. 非功能需求

- **零依赖**：只用 Node 内置（`node:http` / `node:crypto`）。
- **可测**：`handleHttpRequest` 为纯函数（无 socket），e2e 用例可直接断言状态码与 JSON-RPC 响应。
- **可部署**：`startCloudRuntime` 监听真实端口（D14/部署使用）。
- **安全**：不泄露 key（响应与日志均不含 key 明文）；鉴权失败路径不触达应用层。

## 6. 验收标准（AC）

| ID | 验收标准 | 验证方式 |
|---|---|---|
| AC-001 | 未配置 key → 503；缺 header → 401；非 Bearer → 401；key 错误 → 401；正确 → `ok:true` | `bin/static-key-auth.test.mjs` |
| AC-002 | 空白 key 视为未配置；比较为常数时间 API（`timingSafeEqual`）且不因长度不同抛错 | `bin/static-key-auth.test.mjs` |
| AC-003 | `initialize` 返回协议版本与 serverInfo；`ping` / 通知语义与 Local 一致 | `bin/cloud-runtime.test.mjs` |
| AC-004 | `tools/list` 与 Local `MCP_TOOLS` 完全一致（名称集合相等且全部属于 `FROZEN_MCP_TOOL_NAMES`） | `bin/cloud-runtime.test.mjs` |
| AC-005 | `tools/call list_tasks` / `get_task` 返回真实 SQLite 数据（经 TaskRepository 播种） | `bin/cloud-runtime.test.mjs` |
| AC-006 | `tools/call` 未实现工具（如 `finish_task`）→ `isError: true` + `cloud_not_implemented`（**不伪造 PASS**） | `bin/cloud-runtime.test.mjs` |
| AC-007 | `record_evidence` 落库并带 `source=local_agent` / `trust_level=cooperative` | `bin/cloud-runtime.test.mjs` |
| AC-008 | 鉴权失败（401/503）时应用层未被调用（计数器为 0） | `bin/cloud-runtime.test.mjs` |
| AC-009 | 路径/方法错误 → 404/405；坏 JSON → 400 + `-32700`；非法请求 → 400 + `-32600` | `bin/cloud-runtime.test.mjs` |
| AC-010 | 分层断言：transport / jsonrpc 模块源码不含 `sqlite` 与领域模块 import | `bin/cloud-runtime.test.mjs` |
| AC-011 | `startHttpServer` 可真实监听并处理一次 `POST /mcp`（本地回环端口） | `bin/cloud-runtime.test.mjs` |

## 7. 架构 / 技术影响

- **架构**：CROSS_MODULE（Cloud 运行时 5 模块 + `mcp.mjs` 导出两枚信封函数；Local 零改动；不新增第二引擎，工具不判业务 ARCH-R2）。
- **技术栈**：`node:http`（ADR-0002 D3：Streamable HTTP v0，POST-only，不做 SSE）。
- **风险**：工具面在 Cloud 未实现对客户端是可见缺口 → 以 `cloud_not_implemented` 显式暴露（D12 补齐），不静默降级。

## 8. 测试计划

- 新增 `bin/static-key-auth.test.mjs`（6）、`bin/cloud-runtime.test.mjs`（11，含真实端口 e2e）。
- 回归：`npm run test:core`（当前 441）必须全绿；D04-D09 契约用例保持通过。

## 9. 范围外

- D12（MCP 兼容：把剩余冻结工具接入 Cloud、新增 `project_init` / `project_status` / `record_approval` / `get_template`）。
- D13（Cloud `strictGovernance=true`）、D14（真客户端测试）、部署构件（RFC-0005 §5）。
- 多用户/租户/密钥库/过期/设备绑定（指令明确不做）。
