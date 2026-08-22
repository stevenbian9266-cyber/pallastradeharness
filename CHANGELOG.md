# Changelog

All notable changes to **pallastrade-harness** are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) · Versioning: [SemVer](https://semver.org/)

## [Unreleased]

### Trust Kernel (1.7.0) — 实施中（2026-08-22）

- ChangeSnapshot: Task/Gate/Evidence/commit 绑定同一可重算变更快照（index tree + worktree/untracked manifest + config hash）— RFC `docs/rfc/0002-change-snapshot.md` ✅
- Verifier Registry: `harness verify`；任意命令降级 diagnostic；手工证据 `success:null` + `--approve` ✅
- Task 强绑定: 新 Gate 必须绑定 Task；Taskless Gate 隔离 + 弃用路径；verify-test 一律证据控制 ✅
- Node 化安全 Hook: `bin/hook-agent.mjs` + `harness hooks doctor`（支持级别 matrix）✅
- 可执行文档: getting-started task-bound 生命周期；docs:check 过时命令防漂移 ✅
- 独立仓自治理: AGENTS.md/harness.config.mjs/lefthook.yml/SECURITY.md/CHANGELOG.md + **GitHub Ruleset `main-protection`**（禁直推/强推/删除、PR+review、6 个 required checks）✅

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
