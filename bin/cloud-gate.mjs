/**
 * cloud-gate.mjs — Cloud 门禁策略与守卫（Cloud 门禁能力；RFC-0006 §4 政策定稿）
 *
 * 定位：把**既有**门禁政策与状态机搬到 Cloud 端口之上，不复制任何政策：
 *   - 检查项清单：`config-loader.getGateChecks`（Local 同一来源）
 *   - 任务类型识别：`gate-commands.detectTaskType`
 *   - 阶段/状态重算：`gate-lifecycle`（纯模块）
 *   - 人工门名单：`mcp.HUMAN_WAIT_CHECKS`
 *
 * 治理不变式：
 *   1. human-WAIT 检查项（user-confirmed / design-confirmed）在 Cloud 下**必须先有审批记录**才能清理；
 *   2. 机器校验项（verify-test 与 `*-gate`）**禁止工具直清**（Cloud 不执行本机验证器）；
 *   3. 门禁是**流程指引**，完工判定以证据为准（见 D13 strict，`finish_task` 不读门禁）。
 *
 * 本模块不 import 本机 IO。
 */
import { randomUUID } from 'node:crypto';
import { getGateChecks } from './config-loader.mjs';
import { detectTaskType } from './gate-commands.mjs';
import { GATE_PHASES, recomputeGateState } from './gate-lifecycle.mjs';
import { HUMAN_WAIT_CHECKS } from './mcp.mjs';

/** 机器校验项后缀（此类检查项由验证器/证据路径满足，工具不得直清）。 */
export const MACHINE_VERIFIED_SUFFIX = '-gate';

/** 是否为机器校验项。 */
export function isMachineVerifiedCheck(checkId) {
  return String(checkId) === 'verify-test' || String(checkId).endsWith(MACHINE_VERIFIED_SUFFIX);
}

/** 门禁 id：时间戳 + 随机段。 */
function makeGateId(now) {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `GATE-${stamp}-${randomUUID().slice(0, 8)}`;
}

/**
 * 构建 Cloud 门禁状态（检查项来自既有政策；状态由既有状态机重算）。
 * @param {object} options
 * @param {object} options.task 目标任务（需 `id`/`title`）
 * @param {object} [options.config]
 * @param {Date} [options.now]
 * @param {{branch?: string|null, head?: string|null}} [options.git] 提交式快照提供的 git 指纹（可缺省）
 */
export function buildCloudGate({ task, config = {}, now = new Date(), git = null } = {}) {
  if (!task?.id) throw new TypeError('buildCloudGate requires a task with id');
  const detected = detectTaskType({ taskDesc: task.title, explicitType: task.type });
  const taskType = detected.taskType ?? 'feature';
  const checks = getGateChecks(config, taskType, task.title).map(check => ({
    ...check,
    phase: check.phase ?? GATE_PHASES.PREPARATION,
    status: 'pending',
  }));
  const createdAt = now.toISOString();
  return recomputeGateState({
    schemaVersion: '2.0',
    id: makeGateId(now),
    taskType,
    taskDescription: task.title,
    taskId: task.id,
    createdAt,
    branch: git?.branch ?? null,
    head: git?.head ?? null,
    cleared: false,
    implementationReady: false,
    checks,
  });
}

/**
 * 清理一个门禁检查项（带守卫；返回新状态，不落库）。
 * @returns {{ok: true, gateState: object} | {ok: false, code: string}}
 */
export function clearCloudGateCheck({ gateState, checkId, note = null, hasApproval = false, now = new Date() } = {}) {
  if (!gateState) return { ok: false, code: 'gate_not_found' };
  const check = (gateState.checks ?? []).find(item => item.id === checkId);
  if (!check) return { ok: false, code: 'unknown_check' };
  if (isMachineVerifiedCheck(checkId)) return { ok: false, code: 'check_machine_verified' };
  if (HUMAN_WAIT_CHECKS.has(checkId) && hasApproval !== true) return { ok: false, code: 'human_approval_required' };
  if (check.status === 'done' || check.status === 'cleared') return { ok: false, code: 'check_already_cleared' };
  const checks = gateState.checks.map(item => (item.id === checkId
    ? { ...item, status: 'done', completedAt: now.toISOString(), note: note ?? item.note ?? null }
    : item));
  return { ok: true, gateState: recomputeGateState({ ...gateState, checks }) };
}
