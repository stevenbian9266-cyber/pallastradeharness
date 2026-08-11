import { execFileSync } from 'node:child_process';

function runGit(rootDir, args) {
  return execFileSync('git', ['-c', 'core.quotepath=false', ...args], { cwd: rootDir, encoding: 'utf-8', stdio: 'pipe' }).trim();
}

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
    { label: 'committed', args: ['diff', '--name-only', `${base}...HEAD`] },
    { label: 'staged', args: ['diff', '--name-only', '--cached'] },
    { label: 'unstaged', args: ['diff', '--name-only'] },
    { label: 'untracked', args: ['ls-files', '--others', '--exclude-standard'] },
  ];

  for (const source of sources) {
    try {
      const out = runGit(rootDir, source.args);
      if (out) {
        for (const f of out.split('\n').filter(Boolean)) files.add(f);
      }
    } catch (e) {
      errors.push(`${source.label}: ${String(e.message).split('\n')[0]}`);
    }
  }

  return { files: [...files].sort(), errors };
}

export function getDiff(rootDir, base = 'origin/main', { unified = 0 } = {}) {
  const errors = [];
  const chunks = [];
  const sources = [
    { label: 'committed', args: ['diff', `--unified=${unified}`, `${base}...HEAD`] },
    { label: 'staged', args: ['diff', `--unified=${unified}`, '--cached'] },
    { label: 'unstaged', args: ['diff', `--unified=${unified}`] },
  ];
  for (const source of sources) {
    try {
      const output = runGit(rootDir, source.args);
      if (output) chunks.push(output);
    } catch (error) {
      errors.push(`${source.label}: ${String(error.message).split('\n')[0]}`);
    }
  }
  return { diff: chunks.join('\n'), errors };
}

export function showFileAtRef(rootDir, ref, file) {
  try {
    return { content: runGit(rootDir, ['show', `${ref}:${file}`]), error: null };
  } catch (error) {
    return { content: null, error: String(error.message).split('\n')[0] };
  }
}
