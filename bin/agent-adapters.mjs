import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { EXIT_CODES, getArg, hasArg } from './cli-utils.mjs';
import { atomicWriteText } from './state-store.mjs';
import { loadStandards, standardsCoverage } from './standards.mjs';

export const ADAPTER_TARGETS = Object.freeze({
  codex: 'AGENTS.md',
  claude: 'CLAUDE.md',
  copilot: '.github/copilot-instructions.md',
  cursor: '.cursor/rules/harness.mdc',
  generic: '.harness/agent-policy.md',
});

const START = '<!-- harness:managed:start -->';
const END = '<!-- harness:managed:end -->';

export function buildManagedPolicy({ config, standards }) {
  const coverage = standardsCoverage(standards);
  const layers = (config.layers || []).map(layer => `- \`${layer.id}\`: \`${layer.path}\``).join('\n') || '- no configured layers';
  return `${START}
## Harness-managed AI development policy

This block is generated from the local Harness policy. User-maintained content outside the markers is preserved.

Lifecycle: task start → project context → risk → standards/change plan → supervised implementation → evidence → knowledge → finish.

Required commands:

- Start/resume: \`npx harness task start|resume\` and \`npx harness brain context\`.
- Plan/review: \`npx harness supervise plan|diff|review\`.
- Evidence: \`npx harness evidence run|record|verify|bundle\`.
- Knowledge/recovery: \`npx harness knowledge verify\`; Critical tasks also require \`npx harness recovery verify\`.
- Never claim an unexecuted verifier passed. A \`not-run\` result remains unresolved evidence.

Project layers:

${layers}

Enforcement: ${config.supervisor?.mode || 'guard'} mode; ${coverage.total} standard(s), ${coverage.machineEnforced} machine-enforced, ${coverage.reviewRequired} review-required, ${coverage.documentedOnly} documented-only.

Runtime state is local to the repository/worktree. Do not copy secrets into tasks, context packs, evidence, or handoff packages.
${END}`;
}

export function updateManagedBlock(existing, managed) {
  const start = existing.indexOf(START);
  const end = existing.indexOf(END);
  if (start < 0 && end < 0) return `${existing.replace(/\s*$/, '')}${existing.trim() ? '\n\n' : ''}${managed}\n`;
  if (start < 0 || end < start) throw new TypeError('Existing adapter has malformed Harness managed markers');
  return `${existing.slice(0, start)}${managed}${existing.slice(end + END.length)}`;
}

export function generateAdapter({ rootDir, config, standards, target, write = false }) {
  const relativePath = ADAPTER_TARGETS[target];
  if (!relativePath) throw new TypeError(`Unknown adapter target: ${target}`);
  const path = resolve(rootDir, relativePath);
  const existing = existsSync(path) ? readFileSync(path, 'utf-8') : '';
  const content = updateManagedBlock(existing, buildManagedPolicy({ config, standards }));
  if (write) atomicWriteText(path, content);
  return { target, path: relativePath, changed: content !== existing, written: write, content };
}

function listAdapters({ rootDir, json }) {
  const targets = Object.entries(ADAPTER_TARGETS).map(([target, path]) => ({ target, path, exists: existsSync(resolve(rootDir, path)) }));
  if (json) console.log(JSON.stringify(targets, null, 2));
  else console.log(targets.map(item => `${item.exists ? '✅' : '○'} ${item.target.padEnd(8)} ${item.path}`).join('\n'));
}

function generateAdapters({ rootDir, config, args, json }) {
  const requested = getArg(args, '--target') || 'generic';
  const targets = requested === 'all' ? Object.keys(ADAPTER_TARGETS) : requested.split(',').map(value => value.trim()).filter(Boolean);
  const registry = loadStandards({ rootDir, config });
  if (registry.errors.length > 0) {
    for (const error of registry.errors) console.error(`❌ adapter: ${error}`);
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return;
  }
  let results;
  try {
    results = targets.map(target => generateAdapter({ rootDir, config, standards: registry.standards, target, write: hasArg(args, '--write') }));
  } catch (error) {
    console.error(`❌ adapter: ${error.message}`);
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return;
  }
  if (json) console.log(JSON.stringify(results.map(({ content, ...result }) => result), null, 2));
  else if (!hasArg(args, '--write') && results.length === 1) console.log(results[0].content);
  else console.log(results.map(result => `${result.written ? '✅ wrote' : '○ would write'} ${result.path}${result.changed ? '' : ' (unchanged)'}`).join('\n'));
}

export function runAdapters({ rootDir, config, args }) {
  const subcommand = args[1] || 'list';
  const json = hasArg(args, '--json') || getArg(args, '--format') === 'json';
  if (subcommand === 'list') {
    listAdapters({ rootDir, json });
    return;
  }
  if (subcommand === 'generate') {
    generateAdapters({ rootDir, config, args, json });
    return;
  }
  console.error('Usage: harness adapter list|generate [--target codex|claude|copilot|cursor|generic|all] [--write]');
  process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
}
