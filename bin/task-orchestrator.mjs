import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContract } from './contracts.mjs';
import { EXIT_CODES, getArg, getArgs, hasArg } from './cli-utils.mjs';
import { assessRisk, mergeRisk } from './risk-engine.mjs';
import {
  atomicWriteJson,
  ensureStateDirectories,
  listTasks,
  loadTask,
  repositoryIdentity,
  resolveTask,
  saveTask,
  statePaths,
  workspaceFingerprint,
} from './state-store.mjs';
import { findPrdAcs, checkAcCoverage, checkUnclaimedAcs } from './ac-trace.mjs';
import { readProfile, governanceReady } from './governance.mjs';

const TERMINAL = new Set(['completed', 'cancelled', 'superseded']);
const TRANSITIONS = Object.freeze({
  draft: ['planned', 'cancelled'],
  planned: ['approved', 'implementing', 'paused', 'cancelled', 'superseded'],
  approved: ['implementing', 'paused', 'cancelled', 'superseded'],
  implementing: ['reviewing', 'paused', 'blocked', 'cancelled', 'superseded'],
  reviewing: ['implementing', 'verifying', 'paused', 'blocked', 'cancelled'],
  verifying: ['implementing', 'completed', 'blocked', 'cancelled'],
  paused: ['implementing', 'cancelled', 'superseded'],
  blocked: ['implementing', 'cancelled', 'superseded'],
  completed: [],
  cancelled: [],
  superseded: [],
});

function id(prefix, seed) {
  const date = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${prefix}-${date}-${createHash('sha256').update(seed).digest('hex').slice(0, 8)}`;
}

export function transitionTask(task, status, note = null) {
  if (task.status === status) return task;
  if (!(TRANSITIONS[task.status] || []).includes(status)) {
    throw new TypeError(`Illegal task transition: ${task.status} -> ${status}`);
  }
  const at = new Date().toISOString();
  return {
    ...task,
    status,
    history: [...(task.history || []), { from: task.status, to: status, at, note }],
    updatedAt: at,
  };
}

export function startTask({ rootDir, config, title, declaredRisk = null, goals = [], nonGoals = [], acceptanceCriteria = [], linkedPrd = null, allow = [], deny = [] }) {
  const identity = repositoryIdentity(rootDir);
  // §19.4：任务↔AC 绑定校验（PRD 存在 + AC 在 PRD 中声明），否则阻止开始
  if (linkedPrd) {
    const prdAcs = findPrdAcs({ rootDir, config, prdId: linkedPrd });
    if (!prdAcs) throw new TypeError(`linked PRD not found: ${linkedPrd}`);
    const prdSet = new Set(prdAcs);
    for (const ac of acceptanceCriteria) {
      const norm = /^AC-\d+$/i.test(ac) ? ac.toUpperCase() : ac;
      if (!prdSet.has(norm)) throw new TypeError(`AC ${ac} not declared in PRD ${linkedPrd}`);
    }
  }
  const risk = assessRisk({ task: title, files: allow, declared: declaredRisk, config });
  const createdAt = new Date().toISOString();
  // §15.9：项目 governance_ready 时记录治理版本（只读，无 profile 则 null）
  let governanceVersion = null;
  try {
    const profile = readProfile({ rootDir, config });
    if (profile && governanceReady(profile).ready) governanceVersion = profile.governance_version || null;
  } catch { /* 可选：profile 解析失败不阻塞任务创建 */ }
  const task = createContract('Task', {
    id: id('TASK', `${identity.repository}:${identity.worktreeId}:${title}:${createdAt}`),
    title,
    status: 'planned',
    riskLevel: risk.level,
    createdAt,
    repository: identity.repository,
    worktreeId: identity.worktreeId,
    branch: identity.branch,
    baseHead: identity.head,
    goals,
    nonGoals,
    linkedPrd,
    governanceVersion,
    acceptanceCriteria,
    risk,
    changePlan: {
      allow: allow.length > 0 ? allow : (config.layers || []).map(layer => `${String(layer.path).replaceAll('\\', '/')}/**/*`),
      deny: [...new Set([...(config.supervisor?.protectedFiles || []), ...deny])],
      standards: [],
      requiredEvidence: risk.requiredEvidence,
    },
    blockers: [],
    nextActions: ['Build project context', 'Select applicable standards', 'Confirm the Change Plan'],
    history: [{ from: null, to: 'planned', at: createdAt, note: 'task started' }],
  });
  return saveTask(rootDir, config, task);
}

export function reassessTaskRisk({ rootDir, config, task, files = [], diff = '', declared = null, override = null, reason = null }) {
  const reassessed = assessRisk({ task: task.title, files, diff, declared, config });
  const risk = mergeRisk(task.risk, reassessed, { override, reason });
  return saveTask(rootDir, config, { ...task, risk, riskLevel: risk.level });
}

export function createCheckpoint({ rootDir, config, task, status = null, summary = '', nextActions = [] }) {
  let updated = task;
  if (status && status !== task.status) updated = transitionTask(task, status, summary || 'checkpoint');
  const identity = repositoryIdentity(rootDir);
  const checkpoint = createContract('TaskCheckpoint', {
    id: id('CHK', `${task.id}:${Date.now()}`),
    taskId: task.id,
    createdAt: new Date().toISOString(),
    status: updated.status,
    summary: summary || 'checkpoint',
    git: { branch: identity.branch, head: identity.head, worktreeId: identity.worktreeId, workspaceFingerprint: workspaceFingerprint(rootDir) },
    modifiedFiles: updated.modifiedFiles || [],
    completedSteps: updated.completedSteps || [],
    blockers: updated.blockers || [],
    decisions: updated.decisions || [],
    nextActions: nextActions.length > 0 ? nextActions : updated.nextActions || [],
  });
  const dir = resolve(statePaths(rootDir, config).checkpoints, task.id);
  mkdirSync(dir, { recursive: true });
  atomicWriteJson(resolve(dir, `${checkpoint.id}.json`), checkpoint);
  updated = saveTask(rootDir, config, { ...updated, lastCheckpointId: checkpoint.id, nextActions: checkpoint.nextActions });
  return { task: updated, checkpoint };
}

export function resumeTask({ rootDir, config, task, note = 'task resumed' }) {
  if (TERMINAL.has(task.status)) throw new TypeError(`Cannot resume terminal task ${task.status}`);
  const identity = repositoryIdentity(rootDir);
  if (identity.repository !== task.repository || identity.worktreeId !== task.worktreeId) {
    throw new TypeError(`Task belongs to a different repository/worktree (${task.worktreeId}); use its handoff package to start a related task here.`);
  }
  const updated = ['paused', 'blocked', 'planned', 'approved'].includes(task.status)
    ? transitionTask(task, 'implementing', note)
    : task;
  return saveTask(rootDir, config, updated);
}

export function buildHandoff({ rootDir, config, task }) {
  const identity = repositoryIdentity(rootDir);
  const handoff = createContract('HandoffPackage', {
    id: id('HANDOFF', `${task.id}:${Date.now()}`),
    taskId: task.id,
    createdAt: new Date().toISOString(),
    status: task.status,
    title: task.title,
    goals: task.goals || [],
    nonGoals: task.nonGoals || [],
    acceptanceCriteria: task.acceptanceCriteria || [],
    risk: task.risk,
    changePlan: task.changePlan,
    completedSteps: task.completedSteps || [],
    blockers: task.blockers || [],
    decisions: task.decisions || [],
    evidence: task.evidence || [],
    repository: { path: identity.repository, branch: identity.branch, head: identity.head, worktreeId: identity.worktreeId },
    contextPack: task.contextPack || null,
    nextActions: task.nextActions || [],
  });
  const paths = ensureStateDirectories(rootDir, config);
  const path = resolve(paths.state, 'handoffs', `${handoff.id}.json`);
  atomicWriteJson(path, handoff);
  return { handoff, path };
}

export function finishVerifiedTask({ rootDir, config, task, verification }) {
  if (!verification?.ok) throw new TypeError(`Task cannot finish: ${(verification?.reasons || ['evidence is not verified']).join('; ')}`);
  let updated = task;
  if (updated.status !== 'verifying') {
    if (updated.status === 'reviewing') updated = transitionTask(updated, 'verifying', 'verification evidence satisfied');
    else if (updated.status === 'implementing') {
      updated = transitionTask(updated, 'reviewing', 'implementation complete');
      updated = transitionTask(updated, 'verifying', 'verification evidence satisfied');
    } else if (['planned', 'approved'].includes(updated.status)) {
      updated = transitionTask(updated, 'implementing', 'delivery already implemented');
      updated = transitionTask(updated, 'reviewing', 'review evidence supplied');
      updated = transitionTask(updated, 'verifying', 'verification evidence satisfied');
    }
  }
  return saveTask(rootDir, config, { ...transitionTask(updated, 'completed', 'task finished'), verification });
}

function output(value, json, human) {
  if (json) console.log(JSON.stringify(value, null, 2));
  else console.log(human);
}

function startCommand({ rootDir, config, args, json }) {
  const title = getArg(args, '--title') || getArg(args, '--task');
  if (!title) {
    console.error('Usage: harness task start --title <text> [--ac <PRD-ID> AC-1,AC-2] [--risk quick|standard|critical]');
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return;
  }
  // §19.4：--ac <PRD-ID> [AC-1,AC-2...] 绑定任务与 PRD 的 AC
  let linkedPrd = null;
  const acFromFlag = [];
  const acArg = getArg(args, '--ac');
  if (acArg) {
    linkedPrd = acArg;
    const idx = args.indexOf('--ac');
    for (let i = idx + 2; i < args.length && !args[i].startsWith('--'); i++) {
      acFromFlag.push(...args[i].split(',').map(s => s.trim()).filter(Boolean));
    }
  }
  let task;
  try {
    task = startTask({
      rootDir, config, title, declaredRisk: getArg(args, '--risk'),
      goals: getArgs(args, '--goal'), nonGoals: getArgs(args, '--non-goal'),
      acceptanceCriteria: [...getArgs(args, '--accept'), ...acFromFlag],
      linkedPrd,
      allow: getArgs(args, '--allow'), deny: getArgs(args, '--deny'),
    });
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return;
  }
  output(task, json, `✅ Task ${task.id} started (${task.riskLevel}) — next: harness brain context --task ${task.id}`);
}

function listCommand({ rootDir, config, args = [], json }) {
  let tasks = listTasks(rootDir, config);
  // token 优化（6.4）：--status 过滤
  const statusFilter = getArg(args, '--status');
  if (statusFilter) tasks = tasks.filter(task => task.status === statusFilter);
  if (json) {
    output(tasks, json, '');
    return;
  }
  if (tasks.length === 0) {
    console.log('No tasks.');
    return;
  }
  // token 优化（6.4）：默认只显示最近 N 条（config.output.taskListDefaultLimit，默认 20；--all 全量）
  const limit = hasArg(args, '--all') ? 0 : Number(config.output?.taskListDefaultLimit ?? 20);
  const shown = limit > 0 ? tasks.slice(0, limit) : tasks;
  const lines = shown.map(task => `${task.id}  ${task.status.padEnd(12)} ${task.riskLevel.padEnd(8)} ${task.title}`);
  if (limit > 0 && tasks.length > limit) {
    lines.push(`（显示最近 ${limit} 条，共 ${tasks.length} 条；--all 查看全部）`);
  }
  console.log(lines.join('\n'));
}

function statusCommand({ task, json }) {
  output(task, json, `${task.id}\n  ${task.status} · ${task.riskLevel}\n  ${task.title}\n  Next: ${(task.nextActions || []).join(' → ') || '—'}`);
}

function checkpointCommand({ rootDir, config, args, task, json }) {
  const result = createCheckpoint({
    rootDir, config, task, status: getArg(args, '--status'), summary: getArg(args, '--summary') || '', nextActions: getArgs(args, '--next'),
  });
  output(result, json, `✅ Checkpoint ${result.checkpoint.id} saved for ${task.id}.`);
}

function resumeCommand({ rootDir, config, args, task, json }) {
  const updated = resumeTask({ rootDir, config, task, note: getArg(args, '--note') || undefined });
  output(updated, json, `✅ Task ${task.id} resumed at ${updated.status}.`);
}

function handoffCommand({ rootDir, config, task, json }) {
  const result = buildHandoff({ rootDir, config, task });
  output(result, json, `✅ Handoff package: ${result.path}`);
}

function abandonCommand({ rootDir, config, args, task, json }) {
  const reason = getArg(args, '--reason');
  if (!reason) {
    console.error('task abandon requires --reason <text>');
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return;
  }
  const updated = saveTask(rootDir, config, transitionTask(task, 'cancelled', reason));
  output(updated, json, `✅ Task ${task.id} cancelled: ${reason}`);
}

function finishCommand({ rootDir, config, task, json, verificationProvider }) {
  const verification = verificationProvider ? verificationProvider(task) : { ok: false, reasons: ['Evidence verification is not configured'] };
  if (!verification.ok) {
    output(verification, json, `❌ Task cannot finish: ${verification.reasons.join('; ')}`);
    process.exitCode = EXIT_CODES.POLICY_FAILURE;
    return;
  }
  // §19.4：任务↔AC 双向追溯（声明 AC 全有测试 + PRD 无未认领 AC）
  if (task.linkedPrd) {
    const coverage = checkAcCoverage({ rootDir, prdId: task.linkedPrd, acs: task.acceptanceCriteria || [] });
    if (coverage.missing.length > 0) {
      const reason = `AC 无测试覆盖: ${coverage.missing.join(', ')}（§19.4）`;
      output({ ok: false, reasons: [reason] }, json, `❌ Task cannot finish: ${reason}`);
      process.exitCode = EXIT_CODES.POLICY_FAILURE;
      return;
    }
    const unclaimed = checkUnclaimedAcs({ rootDir, config, prdId: task.linkedPrd });
    if (unclaimed.length > 0) {
      const reason = `PRD ${task.linkedPrd} 存在未认领 AC: ${unclaimed.join(', ')}（§19.4）`;
      output({ ok: false, reasons: [reason] }, json, `❌ Task cannot finish: ${reason}`);
      process.exitCode = EXIT_CODES.POLICY_FAILURE;
      return;
    }
  }
  const updated = finishVerifiedTask({ rootDir, config, task, verification });
  output(updated, json, `✅ Task ${task.id} completed with verified evidence.`);
}

const TASK_COMMANDS = Object.freeze({
  status: statusCommand,
  checkpoint: checkpointCommand,
  resume: resumeCommand,
  handoff: handoffCommand,
  abandon: abandonCommand,
  finish: finishCommand,
});

export function runTask({ rootDir, config, args, verificationProvider = null }) {
  const subcommand = args[1] || 'status';
  const json = hasArg(args, '--json') || getArg(args, '--format') === 'json';
  if (subcommand === 'start') return startCommand({ rootDir, config, args, json });
  if (subcommand === 'list') return listCommand({ rootDir, config, args, json });
  const task = resolveTask(rootDir, config, getArg(args, '--task'), { allowTerminal: subcommand === 'status' || subcommand === 'handoff' });
  const handler = TASK_COMMANDS[subcommand];
  if (handler) return handler({ rootDir, config, args, task, json, verificationProvider });
  console.error('Usage: harness task start|list|status|checkpoint|resume|handoff|finish|abandon [options]');
  process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
}

export { loadTask, resolveTask };
