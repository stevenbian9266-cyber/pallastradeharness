import { readFileSync, existsSync, statSync, globSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig, resolveProjectRoot } from './config-loader.mjs';

export function scan({ rootDir, files: fileFilter = null, config }) {
  const rulesPath = resolve(rootDir, config?.scanners?.antiPatterns || 'harness/policies/anti-patterns.json');
  if (!existsSync(rulesPath)) {
    console.log('⚠️  No anti-patterns rules file found. Skipping scan.');
    return;
  }

  const { rules } = JSON.parse(readFileSync(rulesPath, 'utf-8'));
  let totalViolations = 0;
  let errors = 0;
  let warnings = 0;
  let scanErrors = 0;

  for (const rule of rules) {
    try {
      // excludeGlob may contain multiple patterns separated by '|'.
      const excludes = rule.excludeGlob ? rule.excludeGlob.split('|').map(s => s.trim()).filter(Boolean) : [];
      const globbed = globSync(rule.fileGlob, { cwd: rootDir, exclude: excludes });
      // When a file filter is provided (e.g. lefthook {staged_files}), only
      // scan the intersection with this rule's glob. Normalize separators —
      // glob returns Windows backslash paths, filter may be forward-slash.
      const norm = p => p.split('\\').join('/');
      const files = fileFilter
        ? fileFilter.map(norm).filter(f => globbed.map(norm).includes(f))
        : globbed;

      for (const file of files) {
        const filePath = resolve(rootDir, file);
        if (!existsSync(filePath)) continue;
        // Skip directories — glob may return them for certain patterns
        if (statSync(filePath).isDirectory()) continue;

        const content = readFileSync(filePath, 'utf-8');
        const regex = new RegExp(rule.pattern, 'gm');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          // Reset per-line: with the 'g' flag, lastIndex persists across
          // test() calls and causes missed matches (stale lastIndex).
          regex.lastIndex = 0;
          if (regex.test(lines[i])) {
            // Guard-aware rules (guardPattern + guardLookback): skip when a
            // guard condition appears within N preceding lines. Prevents
            // false positives on `if (x !== y) { redirect('/x') }` patterns.
            if (rule.guardPattern && Number.isInteger(rule.guardLookback)) {
              const start = Math.max(0, i - rule.guardLookback);
              const context = lines.slice(start, i + 1).join('\n');
              const guardRe = new RegExp(rule.guardPattern, 'gm');
              if (guardRe.test(context)) continue;
            }
            const lineNum = i + 1;
            const icon = rule.severity === 'error' ? '❌' : '⚠️';
            console.log(`${icon} ${rule.id} [${rule.severity}] ${file}:${lineNum}`);
            console.log(`   ${rule.message}`);
            console.log(`   Fix: ${rule.fix}`);
            console.log(`   Code: ${lines[i].trim().slice(0, 120)}`);
            console.log('');

            totalViolations++;
            if (rule.severity === 'error') errors++;
            else warnings++;
          }
        }
      }
    } catch (e) {
      scanErrors++;
      console.log(`❌ Rule ${rule.id}: error scanning: ${e.message}`);
    }
  }

  if (scanErrors > 0) {
    console.log(`\n❌ ${scanErrors} rule(s) failed to scan — failing the check.`);
    process.exit(1);
  }

  if (totalViolations === 0) {
    console.log('✅ No anti-patterns detected.');
  } else {
    console.log(`${totalViolations} violation(s): ${errors} error(s), ${warnings} warning(s).`);
    if (errors > 0) {
      console.log('❌ Anti-pattern scan failed with errors.');
      process.exit(1);
    }
  }
}

// CLI entry
const args = process.argv.slice(2);
if (args.length > 0 && args[0] === 'scan') {
  const rootDir = resolveProjectRoot();
  const filesIdx = args.indexOf('--files');
  const files = filesIdx >= 0 && args[filesIdx + 1]
    ? args[filesIdx + 1].split(',').map(s => s.trim()).filter(Boolean)
    : null;
  const { config } = await loadConfig({ rootDir });
  scan({ rootDir, files, config });
}
