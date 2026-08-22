---
layout: default
title: Getting Started (English)
---
# Getting Started (English)

> 中文版见 `docs/getting-started.md`。This page keeps the core lifecycle in sync with the Chinese version (HTH-022: bilingual core docs, core-first, not exhaustive translation).

## 1. Install

```bash
npm i -D pallastrade-harness
# or upgrade
npm i -D pallastrade-harness@latest
```

Git-dependency alternative (no npm publish needed):

```bash
npm i -D github:stevenbian9266-cyber/pallastradeharness
```

## 2. Setup (recommended entry)

```bash
npx harness setup --dry-run          # preview what will be created/changed (always safe)
npx harness setup --preset single --tier lite --name my-app
```

`setup` is the recommended entry; `init` / `onboard` remain as compatible aliases. Presets: `single` / `nextjs` / `rails` / `monorepo`.

## 3. Health check

```bash
npx harness doctor
npx harness config:check
```

## 4. Zero-cognition path (HTH-013)

No need to understand Task ID / Gate ID / check ID — two commands:

```bash
npx harness next          # always tells you the next step
npx harness do "优化：my request"   # one-line start (guides next step when a task is active)
```

`harness next --json` returns a stable structure for tooling:

```json
{ "taskId": "...", "gateId": "...", "phase": "no-task|no-gate|preparation|verification|finish",
  "blockingReason": "...", "nextAction": "...", "commands": ["..."], "humanDecisionRequired": true }
```

### Interactive task view (HTH-016)

Run `npx harness tui` in a terminal:

```
> TASK-...  implementing  evidence:3  优化：interactive TUI
  TASK-...  planned       evidence:0  新增：payment gateway
↑/↓ navigate · Enter detail · r refresh · q quit
```

- **↑/↓** move cursor; **Enter** opens task detail (goals / acceptance criteria / blockers / evidence / nextAction)
- In detail: **Enter** runs the next CLI action; **b** back; **q** quit
- Non-TTY (pipe/CI) falls back to static output; `--json` / `--watch` equivalents remain
- **Every interactive action has a CLI/JSON equivalent** (view detail = `harness task status --task <id> --json`; nextAction itself is a CLI command)

### Brain retrieval & offline eval (HTH-017)

```bash
npx harness brain index                         # build the knowledge index
npx harness brain query --query "change snapshot evidence freshness" --top 10
npx harness brain eval                          # built-in 50-query suite (presets/brain-eval/default.json)
npx harness brain eval --file my-queries.json   # custom suite ([{query, requiredAssets:[...]}])
```

## 5. Standard task (full lifecycle)

Task prefixes auto-select the type (feature/bugfix/style/docs/audit/research/refactor/security/test). Gate lifecycle: preparation → implementation → verification → finished; **every new Gate must bind a Task** (INV-03), and verification closes only via typed evidence (never manually clear `verify-test`).

```bash
# 1. Create/resume a task (persistent state)
npx harness task start --title "新增：my feature" --allow "src/**"
# note the ID: TASK-XXXXXXXXXXXX-xxxxxxxx

# 2. Build context and assess risk
npx harness brain context --task <TASK-ID>
npx harness risk check --task <TASK-ID>

# 3. Open a Task-bound Gate
npx harness gate --task "新增：my feature" --task-id <TASK-ID>
npx harness gate:clear --gate <GATE-ID> --clear <check-id>

# 4. Generate allowed/modified scope and applicable standards
npx harness supervise plan --task "新增：my feature" --allow "src/**" "test/**"

# 5. Review during/after implementation
npx harness supervise diff
npx harness standards coverage

# 6. Objective verification (trusted verifier registry, HTH-005)
npx harness verify unit --task <TASK-ID>
npx harness evidence record --task <TASK-ID> --type review --summary "..." --approve
npx harness evidence record --task <TASK-ID> --type knowledge --summary "..." --approve

# 7. Close verification (evidence-only, HTH-007)
npx harness evidence verify --task <TASK-ID> --gate <GATE-ID>

# 8. Finish the task (before commit/HEAD moves)
npx harness task finish --task <TASK-ID>
```

> ⚠️ Deprecated usage (removed/forbidden):
> - `harness gate` without `--task-id` (rejected when no active task)
> - `harness gate:clear --gate <GATE-ID> --clear verify-test` (verification closes only via `evidence verify`)
> - Any command posing as a test: `evidence run --type test -- <any command>` is marked `diagnostic`; use `harness verify <verifier-id>`

## 6. lefthook (physical enforcement)

See `docs/getting-started.md` §6 for the `lefthook.yml` example (pre-commit: gate:required + anti-patterns + secrets; pre-push: doc-impact).

## 7. Progressive tiers

| Tier | Audience | Features |
|---|---|---|
| Lite | individual/prototype | basic gate + scanners |
| Standard | team | + PRD workflow + doc-impact |
| Strict | critical systems | + full checks + coverage thresholds |

`harness suggest` recommends when to upgrade from usage history.

## 8. Privacy-first metrics (HTH-019)

```bash
npx harness metrics          # local anonymous aggregates only
npx harness metrics export   # review before any opt-in upload
```

Never uploads source code, command output, paths, PRD content, or raw evidence.
