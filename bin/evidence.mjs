import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Collect structured delivery evidence into artifacts/harness-evidence/.
 *
 * Replaces the old stub: evidence is now captured from real command output
 * (doctor, anti-pattern scan, affected) plus git/environment metadata — not
 * self-reported by the AI.
 *
 * @param {{ rootDir: string }} options
 */
export function collect({ rootDir }) {
  const dir = resolve(rootDir, 'artifacts', 'harness-evidence');
  mkdirSync(dir, { recursive: true });

  const run = (cmd) => {
    try {
      return execSync(cmd, { cwd: rootDir, encoding: 'utf-8', stdio: 'pipe' }).trim();
    } catch (e) {
      return `EXIT_${e.status ?? 'ERR'}: ${String(e.stdout ?? '').trim() || String(e.message).split('\n')[0]}`;
    }
  };

  const antiPatterns = run('node scripts/harness/scan-anti-patterns.mjs scan');

  const evidence = {
    schemaVersion: 1,
    collectedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
    },
    git: {
      branch: run('git rev-parse --abbrev-ref HEAD'),
      head: run('git rev-parse --short HEAD'),
      statusShort: run('git status --short'),
    },
    checks: {
      doctor: run('node scripts/harness/cli.mjs doctor'),
      antiPatternsSummary: antiPatterns.split('\n').filter(l => /violation|no anti-patterns|rule\(s\) failed/i.test(l)).slice(-3).join('\n') || 'no summary',
      affected: run('node scripts/harness/cli.mjs affected --base origin/main'),
    },
  };

  const stamp = evidence.collectedAt.replace(/[:.]/g, '-');
  const file = resolve(dir, `evidence-${stamp}.json`);
  writeFileSync(file, JSON.stringify(evidence, null, 2));
  writeFileSync(resolve(dir, 'latest.json'), JSON.stringify(evidence, null, 2));

  const doctorHealthy = /checks passed/i.test(evidence.checks.doctor);
  console.log(`📦 Evidence collected → ${file}`);
  console.log(`   git: ${evidence.git.branch} @ ${evidence.git.head}`);
  console.log(`   doctor: ${doctorHealthy ? '✅ healthy' : '❌ ISSUES'}`);
}
