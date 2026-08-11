import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContract } from './contracts.mjs';
import { EXIT_CODES, getArg, getArgs, hasArg } from './cli-utils.mjs';
import { getChangedFiles } from './git-files.mjs';
import { recordEvidence } from './evidence.mjs';
import { atomicWriteJson, readJson, resolveTask, statePaths } from './state-store.mjs';

const STATUSES = new Set(['updated', 'reviewed-no-change', 'not-applicable']);

function id(seed) {
  return `KNA-${createHash('sha256').update(seed).digest('hex').slice(0, 14)}`;
}

function directory(rootDir, config, taskId) {
  return resolve(statePaths(rootDir, config).knowledge, taskId);
}

export function listAssessments(rootDir, config, taskId) {
  const path = directory(rootDir, config, taskId);
  if (!existsSync(path)) return [];
  return readdirSync(path).filter(file => file.endsWith('.json')).map(file => readJson(resolve(path, file)));
}

export function affectedKnowledge({ rootDir, config, task }) {
  const changed = getChangedFiles(rootDir, task.baseHead || 'HEAD');
  if (changed.errors.length > 0) return { errors: changed.errors, assets: [], changed: [] };
  const assets = new Set();
  for (const rule of config.syncCheck?.rules || []) {
    let matches = false;
    try {
      matches = changed.files.some(file => {
        if (rule.re instanceof RegExp) { rule.re.lastIndex = 0; return rule.re.test(file); }
        return false;
      });
    } catch { matches = false; }
    if (matches) for (const asset of rule.assets || []) assets.add(asset);
  }
  if (assets.size === 0 && changed.files.some(file => !/\.(?:md|mdx|txt)$/.test(file))) assets.add('project knowledge impact');
  return { errors: [], assets: [...assets].sort(), changed: changed.files };
}

export function assessKnowledge({ rootDir, config, task, asset, status, reason, sources = [] }) {
  if (!STATUSES.has(status)) throw new TypeError(`Knowledge status must be one of: ${[...STATUSES].join(', ')}`);
  if (!reason) throw new TypeError('Knowledge assessment requires a reason');
  const assessedAt = new Date().toISOString();
  const assessment = createContract('KnowledgeAssessment', {
    id: id(`${task.id}:${asset}:${assessedAt}`),
    taskId: task.id,
    asset,
    status,
    reason,
    sources,
    assessedAt,
  });
  atomicWriteJson(resolve(directory(rootDir, config, task.id), `${assessment.id}.json`), assessment);
  return assessment;
}

export function verifyKnowledge({ rootDir, config, task, record = false }) {
  const affected = affectedKnowledge({ rootDir, config, task });
  const assessments = listAssessments(rootDir, config, task.id);
  const assessed = new Set(assessments.map(item => item.asset));
  const missing = affected.assets.filter(asset => !assessed.has(asset));
  const ok = affected.errors.length === 0 && missing.length === 0 && (affected.assets.length > 0 || assessments.length > 0);
  const result = {
    schemaVersion: '1.0', type: 'KnowledgeVerification', taskId: task.id, verifiedAt: new Date().toISOString(),
    ok, affected: affected.assets, assessments, missing, errors: affected.errors,
  };
  if (ok && record) {
    result.evidence = recordEvidence({
      rootDir, config, task, evidenceType: 'knowledge', summary: `${assessments.length} knowledge assessment(s) completed`,
      files: assessments.flatMap(item => item.sources || []).filter(path => existsSync(resolve(rootDir, path))), metadata: { assessments: assessments.map(item => item.id) },
    });
  }
  return result;
}

function assessCommand({ rootDir, config, args, task, json }) {
  const asset = getArg(args, '--asset');
  const status = getArg(args, '--status');
  const reason = getArg(args, '--reason');
  if (!asset || !status || !reason) {
    console.error('Usage: harness knowledge assess --task <id> --asset <path-or-label> --status <state> --reason <text> [--source <path>]');
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return;
  }
  const assessment = assessKnowledge({ rootDir, config, task, asset, status, reason, sources: getArgs(args, '--source') });
  if (json) console.log(JSON.stringify(assessment, null, 2));
  else console.log(`✅ ${asset}: ${status} (${assessment.id})`);
}

function listCommand({ rootDir, config, task, json }) {
  const values = listAssessments(rootDir, config, task.id);
  if (json) console.log(JSON.stringify(values, null, 2));
  else console.log(values.length ? values.map(item => `${item.status.padEnd(20)} ${item.asset} — ${item.reason}`).join('\n') : 'No knowledge assessments.');
}

function verifyCommand({ rootDir, config, task, json, subcommand }) {
  const result = verifyKnowledge({ rootDir, config, task, record: subcommand === 'verify' });
  if (json) console.log(JSON.stringify(result, null, 2));
  else console.log(`${result.ok ? '✅' : '❌'} Knowledge loop: ${result.assessments.length}/${result.affected.length} assessment(s)${result.missing.length ? `; missing ${result.missing.join(', ')}` : ''}`);
  if (!result.ok) process.exitCode = EXIT_CODES.POLICY_FAILURE;
}

export function runKnowledge({ rootDir, config, args }) {
  const subcommand = args[1] || 'status';
  const json = hasArg(args, '--json') || getArg(args, '--format') === 'json';
  const task = resolveTask(rootDir, config, getArg(args, '--task'), { allowTerminal: subcommand === 'status' || subcommand === 'list' });
  if (subcommand === 'assess') {
    return assessCommand({ rootDir, config, args, task, json });
  }
  if (subcommand === 'list') {
    return listCommand({ rootDir, config, task, json });
  }
  if (subcommand === 'status' || subcommand === 'verify') {
    return verifyCommand({ rootDir, config, task, json, subcommand });
  }
  console.error('Usage: harness knowledge assess|list|status|verify [options]');
  process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
}
