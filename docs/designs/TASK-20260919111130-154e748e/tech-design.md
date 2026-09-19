# 技术设计 — TASK-20260919111130-154e748e（Batch D / D14：真实 MCP 客户端端到端测试）

上游：指令文档 TASK-D14、`docs/rfc/0006-runtime-boundary.md` §7、`docs/adr/ADR-0002-runtime-boundary.md`（D3 Streamable HTTP v0）。

---

## Part A — 现状识别（Baseline）

### A1 业务系统盘点

| 域 | 现有承载 | 现状行为 | 本任务处置 |
|---|---|---|---|
| Cloud 运行时 | `bin/cloud-runtime.mjs`（D10） | `createCloudRuntime` / `startCloudRuntime`（真实监听、`/health`、`POST /mcp`） | **复用**（被测服务端；不改） |
| 工具面 | `bin/cloud-application.mjs` + `bin/cloud-commands.mjs`（D10/D12） | 12 个工具接线，其余 `cloud_not_implemented` | **复用** |
| strict | `bin/cloud-policy.mjs`（D13） | 恒严格 + 双层守卫 | **复用** |
| 既有验证 | `bin/cloud-runtime.test.mjs`（进程内 `handleRequest`）· `bin/command-registry` · `mcp-server.test.mjs`（服务端） | **无真实客户端** | **新增**：真实 SDK 客户端测试 |
| 依赖面 | `package.json`（零运行时依赖） | 仓库策略要求不新增依赖 | SDK **隔离安装**在仓库外 |

跨层检索结论（REQ Step 0）：`bin/` 无 `@modelcontextprotocol`/`StreamableHTTPClientTransport`；既有 e2e 是 CLI 进程级或服务端视角 → 净新增。

### A2 数据模型识别

- 无新增实体/表；测试使用临时 SQLite（D06 schema）并清理。

### A3 字段盘点

| 字段 | 说明 |
|---|---|
| `HARNESS_MCP_SDK_DIR` | 新增**测试环境变量**（SDK 解析入口）；产品运行时不受影响 |
| SDK 版本 | 锁定 `@modelcontextprotocol/sdk@1.30.0`（实测可用） |
| `requestInit.headers.Authorization` | 真实客户端注入 Bearer（D11 契约） |

### A4 代码结构

| 文件 | 现有职责 | 本任务改动 |
|---|---|---|
| `bin/mcp-real-client.test.mjs` | — | **新增**（真实客户端 3 用例） |
| `README.md` · `CHANGELOG.md` | 文档 | 同步「真实客户端验证」小节 |
| 运行时四层（transport/auth/adapter/commands） | D10-D13 | **零改动** |
| `package.json` | 零依赖 | **零改动**（AC-007 断言） |

---

## Part B — 复用决策矩阵

| 能力需求 | 决策 | 目标 | 依据（已有位置/签名） |
|---|---|---|---|
| 被测服务端（真实端口） | 调用已有 | startCloudRuntime | bin/cloud-runtime.mjs（D10） |
| 工具清单断言基准 | 调用已有 | MCP_TOOLS | bin/mcp.mjs |
| 协议版本断言基准 | 调用已有 | MCP_PROTOCOL_VERSION | bin/mcp.mjs |
| 建库 | 调用已有 | openHarnessDatabaseSync | bin/sqlite-store.mjs（D06） |
| 任务读回校验 | 调用已有 | createSqliteRepositories | bin/sqlite-repositories.mjs（D07） |
| 默认配置 | 调用已有 | DEFAULT_CONFIG | bin/config-loader.mjs |
| SDK 解析 | 新建局部 | loadRealClientSdk | 新增 bin/mcp-real-client.test.mjs（仅本文件使用） |
| 真实客户端连接 | 新建局部 | connectRealClient | 新增 bin/mcp-real-client.test.mjs（仅本文件使用） |
| SDK 默认目录 | 新建局部 | DEFAULT_SDK_DIR | 新增 bin/mcp-real-client.test.mjs |
| SDK 包锁定信息 | 新建局部 | SDK_PACKAGE | 新增 bin/mcp-real-client.test.mjs |

> 决策列取值域：调用已有 / 扩展已有 / 新封装公用 / 新建局部。

---

## Part C — 实施设计

### C1 文件清单（按实施顺序）

1. `bin/mcp-real-client.test.mjs`。
2. `README.md` / `CHANGELOG.md`（验证方式与安装命令）。

### C2 关键实现约定

- **SDK 解析**：`HARNESS_MCP_SDK_DIR` → 默认临时目录；用 `pathToFileURL` 动态 `import()` 两个入口：
  - `dist/esm/client/index.js` → `Client`
  - `dist/esm/client/streamableHttp.js` → `StreamableHTTPClientTransport`
- **真实连接**：`new Client({ name: 'harness-real-client', version })` + `new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: { headers: { Authorization: \`Bearer ${key}\` } } })`。
- **断言口径**：`tools/list` 名称集合与 `MCP_TOOLS` **严格相等**；流程断言读取 `structuredContent`（与协议一致）。
- **失败路径**：无凭据客户端连接/首次调用必须抛错；随后断言数据库中任务数为 0（用 Sqlite TaskRepository 读回）。
- **不可用即 skip**：SDK 缺失 → `test(..., { skip: '...' })`（打印安装命令），避免假绿/假红。
- **清理**：`t.after` 关闭服务端、关闭 DB、删临时目录。
- **零依赖改动**：不修改 `package.json`；AC-007 在测试内静态断言（无新增依赖键）。

### C3 风险与回滚

| 风险 | 处置 |
|---|---|
| 用进程内调用冒充真实客户端 | 强制 `startCloudRuntime` + SDK 传输（真实 socket） |
| CI 无 SDK | skip + 提示（AC-001） |
| SDK 与 v0 传输约定不符（SSE 期望） | 若失败则记录为 deferred 并说明；不伪装通过 |
| 端口/目录残留 | `t.after` 清理 + `port: 0` |
| 污染仓库依赖 | 隔离安装 + AC-007 静态断言 |

**回滚**：删除 `bin/mcp-real-client.test.mjs` 与文档小节即可（运行时零改动）。
