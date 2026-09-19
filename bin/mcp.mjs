import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildContextPack, recordDecision } from './project-brain.mjs';
import { assessRisk, mergeRisk } from './risk-engine.mjs';
import { finishVerifiedTask, resumeTask, startTask } from './task-orchestrator.mjs';
import { recordEvidence, verifyTaskEvidence } from './evidence.mjs';
import { getChangedFiles, getDiff } from './git-files.mjs';
import { loadStandards, selectStandards } from './standards.mjs';
import { reviewDiff } from './supervisor.mjs';
import { reviewDomainSupervisors } from './domain-supervisors.mjs';
import { listTasks, loadTask, resolveTask, saveTask } from './state-store.mjs';
import { createGate, clearGateCheck, autoDiscoverTask, detectTaskType, gateStatusSnapshot, loadLatestGate } from './gate-commands.mjs';
import { nextAction } from './guide.mjs';
import { listVerifiers, runVerifier } from './verifier.mjs';
import { buildGapReport } from './standards-gen.mjs';
import { createSkill } from './skill.mjs';
import { createDocsDraft } from './docs-gen.mjs';
import { getHarnessName, getHarnessVersion } from './version.mjs';

export const MCP_PROTOCOL_VERSION = '2025-03-26';

export const MCP_TOOLS = Object.freeze([
  { name: 'get_project_context', description: 'Build the minimum project context for a task.', inputSchema: { type: 'object', properties: { taskId: { type: 'string' }, refresh: { type: 'boolean' } } } },
  { name: 'start_task', description: 'Start a persistent governed task.', inputSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, risk: { enum: ['quick', 'standard', 'critical'] }, goals: { type: 'array', items: { type: 'string' } }, allow: { type: 'array', items: { type: 'string' } } } } },
  { name: 'resume_task', description: 'Resume a paused or blocked task.', inputSchema: { type: 'object', properties: { taskId: { type: 'string' }, note: { type: 'string' } } } },
  { name: 'get_applicable_standards', description: 'Select standards for files.', inputSchema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string' } } } } },
  { name: 'get_change_plan', description: 'Read a task Change Plan.', inputSchema: { type: 'object', properties: { taskId: { type: 'string' } } } },
  { name: 'risk_check', description: 'Reassess risk from the current diff.', inputSchema: { type: 'object', properties: { taskId: { type: 'string' }, base: { type: 'string' }, override: { enum: ['quick', 'standard', 'critical'] }, reason: { type: 'string' } } } },
  { name: 'record_decision', description: 'Record an architectural or implementation decision.', inputSchema: { type: 'object', required: ['title', 'decision', 'reason'], properties: { taskId: { type: 'string' }, title: { type: 'string' }, decision: { type: 'string' }, reason: { type: 'string' } } } },
  { name: 'record_evidence', description: 'Record typed non-command evidence. Arbitrary command execution is not exposed through MCP.', inputSchema: { type: 'object', required: ['type', 'summary'], properties: { taskId: { type: 'string' }, type: { type: 'string' }, summary: { type: 'string' }, file: { type: 'string' } } } },
  { name: 'review_diff', description: 'Review changed code against task scope and domain standards.', inputSchema: { type: 'object', properties: { taskId: { type: 'string' }, base: { type: 'string' }, domains: { type: 'array', items: { type: 'string' } } } } },
  { name: 'finish_task', description: 'Finish a task only when fresh evidence satisfies its policy.', inputSchema: { type: 'object', properties: { taskId: { type: 'string' } } } },
  { name: 'generate_standards', description: 'Auto-Standards: report which code domains have no standards coverage (gap report). Deterministic; does not write files.', inputSchema: { type: 'object', properties: {} } },
  { name: 'generate_skill', description: 'Auto-Skills: create a domain Skill skeleton (ai/skills/<domain>/SKILL.md) and register it in AGENTS.md/ai README indexes.', inputSchema: { type: 'object', required: ['domain'], properties: { domain: { type: 'string' }, title: { type: 'string' } } } },
  { name: 'generate_docs', description: 'Auto-Docs: create a knowledge doc drafting pack for an asset (e.g. README.md). Deterministic skeleton; AI fills the body.', inputSchema: { type: 'object', required: ['asset'], properties: { asset: { type: 'string' }, base: { type: 'string' }, write: { type: 'boolean' } } } },
  { name: 'gate_create', description: 'Create the phased pre-coding gate for a task. Preparation checks must clear before any implementation edit.', annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }, inputSchema: { type: 'object', required: ['task'], additionalProperties: false, properties: { task: { type: 'string' }, type: { type: 'string' }, taskId: { type: 'string' }, lite: { type: 'boolean' } } } },
  { name: 'gate_status', description: 'Read the active gate phase, remaining checks, validity and expiry.', annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }, inputSchema: { type: 'object', additionalProperties: false, properties: { gateId: { type: 'string' } } } },
  { name: 'gate_clear', description: 'Clear one gate check. Machine-verified checks run server-side; human-WAIT checks cannot be cleared through MCP.', annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }, inputSchema: { type: 'object', required: ['checkId'], additionalProperties: false, properties: { checkId: { type: 'string' }, gateId: { type: 'string' }, note: { type: 'string' } } } },
  { name: 'run_verifier', description: 'Run a registered verifier (whitelist only) and record typed evidence. Arbitrary commands are not exposed.', annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }, inputSchema: { type: 'object', required: ['verifierId'], additionalProperties: false, properties: { verifierId: { type: 'string' }, taskId: { type: 'string' } } } },
  { name: 'get_next_action', description: 'Report the stable next action for the current task/gate state.', annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }, inputSchema: { type: 'object', additionalProperties: false, properties: {} } },
  { name: 'get_task', description: 'Read one task (defaults to the latest active task).', annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }, inputSchema: { type: 'object', additionalProperties: false, properties: { taskId: { type: 'string' } } } },
  { name: 'list_tasks', description: 'List tasks (default-capped, filterable by status).', annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }, inputSchema: { type: 'object', additionalProperties: false, properties: { status: { type: 'string' }, limit: { type: 'number' }, all: { type: 'boolean' } } } },
]);

/** 人工确认检查项：MCP 侧禁止裸清（RFC-0004 D5） */
export const HUMAN_WAIT_CHECKS = Object.freeze(new Set(['user-confirmed', 'design-confirmed']));

/** 工具结果信封（Local stdio 与 Cloud HTTP 共用，RFC-0004 §6） */
export function content(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: value };
}

/** 业务失败的统一错误信封（RFC-0004 §6.1）：isError:true，便于模型自愈 */
export function toolError(code, message, extra = {}) {
  const payload = { code, message, retryable: false, ...extra };
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError: true };
}

function requiredString(args, field) {
  if (typeof args?.[field] !== 'string' || !args[field].trim()) throw new TypeError(`${field} must be a non-empty string`);
  return args[field].trim();
}

export function createMcpHandler({ rootDir, config }) {
  const taskFor = taskId => resolveTask(rootDir, config, taskId, { allowTerminal: false });
  const registry = () => {
    const value = loadStandards({ rootDir, config });
    if (value.errors.length > 0) throw new TypeError(value.errors.join('; '));
    return value.standards;
  };
  const calls = {
    get_project_context(args) {
      const task = taskFor(args.taskId);
      return buildContextPack({ rootDir, config, task, refresh: args.refresh === true });
    },
    start_task(args) {
      return startTask({ rootDir, config, title: requiredString(args, 'title'), declaredRisk: args.risk, goals: args.goals || [], allow: args.allow || [] });
    },
    resume_task(args) {
      return resumeTask({ rootDir, config, task: taskFor(args.taskId), note: args.note || 'resumed through MCP' });
    },
    get_applicable_standards(args) {
      const files = Array.isArray(args.files) ? args.files : getChangedFiles(rootDir, 'HEAD').files;
      return { files, standards: selectStandards(registry(), files) };
    },
    get_change_plan(args) {
      const task = taskFor(args.taskId);
      return { taskId: task.id, risk: task.risk, changePlan: task.changePlan };
    },
    risk_check(args) {
      const task = taskFor(args.taskId);
      const base = args.base || task.baseHead || 'HEAD';
      const changed = getChangedFiles(rootDir, base);
      const diff = getDiff(rootDir, base, { unified: 0 });
      const errors = [...changed.errors, ...diff.errors];
      if (errors.length > 0) throw new TypeError(errors.join('; '));
      const reassessed = assessRisk({ task: task.title, files: changed.files, diff: diff.diff, config });
      const risk = mergeRisk(task.risk, reassessed, { override: args.override, reason: args.reason });
      saveTask(rootDir, config, { ...task, risk, riskLevel: risk.level });
      return risk;
    },
    record_decision(args) {
      const task = taskFor(args.taskId);
      return recordDecision({ rootDir, config, taskId: task.id, title: requiredString(args, 'title'), decision: requiredString(args, 'decision'), reason: requiredString(args, 'reason') });
    },
    record_evidence(args) {
      const task = taskFor(args.taskId);
      return recordEvidence({ rootDir, config, task, evidenceType: requiredString(args, 'type'), summary: requiredString(args, 'summary'), files: args.file ? [args.file] : [], metadata: { source: 'mcp' } });
    },
    review_diff(args) {
      const task = taskFor(args.taskId);
      const base = args.base || task.baseHead || 'HEAD';
      const standards = registry();
      const core = reviewDiff({ rootDir, config, base, plan: task, standards });
      const domains = reviewDomainSupervisors({ rootDir, config, base, standards, domains: args.domains || null });
      if (core.errors.length > 0 || domains.errors.length > 0) throw new TypeError([...core.errors, ...domains.errors].join('; '));
      const findings = [...new Map([...core.report.findings, ...domains.report.findings].map(item => [item.id, item])).values()];
      const updated = saveTask(rootDir, config, { ...task, findings });
      return { taskId: updated.id, findings, blocking: findings.filter(item => item.blocking).length, core: core.report.summary, domains: domains.report.byDomain };
    },
    finish_task(args) {
      const task = taskFor(args.taskId);
      const verification = verifyTaskEvidence({ rootDir, config, task });
      return finishVerifiedTask({ rootDir, config, task, verification });
    },
    generate_standards() {
      const report = buildGapReport({ rootDir, config });
      return { summary: report.summary, gaps: report.gaps.map(g => ({ category: g.category, label: g.label, total: g.total })), sources: report.sources, errors: report.errors };
    },
    generate_skill(args) {
      const result = createSkill({ rootDir, config, domain: requiredString(args, 'domain'), title: args.title });
      return result;
    },
    async generate_docs(args) {
      const asset = requiredString(args, 'asset');
      const result = await createDocsDraft({ rootDir, config, asset, base: args.base || 'origin/main', write: args.write === true });
      return { asset: result.asset, draftPath: result.draftPath, changed: result.changed, wrote: result.wrote, targetExists: result.targetExists };
    },
    async gate_create(args) {
      const taskDesc = requiredString(args, 'task');
      const { taskType, detectedVia } = detectTaskType({ taskDesc, explicitType: args.type || null });
      if (!taskType) return toolError('USAGE', `cannot detect task type for: ${taskDesc}`, { hint: 'use a 新增：/修复：/重构： prefix or pass type explicitly' });
      const created = await createGate({ rootDir, config, taskDesc, taskType, taskId: args.taskId || null, lite: args.lite === true });
      if (!created.ok) {
        if (created.code === 'PLUGIN_ERRORS') return toolError('PLUGIN_ERRORS', created.errors.join('; '));
        if (created.code === 'NOT_GIT') return toolError('NOT_GIT', 'gate requires a Git repository', { hint: 'run inside a git work tree or point --root at one' });
        if (created.code === 'NO_ACTIVE_TASK') return toolError('NO_ACTIVE_TASK', 'every new gate must be bound to a task (INV-03)', { nextAction: 'start_task' });
        return toolError('INTERNAL', `gate_create failed: ${created.code}`);
      }
      const snapshot = gateStatusSnapshot({ rootDir, config });
      return content({
        gateId: created.gateId,
        taskId: created.taskId,
        taskType,
        detectedVia,
        branch: created.branch,
        head: created.head,
        phase: snapshot.ok ? snapshot.phase : 'preparation',
        checks: created.checks.map(c => ({ id: c.id, phase: c.phase || 'preparation' })),
        remainingPreparation: snapshot.ok ? snapshot.remainingPreparation : created.checks.filter(c => (c.phase || 'preparation') === 'preparation').map(c => c.id),
      });
    },
    gate_status(args) {
      const snapshot = gateStatusSnapshot({ rootDir, config });
      if (!snapshot.ok) {
        if (snapshot.code === 'NO_GATES_DIR') return toolError('NO_GATES_DIR', 'no gates directory yet', { nextAction: 'gate_create' });
        return toolError('NO_ACTIVE_GATES', 'no active gates', { nextAction: 'gate_create' });
      }
      if (args.gateId && args.gateId !== snapshot.gateState.id) {
        return toolError('NOT_FOUND', `only the latest gate is addressable (latest: ${snapshot.gateState.id})`, { hint: 'omit gateId to read the latest gate' });
      }
      return content({
        gateId: snapshot.gateState.id,
        taskId: snapshot.gateState.taskId || null,
        taskType: snapshot.gateState.taskType,
        phase: snapshot.phase,
        valid: snapshot.valid,
        expired: snapshot.expired,
        hoursAgo: snapshot.hoursAgo,
        maxAge: snapshot.maxAge,
        remainingCount: snapshot.remainingCount,
        remainingPreparation: snapshot.remainingPreparation,
        remainingVerification: snapshot.remainingVerification,
        checks: snapshot.gateState.checks.map(c => ({ id: c.id, phase: c.phase, status: c.status })),
      });
    },
    gate_clear(args) {
      const checkId = requiredString(args, 'checkId');
      if (HUMAN_WAIT_CHECKS.has(checkId)) {
        return toolError('HUMAN_CONFIRMATION_REQUIRED', `${checkId} is a human-WAIT check and cannot be cleared through MCP (RFC-0004 D5)`, { hint: 'ask the human to clear it via the CLI: harness gate:clear --gate <id> --clear ' + checkId });
      }
      const latest = loadLatestGate({ rootDir, config });
      if (!latest.ok) return toolError('GATE_NOT_FOUND', 'no gate file found', { nextAction: 'gate_create' });
      if (args.gateId && args.gateId !== latest.gateState.id) {
        return toolError('GATE_NOT_FOUND', `only the latest gate is addressable (latest: ${latest.gateState.id})`);
      }
      const result = clearGateCheck({ rootDir, config, gateId: latest.gateState.id, checkId, note: args.note || 'cleared through MCP' });
      if (!result.ok) {
        if (result.code === 'UNKNOWN_CHECK') return toolError('UNKNOWN_CHECK', `unknown check: ${checkId}`, { available: result.available });
        if (result.code === 'EVIDENCE_CONTROLLED') return toolError('EVIDENCE_CONTROLLED', 'verify-test is evidence-controlled (INV-03)', { nextAction: `evidence verify --task ${result.taskId} --gate ${result.gateId}` });
        if (result.code === 'TASKLESS_EVIDENCE_GUARD') return toolError('TASKLESS_EVIDENCE_GUARD', 'a taskless gate cannot clear verification manually', { hint: 'bind the gate to a task (INV-03)' });
        if (result.code === 'MACHINE_CHECK_FAILED') return toolError('MACHINE_CHECK_FAILED', `${checkId}: ${result.reason}`, { nextAction: 'design:check' });
        return toolError('NOT_FOUND', `gate check clear failed: ${result.code}`);
      }
      return content({ cleared: true, checkId, done: result.doneCount, total: result.totalCount, state: result.state, remainingIds: result.remainingIds });
    },
    async run_verifier(args) {
      const verifierId = requiredString(args, 'verifierId');
      const taskId = args.taskId || await autoDiscoverTask(rootDir, config);
      if (!taskId) return toolError('NO_ACTIVE_TASK', 'no active task to attach verifier evidence to', { nextAction: 'start_task' });
      const task = taskFor(taskId);
      try {
        const evidence = runVerifier({ rootDir, config, task, verifierId });
        return content({ verifierId, evidenceId: evidence.id, success: evidence.success, exitCode: evidence.exitCode, summary: evidence.summary });
      } catch (error) {
        if (/Unknown verifier/.test(error.message)) {
          return toolError('VERIFIER_NOT_FOUND', error.message, { available: listVerifiers(config).map(v => v.id) });
        }
        return toolError('VERIFIER_FAILED', error.message);
      }
    },
    get_next_action() {
      return content(nextAction({ rootDir, config }));
    },
    async get_task(args) {
      const taskId = args.taskId || await autoDiscoverTask(rootDir, config);
      if (!taskId) return toolError('TASK_NOT_FOUND', 'no active task found', { hint: 'pass taskId or call start_task first' });
      let task = null;
      try { task = loadTask(rootDir, config, taskId); } catch { task = null; }
      if (!task) return toolError('TASK_NOT_FOUND', `task not found: ${taskId}`);
      return content(task);
    },
    list_tasks(args) {
      let tasks = listTasks(rootDir, config);
      if (args.status) tasks = tasks.filter(t => t.status === args.status);
      tasks.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
      const limit = Number.isFinite(args.limit) ? Number(args.limit) : (args.all === true ? 0 : (config.output?.taskListDefaultLimit ?? 20));
      const limited = limit > 0 ? tasks.slice(0, limit) : tasks;
      return content({
        count: limited.length,
        total: tasks.length,
        tasks: limited.map(t => ({ id: t.id, title: t.title, status: t.status, riskLevel: t.riskLevel, updatedAt: t.updatedAt || t.createdAt })),
      });
    },
  };

  return async request => {
    if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') throw new TypeError('Invalid JSON-RPC request');
    if (request.method === 'initialize') return { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: { name: getHarnessName(), version: getHarnessVersion() } };
    if (request.method === 'ping') return {};
    if (request.method === 'notifications/initialized') return null;
    if (request.method === 'tools/list') return { tools: MCP_TOOLS };
    if (request.method === 'tools/call') {
      const name = request.params?.name;
      const fn = calls[name];
      if (!fn) throw Object.assign(new TypeError(`Unknown MCP tool: ${name}`), { code: -32601 });
      const result = await fn(request.params?.arguments || {});
      // 已是 tool result（含 content / isError 信封）则原样返回；否则按值包装
      if (result && typeof result === 'object' && Array.isArray(result.content)) return result;
      return content(result);
    }
    throw Object.assign(new TypeError(`Unknown MCP method: ${request.method}`), { code: -32601 });
  };
}

export function runMcpStdio({ rootDir, config, input = process.stdin, output = process.stdout, error = process.stderr, rootSource = 'explicit' }) {
  let activeRoot = rootDir;
  let activeConfig = config;
  let handler = createMcpHandler({ rootDir: activeRoot, config: activeConfig });
  let clientRootsCapable = false;
  let ready = Promise.resolve();
  const pendingServerRequests = new Map();
  let serverRequestSeq = 0;

  // RFC-0004 Phase 1：客户端声明 roots 且未显式指定 root 时发起协商；
  // 单根生效 → 重载 config + 重建 handler；任何异常静默回退原 root。
  async function negotiateRoots() {
    if (rootSource === 'explicit' || !clientRootsCapable) return;
    const id = `srv-roots-${++serverRequestSeq}`;
    const responsePromise = new Promise(resolve => pendingServerRequests.set(id, resolve));
    output.write(`${JSON.stringify({ jsonrpc: '2.0', id, method: 'roots/list' })}\n`);
    const timedOut = new Promise(resolve => setTimeout(() => resolve(null), 2000));
    const response = await Promise.race([responsePromise, timedOut]);
    pendingServerRequests.delete(id);
    const roots = response?.result?.roots;
    if (!Array.isArray(roots) || roots.length !== 1 || typeof roots[0]?.uri !== 'string') return;
    try {
      const candidate = fileURLToPath(roots[0].uri);
      if (!existsSync(candidate)) return;
      const { loadConfig } = await import('./config-loader.mjs');
      const loaded = await loadConfig({ rootDir: candidate });
      activeRoot = candidate;
      activeConfig = loaded.config;
      handler = createMcpHandler({ rootDir: activeRoot, config: activeConfig });
    } catch {
      // 协商失败回退 cwd 链解析结果
    }
  }

  const lines = createInterface({ input, crlfDelay: Infinity });
  lines.on('line', async line => {
    if (!line.trim()) return;
    let request;
    try {
      request = JSON.parse(line);
      // 服务器发起请求（roots/list）的响应：无 method 且 id 命中 pending
      if (request && request.method === undefined && request.id !== undefined && pendingServerRequests.has(request.id)) {
        pendingServerRequests.get(request.id)(request);
        return;
      }
      if (request?.method === 'initialize') {
        clientRootsCapable = Boolean(request?.params?.capabilities?.roots);
      }
      if (request?.method === 'notifications/initialized') {
        ready = negotiateRoots();
      }
      await ready;
      const result = await handler(request);
      if (request.id !== undefined && result !== null) output.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result })}\n`);
    } catch (cause) {
      const code = cause.code || (request ? -32603 : -32700);
      if (request?.id !== undefined) output.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code, message: cause.message } })}\n`);
      else error.write(`[harness:mcp] ${cause.message}\n`);
    }
  });
}
