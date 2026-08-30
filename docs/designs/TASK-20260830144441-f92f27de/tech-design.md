# 技术方案（Tech Design）— TASK-20260830144441-f92f27de

> 设计阶段产物 4/4（核心）。对应 PRD：`PRD-20260830-other-设计检查机器校验-design-check`
> 前置事实来源：`harness design:scan --scope code`（本仓 bin/ 现状）。

## Part A — 现状识别

### A1 业务系统盘点

| 现有业务模块/服务 | 边界 | 新功能归属 |
|---|---|---|
| Gate 生命周期（harness.mjs gate:clear） | 检查项状态流转、人工 clear | 本次扩展：设计检查项拦截 |
| 设计阶段治理（design:scan / reuse-adherence / templates/designs） | 设计产物产出与校验 | 本次新增 design:check |
| 验证器注册（config-loader verifiers） | 受信验证器 | 不涉及（本次用 gate:clear 拦截，不新增验证器） |

### A2 数据模型识别

| 现有表/集合/模型 | 关联 | 新增 or 扩展 |
|---|---|---|
| Gate 状态文件 `harness/gates/*.json` | checks[].status | 扩展（不改 schema，仅拦截 clear 前校验） |
| 设计文档 `docs/designs/<task>/*.md` | 本次校验对象 | 新增（本任务已产出） |

### A3 字段盘点

| 字段 | 现有定义（类型/约束） | 新增 or 复用 |
|---|---|---|
| `gate.checks[].id` | 字符串，唯一 | 复用（拦截匹配 6 个固定 id） |
| `gate.taskId` | 字符串 | 复用（定位 docs/designs/<taskId>） |
| 设计文档文件名 | ui/interaction/visual/tech-design.md | 复用（约定） |

### A4 代码结构

| 公共方法/组件/工具 | 位置 | 签名/说明 |
|---|---|---|
| `parseReuseMatrix(content)` | `bin/reuse-adherence.mjs` | 解析 Part B 矩阵 → 行数组 |
| `getArg`/`hasArg` | `bin/cli-utils.mjs` | 参数解析 |
| `EXIT_CODES.POLICY_FAILURE` | `bin/harness.mjs` | 拒绝退出码 |
| gate:clear 分支 | `bin/harness.mjs` | 现有 clear 逻辑 + verify-test 拦截范式 |

## Part B — 复用决策矩阵

| 能力需求 | 决策 | 目标 | 依据（已有位置/签名） |
|---|---|---|---|
| Part B 矩阵解析 | 调用已有 | parseReuseMatrix | bin/reuse-adherence.mjs:30 |
| CLI 参数解析 | 调用已有 | getArg | bin/cli-utils.mjs |
| 拒绝 clear 语义 | 调用已有 | EXIT_CODES | bin/cli-utils.mjs |
| 6 项检查判定 | 新封装公用 | checkDesignArtifacts | 新增 bin/design-check.mjs（纯函数，供 CLI 与 gate:clear 复用） |

## Part C — 实施落点

### C1 新增/修改文件清单

| 文件路径 | 操作（新增/修改） | 说明 |
|---|---|---|
| `bin/design-check.mjs` | 新增 | checkDesignArtifacts + runDesignCheck |
| `bin/design-check.test.mjs` | 新增 | 5 用例 |
| `bin/harness.mjs` | 修改 | design:check 分发 + gate:clear 拦截 |

### C2 分层改动

- CLI 层：`design:check` 子命令分发（harness.mjs design 分支）；
- 治理层：`gate:clear` 拦截 6 个设计检查项（在 verify-test 拦截之后、写状态之前）；
- 逻辑层：`checkDesignArtifacts`（纯函数，文件存在 + Part A 四节 + Part B 矩阵）。

### C3 依赖与实施顺序

1. `bin/design-check.mjs`（纯函数 + CLI）；
2. `bin/harness.mjs` gate:clear 拦截（依赖 checkDesignArtifacts）；
3. 测试 + 文档。

### C4 风险与回滚

- 风险：拦截误伤正常 clear → 校验仅针对 6 个固定 id，且仅 check 被 clear 的那一项（`only` 参数），其余 clear 不受影响；
- 回滚：删除 design-check.mjs 并还原 harness.mjs gate:clear 分支（git revert 单提交）。
