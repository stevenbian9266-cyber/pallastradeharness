# Changelog

All notable changes to **pallastrade-harness** are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) · Versioning: [SemVer](https://semver.org/)

## [Unreleased]

### 发布前开发与测试强化（设计文档 §19）+ UI 监督便宜项（设计文档 §18）

- `prd verify --semantic`：AC 语义校验，拒绝空断言 / 过度 mock 的"假覆盖"（新增 `bin/ac-semantic.mjs`）
- `task start --ac <PRD> AC-x`：任务↔AC 双向绑定；PRD 不存在或 AC 未声明即阻止开始；`task finish` 校验声明的 AC 全有测试 + PRD 无未认领 AC（新增 `bin/ac-trace.mjs`）
- `verify coverage`：coverage 注册为受信验证器；项目声明 `coverage.thresholds` 时 gate 自动追加 `coverage-gate`，由 coverage 验证器证据自动满足（evidence.mjs）
- `ui-approval` 证据类型：`EVIDENCE_TYPES` 新增，UI 人工确认作为 UI 任务的硬性完成条件（设计文档 §18.5）
- `scan-ui-anti-patterns`：UI 反模式扫描器（UI-001 inline style / UI-002 硬编码十六进制色（排除 design-tokens）/ UI-003 裸 fetch / UI-005 img 缺 alt），内置默认规则 + `harness/policies/ui-anti-patterns.json`，接入 lefthook 模板
- `visual:baseline / visual:diff`：视觉回归（§18.4）——golden screenshot 基线 + 像素 diff（pngjs+pixelmatch），超阈值 exit 1，无基线/无截图 → `validation_unavailable`（exit 2）；`config.visualRegression`（enabled/url/viewports/baselineDir/maxDiffRatio），enabled 时 gate 自动追加 `visual-regression`，由截图/ui-approval 证据自动满足
- `adapter register / registered / unregister`：Agent 能力登记与诚实保护报告（§17.3.2）——新增 `bin/capability-registry.mjs`（能力白名单 + validate + 保护等级派生 enforced/guarded/advisory + 大白话描述），登记存 `.harness-state/adapters/`
- `governance:init / status / version`：治理版本与项目画像（§15 总前置条件）——新增 `bin/governance.mjs`（project.yaml 画像 + `governanceReady` + 版本快照锁定 `governance-0.1.0` + 状态机只前进）；`task start` 在 ready 项目上记录 `governanceVersion`（§15.9）
- `wizard init / step / status / from / finish / reset`：从零项目 10 步向导（§17.7 旗舰功能）——新增 `bin/wizard.mjs`（10 步定义 + 答案落盘可恢复 + 答案→画像映射 + `derivePrdCategory` + finish 复用 governance 锁定）；引导式问答产出 `harness/project.yaml` 并锁定治理版本
- `baseline:create / check / status`：存量项目质量基线 / no_regression（§14.5）——新增 `bin/baseline.mjs`（TAP 解析 + 基线落盘 `.harness-state/baseline/` + 三态：新增失败阻断 / 历史失败仅记录 / 已修复改善）；`config.qualityBaseline`（enabled/testCommand），enabled 时 gate 自动追加 `baseline-gate`，由 baseline 验证器证据自动满足；修复测试命令子进程继承 `NODE_TEST_CONTEXT=child-v8` 导致 stdout 被抑制的坑
- 单测：`bin/ac-semantic.test.mjs`、`bin/ac-trace.test.mjs`、`bin/scan-ui-anti-patterns.test.mjs`、`bin/visual-regression.test.mjs`、`bin/capability-registry.test.mjs`、`bin/governance.test.mjs`、`bin/wizard.test.mjs`、`bin/baseline.test.mjs`（全量 255/255 通过）

### Guided UX + External Validation (1.8.0) — 实施中（2026-08-22）

- 交互式 TUI 当前任务视图（HTH-016）：键盘导航 / 任务详情 / nextAction 动作执行，全部动作有 CLI/JSON 等价物
- Brain 检索 adapter 与评测框架（HTH-017）：`brain query` 确定性 top-K 检索 + `brain eval` 离线评测（Recall@K + 必需资产遗漏率）+ 50 查询评测集；修复 F-09 召回虚高
- 本地匿名指标（HTH-019）：`harness metrics` 隐私优先，默认不上传，`metrics export` 审阅导出
- 插件合同测试与兼容政策（HTH-021）：1.0 manifest 幂等验证 + 确定性断言
- Tier A 参考仓 fixtures（HTH-018）：`examples/` node-ts/rails/java 最小参考项目
- 小白可用性试点包（HTH-020）：`docs/pilot/` 指南/指标表/访谈/问题报告模板（待外部执行）
- 双语核心文档与 2.0 beta 发布决策（HTH-022）：`README.en.md` / `docs/getting-started.en.md` / Go-No-Go 报告 `docs/rfc/0003-release-gate.md`（2.0 正式版 No-Go，继续 beta）

### README 版本信息防漂移（readme:sync）

- 新增 `harness readme:sync [--check|--write]`：从 `package.json`（当前版本）+ `CHANGELOG.md`（已发布版本）确定性同步 README「发布信息/版本记录」——`--check` 漂移即 exit 1（CI 硬卡），`--write` 就地修复（更新当前版本行 + 补齐缺失版本表行，自动生成行标注「待润色」，不覆盖手写富文本）
- 修复现存漂移：README 当前源码版本 1.6.0 → 1.7.0 + 版本表补 v1.7.0/v1.3.1 行；`package-lock.json` 根版本经 `npm install --package-lock-only` 再生成；`docs/roadmap.md` 1.6.0 状态行改为已发布；`SECURITY.md` 支持版本下限升 1.7.0
- CI 门禁：`.github/workflows/test.yml` 新增 `readme-sync` job（`node bin/readme-sync.mjs --check`），版本变更 PR 必须同步 README 才能合并
- 发布后自动更新：`.github/workflows/publish.yml` 发布成功后自动 `--write`，若有漂移自动创建修复 PR（main 受 Ruleset 保护，禁止直推）
- 单测 `bin/readme-sync.test.mjs`（11 用例）覆盖 parse/check/write/roundtrip

## [1.7.0] — 2026-08-22

### Trust Kernel（可信内核）

- ChangeSnapshot: Task/Gate/Evidence/commit 绑定同一可重算变更快照（index tree + worktree/untracked manifest + config hash）— RFC `docs/rfc/0002-change-snapshot.md`
- Verifier Registry: `harness verify`；任意命令降级 diagnostic；手工证据 `success:null` + `--approve`
- Task 强绑定: 新 Gate 必须绑定 Task；Taskless Gate 隔离 + 废弃路径；verify-test 一律证据控制
- Node 化安全 Hook: `bin/hook-agent.mjs` + `harness hooks doctor`（支持级别矩阵）
- 可执行文档: getting-started task-bound 生命周期；docs:check 过时命令防漂移
- 独立仓自治理: AGENTS.md/harness.config.mjs/lefthook.yml/SECURITY.md/CHANGELOG.md + **GitHub Ruleset `main-protection`**（禁直推/强推/删除、PR+review、6 个 required checks）
- 引导式体验（P1 前置内容）：`harness do`/`next` 零认知路径 + 真 Lite + `harness setup` 统一接入 + 保护 doctor 覆盖

## [1.6.0] — 2026-08-20

- feat: automated trigger completion (自动触发补全)
- 45 production `.mjs` modules, 138 passing automated tests
- CI on Windows/macOS/Ubuntu × Node 22/24
- npm OIDC trusted publishing + SLSA provenance

## [1.5.0] — 2026-08-19

- feat: Auto-Content 自动内容生成

## [1.4.0] — 2026-08-18

- feat: PRD workflow enabled by default (一句话 → PRD → 确认 → 实施)

## [1.3.1] — 2026-08-17

- fix: resolveSmartPath src doubling + glob/negation/table-row support in scan & freshness

## [1.3.0] — 2026-08-16

- feat: skill audit — 通用 Skills 自动治理
