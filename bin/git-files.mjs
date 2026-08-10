import { execSync } from 'node:child_process';

/**
 * Collect changed file paths from three git sources:
 *   1. committed — git diff --name-only <base>...HEAD  (since base branch)
 *   2. staged    — git diff --name-only --cached        (git add-ed)
 *   3. unstaged  — git diff --name-only                 (working tree edits)
 *
 * Merged, de-duplicated, sorted. Git failures are collected as errors rather
 * than silently returning empty (fail-closed, not fail-open).
 *
 * @param {string} rootDir
 * @param {string} base
 * @returns {{ files: string[], errors: string[] }}
 */
export function getChangedFiles(rootDir, base = 'origin/main') {
  const errors = [];
  const files = new Set();

  const sources = [
    { label: 'committed', cmd: `git diff --name-only ${base}...HEAD` },
    { label: 'staged', cmd: 'git diff --name-only --cached' },
    { label: 'unstaged', cmd: 'git diff --name-only' },
  ];

  for (const source of sources) {
    try {
      const out = execSync(source.cmd, { cwd: rootDir, encoding: 'utf-8', stdio: 'pipe' }).trim();
      if (out) {
        for (const f of out.split('\n').filter(Boolean)) files.add(f);
      }
    } catch (e) {
      errors.push(`${source.label}: ${String(e.message).split('\n')[0]}`);
    }
  }

  return { files: [...files].sort(), errors };
}
