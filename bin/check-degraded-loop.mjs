/**
 * check-degraded-loop — AP-009 heuristic scan
 *
 * Detects the "degraded-mode self-loop" anti-pattern:
 *   1. redirect() calls that may target the current URL (AP-009a)
 *   2. .catch(() => []) that collapses unknown→empty (AP-009b)
 *
 * Rules are loaded from harness/policies/anti-patterns.json (single source of truth).
 * This is a fast read-only scan (no AST parsing).
 */
import { readFileSync, existsSync, statSync, globSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { loadConfig, resolveProjectRoot } from './config-loader.mjs';
import { recordScan } from './stats.mjs';

/**
 * Load AP-009 rules from anti-patterns.json (path from project config).
 * Only rules with id starting "AP-009" are used.
 * @param {string} rootDir
 * @param {object} config
 * @returns {Array<{id:string, severity:string, pattern:RegExp, fileGlob:string, message:string, fix:string}>}
 */
function loadRules(rootDir, config) {
  const rulesPath = resolve(rootDir, config?.scanners?.antiPatterns || 'harness/policies/anti-patterns.json');
  if (!existsSync(rulesPath)) return [];

  const { rules } = JSON.parse(readFileSync(rulesPath, 'utf-8'));
  return rules
    .filter(r => r.id && r.id.startsWith('AP-009'))
    .map(r => ({
      ...r,
      pattern: new RegExp(r.pattern, 'g'),
    }));
}

/**
 * Run the degraded-loop scan against the workspace.
 * @param {{ rootDir: string, config?: object }} options
 * @returns {{ violations: number, errors: number, warnings: number }}
 */
export function scan({ rootDir, files: fileFilter = null, config }) {
  const rules = loadRules(rootDir, config);
  if (rules.length === 0) {
    console.log('');
    console.log('🔍 AP-009 degraded-loop scan: no AP-009 rules found in anti-patterns.json');
    console.log('');
    return { totalViolations: 0, errors: 0, warnings: 0 };
  }

  let totalViolations = 0;
  let errors = 0;
  let warnings = 0;
  const byRule = {};

  console.log('');
  console.log('🔍 AP-009 degraded-loop scan');

  for (const rule of rules) {
    let ruleViolations = 0;
    const globbed = globSync(rule.fileGlob, { cwd: rootDir });
    // Normalize separators — glob returns Windows backslash paths, the file
    // filter from lefthook {staged_files} may use forward slashes.
    const norm = p => p.split('\\').join('/');
    const files = fileFilter ? fileFilter.map(norm).filter(f => globbed.map(norm).includes(f)) : globbed;

    for (const file of files) {
      const filePath = resolve(rootDir, file);
      if (!existsSync(filePath)) continue;
      if (statSync(filePath).isDirectory()) continue;

      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(lines[i])) {
          const lineNum = i + 1;
          const icon = rule.severity === 'error' ? '❌' : '⚠️';
          const relPath = relative(rootDir, filePath);

          if (ruleViolations === 0) {
            console.log(`  ${icon} ${rule.id} [${rule.severity}] ${rule.name}`);
            console.log(`     ${rule.message}`);
            console.log(`     Fix: ${rule.fix}`);
            console.log('');
          }

          console.log(`     ${relPath}:${lineNum}  ${lines[i].trim().slice(0, 100)}`);
          ruleViolations++;
          totalViolations++;
          byRule[rule.id] = (byRule[rule.id] || 0) + 1;

          if (rule.severity === 'error') errors++;
          else warnings++;
        }
      }
    }

    if (ruleViolations === 0) {
      console.log(`  ✅ ${rule.id}: no violations`);
    }
  }

  // 记录扫描统计（Phase 3）
  try { recordScan(rootDir, { type: 'degraded-loop', total: totalViolations, errors, warnings, byRule }); } catch { /* stats 可选 */ }

  console.log('');
  if (totalViolations === 0) {
    console.log('✅ AP-009: no degraded-loop patterns detected.\n');
  } else {
    const summary = `${totalViolations} violation(s): ${errors} error(s), ${warnings} warning(s)`;
    console.log(`${errors > 0 ? '❌' : '⚠️'}  AP-009: ${summary}\n`);
  }

  return { totalViolations, errors, warnings };
}

// CLI entry point
const args = process.argv.slice(2);
if (args.length > 0 && args[0] === 'scan') {
  const rootDir = resolveProjectRoot();
  const filesIdx = args.indexOf('--files');
  const files = filesIdx >= 0 && args[filesIdx + 1]
    ? args[filesIdx + 1].split(',').map(s => s.trim()).filter(Boolean)
    : null;
  const { config } = await loadConfig({ rootDir });
  const result = scan({ rootDir, files, config });
  // Fail-closed: standalone CLI must exit non-zero when error-severity
  // violations exist (lefthook pre-commit relies on this).
  if (result.errors > 0) process.exit(1);
}
