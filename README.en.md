# pallastrade-harness

A software-development-lifecycle governance and evidence-orchestration layer for AI agents: phased gates, machine-readable standards, live development supervision, PRD-to-acceptance loop, and knowledge sync. **Local-first, Git-native, config-driven, project-agnostic** — single apps, Rails monorepos, and any language stack can adopt it.

> Layered architecture: engine layer (deterministic, zero-LLM) + common asset layer (`presets` / `rules` / `skills` / `templates`, overridable per project) + project customization layer (`harness.config.mjs` / `ai/skills` / `harness/standards`).

---

## What it solves

| Problem | Mechanism |
|---|---|
| AI loses goal/context across sessions | **Task Orchestrator + Project Brain**: state, checkpoints, minimal context, agent handoff packs |
| AI edits code uncontrolled / bypasses rules | **Pre-coding Gate**: plan & clear checks before edits; pre-commit physically blocks |
| Standards written but never enforced | **Standards Registry**: standard ID, authority source, scope, enforcement level, coverage |
| Implementation drifts from plan / complex or duplicate code | **Development Supervisor**: scope drift, dependency selection, architecture boundaries, cycles, new-code baselines |
| Anti-patterns recur (inline styles / raw fetch / hardcoded colors) | **Anti-pattern scanner**: JSON-rule driven, CI + pre-commit double gate |
| One-line requirement → ungrounded implementation | **PRD workflow**: one-liner → structured PRD → AC→test mapping → acceptance |
| Code changed but docs forgotten | **Knowledge-sync gate (doc-impact)**: which files changed → which docs must sync |
| Secrets / dangerous commands committed | **Secrets + dangerous-command scanner**: agent-agnostic (Copilot/Codex/Claude/humans all blocked) |
| Standards incomplete on day one | **Progressive adoption**: Lite → Standard → Strict tiers, `harness doctor` next-step hints |
| "It passed tests" can't be re-verified | **Typed Evidence + Recovery**: evidence bound to HEAD/worktree/hash; high-risk tasks require recovery plans |

---

## Quick start

```bash
npm i -D pallastrade-harness
# or upgrade
npm i -D pallastrade-harness@latest

npx harness setup --preset single --tier lite --name my-app   # recommended entry
npx harness doctor                                            # what's missing
npx harness config:check                                      # validate config

# Zero-cognition path (HTH-013): no need to know Task/Gate IDs
npx harness next
npx harness do "优化：my request"

# Standard lifecycle
npx harness task start --title "新增：my feature" --allow "src/**"
npx harness brain context --task <TASK-ID>
npx harness gate --task "新增：my feature" --task-id <TASK-ID>
npx harness gate:clear --gate <GATE-ID> --clear <check-id>
npx harness supervise plan --task "新增：my feature" --allow "src/**"
npx harness supervise diff
npx harness verify unit --task <TASK-ID>
npx harness evidence record --task <TASK-ID> --type review --summary "..." --approve
npx harness evidence verify --task <TASK-ID> --gate <GATE-ID>
npx harness task finish --task <TASK-ID>
```

Interactive task view: `npx harness tui` (↑/↓ navigate, Enter for detail, run next action). Brain retrieval & offline eval: `harness brain query` / `harness brain eval` (50-query reproducible suite).

### Release info

- Source: `github.com/stevenbian9266-cyber/pallastradeharness` (main branch)
- Published via **npm OIDC trusted publishing** with SLSA provenance — no long-lived tokens
- Release order: PR checks → merge main → tag → workflow → registry/provenance verification
- Git dependency alternative: `npm i -D github:stevenbian9266-cyber/pallastradeharness`

### Version highlights

| Version | Highlight |
|---|---|
| **v1.7.0** | **Trust Kernel**: ChangeSnapshot (Task/Gate/Evidence/commit bound to one snapshot), Verifier Registry (`harness verify`), Task-bound Gates (Taskless isolation), Node-based safety Hook (`harness hooks doctor`), self-governed standalone repo (Ruleset `main-protection` + required checks) |
| **v1.6.0** | Automated trigger completion: `ci github` multi-tier CI, `onboard` auto-generates lefthook + AI hooks + deep config |
| **v1.5.0** | Auto-Content: 11 meta-domain skill templates with real content |
| **v1.4.0** | PRD workflow enabled by default |
| **v1.3.0** | Auto-Skills governance (`harness skill audit`) |
| **v1.2.0** | Asset governance (`harness scan`) + Java/Maven signals |

---

See `docs/getting-started.md` (中文) / `docs/getting-started.en.md` (English) for the full lifecycle. Local anonymous metrics: `harness metrics` (privacy-first, opt-in upload, `harness metrics export` to review).
