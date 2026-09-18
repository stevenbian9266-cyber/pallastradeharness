# 需求文档 REQ-20260918-phase1-mcp-onboarding.md

> 对应 PRD：`docs/prd/other/PRD-20260918-other-phase-1-mcp-零安装接入-harness-mcp-bin-root-定位-l1-工具面.md`
> Task: TASK-20260918142555-5d8f7ec3 / Gate: GATE-2026-09-18T14-26-00
> 依据：`docs/rfc/0004-mcp-mechanism.md` §7 Phase 1（用户已确认）

---

## Step 0：跨层搜索（独立仓结构层）

| 层 | 搜索路径 | 关键词 | 找到的文件 | 是否满足需求？ |
|---|---|---|---|---|
| bin | `bin/` | `harness-mcp` / `HARNESS_ROOT` / `roots/list` | 仅 `bin/mcp.test.mjs`（临时目录前缀，非实现） | ❌ 无既有实现，需新增 |
| presets | `presets/` | `mcp` | 仅 `presets/brain-eval/default.json`（检索查询词） | 不涉及 |
| templates | `templates/` | `mcp` | 无 | 不涉及 |
| rules | `rules/` | `mcp` | 无 | 不涉及 |
| docs | `docs/` | `harness-mcp` / `HARNESS_ROOT` / 零安装 | 仅 `docs/rfc/0004-mcp-mechanism.md`（规格定义） | ✅ 规格已定，无实现 |

### 搜索结论

- 独立入口、root 定位、roots 协商均为**净新增**（bin 层无同名概念）；
- 协议层已有 `createMcpHandler` / `runMcpStdio`（`bin/mcp.mjs`）可复用，Phase 1 只做"入口 + 定位 + 工具面扩充"；
- gate 生命周期数据函数 Phase 0 已提炼（`bin/gate-commands.mjs`），MCP 工具直接接数据函数，不解析 stdout；
- 契约层已有 `FROZEN_MCP_TOOLS`（`bin/command-registry.mjs`），新增 7 工具必须与冻结清单一致。

---

## Step 1：Skill 文件咨询

| Skill 文件 | 状态 | 关键结论引用 |
|---|---|---|
| `skills/harness-prd/SKILL.md` | ✅ 已读 | 一句话→PRD→用户确认→gate→实施→AC↔测试；PRD 命名/分类/索引；本任务 AC 已映射测试位置 |
| `skills/harness-docs/SKILL.md` | ✅ 已读 | 代码变更后同步知识文档并跑 `docs:check`；人确认后写回；doc-impact 放行 |

---

## 需求标题

Phase 1 MCP 零安装接入：`harness-mcp` 独立入口 + root 定位链 + L1 工具面（20 个）+ stdio 端到端验证。

## 任务类型

新增（feature，引擎仓 self-dogfood）。

## 需求描述（FR）

1. **FR-001 独立入口**：`bin/mcp-server.mjs`（shebang + main-guard，导出 `resolveServerContext`）；`package.json` 注册 bin `harness-mcp`。
2. **FR-002 root 定位**：`--root` > `HARNESS_ROOT` > cwd 向上查找；显式 root 非法 → 报错退出；客户端声明 `roots` 能力且无显式 root 时发起 `roots/list` 协商（单根生效）。
3. **FR-003 L1 工具面**：新增 7 工具 —— `gate_create` / `gate_status` / `gate_clear` / `run_verifier` / `get_next_action` / `get_task` / `list_tasks`；既有 13 工具不变。
4. **FR-004 错误信封**：新工具失败返回 `isError:true` + `{code,message,hint?,nextAction?}`；验证器仅注册表白名单。
5. **FR-005 契约防漂移**：测试断言 MCP 工具集合 === 注册表冻结 L1 清单。
6. **FR-006 验证器复用**：直接复用 `bin/verifier.mjs` 的 `runVerifier`（CLI/MCP 共用；白名单，无任意命令面）。

## 验收标准（AC，与 PRD 一致）

| AC | 描述 | 测试位置 |
|---|---|---|
| AC-001 | `harness-mcp` 独立启动完成 initialize/tools/list | `bin/mcp-server.test.mjs` |
| AC-002 | 工具面 20 个且与注册表冻结清单一致 | `bin/mcp.test.mjs` + `bin/command-registry.test.mjs` |
| AC-003 | `--root`/`HARNESS_ROOT` 优先级与非法 root 报错 | `bin/mcp-server.test.mjs` |
| AC-004 | `gate_create`/`gate_status` 经 MCP 返回结构化状态 | `bin/mcp.test.mjs` |
| AC-005 | `gate_clear` 对 verify-test 拒绝（isError + 明确 code） | `bin/mcp.test.mjs` |
| AC-006 | `run_verifier` 未知验证器被拒绝 | `bin/mcp.test.mjs` |
| AC-007 | 既有 13 工具语义/错误行为不变 | 既有 `bin/mcp.test.mjs` 用例 |
| AC-008 | CLI `verify` 提炼后回归不变 | `bin/cli-e2e.test.mjs` |

## 文档同步清单

- `README.md`、`CHANGELOG.md`（本任务）；
- `docs/commands.md`、`docs/mcp.md`、`docs/index.md`（下一任务：接入文档批次）。
