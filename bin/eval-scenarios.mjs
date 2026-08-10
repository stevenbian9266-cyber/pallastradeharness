#!/usr/bin/env node
/**
 * GS scenario executor — static readiness validation + LLM executor prompts.
 *
 *   node scripts/harness/cli.mjs eval-scenarios [--readiness] [--prompts]
 *
 * Two modes:
 *   --readiness  (default)  For each GS scenario, statically verify the
 *                           capabilities the scenario exercises actually exist
 *                           in this repo (generators, hooks, SDK, DI config,
 *                           V3-only routes, doc-impact rules, etc.). Fails
 *                           closed (exit 1) when any scenario is not ready.
 *   --prompts               Print an LLM execution prompt per scenario. This
 *                           is the interface a future promptfoo-style executor
 *                           will feed to the model; today it makes the library
 *                           machine-consumable.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig, resolveProjectRoot } from './config-loader.mjs';

function loadScenarios(rootDir, config) {
  const p = resolve(rootDir, config?.scenarios || 'harness/scenarios/scenarios.json');
  if (!existsSync(p)) return [];
  try { return JSON.parse(readFileSync(p, 'utf-8')).scenarios || []; } catch { return []; }
}

const exists = (r, p) => existsSync(resolve(r, p));
const anyExists = (r, paths) => paths.some(p => exists(r, p));
function contains(r, p, re) {
  if (!existsSync(resolve(r, p))) return false;
  try { return re.test(readFileSync(resolve(r, p), 'utf-8')); } catch { return false; }
}
/** Recursive filename search under subdir (max depth). */
function findFiles(r, subdir, nameRe, depth = 5) {
  const base = resolve(r, subdir);
  if (!existsSync(base)) return [];
  const out = [];
  const walk = (dir, d) => {
    if (d > depth) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(full, d + 1);
      else if (nameRe.test(entry.name)) out.push(full);
    }
  };
  walk(base, 0);
  return out;
}

// Scenario id -> list of [label, check(rootDir) => boolean, critical=true].
// Critical checks gate the readiness result (exit 1); advisory checks (false)
// are reported as ⚠️ notes and do not block (e.g. VCR is nice-to-have for
// GS-003 but the payment stack works without it).
const READINESS_CHECKS = {
  'GS-001': [
    ['api_resource generator', r => findFiles(r, 'backend/pallastrade_gems', /api_resource/).length > 0],
    ['prefixed-ID serializers', r => exists(r, 'backend/pallastrade_gems/pallastrade_api/app/serializers')],
    ['RSpec suite', r => exists(r, 'backend/spec')],
  ],
  'GS-002': [
    ['dependencies registration point', r => anyExists(r, ['backend/config/initializers/pallastrade.rb', 'backend/pallastrade_gems/pallastrade_api/lib/pallastrade/api/dependencies.rb'])],
    ['RSpec suite', r => exists(r, 'backend/spec')],
  ],
  'GS-003': [
    ['payment gateway stack', r => anyExists(r, ['backend/pallastrade_gems/pallastrade_core/app/models/pallastrade/payment_method.rb', 'backend/pallastrade_gems/pallastrade_stripe', 'platform/payments/pallastrade_stripe'])],
    ['payment specs', r => exists(r, 'backend/spec/payments') || findFiles(r, 'backend/pallastrade_gems/pallastrade_stripe', /_spec\.rb$/i).length > 0],
    ['VCR dependency', r => contains(r, 'backend/Gemfile', /vcr/i), false],
  ],
  'GS-004': [
    ['@pallastrade/sdk', r => exists(r, 'platform/packages/sdk/package.json')],
    ['vitest suite', r => exists(r, 'storefront/vitest.config.ts')],
  ],
  'GS-005': [
    ['destructive-DB block hook', r => exists(r, 'ai/hooks/block_destructive_db.sh')],
    ['cross-agent destructive scanner', r => exists(r, 'scripts/harness/scan-secrets.mjs')],
  ],
  'GS-006': [
    ['secret-warn hook', r => exists(r, 'ai/hooks/warn_on_secrets.sh')],
    ['cross-agent secret scanner', r => exists(r, 'scripts/harness/scan-secrets.mjs')],
  ],
  'GS-007': [
    ['V3-only runtime (no v1/v2 routes)', r =>
      !contains(r, 'backend/config/routes.rb', /api\/v1|api\/v2/)
      && findFiles(r, 'backend/pallastrade_gems', /v[12]\.rb$/i).length === 0],
  ],
  'GS-008': [
    ['doc-impact sync rules', r => contains(r, 'harness.config.mjs', /docImpact/)],
  ],
  'GS-009': [
    ['harness doctor', r => contains(r, 'scripts/harness/cli.mjs', /cmd === 'doctor'/)],
  ],
  'GS-011': [
    ['category model/controller', r => findFiles(r, 'backend/app', /categor.*\.rb$/i).length > 0 || findFiles(r, 'backend/pallastrade_gems/pallastrade_admin/app', /categor.*\.rb$/i).length > 0],
    ['nested-set hierarchy', r => contains(r, 'backend/pallastrade_gems/pallastrade_core/pallastrade_core.gemspec', /awesome_nested_set|ancestry/i)],
    ['RSpec suite', r => exists(r, 'backend/spec')],
  ],
  'GS-013': [
    ['PRD template', r => exists(r, 'docs/prd/_TEMPLATE.md')],
    ['PRD categories policy', r => exists(r, 'harness/policies/prd-categories.json')],
    ['PRD skill', r => exists(r, 'ai/skills/pallastrade-prd/SKILL.md')],
    ['prd CLI', r => contains(r, 'scripts/harness/cli.mjs', /cmd === 'prd'/)],
  ],
  'GS-014': [
    ['sync-check command', r => contains(r, 'scripts/harness/cli.mjs', /cmd === 'sync-check'/)],
    ['doc-impact matrix', r => contains(r, 'harness.config.mjs', /docImpact/)],
    ['GS-014 scenario entry', r => contains(r, 'harness/scenarios/scenarios.json', /GS-014/)],
  ],
};

function buildPrompt(rootDir, scenario) {
  const lines = [
    `# Eval Scenario ${scenario.id}: ${scenario.name}`,
    '',
    `Description: ${scenario.description}`,
    '',
    '## MUST do',
    ...scenario.mustDo.map(x => `- ${x}`),
    '',
    '## MUST NOT do',
    ...scenario.mustNotDo.map(x => `- ${x}`),
  ];
  if (scenario.expectBlocked) lines.push('', 'Expected outcome: the destructive action MUST be blocked.');
  if (scenario.expectWarned) lines.push('', 'Expected outcome: a secret-shaped value MUST trigger a warning.');
  if (scenario.expectUsesV3) lines.push('', 'Expected outcome: only /api/v3/ routes and V3 namespaces are used.');
  if (scenario.scoring) {
    lines.push('', '## Scoring');
    for (const [k, v] of Object.entries(scenario.scoring)) lines.push(`- ${k}: ${v}`);
  }
  lines.push('', '## Evidence required', '- List files created/modified', '- List tests run (file + result)', '- Confirm no mustNotDo items occurred');
  return lines.join('\n');
}

export function run({ rootDir, args, config }) {
  const wantPrompts = args.includes('--prompts');
  const wantReadiness = args.includes('--readiness') || !wantPrompts;
  const scenarios = loadScenarios(rootDir, config);

  if (scenarios.length === 0) {
    console.log('⚠️  No scenarios found in harness/scenarios/scenarios.json.');
    process.exit(wantPrompts ? 0 : 1);
  }

  if (wantPrompts) {
    console.log(`# GS Scenario Executor Prompts (${scenarios.length})\n`);
    for (const s of scenarios) {
      console.log(buildPrompt(rootDir, s));
      console.log('\n---\n');
    }
    return;
  }

  let failed = false;
  let checked = 0;
  for (const s of scenarios) {
    const checks = READINESS_CHECKS[s.id];
    if (!checks) {
      console.log(`⚠️  ${s.id} (${s.name}): no readiness checks defined`);
      continue;
    }
    const results = checks.map(([label, fn, critical = true]) => {
      let pass;
      try { pass = fn(rootDir); } catch { pass = false; }
      return { label, pass, critical };
    });
    const ok = results.every(x => x.pass);
    const criticalFail = results.some(x => !x.pass && x.critical);
    if (criticalFail) failed = true;
    checked++;
    console.log(`${ok ? '✅' : '❌'} ${s.id} ${s.name}`);
    for (const r of results) {
      const mark = r.pass ? '✅' : (r.critical ? '❌' : '⚠️');
      console.log(`   ${mark} ${r.label}${r.pass || r.critical ? '' : ' (advisory)'}`);
    }
  }

  console.log(`\n${checked} scenario(s) readiness-checked.`);
  if (failed) {
    console.log('❌ One or more CRITICAL scenario capabilities are not ready — see failures above.');
    process.exit(1);
  }
  console.log('✅ All critical scenario capabilities ready.');
}

// CLI entry
const args = process.argv.slice(2);
if (args.length > 0 && args[0] === 'eval-scenarios') {
  const rootDir = resolveProjectRoot();
  const { config } = await loadConfig({ rootDir });
  run({ rootDir, args: args.slice(1), config });
}
