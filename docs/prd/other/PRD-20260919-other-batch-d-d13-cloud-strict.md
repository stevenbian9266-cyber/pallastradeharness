# PRD — Batch D D13：Cloud Strict Governance 强制（无 legacy 回退）

- **状态**：approved（授权：ADR-0002 ACCEPTED + 用户「继续」）
- **任务**：TASK-20260919110529-abfac7d9（critical）
- **上游规格**：`pallastradeharness Phase 1 AI 实施指令.md` TASK-D13；`docs/rfc/0006-runtime-boundary.md` §5/§7；`docs/adr/ADR-0002-runtime-boundary.md`
- **影响面**：Cloud 策略模块（新增）+ 云运行时守卫；**Local 运行时零行为改动**

## 1. 背景

D12 已把 `finish_task` 实现为严格语义（证据/审批缺一即拒、无自动流转）。指令 TASK-D13 要求把这一点**显式化并强制**：

```text
Cloud：strictGovernance = true
强制。
不得 fallback 到 Local legacy auto-transition 行为。
```

Local 侧的 strict 判定为 `strictGovernanceEnabled(config)` = `config.strictGovernance === true || config.governance.strictGovernance === true`（默认 **false**，即本仓默认非严格）。Cloud 必须**无视**该默认值恒为严格，且**拒绝**任何显式关闭。

`bin/fact-gates.mjs`（Local strict 实现）导入 `node:fs` 与 state-store，**不可**进入 Cloud 依赖链；因此需要纯策略模块承载 Cloud 侧语义，并保持配置键一致（`strictGovernance` / `governance.strictGovernance`）。

## 2. 目标

- **G1**：新增纯策略模块 `bin/cloud-policy.mjs`：`CLOUD_STRICT_GOVERNANCE`（恒 true）、`strictFlagDisabled(config)`、`cloudStrictPolicy(config)`、`assertCloudStrictGovernance(config)`。
- **G2**：**装配期守卫**：`createCloudApplication` 启动即校验，显式关闭 strict 的配置 → 抛错（fail-fast，不启动半严格运行时）。
- **G3**：**运行期守卫（纵深防御）**：`finish_task` 在执行前复查策略；一旦检测到「配置试图关闭 strict」→ 返回 `strict_governance_required` 错误信封，**绝不**转入 legacy 自动流转。
- **G4**：可观测：运行时暴露 `strictGovernance: true`；`GET /health` 返回该标记（部署/客户端可核对）。
- **G5**：回归证明「无 legacy 回退」：对待完工任务调用**全部已接线工具**的扫描用例断言任务状态不会被置为 `completed`。

## 3. 用户场景

1. **正常 Cloud 部署**：`createCloudRuntime({ db, config: {} })` → 严格模式生效；证据不全时 `finish_task` 拒绝。
2. **误配**：运维把 `governance.strictGovernance: false` 写进配置 → 启动即失败（错误信息明确指出 Cloud 不允许关闭），避免"看似 Cloud、实则 legacy"。
3. **绕过尝试**：直接调用命令层（不经装配）并传入关闭 strict 的配置 → `finish_task` 仍拒绝（`strict_governance_required`）。
4. **健康检查**：`GET /health` → `{ ok: true, runtime: 'cloud', strictGovernance: true }`。

## 4. 功能需求

| ID | 需求 |
|---|---|
| FR-001 | `CLOUD_STRICT_GOVERNANCE = true`（冻结常量，单一来源） |
| FR-002 | `strictFlagDisabled(config)`：仅当 `config.strictGovernance === false` 或 `config.governance?.strictGovernance === false` 时为 true（与 Local 判定键一致） |
| FR-003 | `cloudStrictPolicy(config)` → `{ strictGovernance: true, disabledByConfig, enforcedBy: 'cloud' }` |
| FR-004 | `assertCloudStrictGovernance(config)`：`disabledByConfig` 为 true 时抛 `TypeError`（信息含修复建议） |
| FR-005 | `createCloudApplication` 装配期调用 `assertCloudStrictGovernance(config)` |
| FR-006 | `finish_task` 运行期复查：`disabledByConfig` → `toolError('strict_governance_required', …)`，任务状态不变 |
| FR-007 | `createCloudRuntime` 返回 `strictGovernance: true`；`createHttpHandler` 接受 `info`，`GET /health` 合并该信息 |
| FR-008 | `cloud-policy.mjs` 不 import `node:fs` / `node:child_process`（保持 Cloud 链纯净） |

## 5. 非功能需求

- **零依赖 / 零新表**：纯逻辑 + 既有运行时装配。
- **fail-fast**：误配在启动期暴露，而不是在运行期静默降级。
- **单一来源**：strict 结论只从 `cloudStrictPolicy` 取，命令层与装配层不各自判断。
- **可测**：策略模块独立单测 + 运行时集成测试（含全工具扫描）。

## 6. 验收标准（AC）

| ID | 验收标准 | 验证方式 |
|---|---|---|
| AC-001 | 空配置 / 未设置 → 策略恒 `strictGovernance: true`，`disabledByConfig: false` | `bin/cloud-policy.test.mjs` |
| AC-002 | 显式 `strictGovernance: false`（两处键任一）→ `disabledByConfig: true` 且 `assertCloudStrictGovernance` 抛错 | `bin/cloud-policy.test.mjs` |
| AC-003 | 显式 `true` → 仍为严格，且 `disabledByConfig: false` | `bin/cloud-policy.test.mjs` |
| AC-004 | 与 Local 判定键一致性：`strictGovernanceEnabled({ strictGovernance: true })` 与 Cloud 策略同为严格 | `bin/cloud-policy.test.mjs`（引用 Local 助手仅用于键位对齐断言） |
| AC-005 | 装配期守卫：`createCloudApplication({ config: { governance: { strictGovernance: false } } })` 抛错 | `bin/cloud-runtime.test.mjs` |
| AC-006 | 运行期守卫：命令层直连 + 关闭配置 → `finish_task` 返回 `strict_governance_required`，任务状态不变 | `bin/cloud-runtime.test.mjs` |
| AC-007 | 运行时暴露 `strictGovernance: true`，且 `/health` 含该字段 | `bin/cloud-runtime.test.mjs` |
| AC-008 | **无 legacy 回退扫描**：无证据任务跑遍所有已接线工具后状态仍非 `completed` | `bin/cloud-runtime.test.mjs` |
| AC-009 | `cloud-policy.mjs` 无本机 IO import | `bin/cloud-policy.test.mjs`（静态断言） |

## 7. 架构 / 技术影响

- **架构**：CROSS_MODULE（Cloud 策略层新增；装配/命令层各加一处守卫；Local 零改动）。
- **技术栈**：NONE（零新依赖）。
- **风险**：策略与 Local 键位漂移 → 由 AC-004 键位对齐断言守住；守卫被绕过 → 双层（装配 + 运行）+ 全工具扫描回归。

## 8. 测试计划

- 新增 `bin/cloud-policy.test.mjs`（5，纯策略）。
- 扩展 `bin/cloud-runtime.test.mjs`（4：装配守卫 / 运行守卫 / health 暴露 / 无回退扫描）。
- 回归：`npm run test:core`（当前 466）全绿。

## 9. 范围外

- D14（真实客户端测试）、部署构件。
- Local 侧 `strict: true` dogfood 决策（属仓库策略，非 Cloud 强制范围；ADR-0002 附注已记录延后）。
