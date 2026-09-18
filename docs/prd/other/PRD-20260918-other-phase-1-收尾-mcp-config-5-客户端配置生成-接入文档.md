# PRD-20260918-other-phase-1-收尾-mcp-config-5-客户端配置生成-接入文档

| 元数据 | 值 |
|---|---|
| 状态 | approved（用户确认依据：对话"继续"授权本批次） |
| 创建日期 | 2026-09-18 |
| 来源 | Phase 1 收尾：mcp-config 5 客户端配置生成 + 接入文档 |
| 分类 | other（自动判定） |
| 上游规格 | `docs/rfc/0004-mcp-mechanism.md` §7；上游 PRD §7（本批次为"下一个任务"） |
| 关联任务 | TASK-20260918143508-b95006d3 / GATE-2026-09-18T14-35-25 |

## 1. 背景

- `harness-mcp` 独立入口与 L1 工具面（20 个）已就绪（TASK-20260918142555），但**接入仍需手工拼客户端配置**，存在三类易错点：
  1. npx 多 bin 歧义（`npx pallastrade-harness` 不可靠，须 `-p package harness-mcp`）；
  2. root 定位（各客户端工作目录/变量支持不一）；
  3. 包版本漂移（无 pin，供应链风险 T-MCP-08）。
- 目标：一条 `harness mcp:config` 命令产出 5 客户端可直接使用的接入配置，并补齐接入文档。

## 2. 目标

1. `harness mcp:config --target <vscode|cursor|claude-code|claude-desktop|codex|all>` 生成配置；
2. 项目内文件（VS Code / Cursor / Claude Code）支持 `--write` 落盘；无工作区变量/用户级客户端（Claude Desktop / Codex）打印片段；
3. 默认 pin 包版本 `@1.10`，可用 `--spec` 覆盖；
4. 接入文档批次：`docs/mcp.md` + README/commands/index/getting-started/CHANGELOG 同步。

## 3. 成功指标

- 5 个目标产物对相应客户端"复制即用"（JSON 可解析 / TOML 片段正确）；
- root 策略正确：VS Code/Cursor 用 `${workspaceFolder}`（可入库）；Claude Desktop 烘焙绝对路径 + `HARNESS_ROOT`；Claude Code 依赖 cwd；
- `docs:check`、`doc-impact`、`readme:sync` 全放行。

## 4. 场景

| 场景 | 客户端 | 产物 | root 策略 |
|---|---|---|---|
| A | VS Code | `.vscode/mcp.json`（`servers`） | `${workspaceFolder}` |
| B | Cursor | `.cursor/mcp.json`（`mcpServers`） | `${workspaceFolder}` |
| C | Claude Code | `.mcp.json`（`mcpServers`） | cwd（项目根启动） |
| D | Claude Desktop | 打印 `claude_desktop_config.json` 片段 | 绝对路径 + `HARNESS_ROOT` |
| E | Codex CLI | 打印 `config.toml` 片段 | 绝对路径 |

## 5. 功能需求（FR）

- **FR-001 纯函数生成**：`buildMcpConfig({ target, rootDir, packageSpec })` 返回 `{ target, path, content, notes }`；JSON 目标输出格式化 JSON，Codex 输出 TOML 文本。
- **FR-002 写盘**：`--write` 仅对项目内目标生效（原子写 + 目录创建）；Claude Desktop/Codex 永不写盘（`path: null` + 说明）。
- **FR-003 CLI**：`harness mcp:config --target <t|all> [--write] [--json] [--spec <spec>]`；非法 target 报错 exit 2。
- **FR-004 文档**：`docs/mcp.md`（接入/工具清单/安全模型/排查）+ 4 处索引同步。
- **FR-005 测试**：`mcp-config.test.mjs`（纯函数 + 写盘 + CLI）。

## 6. 验收标准（AC）

| AC | 描述 | 测试位置 |
|---|---|---|
| AC-001 | vscode/cursor 产物含 `${workspaceFolder}` 且 JSON 可解析 | mcp-config.test.mjs |
| AC-002 | claude-desktop 含绝对路径 + HARNESS_ROOT；codex 为 TOML 片段 | mcp-config.test.mjs |
| AC-003 | `--write` 落盘且幂等（重复生成结果一致） | mcp-config.test.mjs |
| AC-004 | 非法 target 报错 exit 2 | mcp-config.test.mjs |
| AC-005 | 默认 spec 含 `@1.10`，`--spec` 可覆盖 | mcp-config.test.mjs |
| AC-006 | docs:check / doc-impact / readme:sync 通过 | 命令实测 |

## 7. 非目标

L2/L3 工具、HTTP 形态、更多客户端适配（按需追加）。

## 8. 技术影响

新增 `bin/mcp-config.mjs` + 测试；`bin/harness.mjs` 增 `mcp:config` 分支与帮助文本；文档 6 处（含 CHANGELOG Unreleased 追加）。

## 9. 测试计划

纯函数（5 目标）+ 写盘（temp 项目）+ CLI（spawnSync）为主；全量回归以 303 为基线。

## 10. 文档同步清单

`docs/mcp.md`（新增）、`docs/commands.md`、`docs/index.md`、`docs/getting-started.md`、`README.md`、`CHANGELOG.md`。
