/**
 * cloud-policy.test.mjs — Cloud strict 策略（Batch D / D13，PRD AC-001~AC-004/AC-009）
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { strictGovernanceEnabled } from './fact-gates.mjs';
import {
  CLOUD_STRICT_GOVERNANCE,
  assertCloudStrictGovernance,
  cloudStrictPolicy,
  strictFlagDisabled,
} from './cloud-policy.mjs';

test('AC-001: 缺省配置下 Cloud 恒为严格（不继承 Local 默认 off）', () => {
  assert.equal(CLOUD_STRICT_GOVERNANCE, true);
  for (const config of [undefined, {}, { governance: {} }, { governance: { strict: false } }]) {
    const policy = cloudStrictPolicy(config);
    assert.equal(policy.strictGovernance, true);
    assert.equal(policy.disabledByConfig, false);
    assert.equal(policy.enforcedBy, 'cloud');
  }
  assert.equal(strictGovernanceEnabled({}), false, 'Local default stays non-strict (key parity only)');
});

test('AC-002: 显式关闭（两处键任一）→ disabledByConfig 且断言抛错', () => {
  assert.equal(strictFlagDisabled({ strictGovernance: false }), true);
  assert.equal(strictFlagDisabled({ governance: { strictGovernance: false } }), true);
  assert.equal(cloudStrictPolicy({ strictGovernance: false }).disabledByConfig, true);
  assert.throws(
    () => assertCloudStrictGovernance({ governance: { strictGovernance: false } }),
    /strict governance cannot be disabled/,
  );
  assert.equal(cloudStrictPolicy({ governance: { strictGovernance: false } }).strictGovernance, true, 'policy stays strict');
});

test('AC-003: 显式开启 → 严格且无关闭意图', () => {
  const policy = assertCloudStrictGovernance({ governance: { strictGovernance: true } });
  assert.equal(policy.strictGovernance, true);
  assert.equal(policy.disabledByConfig, false);
});

test('AC-004: 与 Local 判定键位一致（同键名，不同默认）', () => {
  assert.equal(strictGovernanceEnabled({ governance: { strictGovernance: true } }), true);
  assert.equal(cloudStrictPolicy({ governance: { strictGovernance: true } }).disabledByConfig, false);
  assert.equal(strictGovernanceEnabled({ governance: { strictGovernance: false } }), false);
  assert.equal(cloudStrictPolicy({ governance: { strictGovernance: false } }).disabledByConfig, true);
});

test('AC-009: 策略模块为纯逻辑（不 import 本机 IO）', () => {
  const source = readFileSync(fileURLToPath(new URL('./cloud-policy.mjs', import.meta.url)), 'utf-8');
  assert.equal(/from 'node:fs'/.test(source), false);
  assert.equal(/from 'node:child_process'/.test(source), false);
});
