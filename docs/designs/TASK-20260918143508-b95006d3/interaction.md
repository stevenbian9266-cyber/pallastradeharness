# 交互设计（Interaction Spec）— TASK-20260918143508-b95006d3

> 设计阶段产物 **2/4**。对应 PRD：`PRD-20260918-other-phase-1-收尾-mcp-config-5-客户端配置生成-接入文档`
> 本任务的"交互面"= 生成器 CLI UX + 5 客户端配置契约。

## 1. 5 客户端配置契约

| 目标 | 配置文件 | 顶层键 | 条目键 | root 策略 | 可入库 |
|---|---|---|---|---|---|
| VS Code | `.vscode/mcp.json` | `servers` | `pallastrade-harness`（含 `type: stdio`） | `${workspaceFolder}` | ✅ |
| Cursor | `.cursor/mcp.json` | `mcpServers` | `pallastrade-harness` | `${workspaceFolder}` | ✅ |
| Claude Code | `.mcp.json` | `mcpServers` | `pallastrade-harness` | 依赖 cwd（项目根启动） | ✅ |
| Claude Desktop | `claude_desktop_config.json`（用户级） | `mcpServers` | `pallastrade-harness` | 绝对路径 + `env.HARNESS_ROOT` | ❌ 打印片段 |
| Codex CLI | `config.toml`（用户级） | `[mcp_servers.*]` | `pallastrade-harness` | 绝对路径 | ❌ 打印片段 |

统一启动命令形态（消除 npx 多 bin 歧义）：

```text
npx -y -p pallastrade-harness@1.10 harness-mcp [--root <dir>]
```

## 2. CLI UX

| 命令 | 行为 |
|---|---|
| `harness mcp:config --target vscode` | 打印将写入的 JSON 内容（dry-run 默认） |
| `harness mcp:config --target vscode --write` | 原子写入 `.vscode/mcp.json`（自动建目录） |
| `harness mcp:config --target all --json` | 全部 5 目标的结构化输出（含 `path/written/notes`） |
| `harness mcp:config --target claude-desktop` | 始终打印片段 + 说明手动粘贴位置 |
| `harness mcp:config --target bogus` | exit 2 + 可用 target 列表 |

## 3. 错误路径

- 非法 target → `USAGE` 语义（exit 2，列出合法值）；
- 写盘失败（权限/占用）→ 错误消息含路径，exit 3；
- `--write` 用于 claude-desktop/codex → 忽略写盘并明确提示"打印模式"（不报错，友好降级）。

## 4. 幂等与可重复执行

同一参数重复执行产物逐字节一致（无时间戳/随机量）；`--write` 覆盖写（配置由本工具全量管理，不做合并）。

## 5. 兼容声明

不影响既有命令；`harness mcp` / `harness-mcp` 行为不变。
