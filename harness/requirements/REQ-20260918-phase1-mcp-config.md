# 需求文档 REQ-20260918-phase1-mcp-config.md

> 对应 PRD：`docs/prd/other/PRD-20260918-other-phase-1-收尾-mcp-config-5-客户端配置生成-接入文档.md`
> Task: TASK-20260918143508-b95006d3 / Gate: GATE-2026-09-18T14-35-25
> 上游：`docs/rfc/0004-mcp-mechanism.md` §7 Phase 1（用户已确认）

---

## Step 0：跨层搜索（独立仓结构层）

| 层 | 搜索路径 | 关键词 | 找到的文件 | 是否满足需求？ |
|---|---|---|---|---|
| bin | `bin/` | `mcp:config` / `mcp-config` / `mcpServers` / `mcp_servers` / `claude_desktop_config` | 无 | ❌ 净新增 |
| presets | `presets/` | `mcp` | 仅 `presets/brain-eval/default.json`（检索词） | 不涉及 |
| templates | `templates/` | `mcp` | 无 | 不涉及 |
| rules | `rules/` | `mcp` | 无 | 不涉及 |
| docs | `docs/` | `mcp:config` / 配置生成器 | `docs/rfc/0004-mcp-mechanism.md`（§7 规划）、上游 PRD（§7 列为下一任务） | ✅ 规格已定 |

### 搜索结论

- 配置生成能力为净新增（bin 层无同类实现）；root 解析、原子写、参数解析均有既有模块可复用；
- 5 客户端形态差异集中在：配置文件路径、顶层键名（`servers` / `mcpServers` / TOML `[mcp_servers.*]`）、工作区变量支持与 root 策略；
- 生成器默认 pin `@1.10`（供应链缓解）；npx 必须以 `-p <pkg> harness-mcp` 形式消除多 bin 歧义。

---

## Step 1：Skill 文件咨询

| Skill 文件 | 状态 | 关键结论引用 |
|---|---|---|
| `skills/harness-prd/SKILL.md` | ✅ 已读 | PRD 命名/分类/索引；AC 需映射测试位置；确认后进入 gate |
| `skills/harness-docs/SKILL.md` | ✅ 已读 | 变更后同步知识文档并跑 `docs:check`；doc-impact 放行；人确认后写回 |

---

## 需求标题

`harness mcp:config`：5 客户端 MCP 接入配置生成器 + 接入文档批次。

## 任务类型

新增（feature，引擎仓 self-dogfood）。

## 需求描述（FR）

1. **FR-001**：`buildMcpConfig({ target, rootDir, packageSpec })` 纯函数，5 目标：
   - `vscode` → `.vscode/mcp.json`，`{ servers: { "pallastrade-harness": { type: "stdio", command: "npx", args: [...] } } }`，root 用 `${workspaceFolder}`；
   - `cursor` → `.cursor/mcp.json`，`{ mcpServers: { ... } }`，root 用 `${workspaceFolder}`；
   - `claude-code` → `.mcp.json`，`{ mcpServers: { ... } }`，依赖 cwd（不写 --root）；
   - `claude-desktop` → 打印片段（`path: null`），`--root <绝对路径>` + `env.HARNESS_ROOT`；
   - `codex` → 打印 TOML 片段（`[mcp_servers.pallastrade-harness]`）。
2. **FR-002**：`--write` 仅项目内目标生效（原子写 + `mkdir` 目录）；用户级/无变量目标必须打印。
3. **FR-003**：CLI `harness mcp:config --target <t|all> [--write] [--json] [--spec <spec>]`；非法 target → exit 2。
4. **FR-004**：文档批次（docs/mcp.md + commands/index/getting-started/README/CHANGELOG）。
5. **FR-005**：`bin/mcp-config.test.mjs` 覆盖纯函数/写盘/CLI。

## 验收标准（AC，与 PRD 一致）

| AC | 描述 | 测试位置 |
|---|---|---|
| AC-001 | vscode/cursor 含 `${workspaceFolder}`、JSON 可解析 | `bin/mcp-config.test.mjs` |
| AC-002 | claude-desktop 绝对路径 + HARNESS_ROOT；codex TOML | `bin/mcp-config.test.mjs` |
| AC-003 | `--write` 落盘且幂等 | `bin/mcp-config.test.mjs` |
| AC-004 | 非法 target exit 2 | `bin/mcp-config.test.mjs` |
| AC-005 | 默认 spec `@1.10`；`--spec` 覆盖 | `bin/mcp-config.test.mjs` |
| AC-006 | docs:check / doc-impact / readme:sync 通过 | 命令实测 |

## 文档同步清单

`docs/mcp.md`、`docs/commands.md`、`docs/index.md`、`docs/getting-started.md`、`README.md`、`CHANGELOG.md`。
