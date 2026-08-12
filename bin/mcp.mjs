import { createInterface } from 'node:readline';
import { buildContextPack, recordDecision } from './project-brain.mjs';
import { assessRisk, mergeRisk } from './risk-engine.mjs';
import { finishVerifiedTask, resumeTask, startTask } from './task-orchestrator.mjs';
import { recordEvidence, verifyTaskEvidence } from './evidence.mjs';
import { getChangedFiles, getDiff } from './git-files.mjs';
import { loadStandards, selectStandards } from './standards.mjs';
import { reviewDiff } from './supervisor.mjs';
import { reviewDomainSupervisors } from './domain-supervisors.mjs';
import { resolveTask, saveTask } from './state-store.mjs';
import { buildGapReport } from './standards-gen.mjs';
import { createSkill } from './skill.mjs';
import { createDocsDraft } from './docs-gen.mjs';

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
]);

function content(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: value };
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
  };

  return async request => {
    if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') throw new TypeError('Invalid JSON-RPC request');
    if (request.method === 'initialize') return { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'pallastrade-harness', version: '1.0.0' } };
    if (request.method === 'ping') return {};
    if (request.method === 'notifications/initialized') return null;
    if (request.method === 'tools/list') return { tools: MCP_TOOLS };
    if (request.method === 'tools/call') {
      const name = request.params?.name;
      const fn = calls[name];
      if (!fn) throw Object.assign(new TypeError(`Unknown MCP tool: ${name}`), { code: -32601 });
      return content(await fn(request.params?.arguments || {}));
    }
    throw Object.assign(new TypeError(`Unknown MCP method: ${request.method}`), { code: -32601 });
  };
}

export function runMcpStdio({ rootDir, config, input = process.stdin, output = process.stdout, error = process.stderr }) {
  const handler = createMcpHandler({ rootDir, config });
  const lines = createInterface({ input, crlfDelay: Infinity });
  lines.on('line', async line => {
    if (!line.trim()) return;
    let request;
    try {
      request = JSON.parse(line);
      const result = await handler(request);
      if (request.id !== undefined && result !== null) output.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result })}\n`);
    } catch (cause) {
      const code = cause.code || (request ? -32603 : -32700);
      if (request?.id !== undefined) output.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code, message: cause.message } })}\n`);
      else error.write(`[harness:mcp] ${cause.message}\n`);
    }
  });
}
