/**
 * command-registry.mjs — 命令注册表（RFC-0004 §3，Phase 0）
 *
 * 单一事实源：CLI 与 MCP 共用命令元数据。本阶段登记生命周期核心命令 +
 * 冻结点名清单（RFC-0004 附录 C），并提供契约校验；工具面派生在 Phase 1 接入。
 *
 * 字段约定：
 *   - id           命令标识（domain:action 或单词）
 *   - domain       域（gate/task/evidence/...）
 *   - writeClass   写分类：none / governance / artifact / ops（RFC-0004 §5.1）
 *   - dryRunDefault 产物类默认 dry-run（artifact 必填）
 *   - mcp          { exposure: full|readonly|excluded|deferred, tier, tool, action }
 *   - output       { json, structured } 输出契约
 *   - adapter      'direct'（模块数据函数）| 'cli-bridge'（--json CLI 桥接）| 'none'
 *   - handler      { module, export }，adapter=direct 时必填
 */

export const WRITE_CLASSES = Object.freeze(['none', 'governance', 'artifact', 'ops']);
export const MCP_EXPOSURES = Object.freeze(['full', 'readonly', 'excluded', 'deferred']);
export const MCP_TIERS = Object.freeze(['L1', 'L2']);
export const OUTPUT_ENVELOPE_VERSION = '1.0';

/** RFC-0004 附录 C：冻结的 MCP 工具名（发布后即公共契约，只增不改） */
export const FROZEN_MCP_TOOLS = Object.freeze({
  existingL1: Object.freeze([
    'get_project_context', 'start_task', 'resume_task', 'get_applicable_standards',
    'get_change_plan', 'risk_check', 'record_decision', 'record_evidence',
    'review_diff', 'finish_task', 'generate_standards', 'generate_skill', 'generate_docs',
  ]),
  newL1: Object.freeze([
    'gate_create', 'gate_status', 'gate_clear', 'run_verifier',
    'get_next_action', 'get_task', 'list_tasks',
  ]),
  l2: Object.freeze([
    'harness_task', 'harness_brain', 'harness_prd', 'harness_design',
    'harness_evidence', 'harness_recovery', 'harness_knowledge', 'harness_standards',
    'harness_skill', 'harness_supervise', 'harness_quality', 'harness_audit',
    'harness_governance', 'harness_adapter', 'harness_report', 'harness_eval',
  ]),
});

export const FROZEN_MCP_TOOL_NAMES = Object.freeze([
  ...FROZEN_MCP_TOOLS.existingL1,
  ...FROZEN_MCP_TOOLS.newL1,
  ...FROZEN_MCP_TOOLS.l2,
]);

/** 生命周期核心命令登记（Phase 0） */
export const COMMAND_DEFINITIONS = Object.freeze([
  // ── brain ──────────────────────────────────────────────────────
  { id: 'brain:context', domain: 'brain', summary: 'Build the minimum project context pack for a task', cli: { args: ['--task', '--refresh'] }, writeClass: 'none', dryRunDefault: false, mcp: { exposure: 'full', tier: 'L1', tool: 'get_project_context' }, output: { json: true, structured: true }, adapter: 'direct', handler: { module: './project-brain.mjs', export: 'buildContextPack' } },
  { id: 'brain:query', domain: 'brain', summary: 'Query the project knowledge index', cli: { args: ['--query', '--top', '--json'] }, writeClass: 'none', dryRunDefault: false, mcp: { exposure: 'full', tier: 'L2', tool: 'harness_brain', action: 'query' }, output: { json: true, structured: true }, adapter: 'cli-bridge' },
  { id: 'brain:decision', domain: 'brain', summary: 'Record an architectural or implementation decision', cli: { args: ['--task', '--title', '--decision', '--reason'] }, writeClass: 'governance', dryRunDefault: false, mcp: { exposure: 'full', tier: 'L1', tool: 'record_decision' }, output: { json: true, structured: true }, adapter: 'direct', handler: { module: './project-brain.mjs', export: 'recordDecision' } },

  // ── task ───────────────────────────────────────────────────────
  { id: 'task:start', domain: 'task', summary: 'Start a persistent governed task', cli: { args: ['--title', '--risk', '--goals', '--allow', '--deny', '--ac'] }, writeClass: 'governance', dryRunDefault: false, mcp: { exposure: 'full', tier: 'L1', tool: 'start_task' }, output: { json: true, structured: true }, adapter: 'direct', handler: { module: './task-orchestrator.mjs', export: 'startTask' } },
  { id: 'task:resume', domain: 'task', summary: 'Resume a paused or blocked task', cli: { args: ['--task', '--note'] }, writeClass: 'governance', dryRunDefault: false, mcp: { exposure: 'full', tier: 'L1', tool: 'resume_task' }, output: { json: true, structured: true }, adapter: 'direct', handler: { module: './task-orchestrator.mjs', export: 'resumeTask' } },
  { id: 'task:finish', domain: 'task', summary: 'Finish a task only when fresh evidence satisfies its policy', cli: { args: ['--task'] }, writeClass: 'governance', dryRunDefault: false, mcp: { exposure: 'full', tier: 'L1', tool: 'finish_task' }, output: { json: true, structured: true }, adapter: 'direct', handler: { module: './task-orchestrator.mjs', export: 'finishVerifiedTask' } },
  { id: 'task:status', domain: 'task', summary: 'Read one task with its risk, plan and evidence state', cli: { args: ['--task', '--json'] }, writeClass: 'none', dryRunDefault: false, mcp: { exposure: 'full', tier: 'L1', tool: 'get_task' }, output: { json: true, structured: true }, adapter: 'cli-bridge' },
  { id: 'task:list', domain: 'task', summary: 'List tasks (default-capped, filterable)', cli: { args: ['--all', '--status', '--json'] }, writeClass: 'none', dryRunDefault: false, mcp: { exposure: 'full', tier: 'L1', tool: 'list_tasks' }, output: { json: true, structured: true }, adapter: 'cli-bridge' },
  { id: 'task:change-plan', domain: 'task', summary: 'Read the task Change Plan (scope/standards/evidence)', cli: { args: ['--task'] }, writeClass: 'none', dryRunDefault: false, mcp: { exposure: 'full', tier: 'L1', tool: 'get_change_plan' }, output: { json: true, structured: true }, adapter: 'direct', handler: { module: './state-store.mjs', export: 'resolveTask' } },
  { id: 'task:checkpoint', domain: 'task', summary: 'Create a task checkpoint', cli: { args: ['--task', '--summary', '--next'] }, writeClass: 'governance', dryRunDefault: false, mcp: { exposure: 'full', tier: 'L2', tool: 'harness_task', action: 'checkpoint' }, output: { json: true, structured: true }, adapter: 'direct', handler: { module: './task-orchestrator.mjs', export: 'createCheckpoint' } },
  { id: 'task:handoff', domain: 'task', summary: 'Build a cross-agent handoff package', cli: { args: ['--task'] }, writeClass: 'none', dryRunDefault: false, mcp: { exposure: 'full', tier: 'L2', tool: 'harness_task', action: 'handoff' }, output: { json: true, structured: true }, adapter: 'direct', handler: { module: './task-orchestrator.mjs', export: 'buildHandoff' } },

  // ── gate ───────────────────────────────────────────────────────
  { id: 'gate:create', domain: 'gate', summary: 'Create a phased task gate (preparation must clear before implementation)', cli: { args: ['--task', '--type', '--task-id', '--lite', '--quiet'] }, writeClass: 'governance', dryRunDefault: false, mcp: { exposure: 'full', tier: 'L1', tool: 'gate_create' }, output: { json: false, structured: true }, adapter: 'direct', handler: { module: './gate-commands.mjs', export: 'createGate' } },
  { id: 'gate:status', domain: 'gate', summary: 'Read the active gate phase, remaining checks and expiry', cli: { args: ['--short'] }, writeClass: 'none', dryRunDefault: false, mcp: { exposure: 'full', tier: 'L1', tool: 'gate_status' }, output: { json: false, structured: true }, adapter: 'direct', handler: { module: './gate-commands.mjs', export: 'gateStatusSnapshot' } },
  { id: 'gate:clear', domain: 'gate', summary: 'Clear one gate check (machine-verified where applicable)', cli: { args: ['--gate', '--clear', '--note'] }, writeClass: 'governance', dryRunDefault: false, mcp: { exposure: 'full', tier: 'L1', tool: 'gate_clear' }, output: { json: false, structured: true }, adapter: 'direct', handler: { module: './gate-commands.mjs', export: 'clearGateCheck' } },
  { id: 'gate:required', domain: 'gate', summary: 'Pre-commit/CI enforcement: fail without a cleared fresh gate', cli: { args: [] }, writeClass: 'none', dryRunDefault: false, mcp: { exposure: 'excluded' }, output: { json: false, structured: false }, adapter: 'none' },
  { id: 'gate:migrate', domain: 'gate', summary: 'Migrate legacy gates to the phased lifecycle', cli: { args: ['--dry-run'] }, writeClass: 'ops', dryRunDefault: true, mcp: { exposure: 'excluded' }, output: { json: false, structured: false }, adapter: 'none' },
  { id: 'gate:clean', domain: 'gate', summary: 'Prune expired cleared gates', cli: { args: ['--days'] }, writeClass: 'ops', dryRunDefault: false, mcp: { exposure: 'excluded' }, output: { json: false, structured: false }, adapter: 'none' },

  // ── risk / evidence / verify ───────────────────────────────────
  { id: 'risk:check', domain: 'risk', summary: 'Reassess risk from the current diff (auto-escalate only)', cli: { args: ['--task', '--base', '--override', '--reason', '--json'] }, writeClass: 'governance', dryRunDefault: false, mcp: { exposure: 'full', tier: 'L1', tool: 'risk_check' }, output: { json: true, structured: true }, adapter: 'cli-bridge' },
  { id: 'evidence:record', domain: 'evidence', summary: 'Record typed non-command evidence', cli: { args: ['--task', '--type', '--summary', '--file', '--approve'] }, writeClass: 'governance', dryRunDefault: false, mcp: { exposure: 'full', tier: 'L1', tool: 'record_evidence' }, output: { json: true, structured: true }, adapter: 'direct', handler: { module: './evidence.mjs', export: 'recordEvidence' } },
  { id: 'evidence:list', domain: 'evidence', summary: 'List evidence for a task', cli: { args: ['--task', '--json'] }, writeClass: 'none', dryRunDefault: false, mcp: { exposure: 'full', tier: 'L2', tool: 'harness_evidence', action: 'list' }, output: { json: true, structured: true }, adapter: 'direct', handler: { module: './evidence.mjs', export: 'listEvidence' } },
  { id: 'evidence:verify', domain: 'evidence', summary: 'Verify evidence freshness and gate satisfaction', cli: { args: ['--task', '--gate'] }, writeClass: 'none', dryRunDefault: false, mcp: { exposure: 'full', tier: 'L2', tool: 'harness_evidence', action: 'verify' }, output: { json: true, structured: true }, adapter: 'direct', handler: { module: './evidence.mjs', export: 'verifyTaskEvidence' } },
  { id: 'verify:run', domain: 'verify', summary: 'Run a registered verifier and record typed evidence', cli: { args: ['--task', '--json'] }, writeClass: 'governance', dryRunDefault: false, mcp: { exposure: 'full', tier: 'L1', tool: 'run_verifier' }, output: { json: false, structured: true }, adapter: 'direct', handler: { module: './evidence.mjs', export: 'runEvidenceCommand' } },

  // ── guide / standards / supervise / skill / docs / prd ─────────
  { id: 'guide:next', domain: 'guide', summary: 'Report the stable next action for the current task/gate state', cli: { args: ['--json'] }, writeClass: 'none', dryRunDefault: false, mcp: { exposure: 'full', tier: 'L1', tool: 'get_next_action' }, output: { json: true, structured: true }, adapter: 'direct', handler: { module: './guide.mjs', export: 'nextAction' } },
  { id: 'standards:select', domain: 'standards', summary: 'Select applicable standards for files/diff', cli: { args: ['--base', '--files', '--json'] }, writeClass: 'none', dryRunDefault: false, mcp: { exposure: 'full', tier: 'L1', tool: 'get_applicable_standards' }, output: { json: true, structured: true }, adapter: 'direct', handler: { module: './standards.mjs', export: 'selectStandards' } },
  { id: 'standards:coverage', domain: 'standards', summary: 'Machine-enforced / review / documented coverage report', cli: { args: ['--json'] }, writeClass: 'none', dryRunDefault: false, mcp: { exposure: 'full', tier: 'L2', tool: 'harness_standards', action: 'coverage' }, output: { json: true, structured: true }, adapter: 'cli-bridge' },
  { id: 'standards:gap', domain: 'standards', summary: 'Auto-Standards gap report (no file writes)', cli: { args: [] }, writeClass: 'none', dryRunDefault: false, mcp: { exposure: 'full', tier: 'L1', tool: 'generate_standards' }, output: { json: true, structured: true }, adapter: 'direct', handler: { module: './standards-gen.mjs', export: 'buildGapReport' } },
  { id: 'supervise:diff', domain: 'supervise', summary: 'Review changed code against scope and domain standards', cli: { args: ['--task', '--base', '--domains'] }, writeClass: 'governance', dryRunDefault: false, mcp: { exposure: 'full', tier: 'L1', tool: 'review_diff' }, output: { json: true, structured: true }, adapter: 'direct', handler: { module: './supervisor.mjs', export: 'reviewDiff' } },
  { id: 'skill:new', domain: 'skill', summary: 'Create a domain Skill skeleton and register it in indexes', cli: { args: ['--domain', '--title'] }, writeClass: 'artifact', dryRunDefault: false, exceptionNote: 'D1：保持兼容直接写盘，2.0 改默认 dry-run', mcp: { exposure: 'full', tier: 'L1', tool: 'generate_skill' }, output: { json: true, structured: true }, adapter: 'direct', handler: { module: './skill.mjs', export: 'createSkill' } },
  { id: 'docs:generate', domain: 'docs', summary: 'Create a knowledge doc drafting pack (dry-run unless --write)', cli: { args: ['--asset', '--base', '--write'] }, writeClass: 'artifact', dryRunDefault: true, mcp: { exposure: 'full', tier: 'L1', tool: 'generate_docs' }, output: { json: true, structured: true }, adapter: 'direct', handler: { module: './docs-gen.mjs', export: 'createDocsDraft' } },
  { id: 'prd:new', domain: 'prd', summary: 'Create a PRD skeleton (inline logic; extraction pending)', cli: { args: ['--title', '--force'] }, writeClass: 'artifact', dryRunDefault: false, exceptionNote: 'D4：单文件新建、可 git 回滚 → 直接执行；待 Phase 2 提取模块函数', mcp: { exposure: 'deferred', tier: 'L2', tool: 'harness_prd', action: 'new' }, output: { json: false, structured: false }, adapter: 'none' },

  // ── audit / adapter / ops / ui ─────────────────────────────────
  { id: 'scan:asset', domain: 'audit', summary: 'Asset governance scan (skills/standards/agent/PRD/索引)', cli: { args: ['--fix', '--check', '--json', '--category'] }, writeClass: 'none', dryRunDefault: false, mcp: { exposure: 'full', tier: 'L2', tool: 'harness_audit', action: 'scan' }, output: { json: true, structured: true }, adapter: 'cli-bridge' },
  { id: 'adapter:register', domain: 'adapter', summary: 'Register an agent adapter with honest capability report', cli: { args: ['--id', '--capabilities', '--from'] }, writeClass: 'governance', dryRunDefault: false, mcp: { exposure: 'full', tier: 'L2', tool: 'harness_adapter', action: 'register' }, output: { json: true, structured: true }, adapter: 'direct', handler: { module: './capability-registry.mjs', export: 'registerCapability' } },
  { id: 'config:migrate', domain: 'ops', summary: 'Migrate harness.config to the current schema', cli: { args: ['--write'] }, writeClass: 'ops', dryRunDefault: true, mcp: { exposure: 'excluded' }, output: { json: false, structured: false }, adapter: 'none' },
  { id: 'state:migrate', domain: 'ops', summary: 'Migrate local state files', cli: { args: ['--write'] }, writeClass: 'ops', dryRunDefault: true, mcp: { exposure: 'excluded' }, output: { json: false, structured: false }, adapter: 'none' },
  { id: 'cache:clean', domain: 'ops', summary: 'Remove the local cache directory', cli: { args: [] }, writeClass: 'ops', dryRunDefault: false, mcp: { exposure: 'excluded' }, output: { json: false, structured: false }, adapter: 'none' },
  { id: 'tui', domain: 'ui', summary: 'Interactive terminal dashboard', cli: { args: ['--json', '--watch'] }, writeClass: 'none', dryRunDefault: false, mcp: { exposure: 'excluded' }, output: { json: true, structured: false }, adapter: 'none' },
]);

const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

function validateIdentity(def) {
  const errors = [];
  if (typeof def.id !== 'string' || !/^[a-z][a-z0-9:-]*$/.test(def.id)) errors.push('id must be lowercase (domain:action)');
  if (typeof def.domain !== 'string' || !def.domain.trim()) errors.push('domain must be a non-empty string');
  if (typeof def.summary !== 'string' || !def.summary.trim()) errors.push('summary must be a non-empty string');
  return errors;
}

function validateWritePolicy(def) {
  const errors = [];
  if (!WRITE_CLASSES.includes(def.writeClass)) errors.push(`writeClass must be one of: ${WRITE_CLASSES.join(', ')}`);
  if (def.writeClass === 'artifact' && typeof def.dryRunDefault !== 'boolean') errors.push('artifact commands must declare dryRunDefault (boolean)');
  if (def.writeClass === 'ops' && def.mcp?.exposure !== 'excluded') errors.push('ops commands must default to excluded (RFC-0004 §4.4)');
  return errors;
}

function validateTier(mcp) {
  return MCP_TIERS.includes(mcp.tier) ? [] : ['exposed commands must declare mcp.tier (L1|L2)'];
}

function validateToolName(mcp) {
  if (typeof mcp.tool !== 'string' || !TOOL_NAME_PATTERN.test(mcp.tool)) return ['exposed commands must declare a snake_case mcp.tool'];
  const errors = [];
  if (mcp.tool.length > 40) errors.push('mcp.tool must be <= 40 characters');
  if (!FROZEN_MCP_TOOL_NAMES.includes(mcp.tool)) errors.push(`mcp.tool ${mcp.tool} is not in the frozen tool list (RFC-0004 appendix C)`);
  if (mcp.tier === 'L1' && mcp.tool.startsWith('harness_')) errors.push('L1 tools must not use the harness_ prefix');
  if (mcp.tier === 'L2' && !mcp.tool.startsWith('harness_')) errors.push('L2 tools must use the harness_ prefix');
  return errors;
}

function validateMcpAction(mcp) {
  if (mcp.tier !== 'L2') return [];
  return /^[a-z][a-z0-9_]*$/.test(mcp.action || '') ? [] : ['L2 commands must declare a snake_case mcp.action'];
}

function validateMcpPolicy(mcp, exposed) {
  if (!MCP_EXPOSURES.includes(mcp.exposure)) return [`mcp.exposure must be one of: ${MCP_EXPOSURES.join(', ')}`];
  if (!exposed) return [];
  return [...validateTier(mcp), ...validateToolName(mcp), ...validateMcpAction(mcp)];
}

function validateHandlerContract(def, errors) {
  const handler = def.handler || {};
  if (typeof handler.module !== 'string' || !handler.module.startsWith('./')) errors.push('direct adapter requires handler.module (relative module path)');
  if (typeof handler.export !== 'string' || !handler.export.trim()) errors.push('direct adapter requires handler.export');
  return errors;
}

function validateExcludedContract(def, mcp) {
  const errors = [];
  if (def.adapter !== 'none') errors.push('excluded commands must use adapter none');
  if (mcp.tool) errors.push('excluded commands must not declare mcp.tool');
  return errors;
}

function validateDeferredContract(def, mcp) {
  const errors = [];
  if (def.adapter !== 'none') errors.push('deferred commands must use adapter none (extraction pending)');
  if (mcp.tool && !FROZEN_MCP_TOOL_NAMES.includes(mcp.tool)) errors.push(`mcp.tool ${mcp.tool} is not in the frozen tool list (RFC-0004 appendix C)`);
  return errors;
}

function validateExposedContract(def) {
  const output = def.output || {};
  const errors = [];
  if (output.json !== true && output.structured !== true) errors.push('exposed commands must produce json or structured output');
  if (def.adapter === 'direct') return validateHandlerContract(def, errors);
  if (def.adapter !== 'cli-bridge') return [...errors, 'exposed commands must use adapter direct|cli-bridge'];
  if (output.json !== true) errors.push('cli-bridge adapter requires output.json=true');
  return errors;
}

function validateAdapterContract(def, mcp) {
  if (mcp.exposure === 'excluded') return validateExcludedContract(def, mcp);
  if (mcp.exposure === 'deferred') return validateDeferredContract(def, mcp);
  return validateExposedContract(def);
}

/** 校验单条定义，返回错误信息数组（空数组 = 通过） */
export function validateCommandDefinition(def) {
  if (!def || typeof def !== 'object') return ['definition must be an object'];
  const mcp = def.mcp || {};
  const exposed = mcp.exposure === 'full' || mcp.exposure === 'readonly';
  return [
    ...validateIdentity(def),
    ...validateWritePolicy(def),
    ...validateMcpPolicy(mcp, exposed),
    ...validateAdapterContract(def, mcp),
  ];
}

/** 校验整份注册表（默认全量），返回错误信息数组 */
export function validateCommandDefinitions(defs = COMMAND_DEFINITIONS) {
  const errors = [];
  const ids = new Set();
  const toolActions = new Set();
  for (const def of defs) {
    for (const error of validateCommandDefinition(def)) errors.push(`${def?.id || '<unknown>'}: ${error}`);
    if (ids.has(def.id)) errors.push(`${def.id}: duplicate command id`);
    ids.add(def.id);
    const tool = def.mcp?.tool;
    if (tool) {
      // L2 域工具是「一个工具 + 多 action」，唯一性按 (tool, action) 判定
      const key = `${tool}#${def.mcp?.action || ''}`;
      if (toolActions.has(key)) errors.push(`${def.id}: duplicate mcp.tool ${tool}${def.mcp?.action ? ` (action ${def.mcp.action})` : ''}`);
      toolActions.add(key);
    }
  }
  return errors;
}

export function listCommandDefinitions({ domain } = {}) {
  return COMMAND_DEFINITIONS.filter(def => !domain || def.domain === domain);
}

export function getCommandDefinition(id) {
  return COMMAND_DEFINITIONS.find(def => def.id === id) || null;
}
