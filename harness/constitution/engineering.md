# Engineering Standard

> pallastradeharness 工程规范（Batch C / C04）。与机器规则分工：本文档定原则，`rules/base-standards.json` 与扫描器定可自动校验的条目。

## Directory Rules

- `bin/`：引擎源码（模块平铺，禁止为"目录美观"搬迁——AGENTS.md §4.7）；`bin/*.test.mjs` 与被测模块同目录
- `templates/`、`presets/`、`rules/`、`skills/`、`docs/`：资产与文档（可被项目覆盖）；`harness/`：治理状态（只提交 requirements/policies/constitution）；`.harness-state/`、`.harness-cache/`、`artifacts/`：本地状态（不入库）
- 新增顶层目录需在 `AGENTS.md §1` 登记

## Naming

- 模块：kebab-case（`task-orchestrator.mjs`）；测试 `*.test.mjs`；模板/技能：kebab-case id
- 契约类型：PascalCase（`ProjectArtifact`）；枚举值：UPPER_SNAKE（`ARCHITECTURE_CHANGE`）或既有小写集合（`ACTIVE`）
- 任务标题前缀固定集合：修复 / 优化 / 新增 / 重构 / 文档 / 审计 / 测试 / 安全 / 样式 / 研究

## Module Organization

- 一个模块一个能力域；导出面显式（`export function`），内部实现不入公开面
- 跨模块复用只走导出符号；禁止复制其他模块的校验/写盘逻辑
- 公开子路径（package.json `exports`）视为稳定契约，变更需迁移说明

## Reuse First

- 实施前必须跨层搜索（bin / presets / templates / rules / docs）——gate 的 `search-*` 检查强制
- 复用顺序：调用已有 → 扩展已有 → 新封装公用（被 ≥2 处引用）→ 新建局部

## Do Not Duplicate

- 禁止第二套 Task/Gate/Evidence/Skill/Decision 引擎（AGENTS.md §4.1-4.4）
- 发现并列实现：合并或抽象；确需例外时记录 Decision

## Error Handling

- 领域函数：返回 `{ok, code, message}` 或抛 `TypeError`（fail-loud）；CLI 映射退出码（0 成功 / 1 策略失败 / 2 用法或配置）
- 禁止静默吞错；禁止 `.catch(() => [])` 把未知折叠为空结果（AGENTS.md §4 反模式）

## Validation

- 外部输入（JSON/CLI/配置）必须校验；复用 `contracts.validateContract` 与模块内校验器
- 文件存在性、枚举、格式（semver/哈希）必须显式校验并给出可操作错误

## Logging

- CLI 输出保持 `✅ / ⚠️ / ❌` + 一句结论 + 下一步命令；禁止输出密钥与敏感值
- 机器可读：`--json` 输出结构化对象（不混入人类文案）

## Configuration

- 配置来源：`harness.config.mjs`（项目）→ `config-loader` DEFAULT_CONFIG（引擎默认）
- 禁止把环境差异硬编码进领域逻辑；新增配置项必须有默认值与文档

## Dependency Policy

- 新增依赖需通过 Tech Stack Impact 评估（`DEPENDENCY_CHANGE`）；框架级变化 = `TECH_STACK_CHANGE` + Decision
- 同一问题不得引入第二个库（先查 `glob-utils` 等既有封装）

## Type Safety

- 无 TS 编译；以契约校验 + JSDoc 注释约束边界；动态数据必须经校验器

## Refactoring Policy

- 重构必须单独任务（`重构：` 前缀）或明确列入批次；禁止顺手重构（Opportunistic Refactoring）
- 行为不变需有测试证据；提炼模块时保持导出/退出码零变化

## Performance

- 单命令启动 < 1s；测试套件保持分钟级；大仓库走 shard
- 禁止无测量依据的优化；新增循环/扫描需说明复杂度

## Security Baseline

- 证据必须绑定 HEAD/worktree/hash；验证器白名单（禁止任意命令冒充证据）
- 密钥扫描 + 危险命令 Hook；`package-lock.json` 等保护文件禁止手改

## Forbidden Patterns

- 详见 `architecture.json#rules` 与 `rules/base-anti-patterns.json`（STARTER-001~005）
- 额外：`.catch(() => [])`、无守卫的 force-push/destructive DB 脚本、MCP 层直接改状态

## Definition of Done

- Task 通过 gate；证据（test/review/knowledge（+approval 当 critical））新鲜；`doc-impact` 放行；测试全绿
- 影响评估（Architecture/Tech Stack Impact）已记录；Constitution 变更走 Change Flow
- 文档（README/CHANGELOG/相关 docs）同步；`docs:check` / `readme:sync` 通过
