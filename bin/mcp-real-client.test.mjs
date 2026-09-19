/**
 * mcp-real-client.test.mjs — 真实 MCP 客户端端到端测试（Batch D / D14）
 *
 * 为什么单独一个文件：指令 TASK-D14 要求用**真实客户端**验证（tools/list、tools/call、
 * project init、task start、task status、evidence、finish），不能只用进程内调用或 mock。
 * 本文件用官方 SDK（`Client` + `StreamableHTTPClientTransport`）经**真实端口**驱动
 * bin/cloud-runtime.mjs，覆盖上述场景 + 无凭据拒绝路径。
 *
 * 仓库依赖面零改动：SDK 隔离安装在仓库外（默认 `%TEMP%\harness-mcp-client`）。
 *   安装：npm i --prefix "<tmp>/harness-mcp-client" @modelcontextprotocol/sdk@1.30.0
 *   指定：HARNESS_MCP_SDK_DIR=<...>/node_modules/@modelcontextprotocol/sdk
 * 未安装时本文件整体 skip（并打印安装命令），不产生假绿/假红。
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startCloudRuntime } from './cloud-runtime.mjs';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { MCP_TOOLS } from './mcp.mjs';
import { createSqliteRepositories } from './sqlite-repositories.mjs';
import { openHarnessDatabaseSync } from './sqlite-store.mjs';

/** 锁定的真实客户端 SDK（实测可用版本）。 */
const SDK_PACKAGE = '@modelcontextprotocol/sdk@1.30.0';
/** 默认隔离安装目录（仓库外）。 */
const SDK_INSTALL_ROOT = join(tmpdir(), 'harness-mcp-client');
const DEFAULT_SDK_DIR = join(SDK_INSTALL_ROOT, 'node_modules', '@modelcontextprotocol', 'sdk');
const INSTALL_HINT = `npm i --prefix "${SDK_INSTALL_ROOT}" ${SDK_PACKAGE}`;

const API_KEY = 'real-client-key';
const ENV = { HARNESS_API_KEY: API_KEY };

/** 加载真实客户端 SDK（仓库外隔离安装；不可用 → null → skip）。 */
export async function loadRealClientSdk(dir = process.env.HARNESS_MCP_SDK_DIR || DEFAULT_SDK_DIR) {
  try {
    const client = await import(pathToFileURL(join(dir, 'dist/esm/client/index.js')).href);
    const http = await import(pathToFileURL(join(dir, 'dist/esm/client/streamableHttp.js')).href);
    return { Client: client.Client, StreamableHTTPClientTransport: http.StreamableHTTPClientTransport };
  } catch {
    return null;
  }
}

let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  DatabaseSync = null;
}

const SDK = await loadRealClientSdk();
const SKIP = SDK && DatabaseSync ? false : `real MCP client unavailable (${SDK_PACKAGE} / node:sqlite); run: ${INSTALL_HINT}`;

/** 隔离项目：临时目录 + 文件库 + 真实监听的服务端。 */
function makeProject() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-real-client-'));
  const db = openHarnessDatabaseSync({ file: join(rootDir, 'cloud.sqlite'), DatabaseSync });
  const config = structuredClone(DEFAULT_CONFIG);
  return {
    rootDir,
    db,
    config,
    repositories: createSqliteRepositories({ db, config }),
    cleanup: () => {
      try { db.close(); } catch { /* closed */ }
      rmSync(rootDir, { recursive: true, force: true });
    },
  };
}

/** 真实客户端连接（可选 Bearer）。 */
async function connectRealClient(url, key) {
  const transport = new SDK.StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
    requestInit: { headers: key ? { Authorization: `Bearer ${key}` } : {} },
  });
  const client = new SDK.Client({ name: 'harness-real-client', version: '1.0.0' });
  await client.connect(transport);
  return { client, transport };
}

/** 调用工具并解包 structuredContent。 */
async function callTool(client, name, args = {}) {
  return client.callTool({ name, arguments: args });
}

test('D14: 真实客户端 tools/list 与冻结工具面严格一致', { skip: SKIP }, async t => {
  const project = makeProject();
  const started = await startCloudRuntime({ db: project.db, config: project.config, env: ENV, port: 0 });
  t.after(async () => { await started.close(); project.cleanup(); });

  const { client, transport } = await connectRealClient(started.url, API_KEY);
  t.after(async () => { await transport.close(); });

  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map(tool => tool.name).sort(), MCP_TOOLS.map(tool => tool.name).sort());
});

test('D14: 真实客户端完成完整治理流程（init → start → status → evidence → finish）', { skip: SKIP }, async t => {
  const project = makeProject();
  const started = await startCloudRuntime({ db: project.db, config: project.config, env: ENV, port: 0 });
  t.after(async () => { await started.close(); project.cleanup(); });

  const { client, transport } = await connectRealClient(started.url, API_KEY);
  t.after(async () => { await transport.close(); });

  // project init
  const initialized = await callTool(client, 'project_init', { project_id: 'PROJECT-REAL', name: 'real client project' });
  assert.equal(initialized.structuredContent.profile.id, 'PROJECT-REAL');

  // task start
  const startedTask = await callTool(client, 'start_task', { title: 'real client task' });
  const taskId = startedTask.structuredContent.task.id;
  assert.match(taskId, /^TASK-/);

  // task status（列表 + 单任务）
  const listed = await callTool(client, 'list_tasks', {});
  assert.ok(listed.structuredContent.tasks.some(task => task.id === taskId));
  const fetched = await callTool(client, 'get_task', { task_id: taskId });
  assert.equal(fetched.structuredContent.task.id, taskId);

  // finish（证据不足 → 拒绝）
  const denied = await callTool(client, 'finish_task', { task_id: taskId });
  assert.equal(denied.isError, true);
  assert.equal(denied.structuredContent.code, 'evidence_policy_unmet');

  // evidence ×3
  for (const type of ['test', 'review', 'knowledge']) {
    const recorded = await callTool(client, 'record_evidence', { task_id: taskId, evidence_type: type, summary: `real client ${type}` });
    assert.equal(recorded.structuredContent.source, 'local_agent');
  }

  // finish（成功）
  const finished = await callTool(client, 'finish_task', { task_id: taskId });
  assert.equal(finished.structuredContent.finished, true);
  assert.equal(finished.structuredContent.task.status, 'completed');
  assert.equal(project.repositories.tasks.get(taskId).status, 'completed');
});

test('D14: 无凭据的真实客户端被拒绝且不产生任务', { skip: SKIP }, async t => {
  const project = makeProject();
  const started = await startCloudRuntime({ db: project.db, config: project.config, env: ENV, port: 0 });
  t.after(async () => { await started.close(); project.cleanup(); });

  await assert.rejects(async () => {
    const { client, transport } = await connectRealClient(started.url, null);
    try {
      await callTool(client, 'start_task', { title: 'should not exist' });
    } finally {
      await transport.close();
    }
  });

  assert.equal(project.repositories.tasks.list().length, 0, 'unauthorized client must not create tasks');
});

test('AC-007: 仓库依赖面零改动（SDK 不进 package.json）', () => {
  const manifest = readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf-8');
  assert.equal(manifest.includes('@modelcontextprotocol'), false, 'real client SDK must stay outside the repository');
});
