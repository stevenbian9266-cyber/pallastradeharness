import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { validateCapabilityRegistration, deriveProtectionLevel, honestReport, registerCapability, listRegisteredCapabilities, removeCapability } from './capability-registry.mjs';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), 'harness.mjs');

function sampleProject() {
  return mkdtempSync(join(tmpdir(), 'harness-cap-'));
}

const VALID_REG = {
  id: 'ide-agent-mcp',
  kind: 'agent_adapter',
  protocol_version: 1,
  capabilities: ['read_governance_context', 'propose_plan', 'propose_patch', 'run_registered_check'],
  needs_permission: ['project_read', 'scoped_project_write', 'registered_command_run'],
  cannot_do: ['change_locked_policy', 'approve_own_high_risk_change', 'write_outside_task_scope'],
};

// AC-001: 合法登记通过，非法登记被拒绝
test('AC-001: validateCapabilityRegistration 合法通过/非法拒绝', () => {
  assert.equal(validateCapabilityRegistration(VALID_REG).length, 0);
  assert.ok(validateCapabilityRegistration({ ...VALID_REG, id: undefined }).some(e => e.includes('id')));
  assert.ok(validateCapabilityRegistration({ ...VALID_REG, capabilities: ['block_write', 'not_a_real_cap'] }).some(e => e.includes('unknown capability')));
  assert.ok(validateCapabilityRegistration({ ...VALID_REG, cannot_do: ['forge_evidence', 'delete_history'] }).some(e => e.includes('unknown cannot_do')));
  assert.ok(validateCapabilityRegistration({ ...VALID_REG, protection_level: 'super' }).some(e => e.includes('protection_level')));
});

// AC-002: 保护等级派生
test('AC-002: deriveProtectionLevel 派生 enforced/guarded/advisory', () => {
  assert.equal(deriveProtectionLevel({ capabilities: ['block_write', 'block_command'] }), 'enforced');
  assert.equal(deriveProtectionLevel({ capabilities: ['block_write', 'block_commit'] }), 'enforced');
  assert.equal(deriveProtectionLevel({ capabilities: ['block_write'] }), 'guarded');
  assert.equal(deriveProtectionLevel({ capabilities: ['block_network'] }), 'guarded');
  assert.equal(deriveProtectionLevel({ capabilities: ['read_governance_context', 'propose_patch'] }), 'advisory');
});

// AC-003: 诚实报告大白话
test('AC-003: honestReport 输出大白话保护描述', () => {
  const r = honestReport({ id: 'x', capabilities: ['block_write', 'block_command'] });
  assert.equal(r.protection_level, 'enforced');
  assert.match(r.message, /强制保护/);
  const a = honestReport({ id: 'y', capabilities: ['propose_patch'] });
  assert.equal(a.protection_level, 'advisory');
  assert.match(a.message, /只能提醒/);
});

// AC-004: register → list 往返
test('AC-004: registerCapability 往返（临时目录）', () => {
  const rootDir = sampleProject();
  try {
    const record = registerCapability({ rootDir, config: DEFAULT_CONFIG, registration: VALID_REG });
    assert.equal(record.protection_level, 'advisory');
    const records = listRegisteredCapabilities({ rootDir, config: DEFAULT_CONFIG });
    assert.equal(records.length, 1);
    assert.equal(records[0].id, 'ide-agent-mcp');
    assert.ok(removeCapability({ rootDir, config: DEFAULT_CONFIG, id: 'ide-agent-mcp' }));
    assert.equal(listRegisteredCapabilities({ rootDir, config: DEFAULT_CONFIG }).length, 0);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// AC-005: CLI register + registered 可用（含保护等级输出）
test('AC-005: harness adapter register/registered CLI', () => {
  const rootDir = sampleProject();
  try {
    const r = spawnSync(process.execPath, [CLI, 'adapter', 'register', '--id', 'cli-adapter', '--capabilities', 'block_write,block_command'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /enforced/);
    const list = spawnSync(process.execPath, [CLI, 'adapter', 'registered'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(list.status, 0, list.stderr + list.stdout);
    assert.match(list.stdout, /cli-adapter/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// AC-006: CLI 非法登记被拒绝
test('AC-006: harness adapter register 非法能力被拒绝', () => {
  const rootDir = sampleProject();
  try {
    const r = spawnSync(process.execPath, [CLI, 'adapter', 'register', '--id', 'bad', '--capabilities', 'hack_all_the_things'], { cwd: rootDir, encoding: 'utf-8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /unknown capability/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
