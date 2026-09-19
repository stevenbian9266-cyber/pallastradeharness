# REQ — Batch D D14：真实 MCP 客户端端到端测试

- **任务**：TASK-20260919111130-154e748e（critical / test）
- **PRD**：`docs/prd/other/PRD-20260919-other-batch-d-d14-real-client.md`
- **上游**：指令文档 TASK-D14、`docs/rfc/0006-runtime-boundary.md` §7

## Step 0 — 跨层检索（AGENTS.md §3）

| 层 | 检索词 | 命中 | 结论 |
|---|---|---|---|
| `bin/` | `@modelcontextprotocol` / `StreamableHTTPClientTransport` / `new Client(` | **0** | 净新增：仓库内无任何真实 MCP 客户端代码（既有 `mcp.mjs` 是**服务端** stdio 实现） |
| `bin/` | 既有客户端测试 | `cli-e2e.test.mjs`（CLI 进程级）、`mcp-server.test.mjs`（服务端协议） | 均为本进程/服务端视角，**不是**真实客户端 |
| `bin/` | `startCloudRuntime` | D10 已交付（真实监听） | 复用为被测服务端 |
| `package.json` | 依赖 | 仓库零依赖策略（无 `dependencies` 运行时依赖；`node_modules` 仅历史工具包） | **不得**新增依赖；SDK 隔离安装 |
| `docs/` | D14 / 真实客户端 | RFC-0006 §7（gate=真实客户端证据）、指令 TASK-D14 | 设计已定 |

**重复实现检查（AP-SEARCH-1/2/3）**：不存在既有真实客户端测试；本批只加测试，不改运行时。

## Step 1 — Skill 咨询

| Skill | 关键结论 | 落地 |
|---|---|---|
| `harness-standards-audit` | 测试不得假绿：不可用环境必须 **skip 并说明原因**，而非静默通过 | skip 分支打印安装命令；断言不降级 |
| `harness-docs` | 引擎/验证方式变更需同步文档 | README 增加「真实客户端验证」小节（安装 + 运行命令） |
| `harness-skill-author`（约定） | 复用同一协议常量，不复制工具名清单 | 断言直接比对 `MCP_TOOLS` |

## Step 2 — 复用决策摘要

- **调用已有**：`startCloudRuntime`（D10）· `MCP_TOOLS` / `MCP_PROTOCOL_VERSION`（`bin/mcp.mjs`）· `openHarnessDatabaseSync`（D06）· `DEFAULT_CONFIG`（config-loader）· `createContract`（测试播种可选）。
- **扩展已有**：无（运行时不动）。
- **新封装公用**：`loadRealClientSdk`（SDK 解析，含 skip 依据）· `connectRealClient`（真实连接 + 清理）。
- **新建局部**：`DEFAULT_SDK_DIR`（测试内默认路径）· `SDK_PACKAGE`（锁定的包名+版本）。

## Step 3 — 需求与验收

FR-001~FR-007、AC-001~AC-007 见 PRD §4/§6（不在本 REQ 重复维护）。

## Step 4 — 风险与缓解

| 风险 | 缓解 |
|---|---|
| CI 无 SDK → 假红 | skip 分支 + 安装提示（AC-001） |
| 假绿（用进程内调用冒充） | 必须 `startCloudRuntime` 真实端口 + 真实 `fetch`/SDK 传输（FR-002/AC-002） |
| 污染仓库依赖 | 隔离目录安装 + AC-007 静态断言 `package.json` 无新增依赖 |
| 端口/临时目录残留 | `close()` + `rmSync`（FR-006） |
| SDK 行为差异（SSE vs JSON） | 服务端返回 `application/json`（D3 v0 约定）；若 SDK 要求 SSE，则记录为 deferred 并给出结论 |

## Step 5 — 验证计划

1. `node --test bin/mcp-real-client.test.mjs`（真实客户端运行，保留输出为证据）
2. `npm run test:core`（476 基线；该文件在无 SDK 环境 skip）
3. `docs:check` / `readme:sync --check` / `doc-impact --base origin/main`
4. `reuse-adherence` 验证器 + `supervise diff`
