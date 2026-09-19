# REQ — Batch D D10/D11：HTTP MCP 运行时 + 静态 Key 鉴权

- **任务**：TASK-20260919104352-1b1ecd6b（critical / feature）
- **PRD**：`docs/prd/other/PRD-20260919-other-batch-d-d10-d11-http-mcp-runtime-static-key.md`
- **上游**：指令文档 TASK-D10/D11、`docs/rfc/0006-runtime-boundary.md` §4/§5、`docs/adr/ADR-0002-runtime-boundary.md`（D3/D4）

## Step 0 — 跨层检索（AGENTS.md §3）

| 层 | 检索词 | 命中 | 结论 |
|---|---|---|---|
| `bin/` | `node:http` / `createServer` / `HARNESS_API_KEY` / `Bearer` / `authorization` | **0**（仅 `wizard.mjs` 文案 "api-development" 误命中） | 净新增：无既有 HTTP 传输或鉴权实现 |
| `bin/mcp.mjs` | 协议层 | `MCP_PROTOCOL_VERSION` · `MCP_TOOLS`(20) · `createMcpHandler` · `runMcpStdio`；`content()` / `toolError()` 为**模块私有** | 复用协议常量与工具清单；需把两枚信封函数导出供 Cloud 复用（FR-013） |
| `bin/command-registry.mjs` | 工具元数据 | `FROZEN_MCP_TOOL_NAMES`(36) · `FROZEN_MCP_TOOLS` · `MCP_EXPOSURES` · `MCP_TIERS` | 复用：Cloud `tools/list` 必须落在冻结名单内（AC-004） |
| `presets/` · `templates/` · `rules/` | 同上关键词 | 0 | 无 |
| `docs/` | `HARNESS_API_KEY` / `Bearer` / Streamable | 16 处（RFC-0005/RFC-0006/ADR-0002/指令文档） | 仅设计，无实现 |

**重复实现检查（AP-SEARCH-1/2/3）**：不存在第二套 MCP 协议引擎；Cloud 复用同一 `MCP_TOOLS` 与结果信封，仅替换传输（stdio → HTTP）与应用层（Local fs → SQLite）。

## Step 1 — Skill 咨询

| Skill | 关键结论 | 落地 |
|---|---|---|
| `harness-standards-audit` | 决策点 ≤12；`??` 的第二个 `?` 计入决策点（D08/D09 教训）；跨文件重复块 STD-CQ-002；安全规则对「动态执行/拼接」敏感 | 各层模块函数保持小函数 + 助手（`fieldOf` 风格）；SQL/字符串一律常量化；鉴权用 `timingSafeEqual` 而非字符串比较 |
| `harness-docs` | 引擎变更必须同步 README / CHANGELOG | 收尾跑 `docs:check` / `readme:sync --check` / `doc-impact` |
| `harness-skill-author`（约定） | 协议语义只允许一处定义 | `content` / `toolError` 由 `bin/mcp.mjs` 导出复用（不复制） |

（本仓无 `<project>-customization` Skill；无 http/runtime 领域 Skill。）

## Step 2 — 复用决策摘要

- **调用已有**：`MCP_PROTOCOL_VERSION`、`MCP_TOOLS`、`content`、`toolError`（`bin/mcp.mjs`，后两者本批导出）、`FROZEN_MCP_TOOL_NAMES`（`bin/command-registry.mjs`，测试断言用）、`createSqliteRepositories`（D07）、`createBoundaryEvidenceRepository`（D09）、`fieldOf` 风格的字段助手（D08 经验）。
- **扩展已有**：`bin/mcp.mjs` 导出 `content` / `toolError`（仅加 `export`，行为不变）。
- **新封装公用**：`authorizeRequest`、`readApiKey`、`API_KEY_ENV`、`BEARER_PREFIX`、`createJsonRpcAdapter`、`createCloudApplication`、`createHttpHandler`、`handleHttpRequest`、`startHttpServer`、`createCloudRuntime`、`startCloudRuntime`。
- **新建局部**：`JSON_RPC_ERROR_CODES`（传输层错误码表，仅 `http-transport.mjs` 使用）。

## Step 3 — 需求与验收

FR-001~FR-013、AC-001~AC-011 见 PRD §4/§6（不在本 REQ 重复维护）。

## Step 4 — 风险与缓解

| 风险 | 缓解 |
|---|---|
| HTTP 层直连 SQLite（架构退化） | 分层静态断言（AC-010）：transport/jsonrpc 源码不得出现 `sqlite` / 领域模块 import |
| 工具自行判定 PASS | 应用层未实现工具一律 `cloud_not_implemented`（AC-006）；`finish_task` 断言不返回成功 |
| key 泄露 | 响应/日志不含 key；鉴权失败早退（不触达应用层，AC-008） |
| 协议漂移（Cloud 与 Local 工具面不一致） | `tools/list` 与 `MCP_TOOLS` 严格相等（AC-004） |
| 未实现工具被客户端误判成功 | `isError: true` + 明确 code（模型可自愈、运维可观测） |

## Step 5 — 验证计划

1. `node --test bin/static-key-auth.test.mjs bin/cloud-runtime.test.mjs`
2. `npm run test:core`（441 基线 + 新增）
3. `docs:check` / `readme:sync --check` / `doc-impact --base origin/main`
4. `reuse-adherence` 验证器 + `supervise diff`（既定 package-lock 例外 + STD-API-001 误报）
