/**
 * runtime-ports.test.mjs — 端口定义与校验器（Batch D / D02，PRD AC-001/AC-004）
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CLOUD_FORBIDDEN_IMPORTS,
  RUNTIME_PORT_KINDS,
  RUNTIME_PORT_METHODS,
  isPortImplementation,
  validatePortImplementation,
} from './runtime-ports.mjs';

test('AC-001: 7 个端口种类与冻结方法面', () => {
  assert.equal(RUNTIME_PORT_KINDS.length, 7);
  assert.deepEqual(
    [...RUNTIME_PORT_KINDS],
    ['ProjectRepository', 'ArtifactRepository', 'TaskRepository', 'GateRepository', 'ApprovalRepository', 'EvidenceRepository', 'EventRepository'],
  );
  for (const kind of RUNTIME_PORT_KINDS) {
    const methods = RUNTIME_PORT_METHODS[kind];
    assert.ok(Array.isArray(methods) && methods.length >= 2, `${kind} must declare >= 2 methods`);
    assert.ok(Object.isFrozen(methods), `${kind} method list must be frozen`);
  }
});

test('AC-001: validatePortImplementation 拒绝缺方法与非法输入', () => {
  const partial = { kind: 'TaskRepository', list: () => [], get: () => null };
  const result = validatePortImplementation('TaskRepository', partial);
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ['save']);
  assert.ok(result.errors.some(error => error.includes('TaskRepository.save')));

  assert.equal(validatePortImplementation('TaskRepository', null).ok, false);
  assert.equal(validatePortImplementation('TaskRepository', 'nope').ok, false);
  assert.equal(validatePortImplementation('Nope', {}).ok, false);
  assert.deepEqual(validatePortImplementation('Nope', {}).errors, ['unknown port kind: Nope']);

  const full = { kind: 'TaskRepository', list: () => [], get: () => null, save: () => {} };
  assert.equal(validatePortImplementation('TaskRepository', full).ok, true);
  assert.equal(isPortImplementation('TaskRepository', full), true);
  assert.equal(isPortImplementation('TaskRepository', { ...full, kind: 'WrongKind' }), false);
});

test('AC-004: Cloud 禁 import 清单冻结且端口定义自身不引入禁品', () => {
  assert.deepEqual([...CLOUD_FORBIDDEN_IMPORTS], ['node:fs', 'node:child_process']);
  const source = readFileSync(fileURLToPath(new URL('./runtime-ports.mjs', import.meta.url)), 'utf-8');
  for (const forbidden of CLOUD_FORBIDDEN_IMPORTS) {
    assert.equal(source.includes(`from '${forbidden}'`), false, `runtime-ports must not import ${forbidden}`);
  }
});
