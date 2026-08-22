# pallastradeharness — Agent Instructions (Root)

You are working on **pallastrade-harness**, a local-first AI-native SDLC governance engine (Task / Risk / Gate / Supervisor / Evidence / Recovery / Knowledge / Agent Adapters / MCP / TUI).

This repo is the **engine itself**. Every change to this repo is dogfooded through the very governance the engine provides. There is no separate "customer code" — the product and its test bed are the same repository.

## 1. Repository Layout

| Path | Purpose | Can Modify? |
|---|---|---|
| `bin/*.mjs` | Engine modules (CLI commands, gate lifecycle, evidence, risk, brain, supervisor, adapters, MCP, TUI) | ✅ Yes |
| `bin/*.test.mjs` | `node:test` unit/integration tests | ✅ Yes |
| `presets/` | Framework presets (single / nextjs / rails / monorepo …) | ✅ Yes |
| `templates/` | Doc/code templates (PRD / REQ / SKILL / standards) | ✅ Yes |
| `rules/` | Generic rule baselines (base-standards.json …) | ✅ Yes |
| `docs/` | Documentation (getting-started, roadmap, RFCs, command reference) | ✅ Yes |
| `harness/` | Local governance state (gates, requirements, evidence) | ✅ Yes (state; commit only requirements + policies) |
| `package.json` | Package manifest | ✅ Yes |

## 2. Before Writing Any Code — MANDATORY Task Lifecycle

Every mutation task must run, in order:

```bash
npx harness task start --title "<prefix：description>" --allow "<approved-glob>" --json
npx harness brain context --task <TASK-ID>
npx harness risk check --task <TASK-ID>
npx harness gate --task "<prefix：description>" --task-id <TASK-ID>
```

Prefixes: `修复：` bugfix / `优化：` `新增：` feature / `样式：` style / `审计：` audit / `研究：` research / `文档：` docs / `重构：` refactor / `安全：` security / `测试：` test.

The gate **must be fully cleared** (`npx harness gate:status` exits 0) before any file edit. During the gate, only `harness/requirements/` and `harness/gates/` may be written. Verification evidence (`verify-test`) is closed only through fresh typed evidence (`npx harness evidence run|record`).

## 3. Cross-Layer Search (ALL tasks)

Search every layer independently before concluding anything exists/doesn't exist:

1. `bin/` — engine code (search by domain concept, not exact file name)
2. `presets/` — framework presets
3. `templates/` — templates
4. `rules/` — rule baselines
5. `docs/` — documentation

Never stop at the first match (AP-SEARCH-1), never assume a layer has a capability because another has it (AP-SEARCH-3), and search by concept not class name (AP-SEARCH-2).

## 4. Anti-Patterns

This repo self-enforces the same anti-patterns the engine scans for:
- No inline `style={{ }}` in any frontend code
- No raw `fetch()` where the SDK exists
- No hardcoded hex colors in components
- No `Model.create(...)` outside test files
- No `after_save` callbacks where a Subscriber fits
- Never hand-edit generated files (`generated:check` guards)
- No hardcoded redirect without a self-redirect guard
- No `.catch(() => [])` that collapses unknown → empty

## 5. Minimum Verification Per Change Type

| What you changed | Minimum check |
|---|---|
| Any `bin/*.mjs` engine module | `node --test bin/*.test.mjs` + `npx harness gate:required` |
| New contract / schema | golden fixtures + `npx harness contract`-style unit tests |
| Docs / README / CLI help | `npx harness docs:check` |
| Any change | `npx harness doc-impact --base origin/main` |

Evidence: backend logic → test run log / exit-0 record; docs-only → `docs:check` record. "No test needed" is not valid for engine logic changes.

## 6. Knowledge Sync

| Code Change | Docs That MUST Be Updated |
|---|---|
| `bin/*.mjs` (new/modified) | `README.md` + `docs/getting-started.md` (command reference) |
| New command / CLI flag | `docs/command-reference.md` (if exists) + README |
| New RFC (`docs/rfc/`) | This `AGENTS.md` §Reference + RFC index |
| `CHANGELOG.md` | Every release / breaking change |

## 7. Release Process

- `main` is protected: no direct pushes; merge via PR with required checks
- Release: bump version → changelog → tag `vX.Y.Z` → npm publish (OIDC + provenance)
- Every release commit must pass: engine tests, docs:check, and the smoke test (clean install → first task → verify → pack)

## Reference

- Roadmap: `docs/roadmap.md`
- Threat model & invariants: `docs/rfc/0001-threat-model.md`
- ChangeSnapshot contract: `docs/rfc/0002-change-snapshot.md`
