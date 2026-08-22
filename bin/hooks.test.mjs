import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { assessHookInput, DEFAULT_SAFETY_RULES, flattenToolInput } from './hook-agent.mjs';
import { ADAPTER_HOOK_SUPPORT, HOOK_ENTRY, hooksDoctor } from './hooks.mjs';

test('dangerous commands are blocked (含换行/Unicode/嵌套分隔符容错)', () => {
  const cases = [
    { input: { tool_name: 'run_in_terminal', tool_input: 'rake db:drop' }, rule: 'SR-001' },
    { input: { tool_name: 'run_in_terminal', tool_input: 'rails db:reset' }, rule: 'SR-001' },
    { input: { tool_name: 'run_in_terminal', tool_input: 'DROP TABLE pallastrade_orders' }, rule: 'SR-002' },
    { input: { tool_name: 'run_in_terminal', tool_input: 'git push --force origin main\n' }, rule: 'SR-004' },
    { input: { tool_name: 'edit_file', tool_input: 'key = "sk_live_AbC123xYz456"' }, rule: 'SR-005' },
    { input: { tool_name: 'run_in_terminal', tool_input: 'echo "a"; rake db:drop; echo done' }, rule: 'SR-001' },
    { input: { tool_name: 'run_in_terminal', tool_input: '删除 rake\ndb:drop 中文' }, rule: 'SR-001' },
  ];
  for (const c of cases) {
    const result = assessHookInput(c.input);
    assert.equal(result.decision, 'block', `should block: ${JSON.stringify(c.input)}`);
    assert.equal(result.ruleId, c.rule, `rule mismatch for: ${JSON.stringify(c.input)}`);
    assert.equal(result.severity, 'critical');
  }
});

test('safe commands are allowed', () => {
  const cases = [
    { tool_name: 'run_in_terminal', tool_input: 'git status' },
    { tool_name: 'run_in_terminal', tool_input: 'node --test' },
    { tool_name: 'edit_file', tool_input: 'update README.md' },
    { tool_name: 'run_in_terminal', tool_input: 'rake db:migrate' },
    { tool_name: 'run_in_terminal', tool_input: 'rails routes' },
    { tool_name: 'read_file', tool_input: '' },
  ];
  for (const input of cases) {
    assert.equal(assessHookInput(input).decision, 'allow', `should allow: ${JSON.stringify(input)}`);
  }
});

test('flattenToolInput handles string/array/object/null', () => {
  assert.equal(flattenToolInput('git status'), 'git status');
  assert.equal(flattenToolInput(['node', '--test', 'a b']), 'node --test a b');
  assert.equal(flattenToolInput({ command: 'rake db:drop' }), 'rake db:drop');
  assert.equal(flattenToolInput(null), '');
  assert.equal(flattenToolInput(undefined), '');
});

test('assessHookInput tolerates unknown or malformed structure', () => {
  assert.equal(assessHookInput({}).decision, 'allow');
  assert.equal(assessHookInput({ tool_name: 123 }).decision, 'allow');
  assert.equal(assessHookInput(null).decision, 'allow');
});

test('default safety rules are structured and documented', () => {
  for (const rule of DEFAULT_SAFETY_RULES) {
    assert.ok(rule.id.startsWith('SR-'), `rule id ${rule.id}`);
    assert.ok(rule.description.length > 0);
    assert.ok(rule.pattern instanceof RegExp);
  }
});

test('hooksDoctor simulation: dangers blocked, safe allowed; support matrix present', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-hooks-'));
  try {
    const report = hooksDoctor({ rootDir });
    for (const sim of report.simulation) {
      assert.equal(sim.pass, true, `${sim.name}: expect ${sim.expect}, got ${sim.got}`);
    }
    assert.equal(ADAPTER_HOOK_SUPPORT.claude.level, 'native-blocking');
    assert.equal(ADAPTER_HOOK_SUPPORT.codex.level, 'advisory');
    assert.equal(ADAPTER_HOOK_SUPPORT.copilot.level, 'native-blocking');
    assert.ok(HOOK_ENTRY.endsWith('hook-agent.mjs'));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
