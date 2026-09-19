# 技术设计 — TASK-20260919110529-abfac7d9（Batch D / D13：Cloud Strict Governance 强制）

上游：指令文档 TASK-D13、`docs/rfc/0006-runtime-boundary.md` §5、`docs/adr/ADR-0002-runtime-boundary.md`。

---

## Part A — 现状识别（Baseline）

### A1 业务系统盘点

| 域 | 现有承载 | 现状行为 | 本任务处置 |
|---|---|---|---|
| Local strict 判定 | `bin/fact-gates.mjs` `strictGovernanceEnabled(config)` / `deriveGateFacts` / `evaluateStrictFinish` | 读 `config.strictGovernance` 与 `config.governance.strictGovernance`；**import node:fs / state-store**（Local 语义：rootDir + 文件状态） | **不改**；键名对齐参考 |
| Cloud 完工 | `bin/cloud-commands.mjs` `finish_task`（D12） | 已严格（证据/审批缺一即拒），但**未显式声明** strict 策略，也无守卫 | **扩展**：运行期复查策略 |
| Cloud 装配 | `bin/cloud-application.mjs`（D10/D12） | 装配 repositories + 命令层 | **扩展**：装配期守卫 |
| 运行时信息 | `bin/cloud-runtime.mjs` · `bin/http-transport.mjs` `/health` | `/health` 返回 `{ ok, runtime }` | **扩展**：暴露 `strictGovernance` |

跨层检索结论（REQ Step 0）：`bin/` 无 `cloudStrictPolicy`/`CLOUD_STRICT_GOVERNANCE`；Local strict 实现含 fs → 不可进 Cloud 链；`presets/`/`rules/` 0 命中。

### A2 数据模型识别

- **无新增实体/表/字段**；本批只新增**策略对象**：`{ strictGovernance: boolean, disabledByConfig: boolean, enforcedBy: 'cloud' }`。
- 运行时信息新增只读字段 `strictGovernance: true`（`/health` 与 runtime 对象）。

### A3 字段盘点

| 配置键 | 位置 | Cloud 语义 |
|---|---|---|
| `config.strictGovernance` | 顶层 | `false` → 禁止启动；`true`/缺省 → 严格 |
| `config.governance.strictGovernance` | 嵌套 | 同上（与 Local 键名一致） |
| 其它 governance 配置 | — | 不影响 strict（Cloud 恒定严格） |

### A4 代码结构

| 文件 | 现有职责 | 本任务改动 |
|---|---|---|
| `bin/cloud-policy.mjs` | — | **新增**（纯策略：常量 + 判定 + 断言） |
| `bin/cloud-commands.mjs` | 命令层（D12） | **改**：`finish_task` 运行期复查 |
| `bin/cloud-application.mjs` | 装配 + 分发表 | **改**：装配期断言 |
| `bin/cloud-runtime.mjs` | 组装根 | **改**：暴露 `strictGovernance`，向 handler 传 info |
| `bin/http-transport.mjs` | HTTP 传输 | **改**：`createHttpHandler({ info })` → `/health` 合并 |
| `bin/cloud-policy.test.mjs` | — | **新增** |
| `bin/cloud-runtime.test.mjs` | D10/D12 用例 | **扩展**：4 条 D13 用例 |

---

## Part B — 复用决策矩阵

| 能力需求 | 决策 | 目标 | 依据（已有位置/签名） |
|---|---|---|---|
| 错误信封 | 调用已有 | toolError | bin/mcp.mjs |
| 命令层装配 | 调用已有 | createCloudCommands | bin/cloud-commands.mjs（D12） |
| HTTP 处理器 | 调用已有 | createHttpHandler | bin/http-transport.mjs（D10） |
| Local 键位对齐参考 | 调用已有 | strictGovernanceEnabled | bin/fact-gates.mjs（仅测试断言使用） |
| Cloud strict 常量 | 新封装公用 | CLOUD_STRICT_GOVERNANCE | 新增 bin/cloud-policy.mjs |
| 关闭意图判定 | 新封装公用 | strictFlagDisabled | 新增 bin/cloud-policy.mjs |
| 策略对象 | 新封装公用 | cloudStrictPolicy | 新增 bin/cloud-policy.mjs |
| 装配期断言 | 新封装公用 | assertCloudStrictGovernance | 新增 bin/cloud-policy.mjs |
| 运行期复查 | 扩展已有 | finish_task | bin/cloud-commands.mjs（finish_task 增加策略复查） |
| 装配守卫 | 扩展已有 | createCloudApplication | bin/cloud-application.mjs（装配期断言） |

> 决策列取值域：调用已有 / 扩展已有 / 新封装公用 / 新建局部。

---

## Part C — 实施设计

### C1 文件清单（按实施顺序）

1. `bin/cloud-policy.mjs`（纯策略）。
2. `bin/cloud-commands.mjs`（`finish_task` 复查）。
3. `bin/cloud-application.mjs`（装配断言）。
4. `bin/cloud-runtime.mjs` + `bin/http-transport.mjs`（暴露 `strictGovernance`）。
5. `bin/cloud-policy.test.mjs` + `bin/cloud-runtime.test.mjs`（用例）。

### C2 关键实现约定

- **单一来源**：strict 结论只从 `cloudStrictPolicy(config)` 取；装配层与命令层不各自解析配置。
- **双层守卫**：
  - 装配期 `assertCloudStrictGovernance(config)` → `TypeError`（fail-fast，不启动半严格运行时）；
  - 运行期 `finish_task` 复查 `disabledByConfig` → `strict_governance_required`（纵深防御，命令层被直连时也拒绝）。
- **不继承 Local 默认**：Local `strictGovernanceEnabled({})` 为 `false`，Cloud `cloudStrictPolicy({})` 的 `strictGovernance` 恒为 `true`（AC-004 断言两者"默认相反、键位相同"）。
- **无 legacy 回退**：`finish_task` 之外任何已接线工具都不得写 `status: 'completed'`（AC-008 全工具扫描：无证据任务跑遍所有工具后状态仍非 completed）。
- **可观测**：`/health` 合并 `info`（`{ strictGovernance: true }`），部署与客户端可核对。

### C3 风险与回滚

| 风险 | 处置 |
|---|---|
| 静默回退 legacy | 双层守卫 + 全工具扫描回归（AC-008） |
| 键位与 Local 漂移 | 同键名 + AC-004 对齐断言 |
| 误把 fs 依赖带入 Cloud | 纯策略模块 + 静态断言（AC-009） |
| 合法部署被阻断 | 仅"显式 false"阻断；缺省即严格（AC-001） |

**回滚**：删除 `bin/cloud-policy.mjs` 与新增用例，还原四处调用点即可（Local 与 D06-D12 行为不变）。
