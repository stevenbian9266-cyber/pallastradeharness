import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { runMcpStdio } from './mcp.mjs';
import { resolveServerContext } from './mcp-server.mjs';

const SERVER = fileURLToPath(new URL('./mcp-server.mjs', import.meta.url));

/** Windows 上子进程可能短时持有句柄 → EPERM：rmSync 退避重试（Node 官方对 EBUSY/EPERM 的解法）。 */
function cleanup(...dirs) {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

/** 终止子进程并等它真正退出（避免清理竞态）。 */
async function stopChild(child) {
  child.kill();
  await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 2000))]);
}

function project() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-mcp-server-'));
  writeFileSync(join(rootDir, 'README.md'), '# mcp-server\n');
  execFileSync('git', ['init', '-b', 'main'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.email', 'harness@example.test'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'Harness Test'], { cwd: rootDir });
  execFileSync('git', ['add', '.'], { cwd: rootDir });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: rootDir });
  return rootDir;
}

test('resolveServerContext: --root beats HARNESS_ROOT; env used otherwise; fallback passthrough; invalid root rejected', async () => {
  const rootA = project();
  const rootB = project();
  const previous = process.env.HARNESS_ROOT;
  try {
    process.env.HARNESS_ROOT = rootB;
    const viaFlag = await resolveServerContext({ args: ['--root', rootA] });
    assert.equal(viaFlag.rootDir, rootA);
    assert.equal(viaFlag.rootSource, 'explicit');

    const viaEnv = await resolveServerContext({ args: [] });
    assert.equal(viaEnv.rootDir, rootB);
    assert.equal(viaEnv.rootSource, 'explicit');

    delete process.env.HARNESS_ROOT;
    const fallback = await resolveServerContext({ args: [], fallback: { rootDir: rootA, config: structuredClone(DEFAULT_CONFIG) } });
    assert.equal(fallback.rootDir, rootA);
    assert.equal(fallback.rootSource, 'auto');

    await assert.rejects(() => resolveServerContext({ args: ['--root', join(rootA, 'missing-dir')] }), /not a directory/);
  } finally {
    if (previous === undefined) delete process.env.HARNESS_ROOT;
    else process.env.HARNESS_ROOT = previous;
    cleanup(rootA, rootB);
  }
});

test('harness-mcp e2e: --root wins over cwd, 20 tools, task+gate lifecycle', { timeout: 30000 }, async () => {
  const rootA = project();
  const cwdB = project();
  const child = spawn(process.execPath, [SERVER, '--root', rootA], { cwd: cwdB, stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout });
  const pending = new Map();
  let seq = 0;
  lines.on('line', line => {
    try {
      const message = JSON.parse(line);
      if (message.id !== undefined && pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
      }
    } catch { /* ignore non-JSON noise */ }
  });
  const request = (method, params = {}) => {
    const id = ++seq;
    const promise = new Promise(resolve => pending.set(id, resolve));
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    return promise;
  };
  try {
    const initialized = await request('initialize', { capabilities: {} });
    assert.equal(initialized.result.serverInfo.name, 'pallastrade-harness');
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);

    const tools = await request('tools/list');
    assert.equal(tools.result.tools.length, 20);

    const started = await request('tools/call', { name: 'start_task', arguments: { title: '重构：stdio e2e' } });
    const taskId = started.result.structuredContent.id;
    assert.ok(taskId.startsWith('TASK-'));

    const created = await request('tools/call', { name: 'gate_create', arguments: { task: '重构：stdio e2e', taskId } });
    assert.ok(created.result.structuredContent.gateId.startsWith('GATE-'));

    assert.ok(existsSync(join(rootA, 'harness', 'gates')), 'gate state must be written under --root');
    assert.equal(existsSync(join(cwdB, 'harness')), false, 'cwd must stay untouched when --root is set');
  } finally {
    await stopChild(child);
    cleanup(rootA, cwdB);
  }
});

test('runMcpStdio negotiates client roots when no explicit root is given', { timeout: 15000 }, async () => {
  const rootA = project();
  const rootB = project();
  try {
    const gateState = {
      schemaVersion: '2.0',
      id: 'GATE-ROOTS',
      taskType: 'refactor',
      taskDescription: 'roots switch probe',
      createdAt: new Date().toISOString(),
      branch: 'main',
      head: 'abc12345',
      taskId: 'TASK-roots-probe',
      checks: [],
    };
    mkdirSync(join(rootB, 'harness', 'gates'), { recursive: true });
    writeFileSync(join(rootB, 'harness', 'gates', 'GATE-ROOTS.json'), JSON.stringify(gateState));

    const input = new PassThrough();
    const output = new PassThrough();
    runMcpStdio({ rootDir: rootA, config: structuredClone(DEFAULT_CONFIG), input, output, error: new PassThrough(), rootSource: 'auto' });

    const messages = [];
    const waiters = [];
    let buffer = '';
    output.on('data', chunk => {
      buffer += String(chunk);
      const parts = buffer.split('\n');
      buffer = parts.pop();
      for (const line of parts) {
        if (!line.trim()) continue;
        const message = JSON.parse(line);
        messages.push(message);
        for (let i = waiters.length - 1; i >= 0; i--) {
          if (waiters[i].predicate(message)) {
            waiters[i].resolve(message);
            waiters.splice(i, 1);
          }
        }
      }
    });
    const waitFor = predicate => {
      const existing = messages.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise(resolve => waiters.push({ predicate, resolve }));
    };

    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { capabilities: { roots: {} } } })}\n`);
    await waitFor(message => message.id === 1);
    input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);

    const rootsRequest = await waitFor(message => message.method === 'roots/list');
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: rootsRequest.id, result: { roots: [{ uri: pathToFileURL(rootB).href }] } })}\n`);

    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'gate_status', arguments: {} } })}\n`);
    const status = await waitFor(message => message.id === 2);
    assert.equal(status.result.structuredContent.gateId, 'GATE-ROOTS');

    input.end();
  } finally {
    cleanup(rootA, rootB);
  }
});
