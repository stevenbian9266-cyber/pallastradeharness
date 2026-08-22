# Changelog

All notable changes to **pallastrade-harness** are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) · Versioning: [SemVer](https://semver.org/)

## [Unreleased]

### Planned — Trust Kernel (1.7.0)

- ChangeSnapshot: Task/Gate/Evidence/commit bound to one recomputable change snapshot (index tree + worktree/untracked manifest + config hash) — RFC `docs/rfc/0002-change-snapshot.md`
- Verifier Registry: evidence must come from registered trusted verifiers; arbitrary commands downgraded to `diagnostic`
- Task-strong binding: every new Gate requires a Task; Taskless Gates isolated and deprecated
- Agent-native hooks: Node JSON parsing, install/verify/explain, `hooks doctor`
- Repo self-governance: this file, `AGENTS.md`, `harness.config.mjs`, `lefthook.yml`, branch protection

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
