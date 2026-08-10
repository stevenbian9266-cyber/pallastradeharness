import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

export async function run({ rootDir, args, config }) {
  const checkFreshness = args.includes('--check-freshness');
  const checkScenarios = args.includes('--scenarios');

  if (checkFreshness) {
    await checkFreshnessImpl(rootDir);
  }
  if (checkScenarios) {
    await checkScenariosImpl(rootDir, config);
  }
}

/**
 * Validate scenarios file (from project config) — structural contract for the
 * GS scenario library (unique ids, mustDo/mustNotDo present, scoring weights
 * sum to 100). Fail-closed on violations.
 */
async function checkScenariosImpl(rootDir, config) {
  const scenariosFile = resolve(rootDir, config?.scenarios || 'harness/scenarios/scenarios.json');
  if (!existsSync(scenariosFile)) {
    console.log('⚠️  scenarios file not found (config scenarios or harness/scenarios/scenarios.json).');
    return;
  }

  let data;
  try {
    data = JSON.parse(readFileSync(scenariosFile, 'utf-8'));
  } catch (e) {
    console.log(`❌ scenarios.json is not valid JSON: ${e.message}`);
    process.exit(1);
  }

  const scenarios = Array.isArray(data.scenarios) ? data.scenarios : [];
  const seen = new Set();
  let errors = 0;

  console.log(`\n📋 Scenario validation: ${scenarios.length} scenario(s)\n`);

  for (const s of scenarios) {
    const issues = [];
    if (!s.id) issues.push('missing id');
    if (s.id && seen.has(s.id)) issues.push(`duplicate id ${s.id}`);
    if (s.id) seen.add(s.id);
    if (!s.name) issues.push('missing name');
    if (!s.description) issues.push('missing description');
    if (!Array.isArray(s.mustDo) || s.mustDo.length === 0) issues.push('mustDo must be a non-empty array');
    if (!Array.isArray(s.mustNotDo) || s.mustNotDo.length === 0) issues.push('mustNotDo must be a non-empty array');
    if (s.scoring && typeof s.scoring === 'object' && !Array.isArray(s.scoring)) {
      const total = Object.values(s.scoring).reduce((a, b) => a + (Number(b) || 0), 0);
      if (total !== 100) issues.push(`scoring weights sum to ${total}, expected 100`);
    } else {
      issues.push('missing scoring object');
    }

    if (issues.length > 0) {
      errors++;
      console.log(`  ❌ ${s.id || '?'} (${s.name || 'unnamed'}): ${issues.join('; ')}`);
    } else {
      console.log(`  ✅ ${s.id}: ${s.name}`);
    }
  }

  console.log(`\n${scenarios.length - errors}/${scenarios.length} valid`);
  if (errors > 0) process.exit(1);
}

function resolveSmartPath(rootDir, ref) {
  // Try path resolution strategies in order — Skill files may reference
  // paths relative to different "base" directories depending on context.

  const candidates = [];

  // 1. As-is from repository root
  candidates.push(resolve(rootDir, ref));

  // 2. With backend/ prefix (for Rails app paths like config/..., app/...)
  if (!ref.startsWith('backend/') && !ref.startsWith('platform/') && !ref.startsWith('storefront/') && !ref.startsWith('ai/') && !ref.startsWith('harness/') && !ref.startsWith('scripts/') && !ref.startsWith('docs/')) {
    candidates.push(resolve(rootDir, 'backend', ref));
  }

  // 3. Old gem paths → new gem paths
  // pallastrade/admin/... → backend/pallastrade_gems/pallastrade_admin/...
  const gemMatch = ref.match(/^pallastrade\/(\w+)\/(.+)/);
  if (gemMatch) {
    candidates.push(resolve(rootDir, 'backend', 'pallastrade_gems', `pallastrade_${gemMatch[1]}`, gemMatch[2]));
    // Also try without the sub-path (just the gem root)
    candidates.push(resolve(rootDir, 'backend', 'pallastrade_gems', `pallastrade_${gemMatch[1]}`));
  }

  // 3b. pallastrade_<gem>/... → backend/pallastrade_gems/pallastrade_<gem>/...
  const gemDirMatch = ref.match(/^pallastrade_(\w+)\/(.+)/);
  if (gemDirMatch) {
    candidates.push(resolve(rootDir, 'backend', 'pallastrade_gems', `pallastrade_${gemDirMatch[1]}`, gemDirMatch[2]));
  }

  // 4. packages/... → platform/packages/...
  if (ref.startsWith('packages/')) {
    candidates.push(resolve(rootDir, 'platform', ref));
  }

  // 5. types/... → platform/packages/sdk/src/types/... (TypeScript type references)
  if (ref.startsWith('types/')) {
    candidates.push(resolve(rootDir, 'platform', 'packages', 'sdk', 'src', ref));
  }

  // 6. docs/... → platform/docs/ or root docs/
  if (ref.startsWith('docs/')) {
    candidates.push(resolve(rootDir, 'platform', ref));
    candidates.push(resolve(rootDir, ref));
  }

  // 7. Fallback: try the ref inside each pallastrade gem. Skill paths that
  //    start with app/, lib/, config/ often refer to gem-internal files
  //    (e.g. `lib/pallastrade/core/dependencies.rb` lives in pallastrade_core).
  if (!ref.startsWith('backend/') && !ref.startsWith('platform/') && !ref.startsWith('storefront/') && !ref.startsWith('ai/') && !ref.startsWith('harness/') && !ref.startsWith('scripts/')) {
    const gemsRoot = resolve(rootDir, 'backend', 'pallastrade_gems');
    if (existsSync(gemsRoot)) {
      const gems = readdirSync(gemsRoot, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name.startsWith('pallastrade_'))
        .map(d => d.name);
      for (const gem of gems) {
        candidates.push(resolve(gemsRoot, gem, ref));
      }
    }
  }

  // Return the first candidate that exists
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }

  return null;
}

function resolveSmartDir(rootDir, ref) {
  // Same logic but for directories
  const candidates = [];
  candidates.push(resolve(rootDir, ref));

  if (!ref.startsWith('backend/') && !ref.startsWith('platform/') && !ref.startsWith('storefront/') && !ref.startsWith('ai/')) {
    candidates.push(resolve(rootDir, 'backend', ref));
  }

  const gemMatch = ref.match(/^pallastrade\/(\w+)\/(.+)/);
  if (gemMatch) {
    candidates.push(resolve(rootDir, 'backend', 'pallastrade_gems', `pallastrade_${gemMatch[1]}`, gemMatch[2]));
  }

  // pallastrade_<gem>/... → backend/pallastrade_gems/pallastrade_<gem>/...
  const gemDirMatch = ref.match(/^pallastrade_(\w+)\/(.+)/);
  if (gemDirMatch) {
    candidates.push(resolve(rootDir, 'backend', 'pallastrade_gems', `pallastrade_${gemDirMatch[1]}`, gemDirMatch[2]));
  }

  // docs/... → platform/docs/ or root docs/
  if (ref.startsWith('docs/')) {
    candidates.push(resolve(rootDir, 'platform', ref));
    candidates.push(resolve(rootDir, ref));
  }

  // Fallback: try inside each pallastrade gem (mirrors resolveSmartPath #7).
  if (!ref.startsWith('backend/') && !ref.startsWith('platform/') && !ref.startsWith('storefront/') && !ref.startsWith('ai/')) {
    const gemsRoot = resolve(rootDir, 'backend', 'pallastrade_gems');
    if (existsSync(gemsRoot)) {
      const gems = readdirSync(gemsRoot, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name.startsWith('pallastrade_'))
        .map(d => d.name);
      for (const gem of gems) {
        candidates.push(resolve(gemsRoot, gem, ref));
      }
    }
  }

  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isDirectory()) return c;
  }

  return null;
}

async function checkFreshnessImpl(rootDir) {
  const skillDir = resolve(rootDir, 'ai', 'skills');
  if (!existsSync(skillDir)) {
    console.log('⚠️  ai/skills/ directory not found. Skipping freshness check.');
    return;
  }

  const skills = readdirSync(skillDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  let errors = 0;
  let warnings = 0;

  for (const skill of skills) {
    const skillFile = join(skillDir, skill, 'SKILL.md');
    if (!existsSync(skillFile)) continue;

    // Strip fenced code blocks BEFORE extracting references: paths inside
    // code examples are illustrative, not normative (this caused most of the
    // historical false positives).
    const content = readFileSync(skillFile, 'utf-8').replace(/```[\s\S]*?```/g, '');

    // Lines that tell the reader WHERE TO CREATE new code are illustrative —
    // their paths must not be required to exist in the framework repo.
    // Covers: create/generate/install verbs, "Output at X", "X → Y" mapping,
    // "Add ... in X", pipe-table file-layout rows (`| \`path\` | desc |`),
    // and list items that begin with a backticked path (`- \`path\` — desc`).
    const ILLUSTRATIVE_LINE = /\b(create|generate|install|rename|mkdir|touch)\b|example|your |output at|outputs to|generated at|^\|\s*`|^[-*]\s*`|→|add .{0,60}in `/i;

    for (const line of content.split('\n')) {
      if (ILLUSTRATIVE_LINE.test(line)) continue;

      // File path references in backticks that look like file paths
      for (const m of line.matchAll(/`([a-z_]+\/[a-z0-9_\/\.\-\[\]\*]+)`/gi)) {
        const ref = m[1];
        if (!ref.includes('/') || ref.startsWith('http') || ref.includes(' ')) continue;
        // Skip build output paths (dist/, node_modules/)
        if (ref.startsWith('dist/') || ref.includes('node_modules/')) continue;
        if (/\.(rb|ts|tsx|json|yml|yaml|md|mjs|js|css)$/.test(ref)) {
          const found = resolveSmartPath(rootDir, ref);
          if (!found) {
            console.log(`❌ ${skill}/SKILL.md: path not found — \`${ref}\``);
            errors++;
          }
        }
      }

      // Directory references
      for (const m of line.matchAll(/`([a-z_]+\/[a-z0-9_\/\.\-]+)\/`/gi)) {
        const ref = m[1];
        if (ref.includes(' ') || ref.startsWith('http')) continue;
        // Skip build output dirs
        if (ref.startsWith('dist/') || ref.includes('node_modules/')) continue;
        const found = resolveSmartDir(rootDir, ref);
        if (!found) {
          console.log(`❌ ${skill}/SKILL.md: directory not found — \`${ref}/\``);
          errors++;
        }
      }
    }
  }

  if (errors > 0) {
    console.log(`\n❌ ${errors} freshness error(s) — skill files reference non-existent paths.`);
    process.exit(1);
  }

  console.log(`✅ ${skills.length} skills checked, 0 path errors, ${warnings} warning(s).`);
}
