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
npx harness task impact --task <TASK-ID> --architecture <NONE|LOCAL|CROSS_MODULE|ARCHITECTURE_CHANGE> --tech-stack <NONE|DEPENDENCY_CHANGE|TECH_STACK_CHANGE>
```

Prefixes: `修复：` bugfix / `优化：` `新增：` feature / `样式：` style / `审计：` audit / `研究：` research / `文档：` docs / `重构：` refactor / `安全：` security / `测试：` test.

The gate **must be fully cleared** (`npx harness gate:status` exits 0) before any file edit. During the gate, only `harness/requirements/` and `harness/gates/` may be written. Verification evidence (`verify-test`) is closed only through fresh typed evidence (`npx harness evidence run|record`).

`task impact` is **not optional** in this repo: strict governance is enabled here (§2.1), and a missing impact record blocks `task finish`. `ARCHITECTURE_CHANGE` / `TECH_STACK_CHANGE` additionally require a recorded Decision（`--decision "<内容>"` 或先 `brain decision`），否则命令被拒。

### 2.1 严格治理（strict）— 本仓已启用

本仓 `harness.config.mjs` 声明 `governance: { strictGovernance: true }`：**本仓即试验田**，所有变更必须通过引擎自己的严格收尾。

- 缺任一必需事实（Context Audit / Requirement & UI Approval / Impact / Plan / 证据 / AC 覆盖 / 知识评估）→ `task finish` 输出 `REQUIRED_ACTIONS`（每项带可执行命令）、退出码非 0、**任务状态不变**，且引擎**不得补造事实**。
- 关闭方式（仅在其他仓/临时验证时）：不声明该键即走兼容路径；本仓若需回退，须同步调整 `bin/cli-e2e.test.mjs` 中的 self-dogfood 守卫用例（`test:core` 会先失败，提示这是有意变更）。
- 云侧语义与本地一致：Cloud 运行时恒为严格（`strictGovernance: true`，见 ADR-0002 D5），不得回退 legacy。


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
- MCP mechanism integration spec: `docs/rfc/0004-mcp-mechanism.md`
- Hosted service plan: `docs/rfc/0005-hosted-service.md`
- Runtime boundary audit & matrix (Batch D / D01): `docs/rfc/0006-runtime-boundary.md`
- ADRs (decision records): `docs/adr/`（当前：`ADR-0002-runtime-boundary.md`，PROPOSED）
