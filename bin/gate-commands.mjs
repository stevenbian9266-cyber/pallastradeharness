/**
 * gate-commands.mjs — Gate 生命周期核心数据函数（RFC-0004 Phase 0）
 *
 * 从 bin/harness.mjs 内联分支提炼（gate / gate:status / gate:clear）：
 *   - 只做数据与状态决策，不做输出格式化（CLI 与 MCP 共用同一语义）
 *   - 结果以结构化对象返回：{ ok: true, ... } 或 { ok: false, code, ... }
 *   - 写盘沿用既有格式（JSON.stringify(state, null, 2)），行为与提炼前一致
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { GATE_PHASES, migrateGateState, pendingChecks, recomputeGateState } from './gate-lifecycle.mjs';
import { getGateChecks } from './config-loader.mjs';
import { loadPlugins, normalizePlugins } from './plugins.mjs';
import { MACHINE_DESIGN_CHECKS, checkDesignArtifacts } from './design-check.mjs';
import { designApprovalFiles, recordApproval, requirementApprovalFiles } from './approvals.mjs';
import { loadTask } from './state-store.mjs';

/** C11：人工确认检查项 → Approval 类型映射（兼容现有 user-confirmed / design-confirmed 机制）。 */
const HUMAN_WAIT_APPROVAL_TYPES = Object.freeze({
  'user-confirmed': 'requirement',
  'design-confirmed': 'ui',
});

/** 清理人工确认项时记录 Approval 绑定（失败不阻断清理，仅不记录）。 */
function recordHumanWaitApproval({ rootDir, config, gateState, checkId, note, now }) {
  const type = HUMAN_WAIT_APPROVAL_TYPES[checkId];
  if (!type || !gateState.taskId) return null;
  const task = loadTask(rootDir, config, gateState.taskId);
  const files = type === 'requirement'
    ? requirementApprovalFiles({ rootDir, config, task })
    : designApprovalFiles({ rootDir, config, task });
  return recordApproval({
    rootDir, config, taskId: task.id, type,
    summary: note || `${checkId} cleared`, files, now: now.toISOString(),
  });
}
/** 任务描述前缀 → 任务类型（CLI gate 自动识别） */
export const TASK_PREFIX_MAP = Object.freeze({
  '修复：': 'bugfix',   'fix:': 'bugfix',
  '优化：': 'feature',  '改进：': 'feature',
  '新增：': 'feature',  '添加：': 'feature',
  '样式：': 'style',    'style:': 'style',
  '需求：': 'feature',
  '审计：': 'audit',    'audit:': 'audit',
  '研究：': 'research', '调研：': 'research', 'research:': 'research',
  '文档：': 'docs',     'docs:': 'docs',
  '重构：': 'refactor', 'refactor:': 'refactor',
  '安全：': 'security', 'security:': 'security',
  '测试：': 'test',     'test:': 'test',
});

const CONTENT_KEYWORDS = Object.freeze({
  bugfix: ['修复', 'bug', 'fix', '错误', '报错', 'crash', '崩溃', '失败', '不行', '不能用', '缺失', '丢了'],
  feature: ['新增', '添加', '优化', '改进', '实现', '开发', '创建', 'add', 'new', 'create', 'feature', '增加', '支持'],
  style:  ['样式', 'UI', '颜色', '字体', '布局', '调整', '美化', 'style', 'color', 'font', 'layout', '对齐'],
  audit: ['审计', '审查', '盘点', 'audit', 'review', '体检'],
  research: ['研究', '调研', '评估', '分析', 'research', '探索', '方案'],
  docs: ['文档', '说明', 'docs', 'documentation', 'doc', '手册'],
  refactor: ['重构', '清理', '整理', 'refactor', 'rename', '删除'],
  security: ['安全', '漏洞', '注入', 'security', 'vuln', '密钥'],
  test: ['测试', 'test', 'spec', '用例', 'coverage'],
});

const PRD_CHECKS = new Set(['read-skill-prd', 'create-prd-doc', 'create-req-doc', 'req-doc-has-skill-table', 'user-confirmed']);

/**
 * 任务类型识别：显式 --type 优先，其次前缀，最后内容关键词。
 * @returns {{ taskType: string|null, detectedVia: '--type flag'|'前缀'|'内容关键词'|null }}
 */
export function detectTaskType({ taskDesc, explicitType = null }) {
  if (explicitType) return { taskType: explicitType, detectedVia: '--type flag' };
  const text = String(taskDesc || '');
  for (const [prefix, type] of Object.entries(TASK_PREFIX_MAP)) {
    if (text.startsWith(prefix)) return { taskType: type, detectedVia: '前缀' };
  }
  const lower = text.toLowerCase();
  for (const [type, keywords] of Object.entries(CONTENT_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return { taskType: type, detectedVia: '内容关键词' };
  }
  return { taskType: null, detectedVia: null };
}

/** 发现当前 worktree 的活动 Task（HTH-007，供 gate 绑定 INV-03） */
export async function autoDiscoverTask(rootDir, config) {
  try {
    const { listTasks, repositoryIdentity } = await import('./state-store.mjs');
    const tasks = listTasks(rootDir, config);
    const terminal = new Set(['completed', 'cancelled', 'abandoned']);
    const currentWorktree = repositoryIdentity(rootDir).worktreeId;
    const active = tasks.filter(t => !terminal.has(t.status) && (!t.worktreeId || t.worktreeId === currentWorktree));
    if (active.length === 0) return null;
    return active.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))[0].id;
  } catch {
    return null;
  }
}

/**
 * 收集 gate 检查项：layers 搜索 + 内置基础 + 配置追加 + 插件 check，含 --lite 与 requireSkillRead 过滤。
 * @returns {{ ok: true, checks: object[] } | { ok: false, code: 'PLUGIN_ERRORS', errors: string[] }}
 */
export async function collectGateChecks({ rootDir, config, taskType, taskDesc, lite = false }) {
  const loadedPlugins = await loadPlugins(rootDir, config);
  const normalizedPlugins = normalizePlugins({ checks: loadedPlugins.checks });
  const errors = [...loadedPlugins.errors, ...normalizedPlugins.errors];
  if (errors.length > 0) return { ok: false, code: 'PLUGIN_ERRORS', errors };

  let baseChecks = getGateChecks(config, taskType, taskDesc);
  // HTH-014: --lite 跳过 PRD 工作流检查（真 Lite，方案 F-07）
  if (lite) baseChecks = baseChecks.filter(check => !PRD_CHECKS.has(check.id));
  // token 优化（6.7）：output.requireSkillRead=false 时移除 read-skill-*（默认 true 保约束）
  if (config.output?.requireSkillRead === false) {
    baseChecks = baseChecks.filter(check => !check.id.startsWith('read-skill-'));
  }
  const pluginChecks = normalizedPlugins.checks || [];
  const checks = pluginChecks.length
    ? [...baseChecks, ...pluginChecks.map(pc => ({ id: `plugin-${pc.id}`, label: `[plugin] ${pc.label}` }))]
    : baseChecks;
  return { ok: true, checks };
}

/**
 * 创建 gate（含 Task 绑定、插件校验、Git 校验）。写盘格式与提炼前一致。
 * @returns { ok: true, gateId, gateFile, gateState, checks, branch, head, taskId, taskless, autoBound }
 *        | { ok: false, code: 'PLUGIN_ERRORS'|'NOT_GIT'|'NO_ACTIVE_TASK', ... }
 */
export async function createGate({ rootDir, config, taskDesc, taskType, taskId = null, lite = false, now = new Date() }) {
  const collected = await collectGateChecks({ rootDir, config, taskType, taskDesc, lite });
  if (!collected.ok) return collected;
  const checks = collected.checks;

  let branch = 'unknown';
  let head = 'unknown';
  try {
    branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: rootDir, encoding: 'utf-8' }).trim();
    head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf-8' }).trim();
  } catch (error) {
    return { ok: false, code: 'NOT_GIT', message: String(error.message).split('\n')[0] };
  }

  // HTH-007: 每个新 Gate 必须绑定 Task（INV-03）。默认自动发现当前活动 Task；
  // 找不到且未显式开启 legacy.allowTasklessGate 时拒绝创建并给出启动命令。
  let resolvedTaskId = taskId;
  let autoBound = false;
  let taskless = false;
  if (!resolvedTaskId) {
    resolvedTaskId = await autoDiscoverTask(rootDir, config);
    if (resolvedTaskId) autoBound = true;
    else if (config.legacy?.allowTasklessGate === true) taskless = true;
    else return { ok: false, code: 'NO_ACTIVE_TASK' };
  }

  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const gateId = `GATE-${ts}`;
  const gateDir = resolve(rootDir, config.paths.gates);
  mkdirSync(gateDir, { recursive: true });
  const gateFile = join(gateDir, `${gateId}.json`);

  const gateState = recomputeGateState({
    schemaVersion: '2.0',
    id: gateId,
    taskType,
    taskDescription: taskDesc,
    createdAt: now.toISOString(),
    branch,
    head: head.slice(0, 8),
    taskId: resolvedTaskId,
    checks: checks.map(c => ({ ...c, phase: c.phase || GATE_PHASES.PREPARATION, status: 'pending', completedAt: null })),
    cleared: false,
  });

  writeFileSync(gateFile, JSON.stringify(gateState, null, 2));
  return { ok: true, gateId, gateFile, gateState, checks, branch, head, taskId: resolvedTaskId, taskless, autoBound };
}

/**
 * 读取最新 gate（按文件名倒序，与 CLI 行为一致）。
 * @returns { ok: true, gateFile, gateState } | { ok: false, code: 'NO_GATES_DIR'|'NO_ACTIVE_GATES' }
 */
export function loadLatestGate({ rootDir, config }) {
  const gateDir = resolve(rootDir, config.paths.gates);
  if (!existsSync(gateDir)) return { ok: false, code: 'NO_GATES_DIR' };
  const files = readdirSync(gateDir).filter(f => f.endsWith('.json')).sort().reverse();
  if (files.length === 0) return { ok: false, code: 'NO_ACTIVE_GATES' };
  const gateFile = join(gateDir, files[0]);
  const gateState = migrateGateState(JSON.parse(readFileSync(gateFile, 'utf-8')));
  return { ok: true, gateFile, gateState };
}

/**
 * gate 状态快照：一次性给出 CLI（多行/--short）与 MCP 所需的全部派生值。
 * `valid` 语义与 CLI --short 一致：cleared → 未过期；未 cleared → implementationReady。
 */
export function gateStatusSnapshot({ rootDir, config, now = new Date() }) {
  const loaded = loadLatestGate({ rootDir, config });
  if (!loaded.ok) return loaded;
  const { gateState } = loaded;

  const elapsed = now.getTime() - new Date(gateState.createdAt).getTime();
  const hoursAgo = Math.round(elapsed / 3600000);
  const maxAge = config.gates?.expiryHours?.[gateState.taskType] || 24;

  const remainingPreparation = pendingChecks(gateState, GATE_PHASES.PREPARATION).map(c => c.id);
  const remainingVerification = pendingChecks(gateState, GATE_PHASES.VERIFICATION).map(c => c.id);
  const phase = gateState.cleared
    ? GATE_PHASES.FINISHED
    : gateState.implementationReady
      ? GATE_PHASES.IMPLEMENTATION
      : GATE_PHASES.PREPARATION;
  const remainingCount = gateState.cleared
    ? 0
    : gateState.implementationReady
      ? remainingVerification.length
      : remainingPreparation.length;

  return {
    ok: true,
    gateState,
    hoursAgo,
    maxAge,
    phase,
    remainingCount,
    remainingPreparation,
    remainingVerification,
    expired: hoursAgo > maxAge,
    valid: gateState.cleared ? hoursAgo <= maxAge : gateState.implementationReady,
    implementedCount: gateState.implemented?.length || 0,
  };
}

function guardEvidenceControlled(gateState, checkId) {
  if (checkId !== 'verify-test') return null;
  return gateState.taskId
    ? { ok: false, code: 'EVIDENCE_CONTROLLED', gateId: gateState.id, taskId: gateState.taskId }
    : { ok: false, code: 'TASKLESS_EVIDENCE_GUARD', gateId: gateState.id };
}

function machineDesignReason({ rootDir, config, gateState, checkId }) {
  if (!MACHINE_DESIGN_CHECKS.includes(checkId)) return { ok: true, reason: null };
  const designsDir = config.designStage?.designsDir || 'docs/designs';
  const result = checkDesignArtifacts({ rootDir, designsDir, taskId: gateState.taskId || null, only: checkId });
  const r = result[checkId];
  if (!r || !r.pass) return { ok: false, reason: r?.reason || 'unknown', taskId: gateState.taskId || null };
  return { ok: true, reason: r.reason };
}

function summarizeGateClear(gateState) {
  const doneCount = gateState.checks.filter(c => c.status === 'done').length;
  const state = gateState.cleared
    ? GATE_PHASES.FINISHED
    : gateState.implementationReady
      ? GATE_PHASES.IMPLEMENTATION
      : GATE_PHASES.PREPARATION;
  const remainingIds = state === GATE_PHASES.FINISHED
    ? []
    : state === GATE_PHASES.IMPLEMENTATION
      ? pendingChecks(gateState, GATE_PHASES.VERIFICATION).map(c => c.id)
      : pendingChecks(gateState, GATE_PHASES.PREPARATION).map(c => c.id);
  return { ok: true, gateState, doneCount, totalCount: gateState.checks.length, state, remainingIds };
}

/**
 * 清除单个 gate 检查项（含 verify-test 证据控制守卫与设计检查项机器校验）。
 * @returns { ok: true, gateState, doneCount, totalCount, state, remainingIds }
 *        | { ok: false, code: 'GATE_NOT_FOUND'|'UNKNOWN_CHECK'|'EVIDENCE_CONTROLLED'|'TASKLESS_EVIDENCE_GUARD'|'MACHINE_CHECK_FAILED', ... }
 */
export function clearGateCheck({ rootDir, config, gateId, checkId, note = null, now = new Date() }) {
  const gateFile = resolve(rootDir, config.paths.gates, `${gateId}.json`);
  if (!existsSync(gateFile)) return { ok: false, code: 'GATE_NOT_FOUND', gateId };

  const gateState = migrateGateState(JSON.parse(readFileSync(gateFile, 'utf-8')));
  const check = gateState.checks.find(c => c.id === checkId);
  if (!check) return { ok: false, code: 'UNKNOWN_CHECK', checkId, available: gateState.checks.map(c => c.id) };

  // HTH-007: verify-test 一律证据控制（INV-03）——task-bound 走 evidence verify。
  const evidenceGuard = guardEvidenceControlled(gateState, checkId);
  if (evidenceGuard) return evidenceGuard;

  // §十九·补 19A.4：6 个设计检查项必须通过机器校验（design:check）才能 clear；
  // design-confirmed 保持人工 WAIT（不拦截）。
  const machine = machineDesignReason({ rootDir, config, gateState, checkId });
  if (!machine.ok) return { ok: false, code: 'MACHINE_CHECK_FAILED', checkId, reason: machine.reason, taskId: machine.taskId };

  check.status = 'done';
  check.completedAt = now.toISOString();
  if (machine.reason) check.note = `machine-verified: ${machine.reason}`;
  if (note) check.note = note;
  if (HUMAN_WAIT_APPROVAL_TYPES[checkId]) {
    try {
      check.approval = recordHumanWaitApproval({ rootDir, config, gateState, checkId, note, now });
    } catch {
      check.approval = null;
    }
  }

  recomputeGateState(gateState);
  writeFileSync(gateFile, JSON.stringify(gateState, null, 2));
  return summarizeGateClear(gateState);
}
