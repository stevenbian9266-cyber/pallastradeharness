import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COMMAND_DEFINITIONS,
  FROZEN_MCP_TOOL_NAMES,
  FROZEN_MCP_TOOLS,
  getCommandDefinition,
  listCommandDefinitions,
  validateCommandDefinition,
  validateCommandDefinitions,
} from './command-registry.mjs';

const clone = value => structuredClone(value);

test('registry: all registered definitions pass contract validation', () => {
  assert.deepEqual(validateCommandDefinitions(), []);
  assert.ok(COMMAND_DEFINITIONS.length >= 20, 'lifecycle core should be registered');
});

test('registry: frozen MCP tool list matches RFC-0004 appendix C (13+7+16)', () => {
  assert.equal(FROZEN_MCP_TOOLS.existingL1.length, 13);
  assert.equal(FROZEN_MCP_TOOLS.newL1.length, 7);
  assert.equal(FROZEN_MCP_TOOLS.l2.length, 16);
  assert.equal(FROZEN_MCP_TOOL_NAMES.length, 36);
  assert.equal(new Set(FROZEN_MCP_TOOL_NAMES).size, 36);
  assert.ok(FROZEN_MCP_TOOL_NAMES.includes('gate_create'));
  assert.ok(FROZEN_MCP_TOOL_NAMES.includes('harness_task'));
});

test('registry: lifecycle core commands are registered with real handlers', () => {
  for (const id of ['task:start', 'task:finish', 'gate:create', 'gate:status', 'gate:clear', 'evidence:record', 'verify:run', 'guide:next']) {
    assert.ok(getCommandDefinition(id), `${id} should be registered`);
  }
  const gateClear = getCommandDefinition('gate:clear');
  assert.equal(gateClear.mcp.tool, 'gate_clear');
  assert.equal(gateClear.writeClass, 'governance');
  assert.deepEqual(gateClear.handler, { module: './gate-commands.mjs', export: 'clearGateCheck' });

  const docsGenerate = getCommandDefinition('docs:generate');
  assert.equal(docsGenerate.dryRunDefault, true, 'artifact writes default to dry-run');

  assert.equal(listCommandDefinitions({ domain: 'gate' }).length >= 5, true);
});

test('registry: duplicate id is rejected', () => {
  const defs = [...COMMAND_DEFINITIONS, clone(getCommandDefinition('gate:status'))];
  const errors = validateCommandDefinitions(defs);
  assert.ok(errors.some(e => /duplicate command id/.test(e)));
});

test('registry: duplicate tool name is rejected', () => {
  const defs = COMMAND_DEFINITIONS.map(clone);
  const status = defs.find(def => def.id === 'gate:status');
  status.mcp.tool = 'gate_create';
  const errors = validateCommandDefinitions(defs);
  assert.ok(errors.some(e => /duplicate mcp.tool gate_create/.test(e)));
});

test('registry: invalid enums and adapters are rejected', () => {
  const base = clone(getCommandDefinition('gate:status'));

  const badWriteClass = { ...base, id: 'x:writeclass', writeClass: 'writes' };
  assert.ok(validateCommandDefinition(badWriteClass).some(e => /writeClass/.test(e)));

  const badBridge = { ...base, id: 'x:bridge', adapter: 'cli-bridge', output: { json: false, structured: true } };
  assert.ok(validateCommandDefinition(badBridge).some(e => /cli-bridge/.test(e)));

  const badDirect = { ...base, id: 'x:direct', adapter: 'direct', handler: null };
  const directErrors = validateCommandDefinition(badDirect);
  assert.ok(directErrors.some(e => /handler\.module/.test(e)));
  assert.ok(directErrors.some(e => /handler\.export/.test(e)));

  const badExcluded = { ...base, id: 'x:excluded', mcp: { exposure: 'excluded' }, adapter: 'direct' };
  assert.ok(validateCommandDefinition(badExcluded).some(e => /excluded commands must use adapter none/.test(e)));

  const opsExposed = {
    ...clone(getCommandDefinition('gate:clean')),
    id: 'x:ops',
    mcp: { exposure: 'full', tier: 'L2', tool: 'harness_task', action: 'clean' },
    adapter: 'cli-bridge',
    output: { json: true, structured: true },
  };
  assert.ok(validateCommandDefinition(opsExposed).some(e => /ops commands/.test(e)));
});

test('registry: L2 tools require the harness_ prefix and an action', () => {
  const badL2 = {
    ...clone(getCommandDefinition('gate:status')),
    id: 'x:l2',
    mcp: { exposure: 'full', tier: 'L2', tool: 'gate_status' },
    output: { json: true, structured: true },
  };
  const errors = validateCommandDefinition(badL2);
  assert.ok(errors.some(e => /harness_ prefix/.test(e)));
  assert.ok(errors.some(e => /mcp\.action/.test(e)));
});

test('registry: artifact commands must declare dryRunDefault', () => {
  const def = clone(getCommandDefinition('docs:generate'));
  delete def.dryRunDefault;
  assert.ok(validateCommandDefinition(def).some(e => /dryRunDefault/.test(e)));
});
