# 技术方案（Tech Design）— TASK-20260918143508-b95006d3

> 设计阶段产物 **4/4（核心）**。对应 PRD：`PRD-20260918-other-phase-1-收尾-mcp-config-5-客户端配置生成-接入文档`；Task：TASK-20260918143508-b95006d3
> 前置：Part A 事实来源 = `harness design:scan --scope all`（2026-09-18，Phase 1 基线）+ 直接源码核对。

## Part A — 现状识别（强制，缺此段方案无效）

### A1 业务系统盘点

| 现有模块/分组 | 边界 | 新功能归属 |
|---|---|---|
| `bin/harness.mjs` | CLI 分发（冒号子命令惯例：`governance:*` / `design:*` / `gate:*`） | **扩展**：新增 `mcp:config` 分支 |
| `bin/mcp-server.mjs` | MCP 入口 + `resolveServerContext`（root 解析） | 复用（文档中说明其行为；生成器不重复实现） |
| `bin/mcp.mjs` | 协议层与工具面 | 不涉及（本批次不改协议） |
| `bin/state-store.mjs` | 原子写工具 | 复用（`atomicWriteText`） |
| `bin/cli-utils.mjs` | 参数解析与退出码 | 复用（`getArg` / `hasArg` / `EXIT_CODES`） |

### A2 数据模型识别

无持久化新增；产出物为**静态配置文件**（非状态），不被引擎读取：

| 产物 | 归属 | 说明 |
|---|---|---|
| `.vscode/mcp.json` / `.cursor/mcp.json` / `.mcp.json` | 项目仓库 | 可入库（无绝对路径） |
| `claude_desktop_config.json` 片段 | 用户目录（打印） | 含绝对路径 |
| `config.toml` 片段 | 用户目录（打印） | TOML |

### A3 字段盘点

| 字段 | 定义（契约） | 来源 |
|---|---|---|
| `servers.*.type` | `stdio`（VS Code 必填） | VS Code MCP 规范 |
| `command` / `args` | `npx` + `['-y','-p','<spec>','harness-mcp', ...]` | 本任务约定（消歧义 + pin） |
| `env.HARNESS_ROOT` | 绝对路径（Claude Desktop 兜底） | `bin/mcp-server.mjs` root 链 |
| `${workspaceFolder}` | 宿主变量（VS Code/Cursor 支持） | 客户端规范 |

### A4 代码结构

| 公共方法/符号 | 位置 | 签名/说明 |
|---|---|---|
| `getArg` / `hasArg` / `EXIT_CODES` | `bin/cli-utils.mjs` | 参数与退出码 |
| `atomicWriteText` | `bin/state-store.mjs` | 原子写（自动创建父目录？需 mkdir 兜底） |
| `resolveServerContext` | `bin/mcp-server.mjs` | `--root` > env > cwd（文档引用其优先级） |
| `runMcpConfig` | 新增 `bin/mcp-config.mjs` | CLI 入口（本任务） |

## Part B — 复用决策矩阵

| 能力需求 | 决策 | 目标 | 依据（已有位置/签名） |
|---|---|---|---|
| CLI 参数解析 | 调用已有 | getArg | bin/cli-utils.mjs |
| 退出码语义 | 调用已有 | EXIT_CODES | bin/cli-utils.mjs |
| 原子写盘 | 调用已有 | atomicWriteText | bin/state-store.mjs |
| root 行为说明 | 调用已有 | resolveServerContext | bin/mcp-server.mjs |
| 配置生成纯函数 | 新封装公用 | buildMcpConfig | bin/mcp-config.mjs 新导出（CLI + 测试引用） |
| 目标清单常量 | 新封装公用 | MCP_CONFIG_TARGETS | bin/mcp-config.mjs 新导出（测试引用） |
| CLI 分发接入 | 扩展已有 | bin/harness.mjs | bin/harness.mjs |
| 测试载体 | 新建局部 | bin/mcp-config.test.mjs | 仅测试文件自身使用 |

## Part C — 实施落点

### C1 新增/修改文件清单

| 文件路径 | 操作（新增/修改） | 说明 |
|---|---|---|
| `bin/mcp-config.mjs` | 新增 | `MCP_CONFIG_TARGETS` / `buildMcpConfig` / `generateMcpConfig` / `runMcpConfig` |
| `bin/mcp-config.test.mjs` | 新增 | 纯函数（5 目标）+ 写盘 + CLI 用例 |
| `bin/harness.mjs` | 修改 | `mcp:config` 分支 + 帮助文本 |
| `docs/mcp.md` | 新增 | 接入指南 + 工具清单 + 安全模型 + 排查 |
| `docs/commands.md` / `docs/index.md` / `docs/getting-started.md` | 修改 | 命令与导航同步 |
| `README.md` / `CHANGELOG.md` | 修改 | 接入入口 + Unreleased 追加 |

### C2 分层改动

- CLI 层：`mcp:config` 分发与帮助；
- 生成层（新）：目标表 → 配置内容构造 → 写盘/打印；
- 文档层：mcp.md 主文档 + 5 处索引/清单同步。

### C3 依赖与实施顺序

1. `buildMcpConfig` 纯函数（5 目标）→ 2. `runMcpConfig` CLI + 分发接线 → 3. 测试 → 4. 文档批次 → 5. 全链验证（docs:check/doc-impact/supervise/reuse-adherence）。

### C4 风险与回滚

- 风险 A：客户端配置格式演进 → notes 字段提示"以客户端官方文档为准"，低风险；
- 风险 B：Claude Desktop 绝对路径在移动机器后失效 → 文档说明重新生成；
- 回滚：删除新增文件与分发分支即可；`--write` 仅新增文件，不影响既有内容。
