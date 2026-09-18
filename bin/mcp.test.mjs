import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { createMcpHandler, MCP_TOOLS } from './mcp.mjs';
import { FROZEN_MCP_TOOLS } from './command-registry.mjs';

function project() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-mcp-'));
  writeFileSync(join(rootDir, 'README.md'), '# MCP\n');
  execFileSync('git', ['init', '-b', 'main'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.email', 'harness@example.test'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'Harness Test'], { cwd: rootDir });
  execFileSync('git', ['add', '.'], { cwd: rootDir });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: rootDir });
  return rootDir;
}

function request(method, params = {}, id = 1) {
  return { jsonrpc: '2.0', id, method, params };
}

test('MCP exposes the governed lifecycle tools and shares task state', async () => {
  const rootDir = project();
  try {
    const handler = createMcpHandler({ rootDir, config: structuredClone(DEFAULT_CONFIG) });
    const initialized = await handler(request('initialize'));
    assert.equal(initialized.serverInfo.name, 'pallastrade-harness');
    const listed = await handler(request('tools/list'));
    assert.equal(listed.tools.length, MCP_TOOLS.length);
    const started = await handler(request('tools/call', { name: 'start_task', arguments: { title: 'Copy edit' } }));
    const task = started.structuredContent;
    assert.equal(task.status, 'planned');
    const context = await handler(request('tools/call', { name: 'get_project_context', arguments: { taskId: task.id } }));
    assert.equal(context.structuredContent.taskId, task.id);
    const plan = await handler(request('tools/call', { name: 'get_change_plan', arguments: { taskId: task.id } }));
    assert.ok(Array.isArray(plan.structuredContent.changePlan.allow));
    await assert.rejects(() => handler(request('tools/call', { name: 'shell_exec', arguments: {} })), /Unknown MCP tool/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('MCP evidence cannot read files outside the project root', async () => {
  const rootDir = project();
  try {
    const handler = createMcpHandler({ rootDir, config: structuredClone(DEFAULT_CONFIG) });
    const started = await handler(request('tools/call', { name: 'start_task', arguments: { title: 'Copy edit' } }));
    await assert.rejects(() => handler(request('tools/call', { name: 'record_evidence', arguments: { taskId: started.structuredContent.id, type: 'review', summary: 'bad', file: '../outside.txt' } })), /outside the project root|does not exist/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('MCP tool surface matches the frozen L1 registry contract', () => {
  const expected = [...FROZEN_MCP_TOOLS.existingL1, ...FROZEN_MCP_TOOLS.newL1].sort();
  const actual = MCP_TOOLS.map(tool => tool.name).sort();
  assert.deepEqual(actual, expected);
  assert.equal(actual.length, 20);
});

test('MCP exposes the gate lifecycle through structured tools (RFC-0004 D5)', async () => {
  const rootDir = project();
  try {
    const handler = createMcpHandler({ rootDir, config: structuredClone(DEFAULT_CONFIG) });
    const started = await handler(request('tools/call', { name: 'start_task', arguments: { title: '重构：MCP gate lifecycle' } }));
    const taskId = started.structuredContent.id;

    const created = await handler(request('tools/call', { name: 'gate_create', arguments: { task: '重构：MCP gate lifecycle', taskId } }));
    assert.equal(created.isError, undefined, JSON.stringify(created).slice(0, 600));
    const gate = created.structuredContent;
    assert.ok(gate.gateId?.startsWith('GATE-'), JSON.stringify(created).slice(0, 600));
    assert.ok(gate.checks.some(c => c.id === 'verify-test'));
    assert.ok(gate.remainingPreparation.length > 0);

    const firstPreparation = gate.remainingPreparation[0];
    const cleared = await handler(request('tools/call', { name: 'gate_clear', arguments: { checkId: firstPreparation } }));
    assert.equal(cleared.structuredContent.cleared, true);
    assert.equal(cleared.structuredContent.remainingIds.includes(firstPreparation), false);

    const status = await handler(request('tools/call', { name: 'gate_status', arguments: {} }));
    assert.equal(status.structuredContent.gateId, gate.gateId);
    assert.equal(status.structuredContent.remainingPreparation.includes(firstPreparation), false);

    const evidenceControlled = await handler(request('tools/call', { name: 'gate_clear', arguments: { checkId: 'verify-test' } }));
    assert.equal(evidenceControlled.isError, true);
    assert.equal(evidenceControlled.structuredContent.code, 'EVIDENCE_CONTROLLED');

    const humanWait = await handler(request('tools/call', { name: 'gate_clear', arguments: { checkId: 'user-confirmed' } }));
    assert.equal(humanWait.isError, true);
    assert.equal(humanWait.structuredContent.code, 'HUMAN_CONFIRMATION_REQUIRED');

    const unknownCheck = await handler(request('tools/call', { name: 'gate_clear', arguments: { checkId: 'no-such-check' } }));
    assert.equal(unknownCheck.isError, true);
    assert.equal(unknownCheck.structuredContent.code, 'UNKNOWN_CHECK');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('MCP task reads and verifier whitelist errors are structured', async () => {
  const rootDir = project();
  try {
    const handler = createMcpHandler({ rootDir, config: structuredClone(DEFAULT_CONFIG) });
    const started = await handler(request('tools/call', { name: 'start_task', arguments: { title: '重构：MCP reads' } }));
    const taskId = started.structuredContent.id;

    const list = await handler(request('tools/call', { name: 'list_tasks', arguments: {} }));
    assert.equal(list.structuredContent.count, 1, JSON.stringify(list).slice(0, 400));
    assert.equal(list.structuredContent.tasks[0].id, taskId);

    const got = await handler(request('tools/call', { name: 'get_task', arguments: { taskId } }));
    assert.equal(got.structuredContent.id, taskId);

    const next = await handler(request('tools/call', { name: 'get_next_action', arguments: {} }));
    assert.ok(next.structuredContent && typeof next.structuredContent === 'object');

    const unknown = await handler(request('tools/call', { name: 'run_verifier', arguments: { verifierId: 'nope' } }));
    assert.equal(unknown.isError, true);
    assert.equal(unknown.structuredContent.code, 'VERIFIER_NOT_FOUND');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
