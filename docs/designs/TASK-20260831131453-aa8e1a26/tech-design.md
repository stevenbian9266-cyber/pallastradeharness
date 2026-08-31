# 技术方案（Tech Design）— TASK-20260831131453-aa8e1a26

> 设计阶段产物 **4/4（核心）**。对应 PRD：`PRD-20260831-other-引擎-harness-token-优化`；Task：`TASK-20260831131453-aa8e1a26`
> 目的：先识别现状、再定复用决策，防止重复造轮子与改错归属模块。
> 前置：已运行 `harness design:scan --scope all`（本任务改动的符号均来自已读源码）。

## Part A — 现状识别（强制，缺此段方案无效）

### A1 业务系统盘点

| 现有业务模块/服务 | 边界 | 新功能归属 |
|---|---|---|
| CLI 分发 `bin/harness.mjs` | gate / gate:status / gate:clear / metrics / prd 等命令分支 | gate 输出精简（--quiet/--short/clear 回显） |
| 配置加载 `bin/config-loader.mjs` | DEFAULT_CONFIG / getGateChecks / validateConfig | disableChecks / designStage auto / output 段 |
| 任务编排 `bin/task-orchestrator.mjs` | start/list/status/finish 子命令 | task list 裁剪 |
| 指标 `bin/metrics.mjs` | collectMetrics / runMetrics | 产物文档 token 统计 |
| 文档生成 `bin/docs-gen.mjs` | BUILTIN_PRD_TEMPLATE / runTemplate | 模板随包精简 |
| 模板 `templates/prd/_TEMPLATE.md` | PRD 结构骨架 | 模板随包精简 |

### A2 数据模型识别

| 现有表/集合/模型 | 关联 | 新增 or 扩展 |
|---|---|---|
| Task 状态 JSON（.harness-state/tasks/*.json） | status/riskLevel/title | 不新增字段（list 只读展示） |
| Gate 状态 JSON（harness/gates/GATE-*.json） | checks[].status/phase | 不新增字段（输出层裁剪） |
| 指标 JSON（内存聚合） | 计数/时间戳 | 扩展：taskArtifacts 数组（计数/字节/estTokens） |
| 配置对象 | gates/designStage/output | 扩展：gates.disableChecks / designStage.uiKeywords / output 段 |

### A3 字段盘点

| 字段 | 现有定义（类型/约束） | 新增 or 复用 |
|---|---|---|
| `config.gates.checkDefs` | object（追加 check） | 复用（旁边新增 `disableChecks`） |
| `config.designStage.enabled` | boolean（默认 true） | 扩展为 `true\|false\|'auto'` |
| `config.designStage.uiKeywords` | 无 | 新增 string[]（默认含 ui/页面/组件/交互/视觉/样式/storefront/dashboard） |
| `config.output` | 无 | 新增对象（gateListVerbose=true / taskListDefaultLimit=20 / requireSkillRead=true） |

### A4 代码结构

| 公共方法/组件/工具 | 位置 | 签名/说明 |
|---|---|---|
| `getGateChecks` | bin/config-loader.mjs | `(config, taskType) => check[]`；将加第三参 `taskDesc` |
| `getArg` / `hasArg` | bin/cli-utils.mjs | 参数读取（复用，无需改） |
| `listCommand` | bin/task-orchestrator.mjs | `({rootDir, config, json}) => void`；将加 limit/status 过滤 |
| `collectMetrics` / `runMetrics` | bin/metrics.mjs | 聚合/展示；将加 taskArtifacts |
| `BUILTIN_PRD_TEMPLATE` | bin/docs-gen.mjs | 内置 PRD 模板字符串；将精简 |
| `listTasks` | bin/state-store.mjs | 返回按 updatedAt 倒序的任务数组（复用） |

## Part B — 复用决策矩阵（每个能力需求必须二选一；决策列限：调用已有 / 扩展已有 / 新封装公用 / 新建局部）

| 能力需求 | 决策 | 目标 | 依据（已有位置/签名） |
|---|---|---|---|
| gate --quiet / gate:status --short / gate:clear 精简 | 扩展已有 | gate 命令分支 | bin/harness.mjs:460（gate）、658（status）、725（clear） |
| disableChecks 过滤 | 扩展已有 | getGateChecks | bin/config-loader.mjs:283 |
| designStage auto 判定 | 扩展已有 | getGateChecks 第三参 + uiKeywords | bin/config-loader.mjs:300（设计检查插入点） |
| task list 默认 20 条/--all/--status | 扩展已有 | listCommand | bin/task-orchestrator.mjs:230 |
| output 配置段 | 扩展已有 | DEFAULT_CONFIG | bin/config-loader.mjs:22 |
| metrics 产物统计 | 扩展已有 | collectMetrics | bin/metrics.mjs:21 |
| 模板精简 | 扩展已有 | templates/prd/_TEMPLATE.md + BUILTIN_PRD_TEMPLATE | bin/docs-gen.mjs:23 |

## Part C — 实施落点

### C1 新增/修改文件清单

| 文件路径 | 操作（新增/修改） | 说明 |
|---|---|---|
| bin/harness.mjs | 修改 | gate --quiet / gate:status --short / gate:clear 回显精简 |
| bin/config-loader.mjs | 修改 | disableChecks / designStage auto+uiKeywords / output 段 / getGateChecks 签名 |
| bin/task-orchestrator.mjs | 修改 | listCommand 默认 20 + --all + --status |
| bin/metrics.mjs | 修改 | collectMetrics 产物统计 + estTokens |
| bin/docs-gen.mjs | 修改 | BUILTIN_PRD_TEMPLATE 精简 |
| templates/prd/_TEMPLATE.md | 修改 | 删除 ⚠️ 说明块，保留骨架 |
| bin/config-loader.test.mjs | 修改 | disableChecks / output / auto 用例 |
| bin/design-scan.test.mjs | 修改 | auto 模式用例 |
| bin/metrics.test.mjs | 修改 | taskArtifacts 用例 |
| bin/cli-e2e.test.mjs | 修改 | --quiet / --short 用例 |
| README.md / docs/commands.md / docs/getting-started.md / CHANGELOG.md | 修改 | 文档同步 |

### C2 分层改动

- UI 层（CLI 输出）：harness.mjs gate/status/clear 分支 + task-orchestrator listCommand。
- 业务层（配置/判定）：config-loader getGateChecks + DEFAULT_CONFIG。
- 数据层（指标）：metrics collectMetrics taskArtifacts。

### C3 依赖与实施顺序

1. config-loader（disableChecks / designStage auto / output）→ 供 gate 与测试消费。
2. harness.mjs gate 输出精简（--quiet / --short / clear 回显）。
3. task-orchestrator list 裁剪。
4. metrics 产物统计。
5. 模板精简（templates/prd + docs-gen）。
6. 测试更新 → 全量 `node --test bin/*.test.mjs`。
7. 文档同步。

### C4 风险与回滚

- 风险：getGateChecks 签名扩展（第三参 taskDesc）——第三参可选，旧调用（仅 config/taskType）不受影响。
- 风险：output.taskListDefaultLimit=20 改变默认输出——CI 若解析 task list 需加 `--all`；默认保守可用 `0` 全量。
- 风险：designStage auto 判定误伤（任务描述含"样式"但非 UI）——uiKeywords 可配置；`enabled: true` 完全保留旧行为。
- 回滚：全部新增配置默认值=现状；删除配置即回退 1.8.0 行为。
