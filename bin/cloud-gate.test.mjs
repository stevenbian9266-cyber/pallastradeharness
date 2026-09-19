/**
 * cloud-gate.test.mjs — Cloud 门禁策略与守卫（Cloud 门禁能力，PRD AC-003~AC-006/AC-009）
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { getGateChecks, DEFAULT_CONFIG } from './config-loader.mjs';
import { buildCloudGate, clearCloudGateCheck, isMachineVerifiedCheck } from './cloud-gate.mjs';

const TASK = { id: 'TASK-CT-1', title: '新增：contract gate', type: null };
const config = () => structuredClone(DEFAULT_CONFIG);

/** 可被工具清理的准备项（排除人工门）。 */
function clearablePrep(gate) {
  return gate.checks.filter(check => check.phase === 'preparation'
    && check.id !== 'user-confirmed' && check.id !== 'design-confirmed'
    && !isMachineVerifiedCheck(check.id));
}

test('AC-003: buildCloudGate 检查项来自既有政策，初始全 pending', () => {
  const gate = buildCloudGate({ task: TASK, config: config() });
  const expected = getGateChecks(config(), 'feature', TASK.title).map(check => check.id);
  assert.deepEqual(gate.checks.map(check => check.id), expected);
  assert.ok(gate.checks.every(check => check.status === 'pending'));
  assert.equal(gate.taskType, 'feature');
  assert.equal(gate.taskId, 'TASK-CT-1');
  assert.equal(gate.implementationReady, false);
  assert.equal(gate.cleared, false);
  assert.match(gate.id, /^GATE-\d{14}-[0-9a-f]{8}$/);
});

test('AC-003: 任务类型由前缀推导；缺 task.id 抛错；git 指纹透传', () => {
  const gate = buildCloudGate({ task: { id: 'TASK-1', title: '修复：a bug' }, config: config(), git: { branch: 'main', head: 'abc1234' } });
  assert.equal(gate.taskType, 'bugfix');
  assert.equal(gate.branch, 'main');
  assert.equal(gate.head, 'abc1234');
  assert.throws(() => buildCloudGate({ task: { title: 'no id' } }), /requires a task with id/);
  assert.equal(isMachineVerifiedCheck('verify-test'), true);
  assert.equal(isMachineVerifiedCheck('coverage-gate'), true);
  assert.equal(isMachineVerifiedCheck('search-bin'), false);
});

test('AC-004: 清理准备项写入 note/completedAt；全部清完 → implementationReady', () => {
  let gate = buildCloudGate({ task: TASK, config: config() });
  const [first] = clearablePrep(gate);
  assert.ok(first, 'default feature gate must expose clearable preparation checks');

  const cleared = clearCloudGateCheck({ gateState: gate, checkId: first.id, note: 'done by test', hasApproval: true });
  assert.equal(cleared.ok, true);
  const updated = cleared.gateState.checks.find(check => check.id === first.id);
  assert.equal(updated.status, 'done');
  assert.equal(updated.note, 'done by test');
  assert.equal(typeof updated.completedAt, 'string');

  gate = cleared.gateState;
  for (const check of gate.checks.filter(item => item.phase === 'preparation')) {
    const result = clearCloudGateCheck({ gateState: gate, checkId: check.id, hasApproval: true });
    if (result.ok) gate = result.gateState;
  }
  assert.equal(gate.implementationReady, true, 'all preparation cleared → implementation ready');
});

test('AC-005: human-WAIT 检查项需审批（无审批拒绝，有审批通过）', () => {
  const gate = buildCloudGate({ task: TASK, config: config() });
  const humanWait = gate.checks.find(check => check.id === 'user-confirmed');
  assert.ok(humanWait, 'default feature gate must contain user-confirmed');

  const denied = clearCloudGateCheck({ gateState: gate, checkId: 'user-confirmed', hasApproval: false });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, 'human_approval_required');

  const allowed = clearCloudGateCheck({ gateState: gate, checkId: 'user-confirmed', hasApproval: true, note: 'approved' });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.gateState.checks.find(check => check.id === 'user-confirmed').status, 'done');
});

test('AC-006: 机器校验项 / 未知项 / 重复清理全部拒绝', () => {
  const gate = buildCloudGate({ task: TASK, config: config() });
  assert.equal(clearCloudGateCheck({ gateState: gate, checkId: 'verify-test' }).code, 'check_machine_verified');
  assert.equal(clearCloudGateCheck({ gateState: gate, checkId: 'no-such-check' }).code, 'unknown_check');
  assert.equal(clearCloudGateCheck({ gateState: null, checkId: 'search-bin' }).code, 'gate_not_found');

  const [first] = clearablePrep(gate);
  const once = clearCloudGateCheck({ gateState: gate, checkId: first.id, hasApproval: true });
  assert.equal(once.ok, true);
  const twice = clearCloudGateCheck({ gateState: once.gateState, checkId: first.id, hasApproval: true });
  assert.equal(twice.code, 'check_already_cleared');
});

test('AC-009: 策略模块不 import 本机 IO', () => {
  const source = readFileSync(fileURLToPath(new URL('./cloud-gate.mjs', import.meta.url)), 'utf-8');
  assert.equal(/from 'node:fs'/.test(source), false);
  assert.equal(/from 'node:child_process'/.test(source), false);
});
