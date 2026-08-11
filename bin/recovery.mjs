import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContract } from './contracts.mjs';
import { EXIT_CODES, getArg, getArgs, hasArg } from './cli-utils.mjs';
import { getChangedFiles, getDiff } from './git-files.mjs';
import { atomicWriteJson, readJson, repositoryIdentity, resolveTask, sha256, statePaths, workspaceFingerprint } from './state-store.mjs';

function id(seed) {
  return `REC-${createHash('sha256').update(seed).digest('hex').slice(0, 14)}`;
}

function values(args, flag, fallback = []) {
  const multiple = getArgs(args, flag);
  const single = getArg(args, flag);
  return multiple.length > 0 ? multiple : single ? [single] : fallback;
}

export function createRecoveryPlan({ rootDir, config, task, failureCriteria, stopConditions, codeRecovery, dataRecovery, verification, notes = [] }) {
  const identity = repositoryIdentity(rootDir);
  const changed = getChangedFiles(rootDir, task.baseHead || 'HEAD');
  const diff = getDiff(rootDir, task.baseHead || 'HEAD', { unified: 0 });
  if (changed.errors.length > 0 || diff.errors.length > 0) throw new TypeError(`Cannot create recovery checkpoint: ${[...changed.errors, ...diff.errors].join('; ')}`);
  const createdAt = new Date().toISOString();
  const plan = createContract('RecoveryPlan', {
    id: id(`${task.id}:${createdAt}`),
    taskId: task.id,
    createdAt,
    failureCriteria,
    stopConditions,
    codeRecovery,
    dataRecovery,
    verification,
    notes,
    checkpoint: {
      repository: identity.repository,
      worktreeId: identity.worktreeId,
      branch: identity.branch,
      head: identity.head,
      workspaceFingerprint: workspaceFingerprint(rootDir, config),
      changedFiles: changed.files,
      diffSha256: sha256(diff.diff || 'clean'),
      configSha256: existsSync(resolve(rootDir, 'harness.config.mjs')) ? sha256(readFileSync(resolve(rootDir, 'harness.config.mjs'))) : null,
    },
    executionPolicy: 'manual-only',
  });
  atomicWriteJson(resolve(statePaths(rootDir, config).recovery, `${task.id}.json`), plan);
  return plan;
}

export function validateRecoveryPlan(plan, { critical = true } = {}) {
  const errors = [];
  if (!plan || plan.type !== 'RecoveryPlan') return ['RecoveryPlan is missing'];
  for (const field of ['failureCriteria', 'stopConditions', 'codeRecovery', 'dataRecovery', 'verification']) {
    if (!Array.isArray(plan[field]) || (critical && plan[field].length === 0)) errors.push(`${field} must be a non-empty array`);
  }
  if (plan.executionPolicy !== 'manual-only') errors.push('executionPolicy must remain manual-only');
  return errors;
}

export function recoveryStatus({ rootDir, config, task }) {
  const path = resolve(statePaths(rootDir, config).recovery, `${task.id}.json`);
  if (!existsSync(path)) return { exists: false, valid: false, errors: ['RecoveryPlan is missing'] };
  const plan = readJson(path);
  const errors = validateRecoveryPlan(plan, { critical: task.riskLevel === 'critical' });
  const identity = repositoryIdentity(rootDir);
  const stale = plan.checkpoint.repository !== identity.repository || plan.checkpoint.worktreeId !== identity.worktreeId || plan.checkpoint.head !== identity.head;
  if (stale) errors.push('Recovery checkpoint is stale for the current repository/worktree/HEAD');
  return { exists: true, valid: errors.length === 0, stale, errors, plan };
}

export function runRecovery({ rootDir, config, args }) {
  const subcommand = args[1] || 'status';
  const json = hasArg(args, '--json') || getArg(args, '--format') === 'json';
  const task = resolveTask(rootDir, config, getArg(args, '--task'), { allowTerminal: subcommand === 'status' });
  if (subcommand === 'create') {
    const defaults = task.riskLevel === 'critical' ? [] : ['not applicable for current risk profile'];
    const plan = createRecoveryPlan({
      rootDir,
      config,
      task,
      failureCriteria: values(args, '--failure', defaults),
      stopConditions: values(args, '--stop', defaults),
      codeRecovery: values(args, '--code', [`Return to ${task.baseHead || 'the recorded base commit'} using a reviewed revert`]),
      dataRecovery: values(args, '--data', defaults),
      verification: values(args, '--verify', ['Re-run the task verification profile']),
      notes: values(args, '--note', []),
    });
    const errors = validateRecoveryPlan(plan, { critical: task.riskLevel === 'critical' });
    if (json) console.log(JSON.stringify({ plan, errors }, null, 2));
    else console.log(`${errors.length === 0 ? '✅' : '❌'} Recovery plan ${plan.id} created (${plan.executionPolicy}).${errors.length ? ` ${errors.join('; ')}` : ''}`);
    if (errors.length > 0) process.exitCode = EXIT_CODES.POLICY_FAILURE;
    return;
  }
  if (subcommand === 'status' || subcommand === 'verify') {
    const status = recoveryStatus({ rootDir, config, task });
    if (json) console.log(JSON.stringify(status, null, 2));
    else console.log(`${status.valid ? '✅' : '❌'} Recovery for ${task.id}: ${status.valid ? 'valid and current' : status.errors.join('; ')}`);
    if (!status.valid) process.exitCode = EXIT_CODES.POLICY_FAILURE;
    return;
  }
  console.error('Usage: harness recovery create|status|verify --task <id> [options]');
  process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
}
