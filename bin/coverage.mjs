#!/usr/bin/env node
/**
 * Coverage gate — parses coverage artifacts and compares against thresholds
 * declared in harness/config.json (coverage.thresholds).
 *
 *   node scripts/harness/cli.mjs coverage [--component backend|storefront|platform] [--enforce]
 *
 * Sources:
 *   - backend  : SimpleCov Cobertura XML  (coverage/cobertura-coverage.xml)
 *   - storefront / platform : vitest v8 JSON summary (coverage/coverage-summary.json)
 *
 * Exit codes:
 *   0 — all present components meet thresholds (or no data & !enforce)
 *   1 — a component is below threshold, or (--enforce) a required component has no data
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig, resolveProjectRoot } from './config-loader.mjs';

/** SimpleCov Cobertura: <coverage line-rate="0.85" branch-rate="0.6" ...> */
function parseCobertura(file) {
  const xml = readFileSync(file, 'utf-8');
  const m = xml.match(/<coverage[^>]*line-rate="([\d.]+)"[^>]*branch-rate="([\d.]+)"/);
  if (!m) return null;
  return { line: parseFloat(m[1]) * 100, branch: parseFloat(m[2]) * 100 };
}

/** vitest v8: { total: { lines: { pct }, statements: { pct }, functions: { pct }, branches: { pct } } } */
function parseV8Summary(file) {
  const j = JSON.parse(readFileSync(file, 'utf-8'));
  const t = j?.total;
  if (!t) return null;
  return {
    lines: t.lines?.pct,
    statements: t.statements?.pct,
    functions: t.functions?.pct,
    branches: t.branches?.pct,
  };
}

/**
 * Aggregates per-package vitest v8 coverage summaries under platform/packages
 * (each package's coverage directory) into a single line/statement percentage
 * (weighted by covered/total).
 */
function aggregatePlatform(rootDir, dir) {
  const packagesDir = resolve(rootDir, dir || 'platform/packages');
  if (!existsSync(packagesDir)) return null;
  let totalLines = 0;
  let coveredLines = 0;
  let totalStatements = 0;
  let coveredStatements = 0;
  let found = false;
  for (const pkg of readdirSync(packagesDir)) {
    const f = resolve(packagesDir, pkg, 'coverage', 'coverage-summary.json');
    if (!existsSync(f)) continue;
    found = true;
    const t = JSON.parse(readFileSync(f, 'utf-8'))?.total;
    if (!t) continue;
    if (t.lines) {
      totalLines += t.lines.total ?? 0;
      coveredLines += t.lines.covered ?? 0;
    }
    if (t.statements) {
      totalStatements += t.statements.total ?? 0;
      coveredStatements += t.statements.covered ?? 0;
    }
  }
  if (!found) return null;
  return {
    lines: totalLines > 0 ? (coveredLines / totalLines) * 100 : null,
    statements: totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : null,
  };
}

/**
 * Component definitions generated from harness.config.mjs → coverage.targets.
 * backend uses SimpleCov Cobertura; platform aggregates per-package v8; others use vitest v8 JSON summary.
 */
function buildComponentDefs(config) {
  const targets = config?.coverage?.targets || [];
  const defs = {};
  for (const t of targets) {
    if (t.id === 'backend') {
      defs[t.id] = {
        files: [`${t.path}/coverage/cobertura-coverage.xml`, 'coverage/cobertura-coverage.xml'],
        parser: parseCobertura,
      };
    } else if (t.id === 'platform') {
      defs[t.id] = {
        files: [`${t.path}/coverage/coverage-summary.json`],
        parser: parseV8Summary,
        aggregateDir: t.path,
      };
    } else {
      defs[t.id] = {
        files: [`${t.path}/coverage/coverage-summary.json`, `${t.path}/coverage/coverage-final.json`],
        parser: parseV8Summary,
      };
    }
  }
  return defs;
}

export function run({ rootDir, args, config: cfg }) {
  const enforce = args.includes('--enforce');
  const componentArg = args.includes('--component') ? args[args.indexOf('--component') + 1] : null;
  const COMPONENT_DEFS = buildComponentDefs(cfg);
  const thresholds = cfg?.coverage?.thresholds || {};
  const components = componentArg ? [componentArg] : Object.keys(COMPONENT_DEFS);

  let failed = false;

  for (const comp of components) {
    const def = COMPONENT_DEFS[comp];
    if (!def) {
      console.log(`⚠️  coverage: unknown component "${comp}". Valid: ${Object.keys(COMPONENT_DEFS).join(', ')}`);
      continue;
    }

    const file = def.files.find(f => existsSync(resolve(rootDir, f)));
    let data = null;
    let source = null;
    if (file) {
      data = def.parser(resolve(rootDir, file));
      source = file;
    } else if (def.aggregateDir) {
      data = aggregatePlatform(rootDir, def.aggregateDir);
      source = `aggregated ${def.aggregateDir} coverage`;
    }

    if (!source || !data) {
      const msg = `coverage: no data for ${comp} (looked for ${def.files.join(' or ')}). Run tests with coverage first.`;
      if (enforce) { console.log(`❌ ${msg}`); failed = true; }
      else console.log(`ℹ️  ${msg}`);
      continue;
    }

    if (!data) {
      const msg = `coverage: unparseable data for ${comp} at ${source}`;
      if (enforce) { console.log(`❌ ${msg}`); failed = true; }
      else console.log(`ℹ️  ${msg}`);
      continue;
    }

    const th = thresholds[comp] || {};
    const checks = [];
    if (data.line !== undefined && data.line !== null) checks.push({ k: 'line', v: data.line, t: th.line ?? 0 });
    if (data.lines !== undefined && data.lines !== null) checks.push({ k: 'lines', v: data.lines, t: th.lines ?? 0 });
    if (data.branch !== undefined && data.branch !== null) checks.push({ k: 'branch', v: data.branch, t: th.branch ?? 0 });
    if (data.branches !== undefined && data.branches !== null) checks.push({ k: 'branches', v: data.branches, t: th.branches ?? 0 });
    if (data.functions !== undefined && data.functions !== null) checks.push({ k: 'functions', v: data.functions, t: th.functions ?? 0 });

    let ok = checks.length > 0;
    const parts = checks.map(c => {
      const pass = c.v >= c.t;
      if (!pass) ok = false;
      return `${c.k} ${c.v.toFixed(1)}% (threshold ${c.t}%)${pass ? '' : ' ❌'}`;
    });
    console.log(`${ok ? '✅' : '❌'} coverage ${comp}: ${parts.join(', ')}`);
    if (!ok) failed = true;
  }

  process.exit(failed ? 1 : 0);
}

// CLI entry
const args = process.argv.slice(2);
if (args.length > 0 && args[0] === 'coverage') {
  const rootDir = resolveProjectRoot();
  const { config: cfg } = await loadConfig({ rootDir });
  run({ rootDir, args: args.slice(1), config: cfg });
}
