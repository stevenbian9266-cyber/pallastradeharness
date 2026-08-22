import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { createContract, EVIDENCE_TYPES } from './contracts.mjs';
import { createSnapshot, indexTree, snapshotsEqual, stableStringify } from './change-snapshot.mjs';
import { EXIT_CODES, getArg, hasArg } from './cli-utils.mjs';
import { expandCommandArgs } from './glob-utils.mjs';
import { GATE_PHASES, migrateGateState, recomputeGateState } from './gate-lifecycle.mjs';
import { getChangedFiles } from './git-files.mjs';
import {
  atomicWriteJson,
  ensureStateDirectories,
  readJson,
  repositoryIdentity,
  resolveTask,
  saveTask,
  sha256,
  statePaths,
  workspaceFingerprint,
} from './state-store.mjs';

const TYPE_ALIASES = Object.freeze({
  'test-evidence': 'test',
  'build-evidence': 'build',
  'command-evidence': 'command',
  'screenshot-evidence': 'screenshot',
  'dom-evidence': 'dom',
  'log-evidence': 'log',
  'database-evidence': 'database',
  'review-evidence': 'review',
  'security-review-evidence': 'review',
  'api-contract-evidence': 'review',
  'accessibility-evidence': 'review',
  'interaction-review': 'review',
  'ui-review': 'review',
  'approval-evidence': 'approval',
  'knowledge-evidence': 'knowledge',
});

function id(prefix, seed) {
  const date = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${prefix}-${date}-${createHash('sha256').update(seed).digest('hex').slice(0, 10)}`;
}

function normalizeType(value) {
  const normalized = TYPE_ALIASES[value] || value;
  if (!EVIDENCE_TYPES.includes(normalized)) throw new TypeError(`Unknown evidence type: ${value}`);
  return normalized;
}

function commandForPlatform(command) {
  if (process.platform !== 'win32') return command;
  if (['npm', 'npx', 'pnpm', 'yarn'].includes(command)) return `${command}.cmd`;
  return command;
}

function quoteCmdArgument(value) {
  const argument = String(value);
  if (/[\0\r\n]/.test(argument)) throw new TypeError('Evidence command arguments cannot contain NUL or newlines');
  return `"${argument.replaceAll('^', '^^').replaceAll('%', '^%').replaceAll('"', '""')}"`;
}

function fileRecords(rootDir, files) {
  return [...new Set(files)].flatMap(path => {
    const absolute = resolve(rootDir, path);
    const root = resolve(rootDir);
    if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) throw new TypeError(`Evidence file is outside the project root: ${path}`);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) return [];
    const content = readFileSync(absolute);
    return [{ path: String(relative(rootDir, absolute)).replaceAll('\\', '/'), sha256: sha256(content), size: content.byteLength }];
  });
}

function evidenceDirectory(rootDir, config, taskId) {
  return resolve(statePaths(rootDir, config).evidence, taskId);
}

function implementationFiles(files, config) {
  const ignored = [config.paths?.state || '.harness-state', config.paths?.evidence || 'artifacts/harness-evidence', config.paths?.gates || 'harness/gates', '.harness-cache']
    .map(path => String(path).replaceAll('\\', '/').replace(/\/$/, ''));
  return files.filter(file => {
    const normalized = String(file).replaceAll('\\', '/');
    return !ignored.some(prefix => normalized === prefix || normalized.startsWith(`${prefix}/`));
  });
}

export function recordEvidence({ rootDir, config, task, evidenceType, summary, command = null, exitCode = null, stdout = '', stderr = '', files = [], metadata = {}, snapshot = null, verifierId = null, verifierDefinitionHash = null }) {
  const type = normalizeType(evidenceType);
  const identity = repositoryIdentity(rootDir);
  if (task.repository && identity.repository !== task.repository) throw new TypeError('Evidence repository does not match the task repository');
  if (task.worktreeId && identity.worktreeId !== task.worktreeId) throw new TypeError('Evidence worktree does not match the task worktree');
  const capturedAt = new Date().toISOString();
  const maxOutput = config.evidence?.maxOutputBytes || 262144;
  const evidence = createContract('Evidence', {
    id: id('EVD', `${task.id}:${type}:${capturedAt}:${summary}`),
    evidenceType: type,
    taskId: task.id,
    capturedAt,
    summary,
    repository: identity.repository,
    worktreeId: identity.worktreeId,
    git: { branch: identity.branch, head: identity.head },
    workspaceFingerprint: workspaceFingerprint(rootDir, config),
    command,
    exitCode,
    // HTH-006: 无 exitCode 的手工证据 success 为 null（未定），需独立 approval 才可满足 Gate（F-02）
    success: exitCode === null ? null : exitCode === 0,
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    files: fileRecords(rootDir, files),
    stdout: String(stdout || '').slice(0, maxOutput),
    stderr: String(stderr || '').slice(0, maxOutput),
    metadata,
    ...(snapshot ? { snapshot } : {}),
    ...(verifierId ? { verifierId, verifierDefinitionHash } : {}),
  });
  const directory = evidenceDirectory(rootDir, config, task.id);
  mkdirSync(directory, { recursive: true });
  atomicWriteJson(resolve(directory, `${evidence.id}.json`), evidence);
  const latestTask = resolveTask(rootDir, config, task.id, { allowTerminal: true });
  saveTask(rootDir, config, { ...latestTask, evidence: [...new Set([...(latestTask.evidence || []), evidence.id])] });
  return evidence;
}

export function runEvidenceCommand({ rootDir, config, task, evidenceType, summary, command, verifierId = null, verifierDefinitionHash = null, diagnostic = false }) {
  if (!Array.isArray(command) || command.length === 0) throw new TypeError('Evidence command must be a non-empty argument array');
  const allow = task.changePlan?.allow || [];
  const startSnapshot = safeSnapshot(rootDir, config, task, allow);
  const executable = commandForPlatform(command[0]);
  // Windows cannot execute .cmd package-manager shims through CreateProcess
  // directly (Node reports EINVAL). Delegate only the known shim to cmd.exe
  // as one quoted command string. No separate argv is passed with shell mode,
  // avoiding Node's unsafe/deprecated shell-plus-args concatenation.
  const usesWindowsShim = process.platform === 'win32' && executable.endsWith('.cmd');
  const spawnExecutable = usesWindowsShim ? [executable, ...command.slice(1).map(quoteCmdArgument)].join(' ') : executable;
  const spawnArguments = usesWindowsShim ? [] : command.slice(1);
  const result = spawnSync(spawnExecutable, spawnArguments, {
    cwd: rootDir,
    encoding: 'utf-8',
    shell: usesWindowsShim ? (process.env.ComSpec || true) : false,
    windowsHide: true,
    env: { ...process.env, NO_COLOR: process.env.NO_COLOR || '1' },
  });
  const exitCode = result.error ? (result.error.code === 'ENOENT' ? 127 : 3) : (result.status ?? 3);
  const endSnapshot = safeSnapshot(rootDir, config, task, allow);
  const snapshot = startSnapshot && endSnapshot ? {
    start: startSnapshot,
    end: endSnapshot,
    status: snapshotsEqual(startSnapshot, endSnapshot) ? 'valid' : 'superseded',
  } : null;
  const changed = getChangedFiles(rootDir, 'HEAD');
  return recordEvidence({
    rootDir,
    config,
    task,
    evidenceType,
    summary: summary || `${command.join(' ')} exited ${exitCode}`, // + (snapshot?.status === 'superseded' ? ' [SUPERSEDED: files changed during run]' : ''),
    command,
    exitCode,
    stdout: result.stdout || '',
    stderr: result.error ? `${result.error.message}\n${result.stderr || ''}` : result.stderr || '',
    files: changed.errors.length === 0 ? implementationFiles(changed.files, config) : [],
    metadata: {
      executable,
      runner: usesWindowsShim ? (process.env.ComSpec || 'cmd.exe') : executable,
      windowsShim: usesWindowsShim,
      spawnError: result.error?.code || null,
      snapshotStatus: snapshot?.status || null,
      ...(diagnostic ? { diagnostic: true } : {}),
    },
    snapshot,
    verifierId,
    verifierDefinitionHash,
  });
}

/** 生成 ChangeSnapshot；git 不可用时降级为 null（不阻止证据记录） */
function safeSnapshot(rootDir, config, task, allow) {
  try {
    return createSnapshot({
      rootDir,
      taskId: task.id,
      branch: task.branch || undefined,
      baseHead: task.baseHead || undefined,
      allow,
      config,
    });
  } catch {
    return null;
  }
}

export function listEvidence(rootDir, config, taskId) {
  const directory = evidenceDirectory(rootDir, config, taskId);
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter(file => file.endsWith('.json')).map(file => readJson(resolve(directory, file)))
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

export function evidenceFreshness({ rootDir, config, evidence }) {
  const identity = repositoryIdentity(rootDir);
  const reasons = [];
  if (identity.repository !== evidence.repository) reasons.push('repository changed');
  if (identity.worktreeId !== evidence.worktreeId) reasons.push('worktree changed');
  if (identity.head !== evidence.git?.head) reasons.push('HEAD changed');
  if (workspaceFingerprint(rootDir, config) !== evidence.workspaceFingerprint) reasons.push('workspace changed');
  for (const file of evidence.files || []) {
    const absolute = resolve(rootDir, file.path);
    if (!existsSync(absolute) || sha256(readFileSync(absolute)) !== file.sha256) reasons.push(`file changed: ${file.path}`);
  }
  // ChangeSnapshot 绑定（INV-01）：证据验证的 staged tree 与当前 staged tree 不一致 → 失效
  const endSnap = evidence.snapshot?.end;
  if (endSnap?.indexTree) {
    try {
      const currentIndex = indexTree(rootDir);
      if (currentIndex !== endSnap.indexTree) {
        reasons.push(`change snapshot mismatch: staged tree changed after verification (${endSnap.indexTree.slice(0, 8)} → ${currentIndex.slice(0, 8)})`);
      }
    } catch {
      // git 不可用时跳过快照校验
    }
  }
  // Verifier 定义 hash（HTH-005/INV-04）：验证器定义变化或注销 → 证据失效
  if (evidence.verifierId) {
    const verifier = config.evidence?.verifiers?.[evidence.verifierId];
    if (!verifier) reasons.push(`verifier no longer registered: ${evidence.verifierId}`);
    else if (verifierDefinitionHash(verifier) !== evidence.verifierDefinitionHash) reasons.push(`verifier definition changed: ${evidence.verifierId}`);
  }
  return { fresh: reasons.length === 0, reasons };
}

function requiredTypes(task) {
  const raw = task.changePlan?.requiredEvidence || task.risk?.requiredEvidence || [];
  const normalized = raw.map(value => TYPE_ALIASES[value] || value).filter(value => EVIDENCE_TYPES.includes(value));
  if (normalized.length > 0) return [...new Set(normalized)];
  return task.riskLevel === 'critical' ? ['test', 'review', 'approval', 'knowledge']
    : task.riskLevel === 'standard' ? ['test', 'review', 'knowledge'] : ['test'];
}

/** Verifier 定义 hash：与 bin/verifier.mjs 一致（避免循环依赖，内联 stableStringify 实现） */
function verifierDefinitionHash(verifier) {
  return createHash('sha256').update(stableStringify(verifier || {})).digest('hex');
}

function recoveryValid(rootDir, config, taskId) {
  const path = resolve(statePaths(rootDir, config).recovery, `${taskId}.json`);
  if (!existsSync(path)) return false;
  const plan = readJson(path);
  return ['failureCriteria', 'stopConditions', 'codeRecovery', 'dataRecovery', 'verification']
    .every(field => Array.isArray(plan[field]) && plan[field].length > 0);
}

export function verifyTaskEvidence({ rootDir, config, task }) {
  const all = listEvidence(rootDir, config, task.id);
  const stale = [];
  const failed = [];
  const valid = [];
  const pending = [];
  for (const evidence of all) {
    const freshness = evidenceFreshness({ rootDir, config, evidence });
    if (!freshness.fresh) stale.push({ id: evidence.id, reasons: freshness.reasons });
    else if (evidence.success === null) pending.push({ id: evidence.id, reason: 'manual evidence without approval (success:null)' });
    else if (!evidence.success) failed.push({ id: evidence.id, exitCode: evidence.exitCode });
    else if (evidence.evidenceType === 'test' && evidence.metadata?.diagnostic === true) pending.push({ id: evidence.id, reason: 'diagnostic evidence (not from a registered verifier)' });
    else valid.push(evidence);
  }
  const required = requiredTypes(task);
  const satisfied = required.filter(type => valid.some(evidence => evidence.evidenceType === type));
  const missing = required.filter(type => !satisfied.includes(type));
  const recoveryRequired = task.riskLevel === 'critical' || task.risk?.recoveryRequired === true;
  const hasRecovery = !recoveryRequired || recoveryValid(rootDir, config, task.id);
  const reasons = [];
  if (missing.length > 0) reasons.push(`missing evidence: ${missing.join(', ')}`);
  if (!hasRecovery) reasons.push('critical task has no valid recovery plan');
  if (stale.length > 0) reasons.push(`${stale.length} evidence record(s) are stale`);
  if (pending.length > 0) reasons.push(`${pending.length} evidence record(s) pending approval/verifier (${pending.map(p => p.id).join(', ')})`);
  return {
    schemaVersion: '1.0',
    type: 'EvidenceVerification',
    taskId: task.id,
    verifiedAt: new Date().toISOString(),
    ok: missing.length === 0 && hasRecovery,
    required,
    satisfied,
    missing,
    recoveryRequired,
    hasRecovery,
    evidence: valid.map(item => item.id),
    stale,
    failed,
    pending,
    reasons,
  };
}

export function completeVerificationGate({ rootDir, config, task, verification, gateId = null }) {
  if (!verification.ok) return { completed: false, reason: verification.reasons.join('; ') };
  const gateDir = resolve(rootDir, config.paths.gates);
  if (!existsSync(gateDir)) return { completed: false, reason: 'no gates directory' };
  const candidates = readdirSync(gateDir).filter(file => file.endsWith('.json')).sort().reverse();
  const selected = candidates.find(file => {
    const gate = migrateGateState(readJson(resolve(gateDir, file)));
    return (gateId && gate.id === gateId) || (!gateId && gate.taskId === task.id);
  });
  if (!selected) return { completed: false, reason: gateId ? `gate ${gateId} not found` : 'no gate is bound to the task' };
  const path = resolve(gateDir, selected);
  const gate = migrateGateState(readJson(path));
  if (gate.taskId && gate.taskId !== task.id) return { completed: false, reason: 'gate belongs to another task' };
  gate.taskId = task.id;
  const check = gate.checks.find(item => item.id === 'verify-test');
  if (!check) return { completed: false, reason: 'gate has no verify-test check' };
  check.status = 'done';
  check.completedAt = new Date().toISOString();
  check.note = `Automatically satisfied by evidence verification (${verification.evidence.length} fresh record(s))`;
  check.evidence = verification.evidence;
  check.phase = GATE_PHASES.VERIFICATION;
  recomputeGateState(gate);
  atomicWriteJson(path, gate);
  return { completed: true, gateId: gate.id, phase: gate.phase };
}

export function buildEvidenceBundle({ rootDir, config, task }) {
  const verification = verifyTaskEvidence({ rootDir, config, task });
  const evidence = listEvidence(rootDir, config, task.id);
  const recoveryPath = resolve(statePaths(rootDir, config).recovery, `${task.id}.json`);
  const bundle = createContract('EvidenceBundle', {
    id: id('BUNDLE', `${task.id}:${Date.now()}`),
    taskId: task.id,
    createdAt: new Date().toISOString(),
    task: { id: task.id, title: task.title, status: task.status, riskLevel: task.riskLevel },
    evidence,
    verification,
    recovery: existsSync(recoveryPath) ? readJson(recoveryPath) : null,
    findings: task.findings || [],
    remainingRisks: verification.reasons,
  });
  const directory = resolve(rootDir, config.paths.evidence || 'artifacts/harness-evidence');
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, `${task.id}-bundle.json`);
  atomicWriteJson(path, bundle);
  atomicWriteJson(resolve(directory, 'latest.json'), bundle);
  return { bundle, path };
}

export function collect({ rootDir, config = { paths: {} } }) {
  const identity = repositoryIdentity(rootDir);
  const diagnostic = {
    schemaVersion: '1.0', type: 'DiagnosticEvidence', collectedAt: new Date().toISOString(),
    repository: identity, workspaceFingerprint: workspaceFingerprint(rootDir, config), environment: { node: process.version, platform: process.platform, arch: process.arch },
  };
  const directory = resolve(rootDir, config.paths?.evidence || 'artifacts/harness-evidence');
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, `diagnostic-${diagnostic.collectedAt.replace(/[:.]/g, '-')}.json`);
  atomicWriteJson(path, diagnostic);
  atomicWriteJson(resolve(directory, 'latest.json'), diagnostic);
  console.log(`📦 Diagnostic evidence collected → ${path}`);
  return diagnostic;
}

function humanEvidence(evidence) {
  return `${evidence.success ? '✅' : '❌'} ${evidence.id} ${evidence.evidenceType}: ${evidence.summary}`;
}

function runCommand({ rootDir, config, args, task, json }) {
  const separator = args.indexOf('--');
  const userCommand = separator >= 0 ? args.slice(separator + 1) : [];
  const evidenceType = getArg(args, '--type') || 'command';
  const verifierId = getArg(args, '--verifier') || null;
  const verifier = verifierId ? config.evidence?.verifiers?.[verifierId] : null;
  if (verifierId && !verifier) {
    console.error(`Unknown verifier: ${verifierId}`);
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return;
  }
  // HTH-005: test 类型证据必须来自已注册验证器；否则降级 diagnostic（不满足严格 Gate）
  // 验证器存在时运行其注册命令（glob 展开），忽略用户原始命令，防止任意命令冒充受信验证器（F-02）
  const command = verifier ? expandCommandArgs(rootDir, verifier.command) : userCommand;
  const diagnostic = evidenceType === 'test' && !verifier;
  if (command.length === 0) {
    console.error('No command to run.');
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return;
  }
  const evidence = runEvidenceCommand({
    rootDir, config, task, evidenceType, summary: getArg(args, '--summary'), command,
    verifierId: verifierId || undefined,
    verifierDefinitionHash: verifier ? verifierDefinitionHash(verifier) : undefined,
    diagnostic,
  });
  if (json) console.log(JSON.stringify(evidence, null, 2));
  else console.log(humanEvidence(evidence) + (diagnostic ? ' (diagnostic — not from a registered verifier)' : ''));
  if (!evidence.success) process.exitCode = EXIT_CODES.POLICY_FAILURE;
}

function recordCommand({ rootDir, config, args, task, json }) {
  const evidenceType = getArg(args, '--type');
  const summary = getArg(args, '--summary');
  const file = getArg(args, '--file');
  const approved = hasArg(args, '--approve');
  if (!evidenceType || !summary) {
    console.error('Usage: harness evidence record --task <id> --type <type> --summary <text> [--file <path>] [--approve]');
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return;
  }
  if (file && !existsSync(resolve(rootDir, file))) {
    console.error(`Evidence file does not exist: ${file}`);
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return;
  }
  // HTH-006: 手工证据默认 success:null（未定）；--approve 视为已独立审批（success:true）
  const evidence = recordEvidence({ rootDir, config, task, evidenceType, summary, files: file ? [file] : [], exitCode: approved ? 0 : null, metadata: { source: file || 'manual-record', ...(approved ? { approved: true } : {}) } });
  if (json) console.log(JSON.stringify(evidence, null, 2));
  else console.log(humanEvidence(evidence) + (approved ? '' : ' (pending approval)'));
}

function listCommand({ rootDir, config, task, json }) {
  const evidence = listEvidence(rootDir, config, task.id);
  if (json) console.log(JSON.stringify(evidence, null, 2));
  else console.log(evidence.length > 0 ? evidence.map(humanEvidence).join('\n') : 'No evidence.');
}

function verifyCommand({ rootDir, config, args, task, json }) {
  const verification = verifyTaskEvidence({ rootDir, config, task });
  const gate = completeVerificationGate({ rootDir, config, task, verification, gateId: getArg(args, '--gate') });
  const result = { verification, gate };
  if (json) console.log(JSON.stringify(result, null, 2));
  else console.log(`${verification.ok ? '✅' : '❌'} Evidence verification: ${verification.satisfied.join(', ') || 'none'}${verification.reasons.length ? ` — ${verification.reasons.join('; ')}` : ''}${gate.completed ? `; gate ${gate.gateId} finished` : ''}`);
  if (!verification.ok) process.exitCode = EXIT_CODES.POLICY_FAILURE;
}

function bundleCommand({ rootDir, config, task, json }) {
  const result = buildEvidenceBundle({ rootDir, config, task });
  if (json) console.log(JSON.stringify(result.bundle, null, 2));
  else {
    console.log(`Delivery report — ${task.title}`);
    console.log(`  Risk: ${task.riskLevel} · Evidence: ${result.bundle.evidence.length} · Verified: ${result.bundle.verification.ok ? 'yes' : 'no'}`);
    console.log(`  Remaining risk: ${result.bundle.remainingRisks.join('; ') || 'none'}`);
    console.log(`  Bundle: ${result.path}`);
  }
  if (!result.bundle.verification.ok) process.exitCode = EXIT_CODES.POLICY_FAILURE;
}

const EVIDENCE_COMMANDS = Object.freeze({
  run: runCommand,
  record: recordCommand,
  list: listCommand,
  verify: verifyCommand,
  bundle: bundleCommand,
  report: bundleCommand,
});

export function runEvidence({ rootDir, config, args }) {
  const subcommand = args[1] || 'collect';
  const json = hasArg(args, '--json') || getArg(args, '--format') === 'json';
  if (subcommand === 'collect') { collect({ rootDir, config }); return; }
  const task = resolveTask(rootDir, config, getArg(args, '--task'), { allowTerminal: subcommand === 'list' || subcommand === 'bundle' || subcommand === 'report' });
  const handler = EVIDENCE_COMMANDS[subcommand];
  if (handler) return handler({ rootDir, config, args, task, json });
  console.error('Usage: harness evidence collect|run|record|list|verify|bundle|report [options]');
  process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
}
