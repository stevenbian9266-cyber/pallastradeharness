# MCP 接入指南（零安装）

> v1.10+ / [RFC-0004](rfc/0004-mcp-mechanism.md)。目标：任何 MCP 客户端**一次配置**即可驱动完整治理闭环，无需在项目里安装任何依赖。
> 本页覆盖：快速接入、5 客户端配置、root 定位、工具面、安全模型与排查。

## 1. 一分钟接入

```bash
npx harness mcp:config --target vscode --write   # 生成并写入 .vscode/mcp.json
npx harness mcp:config --target claude-desktop   # 打印片段（用户级配置需手动合并）
npx harness mcp:config --target all --json       # 全部 5 客户端结构化输出
```

> 默认 dry-run（只打印）；项目内文件（VS Code / Cursor / Claude Code）加 `--write` 落盘。默认 pin `pallastrade-harness@1.10`，可用 `--spec` 覆盖。

## 2. 启动方式与要求

- 服务入口：`npx -y -p pallastrade-harness@1.10 harness-mcp [--root <dir>]`（专用 bin，消除 npx 多 bin 歧义）
- Node ≥ 22；首次运行需要网络（npx 拉取包）
- 协议：stdio / JSON-RPC（`2025-03-26`）；不提供任意 shell 执行面

**root 定位优先级**：`--root` > `HARNESS_ROOT` >（客户端声明 `roots` 能力时的 `roots/list` 协商）> cwd 向上查找 `harness.config.*`。

## 3. 5 客户端配置

| 客户端 | 配置文件 | 生成命令 | root 策略 |
|---|---|---|---|
| VS Code | `.vscode/mcp.json` | `mcp:config --target vscode --write` | `${workspaceFolder}` |
| Cursor | `.cursor/mcp.json` | `mcp:config --target cursor --write` | `${workspaceFolder}` |
| Claude Code | `.mcp.json` | `mcp:config --target claude-code --write` | cwd（项目根启动） |
| Claude Desktop | 用户级 `claude_desktop_config.json` | `mcp:config --target claude-desktop` → 手动合并 | 绝对路径 + `HARNESS_ROOT` |
| Codex CLI | 用户级 `config.toml` | `mcp:config --target codex` → 手动合并 | 绝对路径 |

生成器产物的统一条目名是 `pallastrade-harness`；VS Code 额外带 `"type": "stdio"`。

## 4. 工具面（L1，20 个）

| 工具 | 用途 |
|---|---|
| `start_task` / `resume_task` / `finish_task` | 任务生命周期（状态机与证据校验在服务端） |
| `gate_create` / `gate_status` / `gate_clear` | 分阶段门禁：创建、读取、逐项清除（机器校验；human-WAIT 禁裸清） |
| `record_evidence` / `run_verifier` | 类型化证据记录；注册验证器白名单执行 |
| `risk_check` / `review_diff` / `get_change_plan` | 风险复评、监督审查、变更计划 |
| `get_project_context` / `get_applicable_standards` / `record_decision` | 上下文包、适用规范、决策记录 |
| `get_next_action` / `get_task` / `list_tasks` | 下一步动作与任务读取 |
| `generate_standards` / `generate_skill` / `generate_docs` | Auto-Standards / Auto-Skills / Auto-Docs |

> L2 域派发（16 个 `harness_<域>` 工具）与 resources / prompts 在 Phase 2 提供；当前长尾能力仍可经 CLI 使用。

## 5. 安全模型（要点）

- **三类写政策**：治理状态写（task/gate/evidence）直接执行；产物写默认 dry-run（`apply`/`--write` 才落盘）；运维类默认排除。
- **无任意命令**：`run_verifier` 仅执行 `harness.config` 中注册的验证器；MCP 不提供 shell 工具。
- **人工确认点**：`user-confirmed` / `design-confirmed` 属 human-WAIT，MCP **禁止裸清**，须人工经 CLI 清除（RFC-0004 决策 D5）。
- **错误信封**：业务失败返回 `isError: true` + `{ code, message, hint?, nextAction? }`，便于模型自愈。
- **诚实边界**：MCP 通道本身不是安全边界——它无法阻止 Agent 绕过它直接改文件；enforced 仍来自 Hook / CI / Ruleset（[RFC-0001](rfc/0001-threat-model.md)）。MCP 的意义是**状态推进不可伪造** + 治理能力默认可达。
- **审计（Phase 2 落地）**：写操作将记入 `.harness-state/mcp/audit.ndjson`（仅本地）。

## 6. 故障排查

| 现象 | 处理 |
|---|---|
| `TASK_NOT_FOUND` / `NO_ACTIVE_TASK` | 先 `start_task`，或传 `taskId` |
| `NO_GATES_DIR` / `NO_ACTIVE_GATES` | 先 `gate_create` |
| `EVIDENCE_CONTROLLED`（清 verify-test 被拒） | 用证据关闭：`evidence verify --task <id> --gate <id>` |
| 服务访问了错误项目 | 显式 `--root` / `HARNESS_ROOT`；核对客户端启动 cwd |
| 客户端看不到工具 | 检查客户端 MCP 日志与 `harness-mcp --help`；确认 Node ≥ 22 |
| npx 拉包失败 | 检查网络/registry；可 `npm i -g pallastrade-harness` 后用 `harness-mcp` |

## 7. 等价 CLI 命令

| MCP 工具 | CLI 等价 |
|---|---|
| `start_task` / `finish_task` | `harness task start` / `harness task finish` |
| `gate_create` / `gate_status` / `gate_clear` | `harness gate` / `harness gate:status` / `harness gate:clear` |
| `record_evidence` / `run_verifier` | `harness evidence record` / `harness verify <id>` |
| `get_next_action` | `harness next` |
| `get_task` / `list_tasks` | `harness task status` / `harness task list` |

> 相关：接入规格见 [RFC-0004](rfc/0004-mcp-mechanism.md)；威胁模型与不变量见 [RFC-0001](rfc/0001-threat-model.md)。
