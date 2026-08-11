#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { createContract, createFinding, SCHEMA_VERSION } from './contracts.mjs';
import { EXIT_CODES, getArg, getArgs } from './cli-utils.mjs';
import { getChangedFiles, getDiff, showFileAtRef } from './git-files.mjs';
import { loadStandards, matchesScope, selectStandards } from './standards.mjs';

function normalizePath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function timestampId(prefix, seed) {
  const date = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const hash = createHash('sha256').update(seed).digest('hex').slice(0, 8);
  return `${prefix}-${date}-${hash}`;
}

function enforcementLevel(standard) {
  return typeof standard.enforcement === 'string' ? standard.enforcement : standard.enforcement.level;
}

function standardById(standards, id) {
  return standards.find(standard => standard.id === id);
}

function riskLevelFor(task, allow) {
  const text = `${task} ${allow.join(' ')}`.toLowerCase();
  const critical = ['payment', '支付', 'auth', '权限', 'security', '安全', 'migration', 'database', '数据库', 'deploy', '发布', 'secret'];
  const standard = ['api', 'dependency', '依赖', 'refactor', '重构', 'architecture', '架构', 'config'];
  if (critical.some(token => text.includes(token))) return 'critical';
  if (standard.some(token => text.includes(token))) return 'standard';
  return 'quick';
}

export function selectPlanStandards(standards, task, allow) {
  const text = `${task} ${allow.join(' ')}`.toLowerCase();
  const categories = new Set(['architecture', 'code-quality', 'testing', 'knowledge']);
  const triggers = {
    'technology-selection': ['dependency', '依赖', 'package.json', 'gemfile', 'requirements', 'technology', '技术选型'],
    database: ['database', '数据库', 'migration', 'schema', '/db/'],
    api: ['api', 'endpoint', '接口'],
    security: ['security', '安全', 'auth', '权限', 'secret'],
    'ui-style': ['ui', 'style', '样式', 'component', '组件', '.css', '.tsx', '.jsx', '.vue'],
    interaction: ['interaction', '交互', 'modal', 'dialog', 'form', '表单', '.tsx', '.jsx', '.vue'],
    accessibility: ['accessibility', 'a11y', '无障碍'],
    documentation: ['docs', 'documentation', '文档', '.md'],
    deployment: ['deploy', 'deployment', '发布', 'docker', 'workflow'],
  };
  for (const [category, tokens] of Object.entries(triggers)) {
    if (tokens.some(token => text.includes(token))) categories.add(category);
  }
  return standards.filter(standard => categories.has(standard.category));
}

export function buildChangePlan({ rootDir, config, task, base, allow = [], deny = [], standards }) {
  const effectiveAllow = allow.length > 0
    ? allow
    : (config.layers || []).map(layer => `${normalizePath(layer.path)}/**/*`);
  if (effectiveAllow.length === 0) effectiveAllow.push('**/*');
  const effectiveDeny = [...new Set([...(config.supervisor?.protectedFiles || []), ...deny])];
  const selectedStandards = selectPlanStandards(standards, task, effectiveAllow);
  const riskLevel = riskLevelFor(task, effectiveAllow);
  const risk = createContract('Risk', {
    id: timestampId('RISK', `${task}:${base}`),
    level: riskLevel,
    reasons: riskLevel === 'quick'
      ? ['No high-risk keyword or scope detected']
      : [`Task or scope triggered ${riskLevel} governance`],
  });
  const taskId = timestampId('TASK', `${task}:${base}:${effectiveAllow.join(',')}`);
  return createContract('Task', {
    id: taskId,
    title: task,
    status: 'planned',
    riskLevel,
    createdAt: new Date().toISOString(),
    base,
    risk,
    changePlan: {
      allow: effectiveAllow,
      deny: effectiveDeny,
      standards: selectedStandards.map(standard => standard.id),
      requiredEvidence: [...new Set(selectedStandards.flatMap(standard => standard.evidence || []))],
    },
  });
}

function latestPlan(rootDir, plansDir) {
  const directory = resolve(rootDir, plansDir);
  if (!existsSync(directory)) return null;
  const files = readdirSync(directory)
    .filter(file => file.endsWith('.json'))
    .map(file => resolve(directory, file))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0] || null;
}

function loadPlan(path) {
  const plan = JSON.parse(readFileSync(path, 'utf-8'));
  const errors = [];
  if (plan.type !== 'Task') errors.push('plan.type must be Task');
  if (!plan.changePlan || !Array.isArray(plan.changePlan.allow) || !Array.isArray(plan.changePlan.deny)) {
    errors.push('plan.changePlan.allow and deny must be arrays');
  }
  return { plan, errors };
}

function parseAddedLines(diff) {
  const byFile = new Map();
  let file = null;
  let line = 0;
  for (const raw of diff.split(/\r?\n/)) {
    if (raw.startsWith('+++ b/')) {
      file = normalizePath(raw.slice(6));
      if (!byFile.has(file)) byFile.set(file, []);
      continue;
    }
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (!file || raw.startsWith('---')) continue;
    if (raw.startsWith('+')) {
      byFile.get(file).push({ line, text: raw.slice(1) });
      line++;
    } else if (!raw.startsWith('-')) {
      line++;
    }
  }
  return byFile;
}

function makeFinding({ standard, file, line = 1, message, recommendation, confidence = 1, mode = 'guard', details }) {
  const level = enforcementLevel(standard);
  const blocking = mode === 'assist'
    ? false
    : ['blocking', 'critical'].includes(level) || (mode === 'guard' && standard.severity === 'error') || (mode === 'strict' && level !== 'documented');
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
    details,
  });
}

function changedOutsidePlan(files, plan, standards, mode) {
  const standard = standardById(standards, 'STD-SCOPE-001');
  if (!standard) return [];
  return files.flatMap(file => {
    const allowed = plan.changePlan.allow.some(scope => matchesScope(file, scope));
    const denied = plan.changePlan.deny.some(scope => matchesScope(file, scope));
    if (allowed && !denied) return [];
    return [makeFinding({
      standard,
      file,
      message: denied ? 'File is explicitly denied by the Change Plan.' : 'File is outside the approved Change Plan scope.',
      mode,
    })];
  });
}

function protectedFileFindings(files, rootDir, base, config, standards, mode) {
  const findings = [];
  const protectedStandard = standardById(standards, 'STD-GEN-001');
  const databaseStandard = standardById(standards, 'STD-DB-001');
  const generated = config.supervisor?.generatedFiles || [];
  const protectedFiles = config.supervisor?.protectedFiles || [];
  for (const file of files) {
    if (databaseStandard && matchesScope(file, '**/db/migrate/**/*')) {
      const previous = showFileAtRef(rootDir, base, file);
      if (previous.content !== null) {
        findings.push(makeFinding({ standard: databaseStandard, file, message: 'An existing historical migration was modified.', mode }));
      }
    }
    if (databaseStandard && matchesScope(file, '**/db/schema.rb')) {
      findings.push(makeFinding({ standard: databaseStandard, file, message: 'A generated database schema snapshot was modified directly.', mode }));
      continue;
    }
    if (protectedStandard && [...generated, ...protectedFiles].some(scope => matchesScope(file, scope))) {
      findings.push(makeFinding({ standard: protectedStandard, file, message: 'A generated or protected file changed.', mode }));
    }
  }
  return findings;
}

function packageDependencies(content) {
  try {
    const json = JSON.parse(content || '{}');
    return new Set(Object.keys({ ...(json.dependencies || {}), ...(json.devDependencies || {}), ...(json.peerDependencies || {}) }));
  } catch {
    return new Set();
  }
}

function dependencyFindings(files, addedLines, rootDir, base, config, standards, mode) {
  const standard = standardById(standards, 'STD-TECH-001');
  if (!standard) return [];
  const findings = [];
  for (const file of files.filter(item => (config.supervisor?.dependencyFiles || []).some(scope => matchesScope(item, scope)))) {
    let additions = [];
    if (file.endsWith('package.json') && existsSync(resolve(rootDir, file))) {
      const before = packageDependencies(showFileAtRef(rootDir, base, file).content);
      const after = packageDependencies(readFileSync(resolve(rootDir, file), 'utf-8'));
      additions = [...after].filter(name => !before.has(name));
    } else {
      additions = (addedLines.get(file) || [])
        .map(item => item.text.trim())
        .filter(line => /^(gem\s+['"]|[A-Za-z0-9_.-]+\s*[=<>~!]=?)/.test(line));
    }
    if (additions.length > 0) {
      findings.push(makeFinding({
        standard,
        file,
        message: `New dependency declaration(s) require review: ${additions.join(', ')}`,
        recommendation: standard.fix,
        confidence: 0.98,
        mode,
        details: { additions },
      }));
    }
  }
  return findings;
}

function boundaryFindings(addedLines, config, standards, mode) {
  const standard = standardById(standards, 'STD-ARCH-001');
  if (!standard) return [];
  const findings = [];
  for (const boundary of config.supervisor?.boundaries || []) {
    for (const [file, lines] of addedLines) {
      if (!matchesScope(file, boundary.from)) continue;
      for (const item of lines) {
        const specifier = item.text.match(/(?:from\s+|import\s*\(|require\s*\()\s*['"]([^'"]+)/)?.[1];
        if (!specifier) continue;
        if ((boundary.denyImports || []).some(pattern => matchesScope(specifier, pattern))) {
          findings.push(makeFinding({
            standard,
            file,
            line: item.line,
            message: `Import "${specifier}" violates architecture boundary ${boundary.id || boundary.from}.`,
            mode,
            details: { boundary: boundary.id || boundary.from, specifier },
          }));
        }
      }
    }
  }
  return findings;
}

function functionRanges(content) {
  const lines = content.split(/\r?\n/);
  const ranges = [];
  const stack = [];
  let depth = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const declaration = line.match(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/);
    const arrow = line.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/);
    const method = line.match(/^\s*(?:async\s+)?(?!(?:if|for|while|switch|catch|with)\b)([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/);
    const name = declaration?.[1] || arrow?.[1] || method?.[1];
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    if (name && opens > closes) {
      stack.push({ name, start: index + 1, startDepth: depth });
    }
    depth += opens - closes;
    while (stack.length > 0 && depth <= stack.at(-1).startDepth) {
      const fn = stack.pop();
      ranges.push({ ...fn, end: index + 1 });
    }
  }
  for (const fn of stack) ranges.push({ ...fn, end: lines.length });
  return ranges;
}

function decisionText(text) {
  return text
    .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '')
    .replace(/\/(?:\\.|[^/\\\n])+\/[dgimsuvy]*/g, '')
    .replace(/\/\/.*$/, '');
}

function containingRange(ranges, line) {
  return ranges
    .filter(candidate => line >= candidate.start && line <= candidate.end)
    .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
}

function groupDecisionPoints(lines, ranges) {
  const groups = new Map();
  for (const item of lines) {
    const range = containingRange(ranges, item.line);
    if (!range) continue;
    const key = `${range.name}:${range.start}`;
    const group = groups.get(key) || { name: range.name, line: range.start, decisions: 0 };
    group.decisions += decisionText(item.text).match(/\b(?:if|else if|for|while|case|catch)\b|&&|\|\||\?(?![?.])/g)?.length || 0;
    groups.set(key, group);
  }
  return groups.values();
}

function complexityFinding(standard, file, group, max, mode) {
  return makeFinding({
    standard,
    file,
    line: group.line,
    message: `Added code in ${group.name} has ${group.decisions} decision points; configured baseline is ${max}.`,
    confidence: 0.85,
    mode,
    details: { function: group.name, decisionPoints: group.decisions, baseline: max },
  });
}

function complexityFindings(addedLines, rootDir, config, standards, mode) {
  const standard = standardById(standards, 'STD-CQ-001');
  if (!standard) return [];
  const max = config.supervisor?.complexity?.maxDecisionPoints ?? 12;
  const findings = [];
  for (const [file, lines] of addedLines) {
    if (!standard.scope.some(scope => matchesScope(file, scope))) continue;
    if (!existsSync(resolve(rootDir, file))) continue;
    const ranges = functionRanges(readFileSync(resolve(rootDir, file), 'utf-8'));
    for (const group of groupDecisionPoints(lines, ranges)) {
      if (group.decisions <= max) continue;
      findings.push(complexityFinding(standard, file, group, max, mode));
    }
  }
  return findings;
}

function duplicationFindings(addedLines, config, standards, mode) {
  const standard = standardById(standards, 'STD-CQ-002');
  if (!standard) return [];
  const windowSize = config.supervisor?.complexity?.duplicateBlockLines ?? 6;
  const blocks = new Map();
  const findings = [];
  for (const [file, rawLines] of addedLines) {
    if (!standard.scope.some(scope => matchesScope(file, scope))) continue;
    const lines = rawLines.filter(item => item.text.trim() && !/^\s*(?:\/\/|#|\*|$)/.test(item.text));
    for (let index = 0; index <= lines.length - windowSize; index++) {
      const window = lines.slice(index, index + windowSize);
      if (window.at(-1).line - window[0].line !== windowSize - 1) continue;
      const normalized = window.map(item => item.text.trim().replace(/\s+/g, ' ')).join('\n');
      if (normalized.length < windowSize * 12) continue;
      const hash = createHash('sha256').update(normalized).digest('hex');
      const previous = blocks.get(hash);
      if (previous && (previous.file !== file || previous.line !== window[0].line)) {
        findings.push(makeFinding({
          standard,
          file,
          line: window[0].line,
          message: `Added ${windowSize}-line block duplicates ${previous.file}:${previous.line}.`,
          confidence: 0.92,
          mode,
          details: { duplicateOf: previous },
        }));
      } else {
        blocks.set(hash, { file, line: window[0].line });
      }
    }
  }
  return findings;
}

function resolveImport(rootDir, fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(rootDir, dirname(fromFile), specifier);
  const candidates = [base, ...['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'].map(suffix => `${base}${suffix}`), ...['index.js', 'index.mjs', 'index.ts', 'index.tsx'].map(name => resolve(base, name))];
  const found = candidates.find(candidate => existsSync(candidate));
  return found ? normalizePath(relative(rootDir, found)) : null;
}

function cycleFindings(files, rootDir, standards, mode) {
  const standard = standardById(standards, 'STD-ARCH-002');
  if (!standard) return [];
  const sourceFiles = files.filter(file => /\.(?:js|mjs|cjs|ts|tsx|jsx)$/.test(file) && existsSync(resolve(rootDir, file)));
  const graph = new Map();
  const visitImports = file => {
    if (graph.has(file)) return;
    let content;
    try { content = readFileSync(resolve(rootDir, file), 'utf-8'); } catch { return; }
    const imports = [...content.matchAll(/(?:from\s+|import\s*\(|require\s*\()\s*['"]([^'"]+)/g)]
      .map(match => resolveImport(rootDir, file, match[1]))
      .filter(Boolean);
    graph.set(file, imports);
    if (graph.size < 1000) for (const dependency of imports) visitImports(dependency);
  };
  for (const file of sourceFiles) visitImports(file);

  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const cycles = [];
  const dfs = file => {
    if (visiting.has(file)) {
      const start = stack.indexOf(file);
      cycles.push([...stack.slice(start), file]);
      return;
    }
    if (visited.has(file)) return;
    visiting.add(file);
    stack.push(file);
    for (const dependency of graph.get(file) || []) dfs(dependency);
    stack.pop();
    visiting.delete(file);
    visited.add(file);
  };
  for (const file of sourceFiles) dfs(file);
  const unique = new Map(cycles.map(cycle => [[...new Set(cycle)].sort().join('|'), cycle]));
  return [...unique.values()].map(cycle => makeFinding({
    standard,
    file: cycle[0],
    message: `Circular dependency introduced or touched: ${cycle.join(' -> ')}`,
    confidence: 0.9,
    mode,
    details: { cycle },
  }));
}

export function reviewDiff({ rootDir, config, base, plan, standards }) {
  const changed = getChangedFiles(rootDir, base);
  const diff = getDiff(rootDir, base, { unified: 0 });
  const errors = [...changed.errors.map(error => `git files: ${error}`), ...diff.errors.map(error => `git diff: ${error}`)];
  if (errors.length > 0) return { errors, report: null };
  const mode = config.supervisor?.mode || 'guard';
  const addedLines = parseAddedLines(diff.diff);
  for (const file of changed.files) {
    if (addedLines.has(file) || !existsSync(resolve(rootDir, file))) continue;
    if (showFileAtRef(rootDir, base, file).content !== null) continue;
    const lines = readFileSync(resolve(rootDir, file), 'utf-8').split(/\r?\n/).map((text, index) => ({ line: index + 1, text }));
    addedLines.set(file, lines);
  }
  const applicable = selectStandards(standards, changed.files);
  const findings = [
    ...changedOutsidePlan(changed.files, plan, standards, mode),
    ...protectedFileFindings(changed.files, rootDir, base, config, standards, mode),
    ...dependencyFindings(changed.files, addedLines, rootDir, base, config, standards, mode),
    ...boundaryFindings(addedLines, config, standards, mode),
    ...complexityFindings(addedLines, rootDir, config, standards, mode),
    ...duplicationFindings(addedLines, config, standards, mode),
    ...cycleFindings(changed.files, rootDir, standards, mode),
  ];
  const unique = [...new Map(findings.map(finding => [finding.id, finding])).values()];
  return {
    errors: [],
    report: {
      schemaVersion: SCHEMA_VERSION,
      type: 'SupervisorReport',
      taskId: plan.id,
      base,
      mode,
      createdAt: new Date().toISOString(),
      files: changed.files,
      standards: applicable.map(standard => standard.id),
      findings: unique,
      summary: {
        files: changed.files.length,
        standards: applicable.length,
        findings: unique.length,
        blocking: unique.filter(finding => finding.blocking).length,
      },
    },
  };
}

function outputReport(report, json) {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`Development Supervisor (${report.mode})`);
  console.log(`  Files: ${report.summary.files} · Standards: ${report.summary.standards} · Findings: ${report.summary.findings} · Blocking: ${report.summary.blocking}`);
  for (const finding of report.findings) {
    console.log(`${finding.blocking ? '❌' : '⚠️'} ${finding.standardId} ${finding.file}:${finding.line} — ${finding.message}`);
    console.log(`   Fix: ${finding.recommendation}`);
  }
  if (report.findings.length === 0) console.log('✅ No supervisor findings.');
}

function printRegistryErrors(errors) {
  for (const error of errors) console.error(`❌ supervisor: ${error}`);
  process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
}

function runPlanCommand({ rootDir, args, config, registry, base, json }) {
  const task = getArg(args, '--task');
  if (!task) {
    console.error('Usage: harness supervise plan --task <text> [--allow <glob> ...] [--deny <glob> ...]');
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return;
  }
  const plan = buildChangePlan({
    rootDir,
    config,
    task,
    base,
    allow: getArgs(args, '--allow'),
    deny: getArgs(args, '--deny'),
    standards: registry.standards,
  });
  const plansDir = resolve(rootDir, config.supervisor?.plansDir || '.harness-cache/plans');
  const output = getArg(args, '--output') ? resolve(rootDir, getArg(args, '--output')) : resolve(plansDir, `${plan.id}.json`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(plan, null, 2)}\n`, 'utf-8');
  if (json) console.log(JSON.stringify({ plan, path: normalizePath(relative(rootDir, output)) }, null, 2));
  else {
    console.log(`✅ Change Plan: ${normalizePath(relative(rootDir, output))}`);
    console.log(`   Risk: ${plan.riskLevel}`);
    console.log(`   Allow: ${plan.changePlan.allow.join(', ')}`);
    console.log(`   Deny: ${plan.changePlan.deny.join(', ') || '—'}`);
    console.log(`   Standards: ${plan.changePlan.standards.join(', ')}`);
  }
}

function resolvePlan(rootDir, args, config) {
  const planPath = getArg(args, '--plan')
    ? resolve(rootDir, getArg(args, '--plan'))
    : latestPlan(rootDir, config.supervisor?.plansDir || '.harness-cache/plans');
  if (!planPath || !existsSync(planPath)) return { error: 'supervise diff requires --plan <path> or an existing Change Plan.' };
  try {
    const loaded = loadPlan(planPath);
    if (loaded.errors.length > 0) return { error: `Invalid Change Plan: ${loaded.errors.join('; ')}` };
    return { plan: loaded.plan };
  } catch (error) {
    return { error: `Invalid Change Plan ${planPath}: ${error.message}` };
  }
}

function runDiffCommand({ rootDir, args, config, registry, base, json }) {
  const resolved = resolvePlan(rootDir, args, config);
  if (resolved.error) {
    console.error(`❌ ${resolved.error}`);
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return;
  }
  const result = reviewDiff({ rootDir, config, base, plan: resolved.plan, standards: registry.standards });
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(`❌ supervisor: ${error}`);
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return;
  }
  outputReport(result.report, json);
  if (result.report.summary.blocking > 0) process.exitCode = EXIT_CODES.POLICY_FAILURE;
}

export function runSupervisor({ rootDir, args, config }) {
  const subcommand = args[1];
  const json = args.includes('--json') || getArg(args, '--format') === 'json';
  const base = getArg(args, '--base') || config.docImpact?.base || 'origin/main';
  const registry = loadStandards({ rootDir, config });
  if (registry.errors.length > 0) {
    printRegistryErrors(registry.errors);
    return;
  }

  if (subcommand === 'plan') {
    runPlanCommand({ rootDir, args, config, registry, base, json });
    return;
  }

  if (subcommand === 'diff') {
    runDiffCommand({ rootDir, args, config, registry, base, json });
    return;
  }

  console.error('Usage: harness supervise plan|diff [options]');
  process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
}
