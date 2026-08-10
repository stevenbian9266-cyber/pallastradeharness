#!/usr/bin/env node
/**
 * Cross-agent secret + destructive-command scanner.
 *
 * The Claude-only safety hooks (ai/hooks/warn_on_secrets.sh,
 * ai/hooks/block_destructive_db.sh) only fire inside Claude Code. This
 * scanner ports the same pattern sets to a plain Node script that works for
 * ANY agent (Copilot / Codex / Claude) and any human via lefthook + CI.
 *
 *   node scripts/harness/scan-secrets.mjs scan [--files a,b,c]
 *
 * Exit codes:
 *   0 — no error-severity findings
 *   1 — error-severity findings (secrets / destructive code) — fail-closed
 */
import { readFileSync, existsSync, statSync, globSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveProjectRoot } from './config-loader.mjs';

// Global excludes — mirrors warn_on_secrets.sh (env examples, READMEs,
// lockfiles) plus build artifacts. We deliberately do NOT exclude all *.md
// (a deployment/secrets.md could ship a real key someone pasted in).
//
// Note: docs (*.md/*.mdx) and the safety-hook scripts themselves (ai/hooks/**)
// legitimately MENTION destructive commands and key shapes — a blocking
// scanner must exclude them or it cries wolf on every doc. The Claude-only
// hooks still soft-warn on doc edits.
const GLOBAL_EXCLUDES = [
  '**/node_modules/**', '**/dist/**', '**/.next/**', '**/vendor/**',
  '**/build/**', '**/coverage/**', '**/tmp/**', '**/log/**', '**/storage/**',
  '**/*.env.example', '**/*.env.sample', '**/README*', '**/CHANGELOG*',
  '**/*.lock', '**/*lockfile',
  // Docs + generated API docs + the hook scripts themselves.
  '**/*.md', '**/*.mdx', '**/*.markdown',
  'ai/hooks/**', '**/api-docs/**', 'platform/docs/**', 'backend/public/**',
];

const RULES = [
  // ---- Secrets (error — hard block) —---
  { id: 'SEC-001', severity: 'error', name: 'stripe-live-key',
    pattern: /sk_live_[A-Za-z0-9]{24,}/,
    message: 'Stripe LIVE secret key. Never commit — use env vars.', fix: 'Move to .env / secret manager.' },
  { id: 'SEC-002', severity: 'error', name: 'stripe-live-restricted-key',
    pattern: /rk_live_[A-Za-z0-9]{24,}/,
    message: 'Stripe LIVE restricted key. Never commit.', fix: 'Move to .env / secret manager.' },
  { id: 'SEC-003', severity: 'error', name: 'pallastrade-admin-secret-key',
    pattern: /sk_[1-9A-HJ-NP-Za-km-z]{24}/,
    message: 'PallasTrade Admin API secret key (sk_…). Never commit.', fix: 'Use env var; keys live in DB only.',
    excludeGlob: ['**/spec/**', '**/__tests__/**'], skipCommentLines: true },
  { id: 'SEC-004', severity: 'error', name: 'aws-access-key-id',
    pattern: /AKIA[0-9A-Z]{16}/,
    message: 'AWS access key ID. Never commit.', fix: 'Move to .env / IAM role.' },
  { id: 'SEC-005', severity: 'error', name: 'github-personal-access-token',
    pattern: /ghp_[A-Za-z0-9]{36}/,
    message: 'GitHub personal access token. Never commit.', fix: 'Use GitHub Actions secrets.' },
  { id: 'SEC-006', severity: 'error', name: 'github-oauth-token',
    pattern: /gho_[A-Za-z0-9]{36}/,
    message: 'GitHub OAuth token. Never commit.', fix: 'Use GitHub Actions secrets.' },
  { id: 'SEC-007', severity: 'error', name: 'github-fine-grained-pat',
    pattern: /github_pat_[A-Za-z0-9_]{82}/,
    message: 'GitHub fine-grained PAT. Never commit.', fix: 'Use GitHub Actions secrets.' },
  { id: 'SEC-008', severity: 'error', name: 'openai-api-key',
    pattern: /sk-[A-Za-z0-9]{20,}/,
    message: 'OpenAI API key. Never commit.', fix: 'Use env var / provider secret.', skipCommentLines: true },
  { id: 'SEC-009', severity: 'error', name: 'anthropic-api-key',
    pattern: /sk-ant-[A-Za-z0-9-]{20,}/,
    message: 'Anthropic API key. Never commit.', fix: 'Use env var / provider secret.', skipCommentLines: true },
  { id: 'SEC-010', severity: 'error', name: 'sensitive-env-assignment',
    pattern: /(?:SECRET_KEY_BASE|DATABASE_PASSWORD|STRIPE_SECRET_KEY|SMTP_PASSWORD)\s*=\s*['"][^$'"]{20,}['"]/,
    message: 'Sensitive value hardcoded with a real value. Use env vars.', fix: 'Replace with ENV.fetch(...) / dotenv reference.', skipCommentLines: true },

  // ---- Destructive code (error — hard block) ----
  { id: 'DNG-001', severity: 'error', name: 'db-drop-reset',
    pattern: /(?:^|[;&|`]\s*)(?:[A-Za-z0-9_./=-]+\s+)*(?:bin\/)?(?:rake|rails)\s+db:(?:drop|reset)\b/,
    message: 'Destructive DB command (db:drop/db:reset) in committed code.', fix: 'Remove; use migrations. See AGENTS.md §8.' },
  { id: 'DNG-002', severity: 'error', name: 'drop-pallastrade-table',
    pattern: /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?["`]?[A-Za-z0-9_]*pallastrade_/i,
    message: 'DROP TABLE against a pallastrade_ table. Physically blocked.', fix: 'Remove; use migrations.' },
  { id: 'DNG-003', severity: 'error', name: 'delete-from-pallastrade-table',
    pattern: /DELETE\s+FROM\s+["`]?[A-Za-z0-9_]*pallastrade_(?:orders|products|customers)\b/i,
    message: 'Mass DELETE against a core pallastrade_ table. Physically blocked.', fix: 'Remove; use scoped destruction.' },

  // ---- Destructive code (warning — advisory; legit in specs) ----
  { id: 'DNG-004', severity: 'warning', name: 'delete-all',
    pattern: /\.delete_all\b/,
    message: 'delete_all in application code. Prefer scoped destruction or subscribers.',
    excludeGlob: ['**/spec/**', '**/db/migrate/**', 'scripts/harness/**'] },
  { id: 'DNG-005', severity: 'warning', name: 'destroy-all',
    pattern: /\.destroy_all\b/,
    message: 'destroy_all in application code. Prefer scoped destruction or subscribers.',
    excludeGlob: ['**/spec/**', '**/db/migrate/**', 'scripts/harness/**'] },
];

/** True when the line is a comment (#, //, *, ;, <!--) after trimming. */
function isCommentLine(line) {
  const t = line.trimStart();
  return t.startsWith('#') || t.startsWith('//') || t.startsWith('*')
    || t.startsWith('<!--') || t.startsWith(';');
}

export function scan({ rootDir, files: fileFilter = null }) {
  let total = 0;
  let errors = 0;
  let warnings = 0;
  let scanErrors = 0;
  const norm = p => p.split('\\').join('/');

  // Per-rule globbing so each rule's excludeGlob is applied to its own file
  // set (a single shared candidate set would leak rule-specific excludes).
  for (const rule of RULES) {
    let globbed;
    try {
      globbed = globSync('**/*', { cwd: rootDir, exclude: [...GLOBAL_EXCLUDES, ...(rule.excludeGlob || [])] });
    } catch (e) {
      scanErrors++;
      console.log(`❌ Rule ${rule.id}: error scanning globs: ${e.message}`);
      continue;
    }

    const files = fileFilter
      ? fileFilter.map(norm).filter(f => globbed.map(norm).includes(norm(f)))
      : globbed;

    for (const file of files) {
      const filePath = resolve(rootDir, file);
      if (!existsSync(filePath)) continue;
      if (statSync(filePath).isDirectory()) continue;
      let content;
      try { content = readFileSync(filePath, 'utf-8'); } catch { continue; }
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        // Generic key-shape rules skip comment lines — docs/configs routinely
        // show commented placeholder examples (e.g. `# openai_api_key: "sk-XXX"`).
        if (rule.skipCommentLines && isCommentLine(lines[i])) continue;
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(lines[i])) {
          const icon = rule.severity === 'error' ? '❌' : '⚠️';
          console.log(`${icon} ${rule.id} [${rule.severity}] ${file}:${i + 1}`);
          console.log(`   ${rule.message}`);
          console.log(`   Fix: ${rule.fix}`);
          console.log('');
          total++;
          if (rule.severity === 'error') errors++;
          else warnings++;
        }
      }
    }
  }

  if (scanErrors > 0) {
    console.log(`\n❌ ${scanErrors} rule(s) failed to scan — failing the check.`);
    process.exit(1);
  }

  if (total === 0) {
    console.log('✅ No secrets or destructive code detected.');
  } else {
    console.log(`${total} finding(s): ${errors} error(s), ${warnings} warning(s).`);
    if (errors > 0) {
      console.log('❌ Secret/destructive scan failed with errors.');
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
  scan({ rootDir, files });
}
