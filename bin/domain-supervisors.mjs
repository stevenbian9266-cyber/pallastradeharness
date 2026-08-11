import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createFinding } from './contracts.mjs';
import { getChangedFiles, getDiff, showFileAtRef } from './git-files.mjs';
import { matchesScope } from './standards.mjs';
import { statePaths } from './state-store.mjs';

const DOMAIN_STANDARD = Object.freeze({
  database: 'STD-DB-002',
  api: 'STD-API-001',
  security: 'STD-SEC-002',
  'ui-style': 'STD-UI-002',
  interaction: 'STD-INT-002',
  accessibility: 'STD-A11Y-002',
  knowledge: 'STD-KNOW-002',
});

function normalize(value) {
  return String(value).replaceAll('\\', '/').replace(/^\.\//, '');
}

function enforcementLevel(standard) {
  return typeof standard.enforcement === 'string' ? standard.enforcement : standard.enforcement?.level;
}

function makeFinding({ standard, file, line = 1, message, recommendation, confidence = 1, mode = 'guard', details }) {
  if (!standard) return null;
  const level = enforcementLevel(standard);
  const blocking = mode === 'assist'
    ? false
    : ['blocking', 'critical'].includes(level)
      || (mode === 'guard' && standard.severity === 'error')
      || (mode === 'strict' && level !== 'documented');
  return createFinding({
    id: `FND-${createHash('sha256').update(`${standard.id}:${file}:${line}:${message}`).digest('hex').slice(0, 12)}`,
    standardId: standard.id,
    file,
    line,
    message,
    risk: standard.severity,
    recommendation: recommendation || standard.fix,
    confidence,
    blocking,
    domain: standard.category,
    details,
  });
}

function addedLines(diff) {
  const result = [];
  let file = null;
  let line = 0;
  for (const raw of String(diff).split(/\r?\n/)) {
    if (raw.startsWith('+++ b/')) { file = normalize(raw.slice(6)); continue; }
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunk) { line = Number(hunk[1]); continue; }
    if (!file || raw.startsWith('---')) continue;
    if (raw.startsWith('+')) { result.push({ file, line, text: raw.slice(1) }); line++; }
    else if (!raw.startsWith('-')) line++;
  }
  return result;
}

function standard(standards, id) {
  return standards.find(item => item.id === id);
}

function newFile(rootDir, base, file) {
  return showFileAtRef(rootDir, base, file).content === null;
}

function databaseReview(ctx) {
  const findings = [];
  const migration = standard(ctx.standards, 'STD-DB-002');
  const backfill = standard(ctx.standards, 'STD-DB-003');
  for (const file of ctx.files.filter(path => /(?:^|\/)db\/migrate\/|(?:^|\/)migrations?\//i.test(path))) {
    if (!newFile(ctx.rootDir, ctx.base, file) || !existsSync(resolve(ctx.rootDir, file))) continue;
    const content = readFileSync(resolve(ctx.rootDir, file), 'utf-8');
    if (/def\s+up\b/.test(content) && !/def\s+down\b/.test(content)) {
      findings.push(makeFinding({ standard: migration, file, message: 'Migration defines `up` without a matching `down` recovery path.', mode: ctx.mode }));
    }
    if (/\b(?:execute|change_column|change_column_null|remove_column|drop_table)\b/.test(content) && !/reversible\s+do|def\s+down\b/.test(content)) {
      findings.push(makeFinding({ standard: migration, file, message: 'Potentially irreversible or locking migration operation has no explicit reversible/down path.', confidence: 0.9, mode: ctx.mode }));
    }
    const match = content.match(/\b(?:update_all|delete_all|destroy_all|find_each|find_in_batches|\.each\s+do)\b/);
    if (match) {
      const line = content.slice(0, match.index).split(/\r?\n/).length;
      findings.push(makeFinding({ standard: backfill, file, line, message: 'Application data backfill logic is embedded in a schema migration.', mode: ctx.mode }));
    }
    if (/add_(?:column|reference)[\s\S]{0,160}null:\s*false/.test(content) && !/default:/.test(content)) {
      findings.push(makeFinding({ standard: migration, file, message: 'NOT NULL column/reference is added without a staged default/backfill strategy.', confidence: 0.85, mode: ctx.mode }));
    }
  }
  return findings;
}

function apiReview(ctx) {
  const findings = [];
  const rawCall = standard(ctx.standards, 'STD-API-002');
  for (const item of ctx.lines) {
    if (/\bfetch\s*\(\s*['"`]\/api\//.test(item.text)) {
      findings.push(makeFinding({ standard: rawCall, file: item.file, line: item.line, message: 'Raw application API call bypasses the project client abstraction.', mode: ctx.mode }));
    }
  }
  const apiSources = ctx.files.filter(file => /(?:^|\/)(?:api|controllers?|routes?|serializers?)(?:\/|\.)/i.test(file) && !/openapi|swagger|api-doc/i.test(file));
  const apiDocs = ctx.files.some(file => /openapi|swagger|api-doc|api-reference/i.test(file));
  if (apiSources.length > 0 && !apiDocs) {
    const apiStandard = standard(ctx.standards, 'STD-API-001');
    findings.push(makeFinding({
      standard: apiStandard,
      file: apiSources[0],
      message: 'API implementation changed without a changed API contract/documentation asset.',
      confidence: 0.75,
      mode: ctx.mode,
      details: { apiSources },
    }));
  }
  return findings;
}

function securityReview(ctx) {
  const findings = [];
  const security = standard(ctx.standards, 'STD-SEC-002');
  const testFiles = ctx.config.supervisor?.testFiles || [];
  const ruleDefinitionFiles = ctx.config.supervisor?.ruleDefinitionFiles || [];
  const patterns = [
    { re: /\b(?:eval|new\s+Function)\s*\(/, message: 'Dynamic code execution was added.' },
    { re: /\b(?:DROP\s+(?:TABLE|DATABASE)|delete_all|destroy_all|truncate)\b/i, message: 'Destructive data operation was added.' },
    { re: /\bexec(?:Sync)?\s*\(\s*`[^`]*\$\{/, message: 'Interpolated command execution may allow shell injection.' },
    { re: /(?:sk_live_|AKIA[0-9A-Z]{12,}|ghp_[A-Za-z0-9]{20,})/, message: 'Secret-like credential was added.' },
  ];
  for (const item of ctx.lines) {
    if (testFiles.some(pattern => matchesScope(item.file, pattern))) continue;
    const isRuleDefinition = ruleDefinitionFiles.some(pattern => matchesScope(item.file, pattern))
      && (/(?:\bre\s*:|\.match\(|\.test\()\s*\//.test(item.text)
        || /^\s*\/(?:\\.|[^/])+\/[dgimsuvy]*,?\s*$/.test(item.text)
        || /^\s*['"`].*[,;]?\s*$/.test(item.text));
    if (isRuleDefinition) continue;
    for (const pattern of patterns) {
      if (pattern.re.test(item.text)) findings.push(makeFinding({ standard: security, file: item.file, line: item.line, message: pattern.message, mode: ctx.mode }));
    }
  }
  return findings;
}

function uiReview(ctx) {
  const findings = [];
  const ui = standard(ctx.standards, 'STD-UI-002');
  for (const item of ctx.lines.filter(line => /\.(?:css|scss|tsx|jsx|vue)$/.test(line.file))) {
    if (/style\s*=\s*\{\{/.test(item.text)) findings.push(makeFinding({ standard: ui, file: item.file, line: item.line, message: 'Static inline styling was added instead of a project styling primitive.', confidence: 0.9, mode: ctx.mode }));
    if (/#[0-9a-f]{6}\b/i.test(item.text)) findings.push(makeFinding({ standard: ui, file: item.file, line: item.line, message: 'Hardcoded color was added instead of a design token.', mode: ctx.mode }));
  }
  return findings;
}

function interactionReview(ctx) {
  const findings = [];
  const interaction = standard(ctx.standards, 'STD-INT-002');
  for (const file of ctx.files.filter(path => /\.(?:tsx|jsx|vue)$/.test(path) && existsSync(resolve(ctx.rootDir, path)))) {
    const content = readFileSync(resolve(ctx.rootDir, file), 'utf-8');
    if (!/<(?:form|button)\b|\b(?:Dialog|Modal|Drawer)\b/.test(content)) continue;
    const missing = [
      ['loading/submitting', /loading|submitting|pending/i],
      ['disabled', /disabled/i],
      ['error/retry', /error|retry/i],
    ].filter(([, pattern]) => !pattern.test(content)).map(([label]) => label);
    if (missing.length > 0) findings.push(makeFinding({
      standard: interaction,
      file,
      message: `Interactive UI needs an explicit state review; no signal found for: ${missing.join(', ')}.`,
      confidence: 0.65,
      mode: ctx.mode,
      details: { missingStates: missing },
    }));
  }
  return findings;
}

function accessibilityReview(ctx) {
  const findings = [];
  const accessibility = standard(ctx.standards, 'STD-A11Y-002');
  for (const item of ctx.lines.filter(line => /\.(?:tsx|jsx|vue|html)$/.test(line.file))) {
    if (/<img\b(?![^>]*\balt=)[^>]*>/i.test(item.text)) findings.push(makeFinding({ standard: accessibility, file: item.file, line: item.line, message: 'Image markup was added without an alt attribute.', mode: ctx.mode }));
    if (/<div\b[^>]*\bonClick=/.test(item.text) && !/\b(?:role|tabIndex|onKeyDown)=/.test(item.text)) {
      findings.push(makeFinding({ standard: accessibility, file: item.file, line: item.line, message: 'Clickable div was added without semantic role and keyboard support.', mode: ctx.mode }));
    }
  }
  return findings;
}

function knowledgeReview(ctx) {
  const source = ctx.files.filter(file => !/\.(?:md|mdx|txt|json|ya?ml)$/.test(file));
  const docs = ctx.files.filter(file => /(?:^|\/)(?:docs?|ai|harness)\/|(?:AGENTS|CLAUDE|README)\.md$/i.test(file));
  if (source.length === 0 || docs.length > 0) return [];
  const knowledge = standard(ctx.standards, 'STD-KNOW-002');
  return [makeFinding({
    standard: knowledge,
    file: source[0],
    message: 'Behavior-bearing files changed; record updated/reviewed-no-change/not-applicable for affected knowledge assets.',
    confidence: 0.8,
    mode: ctx.mode,
    details: { sourceFiles: source.slice(0, 20) },
  })];
}

function autoDomains(files) {
  const domains = new Set(['security', 'knowledge']);
  for (const file of files) {
    if (/db\/migrate|migrations?|schema/i.test(file)) domains.add('database');
    if (/(?:^|\/)(?:api|controllers?|routes?|serializers?)(?:\/|\.)|openapi|swagger/i.test(file)) domains.add('api');
    if (/\.(?:css|scss|tsx|jsx|vue)$/.test(file)) domains.add('ui-style');
    if (/\.(?:tsx|jsx|vue)$/.test(file)) { domains.add('interaction'); domains.add('accessibility'); }
  }
  return [...domains];
}

function runExternalVerifiers(ctx, domains) {
  return (ctx.config.supervisor?.verifiers || []).filter(verifier => !verifier.domain || domains.includes(verifier.domain)).map(verifier => {
    if (!Array.isArray(verifier.command) || verifier.command.length === 0) {
      return { id: verifier.id, domain: verifier.domain, status: 'not-run', reason: 'command is not configured' };
    }
    const result = spawnSync(verifier.command[0], verifier.command.slice(1), { cwd: ctx.rootDir, encoding: 'utf-8', shell: false });
    if (result.error?.code === 'ENOENT') return { id: verifier.id, domain: verifier.domain, status: 'not-run', reason: 'tool is not installed' };
    return {
      id: verifier.id,
      domain: verifier.domain,
      status: result.status === 0 ? 'passed' : 'failed',
      exitCode: result.status,
      summary: String(result.stdout || result.stderr || '').trim().slice(0, 2000),
    };
  });
}

function includeNewFileLines({ rootDir, base, files, lines }) {
  const withAddedLines = new Set(lines.map(item => item.file));
  for (const file of files) {
    if (withAddedLines.has(file)) continue;
    if (!existsSync(resolve(rootDir, file))) continue;
    if (!newFile(rootDir, base, file)) continue;
    readFileSync(resolve(rootDir, file), 'utf-8').split(/\r?\n/).forEach((text, index) => lines.push({ file, line: index + 1, text }));
  }
  return lines;
}

function runDomainReviewers(ctx, selected) {
  const reviewers = { database: databaseReview, api: apiReview, security: securityReview, 'ui-style': uiReview, interaction: interactionReview, accessibility: accessibilityReview, knowledge: knowledgeReview };
  const byDomain = {};
  const findings = [];
  for (const domain of selected) {
    const domainFindings = (reviewers[domain]?.(ctx) || []).filter(Boolean);
    findings.push(...domainFindings);
    byDomain[domain] = { status: domainFindings.length > 0 ? 'findings' : 'passed', findings: domainFindings.length, standardId: DOMAIN_STANDARD[domain] };
  }
  return { byDomain, findings };
}

export function reviewDomainSupervisors({ rootDir, config, base, standards, domains = null }) {
  const changed = getChangedFiles(rootDir, base);
  const diff = getDiff(rootDir, base, { unified: 0 });
  const errors = [...changed.errors.map(error => `git files: ${error}`), ...diff.errors.map(error => `git diff: ${error}`)];
  if (errors.length > 0) return { errors, report: null };
  const selected = domains?.length ? domains : autoDomains(changed.files);
  const lines = includeNewFileLines({ rootDir, base, files: changed.files, lines: addedLines(diff.diff) });
  const ctx = {
    rootDir, config, base, standards, files: changed.files, lines, mode: config.supervisor?.mode || 'guard',
  };
  const { byDomain, findings } = runDomainReviewers(ctx, selected);
  const verifiers = runExternalVerifiers(ctx, selected);
  for (const verifier of verifiers) {
    if (verifier.domain && byDomain[verifier.domain]) byDomain[verifier.domain].externalVerifier = verifier.status;
  }
  return {
    errors: [],
    report: {
      schemaVersion: '1.0', type: 'DomainSupervisorReport', createdAt: new Date().toISOString(), base,
      domains: selected, byDomain, findings, verifiers,
      summary: {
        domains: selected.length,
        files: changed.files.length,
        shards: Math.max(1, Math.ceil(changed.files.length / (config.supervisor?.shardSize || 500))),
        findings: findings.length,
        blocking: findings.filter(finding => finding.blocking).length,
        notRun: verifiers.filter(item => item.status === 'not-run').length,
      },
    },
  };
}
