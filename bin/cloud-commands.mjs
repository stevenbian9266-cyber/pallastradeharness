/**
 * cloud-commands.mjs — Cloud 命令层（Batch D / D12）
 *
 * 分层位置：MCP Adapter → cloud-application（分发表）→ **本模块** → 端口 / 纯引擎 → SQLite。
 *   - 只做「命令 → 端口/纯引擎调用」的映射与参数归一；
 *   - 业务结论只来自**纯引擎**（assessRisk）或**端口数据**（证据/门/审批是否存在），不手写判断；
 *   - 未实现/上下文不足一律显式错误信封（不伪造 PASS、不补造数据）。
 *
 * 禁止：本机项目 IO（不 import node:fs / node:child_process）；`get_template` 只读随包模板注册表。
 */
import { randomUUID } from 'node:crypto';
import { buildCloudGate, clearCloudGateCheck } from './cloud-gate.mjs';
import { cloudStrictPolicy } from './cloud-policy.mjs';
import { APPROVAL_TYPES, EVIDENCE_TYPES } from './contracts.mjs';
import { toolError } from './mcp.mjs';
import { assessRisk, highestRisk } from './risk-engine.mjs';
import { getTemplate } from './template-registry.mjs';

/** Cloud 默认必需证据集（与仓库默认治理一致）。 */
const DEFAULT_REQUIRED_EVIDENCE = Object.freeze(['test', 'review', 'knowledge']);

/** 读取字段（对象缺失或字段缺失 → null）。 */
function fieldOf(source, field) {
  if (!source) return null;
  return source[field] === undefined ? null : source[field];
}

/** 必填字符串参数。 */
function requireString(args, field, tool) {
  const value = fieldOf(args, field);
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return toolError('missing_argument', `${tool} requires ${field}`, { argument: field });
}

/** 门禁快照（端口派生；供 gate_create / gate_clear 返回）。 */
function gateSnapshot(repositories) {
  const snapshot = repositories.gates.statusSnapshot();
  return {
    phase: fieldOf(snapshot, 'phase'),
    remainingPreparation: fieldOf(snapshot, 'remainingPreparation') ?? [],
    remainingVerification: fieldOf(snapshot, 'remainingVerification') ?? [],
  };
}

const isToolError = value => Boolean(value) && value.isError === true;

/** 时间戳 + 随机段组成的 Cloud 任务 id。 */
function makeTaskId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `TASK-${stamp}-${randomUUID().slice(0, 8)}`;
}

const GIT_SUBMISSION_SQL = "SELECT data_json FROM git_snapshots WHERE kind = 'GitSnapshotSubmission' ORDER BY created_at DESC, id DESC LIMIT 1";

/** 最新提交式 git 快照（无则 null）。 */
function latestSnapshotSubmission(db) {
  const row = db.prepare(GIT_SUBMISSION_SQL).get();
  return row ? JSON.parse(row.data_json) : null;
}

/** 最新提交式 git 快照的变更文件清单。 */
function submittedFiles(db) {
  const submission = latestSnapshotSubmission(db);
  return Array.isArray(submission?.changed_files) ? submission.changed_files : [];
}

/** 门禁 git 指纹（Cloud 快照无分支字段 → branch 为 null；无快照 → null）。 */
function gateGitSnapshot(db) {
  const submission = latestSnapshotSubmission(db);
  return submission === null ? null : { branch: fieldOf(submission, 'branch'), head: fieldOf(submission, 'commit') };
}

/**
 * 要求齐备判定：证据按类型查 evidences；critical 额外要求一条非 STALE 审批（approvals 表）。
 * @returns {string[]} 缺失项（空数组 = 齐备）
 */
function missingRequirements({ evidence, approvals }, task) {
  const required = [...new Set([...DEFAULT_REQUIRED_EVIDENCE, ...(task.requiredEvidence ?? [])])]
    .filter(type => type !== 'approval');
  const records = evidence.list(task.id);
  const missing = required.filter(type => records.some(record => record.evidenceType === type) === false);
  if (task.riskLevel === 'critical' && approvals.list().some(record => record.taskId === task.id && record.status !== 'STALE') === false) {
    missing.push('approval');
  }
  return missing;
}

/**
 * 创建 Cloud 命令集。
 * @param {object} options
 * @param {object} options.repositories `createSqliteRepositories` 的产物
 * @param {object} options.evidence D09 边界包装后的证据仓储
 * @param {object} options.db 已打开的 node:sqlite 句柄（提交快照读取）
 * @param {object} [options.config]
 */
export function createCloudCommands({ repositories, evidence, db, config = {} } = {}) {
  if (!repositories || !db) throw new TypeError('createCloudCommands requires { repositories, db }');

  /** 读取任务（缺 task_id 时取最近一条），未找到 → 错误信封。 */
  const resolveCloudTask = args => {
    const taskId = fieldOf(args, 'task_id');
    const task = taskId ? repositories.tasks.get(taskId) : repositories.tasks.list().at(-1);
    if (task) return task;
    return toolError('task_not_found', taskId ? `unknown task: ${taskId}` : 'no tasks in this project', { task_id: taskId ?? null });
  };

  return {
    /** 启动任务：风险与必需证据由 assessRisk 推导，Change Plan 落检查点。 */
    start_task(args = {}) {
      const title = requireString(args, 'title', 'start_task');
      if (isToolError(title)) return title;
      const risk = assessRisk({ task: title, files: [], declared: fieldOf(args, 'declared'), config });
      const task = {
        id: makeTaskId(),
        title,
        status: 'planned',
        riskLevel: risk.level,
        requiredEvidence: fieldOf(args, 'required_evidence') ?? risk.requiredEvidence ?? ['test'],
        createdAt: new Date().toISOString(),
      };
      const changePlan = {
        allow: Array.isArray(args.allow) ? args.allow : [],
        deny: ['**/package-lock.json'],
        requiredEvidence: task.requiredEvidence,
        recoveryRequired: risk.recoveryRequired === true,
      };
      repositories.tasks.save(task);
      db.prepare('INSERT INTO task_checkpoints (id, task_id, data_json, created_at) VALUES (?, ?, ?, ?)')
        .run(`CHK-${randomUUID()}`, task.id, JSON.stringify({ kind: 'change_plan', changePlan }), new Date().toISOString());
      return { task, changePlan, next_action: 'gate_create' };
    },

    /** 门禁状态：直接读端口（空态原样返回）。 */
    gate_status() {
      return repositories.gates.statusSnapshot();
    },

    /** 建门：检查项来自既有政策；同一任务已有未完成门禁时拒绝。 */
    gate_create(args = {}) {
      const task = resolveCloudTask(args);
      if (isToolError(task)) return task;
      const existing = repositories.gates.loadLatest();
      if (existing.ok && existing.gateState?.cleared !== true) {
        return toolError('gate_already_active', `gate ${existing.gateState.id} is still active`, { gate_id: existing.gateState.id, task_id: task.id });
      }
      const gateState = buildCloudGate({ task, config, git: gateGitSnapshot(db) });
      repositories.gates.save(gateState);
      return { gateId: gateState.id, taskId: task.id, ...gateSnapshot(repositories) };
    },

    /** 清门：守卫齐全（未知项 / 机器校验项 / 人工门需审批 / 重复清理）。 */
    gate_clear(args = {}) {
      const checkId = requireString(args, 'check_id', 'gate_clear');
      if (isToolError(checkId)) return checkId;
      const loaded = repositories.gates.loadLatest();
      if (!loaded.ok) return toolError('gate_not_found', 'no active gate in this project', {});
      const gateState = loaded.gateState;
      const hasApproval = repositories.approvals.list()
        .some(record => record.taskId === gateState.taskId && record.status !== 'STALE');
      const result = clearCloudGateCheck({ gateState, checkId, note: fieldOf(args, 'note'), hasApproval });
      if (!result.ok) {
        return toolError(result.code, `gate_clear refused: ${result.code}`, { check_id: checkId, gate_id: gateState.id });
      }
      repositories.gates.save(result.gateState);
      return { gateId: result.gateState.id, cleared: checkId, ...gateSnapshot(repositories) };
    },

    /** 记录审批（类型经单点常量校验）。 */
    record_approval(args = {}) {
      const type = requireString(args, 'type', 'record_approval');
      if (isToolError(type)) return type;
      if (!APPROVAL_TYPES.includes(type)) {
        return toolError('invalid_argument', `unknown approval type: ${type}`, { allowed: [...APPROVAL_TYPES] });
      }
      return repositories.approvals.record({
        taskId: fieldOf(args, 'task_id'),
        type,
        summary: fieldOf(args, 'summary') ?? '',
      });
    },

    /** 项目初始化：profile 落库 + 制品登记。 */
    project_init(args = {}) {
      const projectId = requireString(args, 'project_id', 'project_init');
      if (isToolError(projectId)) return projectId;
      const profile = { id: projectId, name: fieldOf(args, 'name') ?? projectId, createdAt: new Date().toISOString() };
      db.prepare('INSERT INTO projects (id, name, data_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, data_json = excluded.data_json, updated_at = excluded.updated_at')
        .run(profile.id, profile.name, JSON.stringify(profile), profile.createdAt);
      const artifacts = Array.isArray(args.artifacts) ? args.artifacts : [];
      for (const artifact of artifacts) {
        if (artifact?.id) repositories.artifacts.upsert(artifact);
      }
      return { profile, artifacts: repositories.artifacts.list() };
    },

    /** 项目状态：画像 / 宪法版本 / 制品 / 计数（全部来自端口）。 */
    project_status() {
      return {
        profile: repositories.project.getProfile(),
        constitutionVersion: repositories.project.getConstitutionVersion(),
        artifacts: repositories.project.listArtifacts(),
        counts: {
          tasks: repositories.tasks.list().length,
          evidence: repositories.evidence.list(null).length,
          approvals: repositories.approvals.list().length,
        },
      };
    },

    /** 模板查询（随包注册表；未找到给出可选示例）。 */
    get_template(args = {}) {
      const templateId = requireString(args, 'template_id', 'get_template');
      if (isToolError(templateId)) return templateId;
      const template = getTemplate(templateId, fieldOf(args, 'version'));
      if (!template) {
        return toolError('template_not_found', `unknown template: ${templateId}`, { template_id: templateId });
      }
      return template;
    },

    /** 下一步引导：纯端口状态推导。 */
    get_next_action(args = {}) {
      const tasks = repositories.tasks.list();
      const taskId = fieldOf(args, 'task_id');
      const task = taskId ? repositories.tasks.get(taskId) : tasks.at(-1);
      if (!task) return { action: 'start_task', reason: 'no task exists in this project', task_id: null };
      if (task.status === 'completed') return { action: 'start_task', reason: `task ${task.id} is completed`, task_id: task.id };
      const gate = repositories.gates.loadLatest();
      if (!gate.ok) return { action: 'gate_create', reason: 'no gate exists for this task', task_id: task.id };
      const snapshot = repositories.gates.statusSnapshot();
      const pendingPreparation = (snapshot.remainingPreparation ?? []).length;
      if (pendingPreparation > 0) return { action: 'gate_clear', reason: `${pendingPreparation} preparation check(s) pending`, task_id: task.id };
      const missing = missingRequirements({ evidence, approvals: repositories.approvals }, task);
      if (missing.length > 0) return { action: 'record_evidence', reason: `missing evidence: ${missing.join(', ')}`, task_id: task.id };
      return { action: 'finish_task', reason: 'evidence policy satisfied', task_id: task.id };
    },

    /** 风险复评：纯引擎 + 提交式快照文件清单；结论更高则升级任务。 */
    risk_check(args = {}) {
      const task = resolveCloudTask(args);
      if (isToolError(task)) return task;
      const risk = assessRisk({
        task: task.title,
        files: submittedFiles(db),
        declared: fieldOf(args, 'declared'),
        config,
      });
      const level = highestRisk(task.riskLevel, risk.level);
      const updated = level === task.riskLevel ? task : { ...task, riskLevel: level, updatedAt: new Date().toISOString() };
      if (updated !== task) repositories.tasks.save(updated);
      return { risk, task: updated };
    },

    /** 严格完工：证据缺一即拒；满足则置 completed（无 legacy 自动流转）。 */
    finish_task(args = {}) {
      if (cloudStrictPolicy(config).disabledByConfig) {
        return toolError('strict_governance_required', 'cloud runtime enforces strict governance; strictGovernance=false is not allowed', { enforcedBy: 'cloud' });
      }
      const task = resolveCloudTask(args);
      if (isToolError(task)) return task;
      const missing = missingRequirements({ evidence, approvals: repositories.approvals }, task);
      if (missing.length > 0) {
        return toolError('evidence_policy_unmet', `evidence policy not satisfied for ${task.id}`, { task_id: task.id, missing });
      }
      const completed = { ...task, status: 'completed', completedAt: new Date().toISOString() };
      repositories.tasks.save(completed);
      return { task: completed, finished: true };
    },

    /** 记录证据（经 D09 边界包装）。 */
    record_evidence(args = {}) {
      const evidenceType = requireString(args, 'evidence_type', 'record_evidence');
      if (isToolError(evidenceType)) return evidenceType;
      if (!EVIDENCE_TYPES.includes(evidenceType)) {
        return toolError('invalid_argument', `unknown evidence type: ${evidenceType}`, { allowed: [...EVIDENCE_TYPES] });
      }
      return evidence.record({
        taskId: fieldOf(args, 'task_id'),
        evidenceType,
        summary: fieldOf(args, 'summary') ?? '',
      });
    },

    /** 差异评审：Cloud 不保存文件内容/全量 diff → 显式上下文不足。 */
    review_diff() {
      return toolError('cloud_context_insufficient', 'review_diff needs submitted file contents; the cloud runtime stores hashes and file lists only', { tool: 'review_diff' });
    },
  };
}
