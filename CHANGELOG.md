# Changelog

All notable changes to **pallastrade-harness** are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) · Versioning: [SemVer](https://semver.org/)

## [Unreleased]

### Guided UX + External Validation (1.8.0) — 实施中（2026-08-22）

- 交互式 TUI 当前任务视图（HTH-016）：键盘导航 / 任务详情 / nextAction 动作执行，全部动作有 CLI/JSON 等价物
- Brain 检索 adapter 与评测框架（HTH-017）：`brain query` 确定性 top-K 检索 + `brain eval` 离线评测（Recall@K + 必需资产遗漏率）+ 50 查询评测集；修复 F-09 召回虚高
- 本地匿名指标（HTH-019）：`harness metrics` 隐私优先，默认不上传，`metrics export` 审阅导出
- 插件合同测试与兼容政策（HTH-021）：1.0 manifest 幂等验证 + 确定性断言
- Tier A 参考仓 fixtures（HTH-018）：`examples/` node-ts/rails/java 最小参考项目
- 小白可用性试点包（HTH-020）：`docs/pilot/` 指南/指标表/访谈/问题报告模板（待外部执行）
- 双语核心文档与 2.0 beta 发布决策（HTH-022）：`README.en.md` / `docs/getting-started.en.md` / Go-No-Go 报告 `docs/rfc/0003-release-gate.md`（2.0 正式版 No-Go，继续 beta）

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
