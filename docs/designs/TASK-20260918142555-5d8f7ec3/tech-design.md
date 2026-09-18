# 技术方案（Tech Design）— TASK-20260918142555-5d8f7ec3

> 设计阶段产物 **4/4（核心）**。对应 PRD：`PRD-20260918-other-phase-1-mcp-零安装接入-harness-mcp-bin-root-定位-l1-工具面`；Task：TASK-20260918142555-5d8f7ec3
> 目的：先识别现状、再定复用决策，防止重复造轮子与改错归属模块。
> 前置：Part A 事实来源 = `harness design:scan --scope all`（2026-09-18 执行）。

## Part A — 现状识别（强制，缺此段方案无效）

### A1 业务系统盘点

本仓为本地治理引擎（无 Web 服务/业务域），"业务模块"= 引擎模块分组：

| 现有模块/分组 | 边界 | 新功能归属 |
|---|---|---|
| `bin/mcp.mjs` | MCP 协议层：handler 注册、tools/list、tools/call、stdio 传输 | **扩展**：追加 7 个 L1 工具与错误信封 |
| `bin/command-registry.mjs` | 命令注册表（Phase 0）：政策元数据 + 冻结工具名契约 | 复用（契约校验对端） |
| `bin/gate-commands.mjs` | Gate 生命周期数据函数（Phase 0） | 复用（工具直接接数据函数） |
| `bin/evidence.mjs` / `bin/state-store.mjs` / `bin/guide.mjs` | 证据/状态/下一步动作 | 复用 + evidence 提炼 `runVerifierById` |
| `bin/config-loader.mjs` / `bin/cli-utils.mjs` | 配置解析 / CLI 工具函数 | 复用 |

### A2 数据模型识别

无数据库。"数据模型"= 本地状态文件（`state-store.mjs` 管理）：

| 现有状态集合 | 关联 | 新增 or 扩展 |
|---|---|---|
| `.harness-state/tasks/*.json`（Task） | gate/taskId、changePlan、risk、findings | 复用（MCP 读写同一状态） |
| `harness/gates/*.json`（Gate 2.0） | taskId、checks[phase,status]、phase/cleared | 复用（gate 工具直接读写） |
| `harness.config.mjs`（项目配置） | paths/evidence.verifiers/output | 复用（root 定位后按新 root 重载） |

### A3 字段盘点

| 字段 | 现有定义（类型/约束） | 新增 or 复用 |
|---|---|---|
| `gate.taskId` | string（HTH-007 强制绑定，INV-03） | 复用 |
| `gate.checks[].phase/status` | `preparation|verification` × `pending|done` | 复用 |
| `tool.inputSchema.required` | JSON Schema（既有 13 工具模式） | 复用（新工具同模式） |
| 错误信封 `{code,message,hint?,retryable,nextAction?}` | RFC-0004 §6.1 定义 | 新增（实现） |

### A4 代码结构

| 公共方法/符号 | 位置 | 签名/说明 |
|---|---|---|
| `createMcpHandler` / `runMcpStdio` | `bin/mcp.mjs` | 传输无关 handler / stdio 循环 |
| `createGate` / `gateStatusSnapshot` / `clearGateCheck` | `bin/gate-commands.mjs` | 已结构化返回 `{ok,...}` |
| `listCommandDefinitions` / `FROZEN_MCP_TOOLS` | `bin/command-registry.mjs` | 注册表查询 + 冻结清单 |
| `loadTask` / `listTasks` / `resolveTask` | `bin/state-store.mjs` | 任务读取（锁内写） |
| `nextAction` | `bin/guide.mjs` | 稳定下一步结构 |
| `runEvidenceCommand` / `recordEvidence` | `bin/evidence.mjs` | 证据执行/记录（提炼复用点） |
| `resolveProjectRoot` / `loadConfig` | `bin/config-loader.mjs` | cwd 向上查找 + 深合并配置 |
| `getArg` / `hasArg` / `HarnessError` / `EXIT_CODES` | `bin/cli-utils.mjs` | 参数解析与错误基类 |

## Part B — 复用决策矩阵

| 能力需求 | 决策 | 目标 | 依据（已有位置/签名） |
|---|---|---|---|
| MCP 协议收发（initialize/tools/call） | 调用已有 | runMcpStdio | bin/mcp.mjs 既有导出 |
| Gate 创建数据 | 调用已有 | createGate | bin/gate-commands.mjs 既有导出 |
| Gate 清除守卫（证据控制/机检） | 调用已有 | clearGateCheck | bin/gate-commands.mjs 既有导出 |
| Gate 状态快照 | 调用已有 | gateStatusSnapshot | bin/gate-commands.mjs 既有导出 |
| 任务读取 | 调用已有 | loadTask | bin/state-store.mjs 既有导出 |
| 任务列表 | 调用已有 | listTasks | bin/state-store.mjs 既有导出 |
| 下一步动作计算 | 调用已有 | nextAction | bin/guide.mjs 既有导出 |
| 冻结工具名契约 | 调用已有 | FROZEN_MCP_TOOLS | bin/command-registry.mjs 既有导出 |
| 验证器执行入口（CLI/MCP 共用） | 调用已有 | runVerifier | bin/verifier.mjs 既有导出 |
| MCP 工具面扩充（7 工具） | 扩展已有 | bin/mcp.mjs | bin/mcp.mjs |
| root 定位链（flag/env/roots） | 新封装公用 | resolveServerContext | bin/mcp-server.mjs 新导出，harness.mjs 引用 |
| 工具错误信封 helper | 新建局部 | toolError | 仅 bin/mcp.mjs 内部使用 |
| stdio 端到端测试载体 | 新建局部 | bin/mcp-server.test.mjs | 仅测试文件自身使用 |

## Part C — 实施落点

### C1 新增/修改文件清单

| 文件路径 | 操作（新增/修改） | 说明 |
|---|---|---|
| `bin/mcp-server.mjs` | 新增 | 独立 bin（main-guard）+ `resolveServerContext` + roots 会话装配 |
| `bin/mcp-server.test.mjs` | 新增 | root 解析用例 + 真 stdio e2e（initialize→tools/list→task/gate 闭环） |
| `bin/mcp.mjs` | 修改 | 13→20 工具；错误信封；roots 协商接线点；既有行为不变 |
| `bin/harness.mjs` | 修改 | `mcp` 分支接 `resolveServerContext`（verify 分支已复用 verifier.mjs，无需改动） |
| `package.json` | 修改 | 注册 bin `harness-mcp` |
| `bin/mcp.test.mjs` | 修改 | 新工具用例 + 注册表一致性断言 |
| `README.md` / `CHANGELOG.md` | 修改 | 入口说明 + Unreleased |

### C2 分层改动

- 协议层（mcp.mjs）：工具定义/调用分支/错误信封；
- 入口层（mcp-server.mjs + package.json）：进程启动、root 定位、bin 注册；
- 数据层：无变更（复用 state-store / gate-commands）；
- 文档层：README / CHANGELOG（`docs/mcp.md` 归下一任务）。

### C3 依赖与实施顺序

1. `resolveServerContext` + `harness-mcp` bin（可独立测试）；
2. 验证器复用确认（`verifier.mjs` 既有 `runVerifier`，无需提炼）；
3. mcp.mjs 追加 7 工具 + 错误信封 + 契约测试；
4. stdio e2e；5. 文档同步。

### C4 风险与回滚

- 风险 A：npx 多 bin 歧义 → 以专用 bin 名 `harness-mcp` + 文档固定 `-p` 形式；
- 风险 B：roots 协商改动传输循环 → 仅在有 roots 能力且无显式 root 时触发，失败静默回退 cwd 链；
- 回滚：新增文件可整体删除；mcp.mjs 改动为追加式（工具清单可回退到 13 个），三处小改均有既有回归测试覆盖。
