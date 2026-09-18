# PRD-20260918-other-phase-1-mcp-零安装接入-harness-mcp-bin-root-定位-l1-工具面

| 元数据 | 值 |
|---|---|
| 状态 | approved（用户确认依据：对话中"继续/自主决策"授权 Phase 1） |
| 创建日期 | 2026-09-18 |
| 来源 | Phase 1 MCP 零安装接入（harness-mcp bin + root 定位 + L1 工具面） |
| 分类 | other（自动判定） |
| 上游规格 | `docs/rfc/0004-mcp-mechanism.md` §7 Phase 1 |
| 关联任务 | TASK-20260918142555-5d8f7ec3 / GATE-2026-09-18T14-26-00 |

## 1. 背景

- RFC-0004（已落盘并经用户确认）定义"机制全量 MCP 化"五阶段路线；Phase 0 已完成（命令注册表内核 + gate 数据函数提炼，TASK-20260918141200）。
- 现状 `harness mcp` 依附 CLI 安装形态：客户端需先安装/经 npx CLI 拉取；stdio 启动时 cwd 不可靠（Claude Desktop 等客户端工作目录不定）；工具面缺失 gate 生命周期（最大治理缺口）。
- 目标形态：MCP 客户端一次配置即可"零安装接入"，agent 通过受治理工具驱动完整闭环。

## 2. 目标（Phase 1 范围）

1. **独立入口** `harness-mcp`：随 npm 包分发，`npx -y -p pallastrade-harness@1.10 harness-mcp` 即启。
2. **root 定位链**：`--root` > `HARNESS_ROOT` > cwd 向上查找 `harness.config.*` >（客户端声明 roots 能力时）`roots/list` 协商。
3. **L1 工具面 20 个**：既有 13 个（名称与语义冻结）+ 新增 7 个：`gate_create` `gate_status` `gate_clear` `run_verifier` `get_next_action` `get_task` `list_tasks`。
4. **契约一致性**：工具面与 `bin/command-registry.mjs` 的冻结清单双向校验，防漂移。
5. **真 stdio 端到端**：起服务 → 初始化 → 起任务 → 建门禁 → 清准备项 → 读状态（自动化测试证明）。

## 3. 成功指标

- 纯 MCP（无 CLI 参与）在自动化 e2e 中完成「task→gate→status」闭环；
- `tools/list` 恰好返回 20 个 L1 工具，且与注册表 L1 清单一一对应；
- root 定位在"cwd≠项目根"场景下由 `--root`/`HARNESS_ROOT` 纠正成功。

## 4. 用户故事与场景

| 场景 | 描述 | 期望 |
|---|---|---|
| A 首次接入 | 用户在 MCP 客户端写入 npx 命令 | 服务启动，`tools/list` 可见治理能力，无需安装 |
| B root 可靠性 | Claude Desktop 等无工作区变量客户端 | 通过 `HARNESS_ROOT`/`--root` 精确定位项目 |
| C 治理闭环 | Agent 调 `start_task→gate_create→gate_status→gate_clear→record_evidence→finish_task` | 全部经服务端校验；不变量不可绕过 |
| D 异常路径 | 无 git 仓库 / 无活动任务 / 未注册验证器 | 返回 `isError:true` + `{code,message,hint}`，可自愈 |

## 5. 功能需求（FR）

- **FR-001 独立入口**：新增 `bin/mcp-server.mjs`（shebang + main-guard）；`package.json` 注册 `harness-mcp` bin。
- **FR-002 root 解析**：`resolveServerContext({ args })` 依序解析 flag/env/cwd；显式 root 不存在时报错退出（exit 2）。
- **FR-003 工具面新增**：`gate_create`（创建门禁，返回结构化 checks/phase）、`gate_status`（phase/remaining/valid/expired）、`gate_clear`（服务端机检 + human-WAIT 拒裸清）、`run_verifier`（仅注册验证器）、`get_next_action`、`get_task`、`list_tasks`。
- **FR-004 错误信封**：新工具业务失败返回 `isError:true` + `{code,message,hint?,nextAction?}`（RFC-0004 §6.1），非 JSON-RPC error；既有 13 工具行为不变。
- **FR-005 契约测试**：`mcp.test.mjs`/新增用例断言工具名集合 === 注册表 L1 冻结清单；`mcp-server.test.mjs` 提供真 stdio e2e 与 root 优先级用例。
- **FR-006 验证器执行复用**：复用 `bin/verifier.mjs` 的 `runVerifier`（CLI `verify` 与 MCP `run_verifier` 共用同一注册表执行路径；白名单执行，无任意命令面）。

## 6. 验收标准（AC）

| AC | 描述 | 验证位置 |
|---|---|---|
| AC-001 | `harness-mcp` 可独立启动并完成 initialize/tools/list | mcp-server.test.mjs |
| AC-002 | 工具面含全部 20 个 L1 工具且与注册表一致 | mcp.test.mjs + command-registry.test.mjs |
| AC-003 | `--root` 优先于 cwd；`HARNESS_ROOT` 次之；显式 root 无效时报错 | mcp-server.test.mjs |
| AC-004 | `gate_create/gate_status` 经 MCP 返回结构化门禁状态 | mcp.test.mjs |
| AC-005 | `gate_clear` 对 verify-test 拒绝（EVIDENCE_CONTROLLED→isError） | mcp.test.mjs |
| AC-006 | `run_verifier` 未知验证器被拒绝且不执行任意命令 | mcp.test.mjs |
| AC-007 | 既有 13 工具语义与错误行为不变 | 既有 mcp.test.mjs 用例 |
| AC-008 | CLI `verify` 行为不变（提炼后回归） | cli-e2e.test.mjs |

## 7. 非目标（划入后续任务）

- 5 客户端配置生成器（`mcp-config`）与 `docs/mcp.md` 完整接入文档（下一个任务）；
- L2 域派发 16 工具、resources/prompts（Phase 2）；
- Streamable HTTP、多根工作区（Phase 3）。

## 8. 技术影响与风险

- **修改面**：`bin/mcp.mjs`（追加 7 工具与错误信封）、`bin/harness.mjs`（mcp 分支接 resolveServerContext）、`package.json`（bin 注册）；验证器执行直接复用 `bin/verifier.mjs`（无改动）。
- **风险**：npx 拉起时进程 cwd 为新目录？——npx 不改变调用方 cwd，属预期；`--root` 与 env 双保险。
- **兼容**：既有 13 工具名/语义冻结；MCP 协议版本维持 `2025-03-26`（Phase 2 再评估升级）。

## 9. 测试计划

| 层 | 内容 |
|---|---|
| 单元 | `mcp.test.mjs`（新工具 + 错误信封）、`mcp-server.test.mjs`（root 解析纯函数 + stdio e2e） |
| 回归 | 全量 `node --test`（当前基线 297） |
| CLI 回归 | `cli-e2e.test.mjs` 覆盖 verify 分支不变性 |

## 10. 文档同步清单

- `README.md`（接入段 + 发布表 1.10 行）；
- `CHANGELOG.md`（Unreleased：新增 harness-mcp 入口与 L1 工具面）；
- `docs/commands.md`、`docs/mcp.md`、`docs/index.md` → 下一个任务（接入文档批次）。
