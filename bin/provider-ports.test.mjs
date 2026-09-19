/**
 * provider-ports.test.mjs — Provider 端口定义与校验器（Batch D / D04/D05，PRD AC-001/AC-002/AC-006）
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  PROVIDER_PORT_KINDS,
  PROVIDER_PORT_METHODS,
  isProviderImplementation,
  validateProviderImplementation,
} from './provider-ports.mjs';
import { CLOUD_FORBIDDEN_IMPORTS } from './runtime-ports.mjs';

test('AC-001: 3 个 Provider 种类与冻结方法面（每个 ≥2 方法）', () => {
  assert.equal(PROVIDER_PORT_KINDS.length, 3);
  assert.deepEqual(
    [...PROVIDER_PORT_KINDS],
    ['ProjectContextProvider', 'TaskContextProvider', 'GitSnapshotProvider'],
  );
  assert.ok(Object.isFrozen(PROVIDER_PORT_KINDS));
  for (const kind of PROVIDER_PORT_KINDS) {
    const methods = PROVIDER_PORT_METHODS[kind];
    assert.ok(Array.isArray(methods) && methods.length >= 2, `${kind} must declare >= 2 methods`);
    assert.ok(Object.isFrozen(methods), `${kind} method list must be frozen`);
  }
  assert.deepEqual([...PROVIDER_PORT_METHODS.TaskContextProvider], ['contextPack', 'recordDecision']);
});

test('AC-002: validateProviderImplementation 拒绝缺方法、非法输入与 kind 不符', () => {
  const partial = { kind: 'TaskContextProvider', contextPack: () => ({}) };
  const result = validateProviderImplementation('TaskContextProvider', partial);
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ['recordDecision']);
  assert.ok(result.errors.some(error => error.includes('TaskContextProvider.recordDecision')));

  assert.equal(validateProviderImplementation('TaskContextProvider', null).ok, false);
  assert.equal(validateProviderImplementation('TaskContextProvider', 'nope').ok, false);
  assert.equal(validateProviderImplementation('Nope', {}).ok, false);
  assert.deepEqual(validateProviderImplementation('Nope', {}).errors, ['unknown provider kind: Nope']);

  const full = { kind: 'TaskContextProvider', contextPack: () => ({}), recordDecision: () => ({}) };
  assert.equal(validateProviderImplementation('TaskContextProvider', full).ok, true);
  assert.equal(isProviderImplementation('TaskContextProvider', full), true);
  assert.equal(isProviderImplementation('TaskContextProvider', { ...full, kind: 'WrongKind' }), false);
});

test('AC-006: 端口定义模块纯逻辑（不 import Cloud 禁品）', () => {
  assert.deepEqual([...CLOUD_FORBIDDEN_IMPORTS], ['node:fs', 'node:child_process']);
  const source = readFileSync(fileURLToPath(new URL('./provider-ports.mjs', import.meta.url)), 'utf-8');
  for (const forbidden of CLOUD_FORBIDDEN_IMPORTS) {
    assert.equal(source.includes(`from '${forbidden}'`), false, `provider-ports must not import ${forbidden}`);
  }
});
