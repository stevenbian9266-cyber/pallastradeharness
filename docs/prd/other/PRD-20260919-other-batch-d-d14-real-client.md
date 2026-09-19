# PRD — Batch D D14：真实 MCP 客户端端到端测试

- **状态**：approved（授权：ADR-0002 ACCEPTED + 用户「继续」）
- **任务**：TASK-20260919111130-154e748e（critical）
- **上游规格**：`pallastradeharness Phase 1 AI 实施指令.md` TASK-D14；`docs/rfc/0006-runtime-boundary.md` §7；`docs/adr/ADR-0002-runtime-boundary.md`（D3 Streamable HTTP v0）
- **影响面**：新增真实客户端测试（**仓库外**隔离依赖）；本仓零依赖策略不变

## 1. 背景

D10-D13 已交付 Cloud HTTP 运行时、工具面与 strict 强制，但验证一直是**进程内**调用（`handleRequest` / `runtime.application`）。指令 TASK-D14 明确：

> 至少拿计划支持的真实客户端测试：`tools/list`、`tools/call`、`project init`、`task start`、`task status`、`evidence`、`finish`。
> **不能只写 mock MCP test 就宣布完成。**

因此本批用**官方 `@modelcontextprotocol/sdk`**（真实 `Client` + `StreamableHTTPClientTransport`）通过网络驱动运行时，覆盖上述 7 个场景。

环境事实（实测）：
- npm registry = `https://registry.npmmirror.com` 可达；`@modelcontextprotocol/sdk` 最新 `1.30.0`；
- 本仓 `node_modules` 无 MCP SDK，且仓库为零依赖策略（不往 `package.json` 添加依赖）；
- 结论：SDK **隔离安装到仓库外**（`%TEMP%\harness-mcp-client`），测试通过环境变量/默认路径解析，未安装时整体 skip。

## 2. 目标

- **G1**：新增 `bin/mcp-real-client.test.mjs`：真实 SDK 客户端 → 真实端口 → 真实 HTTP。
- **G2**：覆盖指令要求的 7 个场景（`tools/list` / `tools/call` / `project init` / `task start` / `task status` / `evidence` / `finish`）。
- **G3**：**不污染仓库**：SDK 从仓库外加载；解析顺序 = `HARNESS_MCP_SDK_DIR` → `%TEMP%\harness-mcp-client\...` → 找不到则 skip（`test:core` 不因缺 SDK 失败）。
- **G4**：真实失败路径：**无凭据的真实客户端**必须被拒（401）。
- **G5**：证据可复现：README/CHANGELOG 记录安装命令与运行命令。

## 3. 用户场景

1. **交付验收**：维护者执行
   ```text
   npm i --prefix "%TEMP%\harness-mcp-client" @modelcontextprotocol/sdk@1.30.0
   node --test bin/mcp-real-client.test.mjs
   ```
   看到真实客户端握手、工具枚举与完整治理流程通过。
2. **CI（无 SDK）**：`npm run test:core` 中该文件自动 skip，并打印所需安装命令（不产生假绿）。
3. **安全回归**：不带 `Authorization` 的真实客户端在 `initialize` 阶段即失败。

## 4. 功能需求

| ID | 需求 |
|---|---|
| FR-001 | 解析 SDK 路径：`HARNESS_MCP_SDK_DIR` → 默认 `os.tmpdir()/harness-mcp-client/node_modules/@modelcontextprotocol/sdk`；两者皆无 → 测试 skip 并给出安装命令 |
| FR-002 | 用 `Client` + `StreamableHTTPClientTransport` 连接 `${url}/mcp`，`requestInit.headers.Authorization = 'Bearer <key>'` |
| FR-003 | 场景 1（tools/list）：真实 `client.listTools()` 结果与 Local `MCP_TOOLS` 名称集合**严格相等** |
| FR-004 | 场景 2~7：`project_init` → `start_task` → `list_tasks`/`get_task`（task status）→ `finish_task`（先拒绝）→ `record_evidence` ×3 → `finish_task`（成功 completed） |
| FR-005 | 无凭据客户端：`client.connect()` 或首个请求抛错（HTTP 401），且**不产生任何任务**（数据库无新增） |
| FR-006 | 测试结束后关闭真实服务器与数据库、清理临时目录（不残留端口/文件） |
| FR-007 | 本仓 `package.json` / `package-lock.json` **零改动** |

## 5. 非功能需求

- **零仓库依赖变更**：SDK 仅存在于仓库外目录。
- **可跳过**：缺 SDK 时 skip（不是失败），避免 CI 假红。
- **真实网络**：必须经真实端口（`startCloudRuntime`），不得用进程内 `handleRequest` 替代。

## 6. 验收标准（AC）

| ID | 验收标准 | 验证方式 |
|---|---|---|
| AC-001 | SDK 缺失 → 跳过且提示安装命令（不失败） | 运行无 `HARNESS_MCP_SDK_DIR` 且临时目录被清空时 |
| AC-002 | 真实客户端 `tools/list` 与 `MCP_TOOLS` 名称集合相等 | `bin/mcp-real-client.test.mjs` |
| AC-003 | 真实客户端完成 `project_init` + `start_task`，任务可在 `list_tasks`/`get_task` 中读到 | 同上 |
| AC-004 | 真实客户端 `finish_task` 在证据不足时被拒（`evidence_policy_unmet`） | 同上 |
| AC-005 | 真实客户端写入 3 类证据后 `finish_task` 成功且任务 `completed` | 同上 |
| AC-006 | 无凭据真实客户端被拒（401）且未创建任务 | 同上 |
| AC-007 | 仓库依赖面零改动（`package.json` 无新增依赖键） | 静态断言（测试内） |

## 7. 架构 / 技术影响

- **架构**：NONE（仅新增测试资产；运行时四层不动）。
- **技术栈**：测试侧使用官方 MCP SDK（仓库外隔离）；产品运行时仍零依赖。
- **风险**：SDK 版本漂移 → 记录锁定版本（1.30.0）并在 README 写明；缺 SDK 的 CI 场景 → skip + 提示。

## 8. 测试计划

- 新增 `bin/mcp-real-client.test.mjs`（3 用例：tools/list、完整流程、无凭据拒绝）。
- 真实运行一次并保留输出作为证据（本批 `verify-test` 的一部分）。
- 回归：`npm run test:core`（476 基线 + 无 SDK 时 skip）全绿。

## 9. 范围外

- 把 SDK 纳入仓库依赖（违反零依赖策略）。
- 官方 Inspector 交互式 UI（需人工操作，不可自动化取证）。
- 其它客户端实现（如其它厂商 Agent）——如后续需要，按同模式扩展。
