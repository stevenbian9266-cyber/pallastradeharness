# 技术设计 — TASK-20260919113354-6b2096bb（本仓 strict 严格治理 self-dogfood）

> PRD：`docs/prd/other/PRD-20260919-other-strict-dogfood.md` ｜ REQ：`harness/requirements/REQ-20260919-strict-dogfood.md`
> 本设计刻意**不引入新的引擎符号**：严格治理能力（Batch C / C12+C14）已存在，缺的是"本仓真的用它" + 真实 CLI 证据。

## Part A — 现状识别（Baseline）

### A1 业务系统盘点

| 系统/流程 | 承载文件 | 与本次关系 |
|---|---|---|
| 任务生命周期（start/context/risk/gate/impact/verify/finish） | `bin/task-orchestrator.mjs` + `bin/harness.mjs`（CLI 分发） | 本次要在其强制路径中加入 `task impact` |
| 事实门与严格收尾 | `bin/fact-gates.mjs`（`deriveGateFacts` / `evaluateStrictFinish`） | **本次不改**，只从 CLI 侧真实驱动 |
| 门禁阶段机 | `bin/gate-commands.mjs` + `bin/gate-lifecycle.mjs` | 复用（e2e 需真实 gate 流转） |
| 证据与验证器 | `bin/evidence.mjs`（`verifyTaskEvidence`、注册验证器执行） | 复用（e2e 需真实证据链） |
| 配置装载 | `bin/config-loader.mjs`（`deepMerge(DEFAULT_CONFIG, fileConfig)`） | 本仓声明 strict 的落点 |
| 本仓治理声明 | `harness.config.mjs` | **本次修改点（唯一非文档的生产文件）** |
| CLI e2e 回归 | `bin/cli-e2e.test.mjs` | **本次扩展点**（不新建重复脚手架） |

### A2 数据模型识别

| 实体 | 存储 | 关键字段 | 本次影响 |
|---|---|---|---|
| Task | `.harness-state/tasks/<TASK-ID>.json` | `status` / `risk` / `riskLevel` / `changePlan` / `requiredEvidence` / `impact` / `decisions` / `contextPack` | `impact` 成为收尾必需事实 |
| Gate | `harness/gates/<GATE-ID>.json` | `phase` / `checks[]{id,phase,status}` | 复用（e2e 需清准备项 + `evidence verify` 关 verify-test） |
| Evidence | `artifacts/harness-evidence/` | `evidenceType` / `success` / `exitCode` / `freshness` | 复用 |
| Context Pack | `.harness-state/brain/context-<TASK-ID>.json` | — | 收尾必需（`brain context`） |
| Config | `harness.config.mjs` → 深合并 `DEFAULT_CONFIG` | `governance.strictGovernance` | 本次新增声明 |

### A3 字段盘点

| 字段 | 位置 | 取值域 | 说明 |
|---|---|---|---|
| `config.governance.strictGovernance` | 本仓 `harness.config.mjs` | `true`（本次写入） | 与 `config.strictGovernance` 等价；README 需写两种写法 |
| `task.impact.architecture` | Task JSON | `NONE` / `LOCAL` / `CROSS_MODULE` / `ARCHITECTURE_CHANGE`（`ARCHITECTURE_IMPACTS`） | 本次记录 `LOCAL`（引擎结构不变） |
| `task.impact.techStack` | Task JSON | `NONE` / `DEPENDENCY_CHANGE` / `TECH_STACK_CHANGE`（`TECH_STACK_IMPACTS`） | 本次记录 `NONE`（零依赖） |
| `task.decisions[]` | Task JSON | `{title,decision,at}` | CHANGE 级 impact 的前置条件 |
| `config.verifiers.unit.command` | `DEFAULT_CONFIG` | `['node','--test','**/*.test.mjs']` | e2e 临时项目据此产生真实 test 证据 |

### A4 代码结构

```text
harness.config.mjs          ← 声明 governance.strictGovernance: true（唯一生产文件改动）
bin/fact-gates.mjs          ← 判定逻辑（12 项事实检查；不改）
bin/task-orchestrator.mjs   ← finishCommand（strict 分支）+ impactCommand（不改）
bin/config-loader.mjs       ← deepMerge（保证 governance 命名空间可叠加；不改）
bin/cli-e2e.test.mjs        ← 复用 run/git 脚手架，新增 4 个用例（扩展）
docs/（PRD/REQ/designs/README/getting-started/baseline/roadmap）+ AGENTS.md + CHANGELOG.md
```

## Part B — 复用决策矩阵

| 能力需求 | 决策 | 目标 | 依据（已有位置/签名） |
|---|---|---|---|
| 严格收尾判定 | 调用已有 | evaluateStrictFinish | bin/fact-gates.mjs（已导出；task-orchestrator 消费） |
| 事实门推导 | 调用已有 | deriveGateFacts | bin/fact-gates.mjs（已导出） |
| strict 开关判定 | 调用已有 | strictGovernanceEnabled | bin/fact-gates.mjs（已导出；读 config 两种写法） |
| 影响评估取值域（架构） | 调用已有 | ARCHITECTURE_IMPACTS | bin/contracts.mjs（已导出；fact-gates 消费） |
| 影响评估取值域（技术栈） | 调用已有 | TECH_STACK_IMPACTS | bin/contracts.mjs（已导出） |
| 配置装载与深合并 | 调用已有 | loadConfig | bin/config-loader.mjs（已导出；保证 governance 可叠加） |
| 证据校验（收尾前置） | 调用已有 | verifyTaskEvidence | bin/evidence.mjs（已导出；fact-gates 消费） |

> 决策列取值域：调用已有 / 扩展已有 / 新封装公用 / 新建局部。
> **本任务不新增任何引擎符号**（无新模块、无新导出），故矩阵全为「调用已有」；新增代码仅为测试用例与文档。

## Part C — 实施设计

### C1 文件清单（按实施顺序）

1. `harness.config.mjs` — 新增 `governance: { strictGovernance: true }` + 注释（语义/后果/回退）。
2. `bin/cli-e2e.test.mjs` — 新增 4 用例：
   - `AC-006: 本仓文档声明严格治理且生命周期含 task impact`（读 `AGENTS.md`）
   - `AC-002: strict 缺事实 → REQUIRED_ACTIONS 阻断且状态不变`
   - `AC-003/AC-004: 记录 impact(LOCAL/NONE) + context + 证据 → 放行（completed）`（含 `task impact` CHANGE 级需 Decision 的断言）
   - `AC-001/AC-005: 本仓配置声明 strict + 非 strict 兼容路径无阻断`
3. `AGENTS.md` §2 — 生命周期补 `task impact` 步骤 + strict 语义说明。
4. `README.md` / `docs/getting-started.md` — 「严格治理（strict）」操作小节。
5. `docs/current-governance-baseline.md` / `docs/roadmap.md` / `CHANGELOG.md` — 现状与变更记录。

### C2 关键实现约定

1. **e2e 用真实 CLI**（`spawnSync(node, [bin/harness.mjs, …])`），不做进程内调用——strict 属于 CLI 收尾路径，必须端到端证明。
2. **临时项目配置最小化**：只写 `{ schemaVersion, name, governance: { strictGovernance: true } }`，其余走 `DEFAULT_CONFIG` 深合并（`verifiers.unit` 提供真实 test 证据）。
3. **阻断断言使用常量词** `Strict finish blocked` + `REQUIRED_ACTIONS` + 缺项 id 集合（含 `context_audit` / `architecture_impact` / `tech_stack_impact` / `review` / `knowledge`）。
4. **放行路径必须真的补齐事实**（context + impact + 注册验证器 test 证据 + review/knowledge + `evidence verify`）——不得绕过。
5. **兼容路径断言**：非 strict 配置下输出**不含** `Strict finish blocked`，且退出码仍非 0（证据缺失）。
6. 本仓守卫用例读取仓库根 `harness.config.mjs` 与 `AGENTS.md`，防"配置被改回 / 文档丢失步骤"。

### C3 风险与回滚

| 风险 | 缓解 | 回滚 |
|---|---|---|
| strict 生效后本仓自身任务被阻断 | 本任务自证（收尾按 `REQUIRED_ACTIONS` 走通）；报错文案带命令 | 删除 `harness.config.mjs` 中的声明（守卫用例同时失败，提示有意变更需走治理） |
| 断言过度耦合文案导致脆测 | 只断言常量词与缺项 id，不断言整段排版 | 调整断言（用例本身在 cli-e2e 内） |
| 影响评估被随意标 `NONE` | 本任务按真实级别记录 + review 证据说明判定依据 | — |
| 下游项目被误伤 | 不改 `DEFAULT_CONFIG` / `presets/`；AC-005 断言兼容路径 | — |
