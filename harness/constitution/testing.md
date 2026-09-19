# Testing Standard

> pallastradeharness 测试规范（Batch C / C04）。
> **单一事实源约束**：测试哲学与选择规则的内容权威源 = `presets/skills/testing.md`（渲染为项目 Skill）；本文档只固化结构与本项目差异。

## Testing Philosophy

- 测试金字塔（大量单测 + 适量集成 + 少量 E2E）；行为优先；覆盖三态（正常/边界/错误）；测试即文档；可重复（无外部依赖）
- 本项目差异：引擎 = 纯 Node；测试即为"合同测试"（契约/行为），跨平台矩阵（Node 22/24 × Win/macOS/Linux）

## Static

- 无独立 linter；静态保障 = `supervisor`（复杂度/重复块/范围）+ 扫描器（anti-patterns/secrets/ui）
- 契约校验器（`validateContract`）承担类型边界检查

## Unit

- `node:test`；`bin/*.test.mjs`；命令：`npm run test:core`（`node --test "bin/*.test.mjs"`）
- 单文件内聚：被测模块与测试同目录、命名对应

## Integration

- 模块组合测试（如 task+gate+evidence 链路）也在 core 内：以临时 git 仓库（`mkdtempSync` + `git init`）构造真实环境

## API

- MCP 工具面契约测试：`bin/mcp.test.mjs`（20 工具 = 冻结清单）、`bin/mcp-server.test.mjs`（真 stdio e2e）
- CLI 契约：`bin/cli-e2e.test.mjs`（子进程真实调用）

## Database

- `N/A`（无数据库）

## Migration

- 状态 schema 迁移：`bin/migrations.test.mjs`（配置/状态 schema 版本迁移，缺省兼容）

## E2E

- `bin/cli-e2e.test.mjs`（端到端命令链）；`test:e2e` 独立脚本
- MCP 端到端：`mcp-server.test.mjs` 通过 stdio 真实握手

## Browser

- `N/A`（默认不依赖浏览器；`examples/` 下的示例项目各自维护）

## Visual

- 可选：`bin/visual-regression.mjs`（golden 基线 + pixelmatch；Playwright 缺失 → `validation_unavailable` exit 2）

## Accessibility

- `N/A`（无 UI 产品面；模板/文档可读性由 docs:check 保障）

## Performance

- 无独立性能测试；约束见 engineering.md（启动/套件时长）

## Security

- `bin/scan-secrets.test.mjs` + 危险命令 Hook 测试（`bin/hooks.test.mjs`）；证据新鲜度测试（`bin/evidence.test.mjs`）

## Test Selection Rules

- 改哪个模块 → 至少跑对应 `*.test.mjs` + `npm run test:core` 全量
- 改 MCP → 追加 `test:mcp`；改示例 → `test:examples`；改 CLI 分发 → `test:e2e`
- 发布前：全量 + `npm pack --dry-run`

## Bug Regression Rule

- 修复类变更必须先写复现测试（红）→ 修复（绿）；无法复现时在任务中记录原因并给出替代证据

## Mock Policy

- 允许：时间/随机/外部进程边界（保持可控）；禁止：mock 被测行为本身、mock 门禁/证据判定
- 优先真实临时目录/真实 git 仓库，而非 mock fs

## Fixture Policy

- 夹具随测试文件内联构造（`mkdtempSync`）；跨文件共享夹具放 `**/fixtures/**`（受 supervisor `testFiles` 保护）

## Test Data

- 全部合成数据；禁止真实密钥/用户数据（密钥扫描强制）

## Flaky Test Policy

- 判定：同环境重复失败 / 时序依赖；处置：隔离 + 修复期限（不得 `--skip` 掩盖）
- 已知慢用例（e2e/临时仓库）允许更长超时，但必须确定性

## Coverage Expectations

- 未启用覆盖率阈值（`config.coverage.thresholds` 为空）；要求：新增模块必须有对应测试文件与失败模式用例
- 关键路径（gate/evidence/constitution）必须有负例测试（守卫行为）

## Evidence Requirements

- 满足 `verify-test` 的证据必须来自**注册验证器**（`harness verify unit|reuse-adherence…`），且绑定当前 HEAD/worktree
- 文档类变更用 `docs:check` 实测记录；命令型手记证据不满足 verify-test
