#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'glob';
import { minimatch } from 'minimatch';
import { validateContract } from './contracts.mjs';
import { getChangedFiles } from './git-files.mjs';
import { EXIT_CODES, getArg } from './cli-utils.mjs';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLED_STANDARDS = resolve(PACKAGE_ROOT, 'rules', 'base-standards.json');

function normalizePath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

export function matchesScope(file, scope) {
  return minimatch(normalizePath(file), scope, { dot: true, nocase: process.platform === 'win32' });
}

function readStandardsFile(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf-8'));
  if (Array.isArray(parsed)) return parsed;
  return Array.isArray(parsed.standards) ? parsed.standards : [];
}

export function loadStandards({ rootDir, config }) {
  const errors = [];
  const sources = [];
  const byId = new Map();
  const origins = new Map();
  const originKinds = new Map();
  const loadFile = (path, kind) => {
    let standards;
    try {
      standards = readStandardsFile(path);
    } catch (error) {
      errors.push(`${path}: ${error.message}`);
      return;
    }
    const localIds = new Set();
    for (const standard of standards) {
      if (localIds.has(standard.id)) {
        errors.push(`${path}: duplicate standard id ${standard.id}`);
        continue;
      }
      localIds.add(standard.id);
      const validation = validateContract('Standard', standard);
      if (validation.length > 0) {
        errors.push(`${path}:${standard.id || '?'}: ${validation.join('; ')}`);
        continue;
      }
      if (byId.has(standard.id) && (kind !== 'project' || originKinds.get(standard.id) === 'project')) {
        errors.push(`${path}: duplicate standard id ${standard.id} (already in ${origins.get(standard.id)})`);
        continue;
      }
      byId.set(standard.id, { ...standard, source: path });
      origins.set(standard.id, path);
      originKinds.set(standard.id, kind);
    }
    sources.push(path);
  };

  if (config.standards?.includeBundled !== false) loadFile(BUNDLED_STANDARDS, 'bundled');
  const seenProjectFiles = new Set();
  for (const pattern of config.standards?.sources || []) {
    const matches = globSync(pattern, { cwd: rootDir, absolute: true, nodir: true, windowsPathsNoEscape: true }).sort();
    for (const path of matches) {
      const normalized = resolve(path);
      if (seenProjectFiles.has(normalized)) continue;
      seenProjectFiles.add(normalized);
      loadFile(normalized, 'project');
    }
  }

  return { standards: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)), sources, errors };
}

export function selectStandards(standards, files) {
  const normalizedFiles = files.map(normalizePath);
  return standards.filter(standard => normalizedFiles.some(file => standard.scope.some(scope => matchesScope(file, scope))));
}

function sumLevels(byLevel, levels) {
  return levels.reduce((sum, level) => sum + (byLevel[level] ?? 0), 0);
}

export function standardsCoverage(standards) {
  const byLevel = {};
  const byCategory = {};
  for (const standard of standards) {
    const level = typeof standard.enforcement === 'string' ? standard.enforcement : standard.enforcement.level;
    byLevel[level] = (byLevel[level] || 0) + 1;
    byCategory[standard.category] ||= { total: 0, verified: 0, review: 0, documented: 0 };
    const row = byCategory[standard.category];
    row.total++;
    const bucket = ['verified', 'blocking', 'critical'].includes(level)
      ? 'verified'
      : (['advisory', 'review-required'].includes(level) ? 'review' : 'documented');
    row[bucket]++;
  }
  const machine = sumLevels(byLevel, ['verified', 'blocking', 'critical']);
  return {
    total: standards.length,
    machineEnforced: machine,
    reviewRequired: sumLevels(byLevel, ['advisory', 'review-required']),
    documentedOnly: byLevel.documented ?? 0,
    machineCoveragePercent: standards.length ? Math.round((machine / standards.length) * 1000) / 10 : 0,
    byLevel,
    byCategory,
  };
}

function printErrors(errors) {
  for (const error of errors) console.error(`❌ standards: ${error}`);
  process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
}

function outputStandardList(registry, args, json) {
  const category = getArg(args, '--category');
  const standards = category ? registry.standards.filter(item => item.category === category) : registry.standards;
  if (json) console.log(JSON.stringify({ standards, sources: registry.sources }, null, 2));
  else {
    for (const standard of standards) {
      const level = typeof standard.enforcement === 'string' ? standard.enforcement : standard.enforcement.level;
      console.log(`${standard.id}\t${standard.category}\t${level}\t${standard.title}`);
    }
    console.log(`\n${standards.length} standard(s)`);
  }
}

function outputCoverage(standards, json) {
  const coverage = standardsCoverage(standards);
  if (json) {
    console.log(JSON.stringify(coverage, null, 2));
    return;
  }
  console.log('Standards Enforcement Coverage');
  console.log(`  Total: ${coverage.total}`);
  console.log(`  Machine enforced: ${coverage.machineEnforced} (${coverage.machineCoveragePercent}%)`);
  console.log(`  Review required: ${coverage.reviewRequired}`);
  console.log(`  Documented only: ${coverage.documentedOnly}`);
  for (const [category, row] of Object.entries(coverage.byCategory)) {
    console.log(`  ${category}: ${row.total} total / ${row.verified} machine / ${row.review} review / ${row.documented} documented`);
  }
}

function explicitFiles(args) {
  const files = [];
  const filesIndex = args.indexOf('--files');
  if (filesIndex < 0) return files;
  for (let index = filesIndex + 1; index < args.length && !args[index].startsWith('--'); index++) {
    files.push(...args[index].split(',').filter(Boolean));
  }
  return files;
}

function outputSelection({ rootDir, args, config, registry, json }) {
  const base = getArg(args, '--base') || config.docImpact?.base || 'origin/main';
  const explicit = explicitFiles(args);
  const changed = explicit.length > 0 ? { files: explicit, errors: [] } : getChangedFiles(rootDir, base);
  if (changed.errors.length > 0) {
    printErrors(changed.errors.map(error => `git: ${error}`));
    return;
  }
  const selected = selectStandards(registry.standards, changed.files);
  const result = { base, files: changed.files, standards: selected };
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Applicable standards for ${changed.files.length} changed file(s):`);
    for (const standard of selected) console.log(`  ${standard.id} ${standard.title}`);
  }
}

export function runStandards({ rootDir, args, config }) {
  const subcommand = args[1] || 'list';
  const json = args.includes('--json') || getArg(args, '--format') === 'json';
  const registry = loadStandards({ rootDir, config });
  if (registry.errors.length > 0) {
    printErrors(registry.errors);
    return;
  }

  if (subcommand === 'list') {
    outputStandardList(registry, args, json);
    return;
  }

  if (subcommand === 'coverage') {
    outputCoverage(registry.standards, json);
    return;
  }

  if (subcommand === 'select') {
    outputSelection({ rootDir, args, config, registry, json });
    return;
  }

  console.error(`Unknown standards subcommand: ${subcommand}`);
  process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
}
