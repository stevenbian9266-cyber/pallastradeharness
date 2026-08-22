import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { globSync } from 'glob';
import { minimatch } from 'minimatch';
import { createContract } from './contracts.mjs';
import { EXIT_CODES, getArg, getArgs, hasArg } from './cli-utils.mjs';
import { atomicWriteJson, cacheRead, cacheWrite, ensureStateDirectories, readJson, repositoryIdentity, sha256, statePaths } from './state-store.mjs';

function normalize(value) {
  return String(value).replaceAll('\\', '/').replace(/^\.\//, '');
}

function identifier(prefix, seed) {
  return `${prefix}-${createHash('sha256').update(seed).digest('hex').slice(0, 12)}`;
}

function stackRoots(config) {
  const roots = new Set(['']);
  for (const layer of config.layers || []) {
    const path = normalize(layer.path).replace(/\/\*.*$/, '').replace(/\/$/, '');
    if (!path) continue;
    roots.add(path);
    roots.add(path.split('/')[0]);
  }
  return [...roots];
}

function detectStacks(rootDir, config) {
  const roots = stackRoots(config);
  const has = names => roots.some(directory => names.some(name => existsSync(resolve(rootDir, directory, name))));
  const stacks = [];
  if (has(['package.json'])) stacks.push('node');
  if (has(['Gemfile'])) stacks.push('ruby');
  if (has(['requirements.txt', 'pyproject.toml'])) stacks.push('python');
  if (has(['go.mod'])) stacks.push('go');
  if (has(['Cargo.toml'])) stacks.push('rust');
  return stacks.length > 0 ? stacks : ['unknown'];
}

function packageScripts(rootDir) {
  const path = resolve(rootDir, 'package.json');
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, 'utf-8')).scripts || {}; } catch { return {}; }
}

function assetKind(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith('agents.md') || lower.endsWith('claude.md') || lower.includes('copilot-instructions')) return 'agent-policy';
  if (lower.includes('/skills/') && lower.endsWith('skill.md')) return 'skill';
  if (lower.includes('/prd')) return 'prd';
  if (/\badr[-_/]|\/decisions?\//.test(lower)) return 'decision';
  if (/openapi|swagger|api-doc/.test(lower)) return 'api';
  if (/style|design|interaction|accessibility/.test(lower)) return 'standard';
  if (basename(lower).startsWith('readme')) return 'readme';
  return 'documentation';
}

function authorityRank(path, kind) {
  if (kind === 'agent-policy') return 100;
  if (kind === 'skill' || kind === 'standard') return 80;
  if (kind === 'decision' || kind === 'api') return 70;
  if (basename(path).toLowerCase().startsWith('readme')) return 50;
  return 30;
}

function safeAsset(path, config) {
  const normalized = normalize(path).toLowerCase();
  const forbidden = ['.env', 'credential', 'private-key', 'id_rsa', '.pem', '.p12'];
  if (forbidden.some(token => normalized.includes(token))) return false;
  return !(config.brain?.exclude || []).some(pattern => minimatch(normalize(path), pattern, { dot: true, nocase: true }));
}

function configuredAssets(rootDir, config) {
  const files = new Set();
  for (const pattern of config.brain?.sources || []) {
    for (const file of globSync(pattern, {
      cwd: rootDir,
      nodir: true,
      dot: true,
      ignore: config.brain?.exclude || [],
      windowsPathsNoEscape: true,
    })) files.add(normalize(file));
  }
  return [...files].filter(file => safeAsset(file, config)).sort();
}

export function buildProjectProfile({ rootDir, config }) {
  const identity = repositoryIdentity(rootDir);
  const scripts = packageScripts(rootDir);
  return createContract('ProjectProfile', {
    id: identifier('PROJECT', identity.repository),
    name: config.name || basename(rootDir),
    repository: identity.repository,
    worktreeId: identity.worktreeId,
    generatedAt: new Date().toISOString(),
    stacks: detectStacks(rootDir, config),
    layers: (config.layers || []).map(layer => ({ id: layer.id, path: normalize(layer.path), label: layer.label || layer.id })),
    commands: {
      test: scripts.test || null,
      build: scripts.build || null,
      lint: scripts.lint || scripts.check || null,
      harness: scripts.harness || 'npx harness',
    },
    riskDomains: ['database', 'api', 'security', 'deployment'].filter(domain =>
      (config.risk?.criticalPaths || []).some(pattern => pattern.toLowerCase().includes(domain === 'deployment' ? 'deploy' : domain))),
    authorities: configuredAssets(rootDir, config).filter(path => assetKind(path) === 'agent-policy'),
  });
}

export function indexKnowledge({ rootDir, config }) {
  const maxBytes = config.brain?.maxAssetBytes || 524288;
  const allFiles = configuredAssets(rootDir, config);
  const maxAssets = config.brain?.maxAssets || 10000;
  const files = allFiles.slice(0, maxAssets);
  const assets = [];
  for (const path of files) {
    const absolute = resolve(rootDir, path);
    const stat = statSync(absolute);
    if (stat.size > maxBytes) continue;
    const content = readFileSync(absolute, 'utf-8');
    const kind = assetKind(path);
    const contentHash = sha256(content);
    const cached = cacheRead(rootDir, config, 'brain-assets', { path, sha256: contentHash, v: 2 });
    const asset = cached?.value || createContract('KnowledgeAsset', {
      id: identifier('KNW', path),
      path,
      status: 'pending',
      kind,
      authority: authorityRank(path, kind),
      sha256: contentHash,
      size: stat.size,
      lastValidatedAt: new Date().toISOString(),
      derived: /summary|generated/i.test(path),
      headings: [...content.matchAll(/^#{1,3}\s+(.+)$/gm)].slice(0, 20).map(match => match[1].trim()),
      keywords: terms(content).slice(0, 200),
    });
    if (!cached) cacheWrite(rootDir, config, 'brain-assets', { path, sha256: contentHash, v: 2 }, asset);
    assets.push({ ...asset, lastValidatedAt: new Date().toISOString() });
  }
  const profile = buildProjectProfile({ rootDir, config });
  const index = {
    stateSchemaVersion: '1.0',
    schemaVersion: '1.0',
    type: 'KnowledgeIndex',
    generatedAt: new Date().toISOString(),
    profile,
    assets,
    stats: { discovered: allFiles.length, indexed: assets.length, truncated: allFiles.length > maxAssets, shardSize: config.brain?.shardSize || 500 },
  };
  const paths = ensureStateDirectories(rootDir, config);
  atomicWriteJson(resolve(paths.brain, 'index.json'), index);
  return index;
}

function terms(text) {
  return [...new Set(String(text || '').toLowerCase().match(/[a-z0-9_-]{3,}|[\u4e00-\u9fa5]{2,}/g) || [])];
}

/** 资产可检索文本：path + 标题 + 内容关键词（F-09 召回修复） */
function searchableText(asset) {
  return `${asset.path} ${(asset.headings || []).join(' ')} ${(asset.keywords || []).join(' ')}`.toLowerCase();
}

function scoreAsset(asset, taskTerms) {
  const haystack = searchableText(asset);
  const termScore = taskTerms.reduce((score, term) => score + (haystack.includes(term) ? 10 : 0), 0);
  return termScore + Number(asset.authority || 0) / 10;
}

export function buildContextPack({ rootDir, config, task, refresh = false }) {
  const paths = ensureStateDirectories(rootDir, config);
  const indexPath = resolve(paths.brain, 'index.json');
  const index = refresh || !existsSync(indexPath) ? indexKnowledge({ rootDir, config }) : readJson(indexPath);
  const taskTerms = terms(`${task.title} ${(task.goals || []).join(' ')} ${(task.acceptanceCriteria || []).join(' ')}`);
  const max = config.brain?.maxContextAssets || 20;
  const selected = index.assets
    .map(asset => ({ asset, score: scoreAsset(asset, taskTerms) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.asset.path.localeCompare(b.asset.path))
    .slice(0, max)
    .map(({ asset, score }) => ({ id: asset.id, path: asset.path, sha256: asset.sha256, kind: asset.kind, reason: score >= 10 ? 'task relevance and authority' : 'project authority' }));
  const pack = createContract('ContextPack', {
    id: identifier('CTX', `${task.id}:${index.generatedAt}`),
    taskId: task.id,
    generatedAt: new Date().toISOString(),
    profile: index.profile,
    assets: selected,
    relevantLayers: (config.layers || []).filter(layer => taskTerms.some(term => `${layer.id} ${layer.path}`.toLowerCase().includes(term))),
    knownRisks: task.risk?.reasons || [],
    changeScope: task.changePlan || null,
    nextActions: ['Review selected authorities', 'Confirm change scope', 'Run risk check before implementation'],
  });
  atomicWriteJson(resolve(paths.brain, `context-${task.id}.json`), pack);
  return pack;
}

export function brainStatus({ rootDir, config }) {
  const path = resolve(statePaths(rootDir, config).brain, 'index.json');
  if (!existsSync(path)) return { indexed: false, stale: [], assets: 0 };
  const index = readJson(path);
  const stale = index.assets.filter(asset => {
    const absolute = resolve(rootDir, asset.path);
    return !existsSync(absolute) || sha256(readFileSync(absolute, 'utf-8')) !== asset.sha256;
  }).map(asset => asset.path);
  return { indexed: true, generatedAt: index.generatedAt, assets: index.assets.length, stale };
}

export function recordDecision({ rootDir, config, taskId, title, decision, reason }) {
  const createdAt = new Date().toISOString();
  const value = createContract('Decision', {
    id: identifier('DEC', `${taskId}:${title}:${createdAt}`), taskId, title, decision, reason, createdAt,
  });
  const paths = ensureStateDirectories(rootDir, config);
  atomicWriteJson(resolve(paths.decisions, `${value.id}.json`), value);
  return value;
}

function output(value, json) {
  if (json) console.log(JSON.stringify(value, null, 2));
  else console.log(value);
}

function indexCommand({ rootDir, config, json }) {
  const index = indexKnowledge({ rootDir, config });
  output(json ? index : `✅ Project Brain indexed ${index.assets.length} knowledge asset(s).`, json);
}

function statusCommand({ rootDir, config, json }) {
  const status = brainStatus({ rootDir, config });
  output(json ? status : `${status.indexed ? '✅' : '⚠️'} Project Brain: ${status.assets} asset(s), ${status.stale.length} stale.`, json);
  if (status.stale.length > 0) process.exitCode = EXIT_CODES.POLICY_FAILURE;
}

function contextCommand({ rootDir, config, args, json, taskResolver }) {
  const task = taskResolver(getArg(args, '--task'));
  const pack = buildContextPack({ rootDir, config, task, refresh: hasArg(args, '--refresh') });
  output(json ? pack : `✅ Context pack ${pack.id}: ${pack.assets.length} selected asset(s).`, json);
}

// ================================================================
// HTH-017：检索 adapter（query）与离线评测框架（eval）
// ================================================================

/** 对给定 KnowledgeIndex 执行确定性检索（可复现排序；F-09：要求术语命中，authority 仅作加权） */
export function searchIndex(index, query, top = 10) {
  const queryTerms = terms(query);
  if (queryTerms.length === 0 || !Array.isArray(index.assets)) return [];
  return index.assets
    .map(asset => ({ asset, termScore: queryTerms.reduce((score, term) => score + (searchableText(asset).includes(term) ? 10 : 0), 0) }))
    .filter(item => item.termScore > 0)
    .map(item => ({ asset: item.asset, score: item.termScore + Number(item.asset.authority || 0) / 10 }))
    .sort((a, b) => b.score - a.score || a.asset.path.localeCompare(b.asset.path))
    .slice(0, top)
    .map(({ asset, score }) => ({ id: asset.id, path: asset.path, kind: asset.kind, score, authority: asset.authority, headings: asset.headings }));
}

/** brain query：检索已索引知识资产，返回 top-K */
export function searchKnowledge({ rootDir, config, query, top = 10 }) {
  const indexPath = resolve(statePaths(rootDir, config).brain, 'index.json');
  if (!existsSync(indexPath)) return { indexed: false, query, top, count: 0, results: [] };
  const index = readJson(indexPath);
  const results = searchIndex(index, query, top);
  return { indexed: true, query, top, count: results.length, results };
}

/** brain eval：对查询集计算 Recall@K 与必需资产遗漏率（离线、确定性、可复现） */
export function evaluateRetrieval({ index, queries, top = 10 }) {
  const rows = (queries || []).map(entry => {
    const results = searchIndex(index, entry.query, top);
    const foundPaths = new Set(results.map(result => result.path));
    const missing = (entry.requiredAssets || []).filter(path => !foundPaths.has(path));
    const required = (entry.requiredAssets || []).length;
    return { query: entry.query, required, found: required - missing.length, recall: required ? (required - missing.length) / required : 1, missing };
  });
  const totalRequired = rows.reduce((sum, row) => sum + row.required, 0);
  const recallAtK = rows.length ? rows.reduce((sum, row) => sum + row.recall, 0) / rows.length : 0;
  const omissionRate = totalRequired ? rows.reduce((sum, row) => sum + row.missing.length, 0) / totalRequired : 0;
  return {
    schemaVersion: '1.0',
    type: 'RetrievalEvaluation',
    generatedAt: new Date().toISOString(),
    top,
    queries: rows.length,
    recallAtK,
    requiredAssetOmissionRate: omissionRate,
    rows,
  };
}

function loadEvalQueries({ rootDir, args }) {
  const file = getArg(args, '--file');
  if (file) return readJson(resolve(rootDir, file));
  const preset = getArg(args, '--preset') || 'default';
  const presetPath = resolve(rootDir, 'presets', 'brain-eval', `${preset}.json`);
  if (!existsSync(presetPath)) {
    console.error(`Brain eval preset not found: presets/brain-eval/${preset}.json (use --file <queries.json>)`);
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return null;
  }
  return readJson(presetPath);
}

function formatEval(report) {
  const lines = [`Brain retrieval eval · top-${report.top} · ${report.queries} queries`,
    `  recall@${report.top}                  ${(report.recallAtK * 100).toFixed(1)}%`,
    `  required-asset omission rate  ${(report.requiredAssetOmissionRate * 100).toFixed(1)}%`];
  for (const row of report.rows.filter(item => item.missing.length > 0).slice(0, 10)) {
    lines.push(`  ⚠ ${row.query} → missing ${row.missing.join(', ')}`);
  }
  return lines.join('\n');
}

function queryCommand({ rootDir, config, args, json }) {
  const query = getArg(args, '--query');
  if (!query) {
    console.error('Usage: harness brain query --query "<text>" [--top <n>]');
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return;
  }
  const top = Number(getArg(args, '--top') || 10);
  const result = searchKnowledge({ rootDir, config, query, top });
  if (!result.indexed) {
    console.error('Project Brain not indexed yet. Run: harness brain index');
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return;
  }
  output(json ? result : result.results.length === 0
    ? `No results for "${query}"`
    : [`Top ${result.results.length} for "${query}":`, ...result.results.map(item => `  ${String(item.score).padStart(4)}  ${item.path}`)].join('\n'), json);
}

function evalCommand({ rootDir, config, args, json }) {
  const top = Number(getArg(args, '--top') || 10);
  const queries = loadEvalQueries({ rootDir, args });
  if (!queries) return;
  const indexPath = resolve(statePaths(rootDir, config).brain, 'index.json');
  if (!existsSync(indexPath)) {
    console.error('Project Brain not indexed yet. Run: harness brain index');
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return;
  }
  const report = evaluateRetrieval({ index: readJson(indexPath), queries, top });
  output(json ? report : formatEval(report), json);
  if (report.requiredAssetOmissionRate > 0.2) process.exitCode = EXIT_CODES.POLICY_FAILURE;
}

function decisionCommand({ rootDir, config, args, json, taskResolver }) {
  const task = taskResolver(getArg(args, '--task'));
  const title = getArg(args, '--title');
  const decision = getArg(args, '--decision');
  const reason = getArg(args, '--reason');
  if (!title || !decision || !reason) {
    console.error('Usage: harness brain decision --task <id> --title <text> --decision <text> --reason <text>');
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return;
  }
  const value = recordDecision({ rootDir, config, taskId: task.id, title, decision, reason });
  output(json ? value : `✅ Decision recorded: ${value.id}`, json);
}

const BRAIN_COMMANDS = Object.freeze({
  index: indexCommand,
  status: statusCommand,
  context: contextCommand,
  decision: decisionCommand,
  query: queryCommand,
  eval: evalCommand,
});

export function runBrain({ rootDir, config, args, taskResolver }) {
  const subcommand = args[1] || 'status';
  const json = hasArg(args, '--json') || getArg(args, '--format') === 'json';
  const handler = BRAIN_COMMANDS[subcommand];
  if (handler) return handler({ rootDir, config, args, json, taskResolver });
  console.error('Usage: harness brain index|status|context|decision|query|eval [options]');
  process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
}
