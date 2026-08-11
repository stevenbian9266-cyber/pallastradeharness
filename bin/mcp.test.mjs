import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { createMcpHandler, MCP_TOOLS } from './mcp.mjs';

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
