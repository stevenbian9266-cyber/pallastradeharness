# 技术设计 — TASK-20260919104352-1b1ecd6b（Batch D / D10/D11：HTTP MCP 运行时 + 静态 Key）

上游：指令文档 TASK-D10/D11、`docs/rfc/0006-runtime-boundary.md` §4/§5/§6、`docs/adr/ADR-0002-runtime-boundary.md`（D3 Streamable HTTP v0 / D4 静态 Key 最小）。

---

## Part A — 现状识别（Baseline）

### A1 业务系统盘点

| 域 | 现有承载 | 现状行为 | 本任务处置 |
|---|---|---|---|
| MCP 协议层 | `bin/mcp.mjs` | `MCP_PROTOCOL_VERSION='2025-03-26'`、`MCP_TOOLS`(20)、`createMcpHandler`（Local：fs/子进程）、`runMcpStdio`；`content()` / `toolError()` 私有 | **扩展**：导出两枚信封函数（FR-013）；协议常量与工具清单**复用** |
| 工具元数据 | `bin/command-registry.mjs` | `FROZEN_MCP_TOOL_NAMES`(36) · `MCP_EXPOSURES` · `MCP_TIERS` | **复用**（测试断言工具名冻结） |
| Cloud 存储 | `bin/sqlite-store.mjs` · `bin/sqlite-repositories.mjs`（D06/D07） | SQLite 12+2 表 + 7 仓储端口 | **复用**（仅应用层可见） |
| 证据边界 | `bin/evidence-boundary.mjs`（D09） | `createBoundaryEvidenceRepository` 自动打边界 | **复用**（`record_evidence` 接线） |
| 提交式 Provider | `bin/submitted-providers.mjs`（D08） | 3 个 Provider 端口实现 | 本批不接线（D12 起按需） |
| HTTP / 鉴权 | —— | **不存在**（`bin/` 对 `node:http`/`HARNESS_API_KEY`/`Bearer` 0 命中） | **新增**：5 个分层模块 |

跨层检索结论（REQ Step 0）：`presets/`、`templates/`、`rules/` 0 命中；`docs/` 16 处均为设计文档 → 净新增。

### A2 数据模型识别

- 无新表：Cloud 运行时复用 D06/D07 的 SQLite（`tasks` 读、`evidences` 写）。
- 新增**协议数据**（不落库）：JSON-RPC 请求/响应、工具结果信封、鉴权结果对象。
  - 鉴权结果：`{ ok:true, scheme:'static_key' }` | `{ ok:false, status:401|503, code, message }`
  - JSON-RPC 错误码：`-32700` parse / `-32600` invalid request / `-32601` method-not-found / `-32603` internal
  - 工具错误信封（复用 Local）：`{ content, structuredContent, isError: true }`

### A3 字段盘点

| 字段 | 位置 | 说明 |
|---|---|---|
| `HARNESS_API_KEY` | 环境变量（`API_KEY_ENV`） | 唯一配置项；空白视为未配置 |
| `authorization` | 请求头（小写化） | 必须 `Bearer <key>` |
| `task_id` / `status` / `limit` | `tools/call` 参数 | `get_task` / `list_tasks` 入参 |
| `evidence_type` / `summary` / `task_id` | `record_evidence` 入参 | 落库后附 `source` / `trust_level` 边界字段（D09） |
| `X-…` 自定义头 | —— | **新增为 0**（不做设备指纹/反共享） |

### A4 代码结构

| 文件 | 现有职责 | 本任务改动 |
|---|---|---|
| `bin/mcp.mjs` | Local MCP（stdio） | **仅加 `export`**（`content` / `toolError`），行为不变 |
| `bin/static-key-auth.mjs` | — | **新增**（鉴权，纯逻辑） |
| `bin/mcp-jsonrpc.mjs` | — | **新增**（JSON-RPC/MCP 适配，只委托） |
| `bin/cloud-application.mjs` | — | **新增**（应用/命令层：唯一触碰 SQLite 与端口） |
| `bin/http-transport.mjs` | — | **新增**（HTTP 传输：`handleHttpRequest` + `startHttpServer`） |
| `bin/cloud-runtime.mjs` | — | **新增**（组装根：串联全部层） |
| `bin/static-key-auth.test.mjs` · `bin/cloud-runtime.test.mjs` | — | **新增** |
| `README.md` · `CHANGELOG.md` | 文档 | 同步（任务 allow list 内） |

---

## Part B — 复用决策矩阵

| 能力需求 | 决策 | 目标 | 依据（已有位置/签名） |
|---|---|---|---|
| 协议版本常量 | 调用已有 | MCP_PROTOCOL_VERSION | bin/mcp.mjs |
| 工具清单（tools/list） | 调用已有 | MCP_TOOLS | bin/mcp.mjs |
| 工具结果信封 | 调用已有 | content | bin/mcp.mjs（本批导出） |
| 业务失败信封 | 调用已有 | toolError | bin/mcp.mjs（本批导出） |
| 冻结工具名校验 | 调用已有 | FROZEN_MCP_TOOL_NAMES | bin/command-registry.mjs |
| Cloud 仓储 | 调用已有 | createSqliteRepositories | bin/sqlite-repositories.mjs（D07） |
| 证据边界包装 | 调用已有 | createBoundaryEvidenceRepository | bin/evidence-boundary.mjs（D09） |
| 静态 Key 读取 | 新封装公用 | readApiKey | 新增 bin/static-key-auth.mjs |
| 请求鉴权 | 新封装公用 | authorizeRequest | 新增 bin/static-key-auth.mjs |
| 鉴权环境变量名 | 新封装公用 | API_KEY_ENV | 新增 bin/static-key-auth.mjs（HARNESS_API_KEY） |
| Bearer 方案前缀 | 新封装公用 | BEARER_PREFIX | 新增 bin/static-key-auth.mjs |
| JSON-RPC/MCP 适配 | 新封装公用 | createJsonRpcAdapter | 新增 bin/mcp-jsonrpc.mjs（对齐 mcp.mjs 分发语义） |
| Cloud 应用层 | 新封装公用 | createCloudApplication | 新增 bin/cloud-application.mjs |
| HTTP 处理器 | 新封装公用 | createHttpHandler | 新增 bin/http-transport.mjs |
| HTTP 请求处理（纯函数） | 新建局部 | handleHttpRequest | 新增 bin/http-transport.mjs（createHttpHandler 返回的处理器，仅本模块内部使用） |
| HTTP 监听 | 新封装公用 | startHttpServer | 新增 bin/http-transport.mjs（node:http） |
| Cloud 运行时组装 | 新封装公用 | createCloudRuntime | 新增 bin/cloud-runtime.mjs |
| Cloud 运行时启动 | 新封装公用 | startCloudRuntime | 新增 bin/cloud-runtime.mjs |
| JSON-RPC 错误码表 | 新建局部 | JSON_RPC_ERROR_CODES | 新增 bin/http-transport.mjs（仅本模块使用） |

> 决策列取值域：调用已有 / 扩展已有 / 新封装公用 / 新建局部。本批对 `bin/mcp.mjs` 的改动仅为**导出已有函数**（不改行为），故不单列「扩展已有」行。

---

## Part C — 实施设计

### C1 文件清单（按实施顺序）

1. `bin/mcp.mjs`：`content` / `toolError` 加 `export`。
2. `bin/static-key-auth.mjs`。
3. `bin/mcp-jsonrpc.mjs`。
4. `bin/cloud-application.mjs`。
5. `bin/http-transport.mjs`。
6. `bin/cloud-runtime.mjs`。
7. `bin/static-key-auth.test.mjs`、`bin/cloud-runtime.test.mjs`。

### C2 关键实现约定

- **分层依赖方向（单向，AC-010）**：
  `cloud-runtime` → {`http-transport`, `mcp-jsonrpc`, `cloud-application`, `static-key-auth`}；
  `cloud-application` → {`mcp.mjs` 常量/信封, `sqlite-repositories`, `evidence-boundary`}；
  `mcp-jsonrpc` → {`mcp.mjs` 常量/信封}（**不得** import sqlite / 领域模块）；
  `http-transport` → {`node:http`}（**不得** import sqlite / 领域 / 适配器）；
  `static-key-auth` → {`node:crypto`}。
- **常数时间比较**：`timingSafeEqual`，长度不等时先各自 hash（避免长度泄露与抛错）。
- **HTTP 处理器**：`handleHttpRequest` 纯函数（入参 `{method, path, headers, body}`，出参 `{status, headers, body}`）；`startHttpServer` 只做 socket 适配（收集 body → 调 handler → 写响应）。
- **JSON-RPC**：`initialize` / `ping` / `notifications/initialized` / `tools/list` / `tools/call`；未知 → `-32601`；通知 → `null`（HTTP `202`）。
- **应用层**：`listTools()` 返回 `MCP_TOOLS`；`callTool` 用显式分发表（`list_tasks` / `get_task` / `record_evidence`），其余 → `toolError('cloud_not_implemented', …)`，**不猜测、不代填**。
- **决策点控制**：延续 D08/D09 经验——字段缺省走 `fieldOf` 风格助手，SQL/字符串常量化，避免 `??` 堆积（每个 `??` 计 1 决策点）。
- **可观测**：`/health` 免鉴权（部署探活）；响应不回显 key。

### C3 风险与回滚

| 风险 | 处置 |
|---|---|
| 架构退化（HTTP→SQLite 直连 / 传输层判业务） | 静态 import 断言（AC-010）+ 应用层为唯一存储访问点 |
| 工具伪造 PASS | 未实现工具统一 `cloud_not_implemented`；`finish_task` 用例强断言 |
| key 泄露 | 不回显、不记录；鉴权失败早退（AC-008 计数器） |
| 协议漂移 | `tools/list === MCP_TOOLS`（AC-004）+ 冻结名单校验 |
| 真实监听端口占用（CI 不稳定） | `startHttpServer({ port: 0 })` 由系统分配端口（AC-011） |

**回滚**：删除 5 个新模块与 2 个测试，并撤销 `mcp.mjs` 的两处 `export`（Local 行为不受影响）。
