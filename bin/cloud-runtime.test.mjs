/**
 * cloud-runtime.test.mjs — Cloud 运行时 e2e / 分层 / 边界（Batch D / D10/D11，PRD AC-003~AC-011）
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createCloudRuntime, startCloudRuntime } from './cloud-runtime.mjs';
import { createCloudCommands } from './cloud-commands.mjs';
import { createBoundaryEvidenceRepository } from './evidence-boundary.mjs';
import { createHttpHandler, startHttpServer } from './http-transport.mjs';
import { FROZEN_MCP_TOOL_NAMES } from './command-registry.mjs';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { APPROVAL_TYPES, createContract } from './contracts.mjs';
import { MCP_PROTOCOL_VERSION, MCP_TOOLS } from './mcp.mjs';
import { createSqliteRepositories } from './sqlite-repositories.mjs';
import { openHarnessDatabaseSync } from './sqlite-store.mjs';
import { listTemplates } from './template-registry.mjs';

let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  DatabaseSync = null;
}

const SKIP = typeof DatabaseSync === 'function' ? false : 'node:sqlite unavailable (requires Node >= 22.5)';

const API_KEY = 'cloud-test-key';
const ENV = { HARNESS_API_KEY: API_KEY };
const AUTH = { authorization: `Bearer ${API_KEY}` };

/** 隔离项目：临时目录 + 文件库 + 一个已持久化任务。 */
function makeProject() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-cloud-'));
  const db = openHarnessDatabaseSync({ file: join(rootDir, 'cloud.sqlite'), DatabaseSync });
  const config = structuredClone(DEFAULT_CONFIG);
  const repositories = createSqliteRepositories({ db, config });
  const task = createContract('Task', {
    id: 'TASK-CLOUD-1',
    title: 'cloud task',
    status: 'planned',
    riskLevel: 'quick',
    createdAt: new Date().toISOString(),
  });
  repositories.tasks.save(task);
  return {
    rootDir,
    db,
    config,
    repositories,
    runtime: createCloudRuntime({ db, config, env: ENV }),
    cleanup: () => {
      try { db.close(); } catch { /* closed */ }
      rmSync(rootDir, { recursive: true, force: true });
    },
  };
}

const rpc = (runtime, body, headers = AUTH) => runtime.handleRequest({
  method: 'POST', path: '/mcp', headers, body: JSON.stringify(body),
});

test('AC-003: initialize / ping / notification 语义与 Local 一致', { skip: SKIP }, async () => {
  const project = makeProject();
  try {
    const init = await rpc(project.runtime, { jsonrpc: '2.0', id: 1, method: 'initialize' });
    assert.equal(init.status, 200);
    const initialized = JSON.parse(init.body).result;
    assert.equal(initialized.protocolVersion, MCP_PROTOCOL_VERSION);
    assert.equal(initialized.capabilities.tools.listChanged, false);
    assert.equal(typeof initialized.serverInfo.version, 'string');

    const ping = await rpc(project.runtime, { jsonrpc: '2.0', id: 2, method: 'ping' });
    assert.deepEqual(JSON.parse(ping.body).result, {});

    const notification = await rpc(project.runtime, { jsonrpc: '2.0', method: 'notifications/initialized' });
    assert.equal(notification.status, 202);
    assert.equal(notification.body, '');

    const health = await project.runtime.handleRequest({ method: 'GET', path: '/health' });
    assert.equal(health.status, 200);
    assert.equal(JSON.parse(health.body).ok, true);
  } finally {
    project.cleanup();
  }
});

test('AC-004: tools/list 与 Local MCP_TOOLS 完全一致且属于冻结名单', { skip: SKIP }, async () => {
  const project = makeProject();
  try {
    const response = await rpc(project.runtime, { jsonrpc: '2.0', id: 3, method: 'tools/list' });
    const tools = JSON.parse(response.body).result.tools;
    assert.deepEqual(tools.map(tool => tool.name), MCP_TOOLS.map(tool => tool.name));
    for (const tool of tools) assert.ok(FROZEN_MCP_TOOL_NAMES.includes(tool.name), `frozen tool name required: ${tool.name}`);
  } finally {
    project.cleanup();
  }
});

test('AC-005: list_tasks / get_task 读取真实 SQLite 数据', { skip: SKIP }, async () => {
  const project = makeProject();
  try {
    const listed = JSON.parse((await rpc(project.runtime, {
      jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_tasks', arguments: {} },
    })).body).result;
    assert.equal(listed.structuredContent.count, 1);
    assert.equal(listed.structuredContent.tasks[0].id, 'TASK-CLOUD-1');

    const fetched = JSON.parse((await rpc(project.runtime, {
      jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'get_task', arguments: { task_id: 'TASK-CLOUD-1' } },
    })).body).result;
    assert.equal(fetched.structuredContent.task.title, 'cloud task');

    const missing = JSON.parse((await rpc(project.runtime, {
      jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'get_task', arguments: {} },
    })).body).result;
    assert.equal(missing.isError, true);
    assert.equal(missing.structuredContent.code, 'missing_argument');
  } finally {
    project.cleanup();
  }
});

test('AC-006: 未实现工具返回 cloud_not_implemented（不伪造 PASS）', { skip: SKIP }, async () => {
  const project = makeProject();
  try {
    for (const name of ['run_verifier', 'generate_standards', 'generate_docs']) {
      const result = JSON.parse((await rpc(project.runtime, {
        jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name, arguments: {} },
      })).body).result;
      assert.equal(result.isError, true, `${name} must not report success`);
      assert.equal(result.structuredContent.code, 'cloud_not_implemented');
      assert.equal(result.structuredContent.retryable, false);
      assert.equal(JSON.stringify(result).includes('completed'), false, `${name} must not mark tasks completed`);
    }
    assert.equal(project.repositories.tasks.get('TASK-CLOUD-1').status, 'planned', 'task status must be untouched');
  } finally {
    project.cleanup();
  }
});

test('AC-007: record_evidence 落库并带 D09 边界标记', { skip: SKIP }, async () => {
  const project = makeProject();
  try {
    const result = JSON.parse((await rpc(project.runtime, {
      jsonrpc: '2.0', id: 8, method: 'tools/call',
      params: { name: 'record_evidence', arguments: { task_id: 'TASK-CLOUD-1', evidence_type: 'test', summary: 'cloud run' } },
    })).body).result;
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.source, 'local_agent');
    assert.equal(result.structuredContent.trust_level, 'cooperative');

    const stored = project.repositories.evidence.list('TASK-CLOUD-1');
    assert.equal(stored.length, 1);
    assert.equal(stored[0].trust_level, 'cooperative');
    assert.equal(stored[0].evidenceType, 'test');
  } finally {
    project.cleanup();
  }
});

test('AC-008: 鉴权失败时应用层不被调用（早退）', async () => {
  let calls = 0;
  const handler = createHttpHandler({
    authorize: () => ({ ok: false, status: 401, code: 'missing_credentials', message: 'Authorization header is required' }),
    adapter: async () => { calls += 1; return { tools: [] }; },
  });
  const response = await handler({ method: 'POST', path: '/mcp', headers: {}, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
  assert.equal(response.status, 401);
  assert.equal(JSON.parse(response.body).error, 'missing_credentials');
  assert.equal(calls, 0);
});

test('AC-009: 路径/方法/报文错误的状态码与 JSON-RPC 错误码', { skip: SKIP }, async () => {
  const project = makeProject();
  try {
    const { handleRequest } = project.runtime;
    assert.equal((await handleRequest({ method: 'GET', path: '/nope' })).status, 404);
    assert.equal((await handleRequest({ method: 'GET', path: '/mcp', headers: AUTH })).status, 405);

    const badJson = await handleRequest({ method: 'POST', path: '/mcp', headers: AUTH, body: '{not json' });
    assert.equal(badJson.status, 400);
    assert.equal(JSON.parse(badJson.body).error.code, -32700);

    const invalid = await handleRequest({ method: 'POST', path: '/mcp', headers: AUTH, body: JSON.stringify({ method: 'tools/list' }) });
    assert.equal(invalid.status, 400);
    assert.equal(JSON.parse(invalid.body).error.code, -32600);

    const unknown = await rpc(project.runtime, { jsonrpc: '2.0', id: 9, method: 'tools/nope' });
    assert.equal(unknown.status, 200);
    assert.equal(JSON.parse(unknown.body).error.code, -32601);

    const noKey = await rpc(project.runtime, { jsonrpc: '2.0', id: 10, method: 'tools/list' }, {});
    assert.equal(noKey.status, 401);
  } finally {
    project.cleanup();
  }
});

test('AC-010: 分层约束——传输/协议层不 import 存储或领域模块', () => {
  const transport = readFileSync(fileURLToPath(new URL('./http-transport.mjs', import.meta.url)), 'utf-8');
  for (const forbidden of ['sqlite', 'cloud-application', 'task-orchestrator', 'evidence', 'static-key-auth']) {
    assert.equal(new RegExp(`from '\\./${forbidden}`).test(transport), false, `http-transport must not import ${forbidden}`);
  }
  const adapter = readFileSync(fileURLToPath(new URL('./mcp-jsonrpc.mjs', import.meta.url)), 'utf-8');
  for (const forbidden of ['sqlite', 'task-orchestrator', 'evidence-boundary', 'cloud-application']) {
    assert.equal(new RegExp(`from '\\./${forbidden}`).test(adapter), false, `mcp-jsonrpc must not import ${forbidden}`);
  }
});

test('AC-011: startHttpServer 真实监听并处理一次 POST /mcp', { skip: SKIP }, async () => {
  const project = makeProject();
  let started = null;
  try {
    started = await startHttpServer({
      handler: project.runtime.handleRequest,
      port: 0,
    });
    const response = await fetch(`${started.url}/mcp`, {
      method: 'POST',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 11, method: 'initialize' }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.result.protocolVersion, MCP_PROTOCOL_VERSION);

    const denied = await fetch(`${started.url}/mcp`, { method: 'POST', body: '{}' });
    assert.equal(denied.status, 401);
  } finally {
    if (started) await started.close();
    project.cleanup();
  }
});

test('startCloudRuntime 组装并暴露 url', { skip: SKIP }, async () => {
  const project = makeProject();
  let started = null;
  try {
    started = await startCloudRuntime({ db: project.db, config: project.config, env: ENV, port: 0 });
    assert.match(started.url, /^http:\/\/127\.0\.0\.1:\d+$/);
    const health = await fetch(`${started.url}/health`);
    assert.equal(health.status, 200);
  } finally {
    if (started) await started.close();
    project.cleanup();
  }
});

// ────────────────────────────────────────────────────────────────
// D12：工具面兼容 + Project 能力
// ────────────────────────────────────────────────────────────────

/** 调用一个工具并解包 structuredContent。 */
async function callTool(project, name, args = {}, id = 100) {
  const response = await rpc(project.runtime, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
  return JSON.parse(response.body).result;
}

test('AC-002: start_task 建任务 + Change Plan 检查点，风险由引擎推导', { skip: SKIP }, async () => {
  const project = makeProject();
  try {
    const result = (await callTool(project, 'start_task', { title: 'cloud governed task', allow: ['bin/**'] })).structuredContent;
    assert.match(result.task.id, /^TASK-\d{14}-[0-9a-f]{8}$/);
    assert.equal(result.task.status, 'planned');
    assert.ok(['quick', 'standard', 'high', 'critical'].includes(result.task.riskLevel));
    assert.ok(Array.isArray(result.task.requiredEvidence) && result.task.requiredEvidence.length >= 1);
    assert.deepEqual(result.changePlan.allow, ['bin/**']);
    assert.equal(result.next_action, 'gate_create');
    assert.equal(project.repositories.tasks.get(result.task.id).title, 'cloud governed task');
    const checkpoint = project.db.prepare('SELECT COUNT(*) AS n FROM task_checkpoints WHERE task_id = ?').get(result.task.id);
    assert.equal(checkpoint.n, 1);

    const missing = await callTool(project, 'start_task', {});
    assert.equal(missing.isError, true);
    assert.equal(missing.structuredContent.code, 'missing_argument');
  } finally {
    project.cleanup();
  }
});

test('AC-003: gate_status 空态与有 gate 两种情况', { skip: SKIP }, async () => {
  const project = makeProject();
  try {
    const empty = (await callTool(project, 'gate_status')).structuredContent;
    assert.equal(empty.ok, false);
    assert.equal(empty.code, 'NO_ACTIVE_GATES');

    project.db.prepare('INSERT INTO gates (id, task_id, data_json, created_at) VALUES (?, ?, ?, ?)')
      .run('GATE-1', 'TASK-CLOUD-1', JSON.stringify({
        id: 'GATE-1',
        cleared: false,
        checks: [
          { id: 'search-bin', label: 'search bin', phase: 'preparation', status: 'done' },
          { id: 'verify-test', label: 'verify', phase: 'verification', status: 'pending' },
        ],
      }), new Date().toISOString());
    const seeded = (await callTool(project, 'gate_status')).structuredContent;
    assert.equal(seeded.ok, true);
    assert.equal(seeded.phase, 'implementation');
    assert.deepEqual(seeded.remainingPreparation, []);
    assert.deepEqual(seeded.remainingVerification, ['verify-test']);
  } finally {
    project.cleanup();
  }
});

test('AC-004: record_approval 校验类型并落库', { skip: SKIP }, async () => {
  const project = makeProject();
  try {
    const record = (await callTool(project, 'record_approval', { task_id: 'TASK-CLOUD-1', type: 'requirement', summary: 'ok' })).structuredContent;
    assert.equal(record.type, 'requirement');
    assert.equal(project.repositories.approvals.list().length, 1);

    const invalid = await callTool(project, 'record_approval', { task_id: 'TASK-CLOUD-1', type: 'nope' });
    assert.equal(invalid.isError, true);
    assert.equal(invalid.structuredContent.code, 'invalid_argument');
    assert.ok(invalid.structuredContent.allowed.includes('requirement'));
  } finally {
    project.cleanup();
  }
});

test('AC-005: project_init → project_status 往返', { skip: SKIP }, async () => {
  const project = makeProject();
  try {
    const init = (await callTool(project, 'project_init', {
      project_id: 'PROJECT-CLOUD',
      name: 'cloud project',
      artifacts: [{ id: 'artifact-1', type: 'constitution', path: 'harness/constitution/architecture.json' }],
    })).structuredContent;
    assert.equal(init.profile.id, 'PROJECT-CLOUD');
    assert.equal(init.artifacts.length, 1);

    const status = (await callTool(project, 'project_status')).structuredContent;
    assert.equal(status.profile.id, 'PROJECT-CLOUD');
    assert.equal(status.artifacts.length, 1);
    assert.equal(status.counts.tasks, 1);
  } finally {
    project.cleanup();
  }
});

test('AC-006: get_template 命中随包注册表；未知 id → template_not_found', { skip: SKIP }, async () => {
  const project = makeProject();
  try {
    const [first] = listTemplates({});
    assert.ok(first?.template_id, 'template registry must ship at least one template');
    const template = await callTool(project, 'get_template', { template_id: first.template_id });
    assert.equal(template.isError, undefined);
    assert.equal(template.structuredContent.template_id, first.template_id);
    assert.equal(template.structuredContent.version, first.version);

    const unknown = await callTool(project, 'get_template', { template_id: 'no-such-template' });
    assert.equal(unknown.structuredContent.code, 'template_not_found');
  } finally {
    project.cleanup();
  }
});

test('AC-007: get_next_action 按状态推进', { skip: SKIP }, async () => {
  const project = makeProject();
  try {
    const fresh = makeProject();
    try {
      fresh.db.prepare('DELETE FROM tasks').run();
      const beforeAnyTask = fresh.runtime.application.callTool('get_next_action', {});
      assert.equal(beforeAnyTask.action, 'start_task');
    } finally {
      fresh.cleanup();
    }

    const started = (await callTool(project, 'start_task', { title: 'next action task' })).structuredContent;
    const nextAction = (await callTool(project, 'get_next_action', { task_id: started.task.id })).structuredContent;
    assert.equal(nextAction.action, 'gate_create');
    assert.equal(nextAction.task_id, started.task.id);
  } finally {
    project.cleanup();
  }
});

test('AC-008: risk_check 依引擎结论升级任务风险', { skip: SKIP }, async () => {
  const project = makeProject();
  try {
    const started = (await callTool(project, 'start_task', { title: 'risk task' })).structuredContent;
    const checked = (await callTool(project, 'risk_check', { task_id: started.task.id, declared: 'critical' })).structuredContent;
    assert.equal(checked.risk.level, 'critical');
    assert.equal(checked.task.riskLevel, 'critical');
    assert.equal(project.repositories.tasks.get(started.task.id).riskLevel, 'critical');
    assert.equal(checked.risk.recoveryRequired, true);
  } finally {
    project.cleanup();
  }
});

test('AC-009: finish_task 证据不足 → evidence_policy_unmet 且状态不变', { skip: SKIP }, async () => {
  const project = makeProject();
  try {
    const started = (await callTool(project, 'start_task', { title: 'strict finish' })).structuredContent;
    const denied = await callTool(project, 'finish_task', { task_id: started.task.id });
    assert.equal(denied.isError, true);
    assert.equal(denied.structuredContent.code, 'evidence_policy_unmet');
    assert.ok(denied.structuredContent.missing.includes('test'));
    assert.equal(project.repositories.tasks.get(started.task.id).status, 'planned', 'no legacy auto-transition');
  } finally {
    project.cleanup();
  }
});

test('AC-010: 证据齐备（含 critical → approval）后 finish_task 成功', { skip: SKIP }, async () => {
  const project = makeProject();
  try {
    const started = (await callTool(project, 'start_task', { title: 'complete me', required_evidence: ['test', 'review'] })).structuredContent;
    for (const type of ['test', 'review', 'knowledge']) {
      await callTool(project, 'record_evidence', { task_id: started.task.id, evidence_type: type, summary: `${type} run` });
    }
    const firstTry = await callTool(project, 'finish_task', { task_id: started.task.id });
    assert.equal(firstTry.structuredContent.finished, true, JSON.stringify(firstTry.structuredContent));
    assert.equal(project.repositories.tasks.get(started.task.id).status, 'completed');

    const critical = (await callTool(project, 'start_task', { title: 'critical task', declared: 'critical' })).structuredContent;
    for (const type of ['test', 'review', 'knowledge']) {
      await callTool(project, 'record_evidence', { task_id: critical.task.id, evidence_type: type, summary: `${type} run` });
    }
    const blocked = await callTool(project, 'finish_task', { task_id: critical.task.id });
    assert.equal(blocked.structuredContent.code, 'evidence_policy_unmet');
    assert.deepEqual(blocked.structuredContent.missing, ['approval']);

    await callTool(project, 'record_approval', { task_id: critical.task.id, type: 'high_risk', summary: 'approved' });
    const finished = await callTool(project, 'finish_task', { task_id: critical.task.id });
    assert.equal(finished.structuredContent.finished, true);
    assert.equal(project.repositories.tasks.get(critical.task.id).status, 'completed');
  } finally {
    project.cleanup();
  }
});

test('AC-011: review_diff → cloud_context_insufficient；未接线工具 → cloud_not_implemented', { skip: SKIP }, async () => {
  const project = makeProject();
  try {
    const review = await callTool(project, 'review_diff', {});
    assert.equal(review.isError, true);
    assert.equal(review.structuredContent.code, 'cloud_context_insufficient');

    const gate = await callTool(project, 'run_verifier', {});
    assert.equal(gate.structuredContent.code, 'cloud_not_implemented');

    const implemented = project.runtime.application.listImplementedTools();
    for (const tool of ['start_task', 'gate_status', 'record_approval', 'project_init', 'project_status', 'get_template', 'get_next_action', 'risk_check', 'finish_task']) {
      assert.ok(implemented.includes(tool), `${tool} must be wired`);
    }
  } finally {
    project.cleanup();
  }
});

test('AC-012: 命令层无本机 IO import；APPROVAL_TYPES 单一来源', () => {
  const commands = readFileSync(fileURLToPath(new URL('./cloud-commands.mjs', import.meta.url)), 'utf-8');
  assert.equal(/from 'node:fs'/.test(commands), false, 'cloud-commands must not import node:fs');
  assert.equal(/from 'node:child_process'/.test(commands), false, 'cloud-commands must not import node:child_process');

  const approvals = readFileSync(fileURLToPath(new URL('./approvals.mjs', import.meta.url)), 'utf-8');
  assert.ok(approvals.includes("from './contracts.mjs'"), 'approvals.mjs must reuse the single APPROVAL_TYPES source');
  assert.equal(/export const APPROVAL_TYPES = Object\.freeze/.test(approvals), false, 'APPROVAL_TYPES must not be re-declared');
  assert.deepEqual([...APPROVAL_TYPES], ['baseline', 'requirement', 'ui', 'architecture', 'tech_stack', 'high_risk', 'waiver']);
});

// ────────────────────────────────────────────────────────────────
// D13：Cloud strict governance 强制
// ────────────────────────────────────────────────────────────────

test('AC-005: 装配期守卫——显式关闭 strict 直接拒绝启动', { skip: SKIP }, () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-cloud-strict-'));
  const db = openHarnessDatabaseSync({ file: join(rootDir, 'cloud.sqlite'), DatabaseSync });
  try {
    assert.throws(
      () => createCloudRuntime({ db, config: { governance: { strictGovernance: false } }, env: ENV }),
      /strict governance cannot be disabled/,
    );
    assert.throws(
      () => createCloudRuntime({ db, config: { strictGovernance: false }, env: ENV }),
      /strict governance cannot be disabled/,
    );
    const ok = createCloudRuntime({ db, config: {}, env: ENV });
    assert.equal(ok.strictGovernance, true);
  } finally {
    try { db.close(); } catch { /* closed */ }
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('AC-006: 运行期守卫（纵深防御）——命令层直连 + 关闭配置仍拒绝完工', { skip: SKIP }, async () => {
  const project = makeProject();
  try {
    const hostile = createCloudCommands({
      repositories: project.repositories,
      evidence: createBoundaryEvidenceRepository(project.repositories.evidence),
      db: project.db,
      config: { governance: { strictGovernance: false } },
    });
    const result = await hostile.finish_task({ task_id: 'TASK-CLOUD-1' });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.code, 'strict_governance_required');
    assert.equal(project.repositories.tasks.get('TASK-CLOUD-1').status, 'planned', 'status must not change');

    const honest = createCloudCommands({
      repositories: project.repositories,
      evidence: createBoundaryEvidenceRepository(project.repositories.evidence),
      db: project.db,
      config: {},
    });
    const denied = await honest.finish_task({ task_id: 'TASK-CLOUD-1' });
    assert.equal(denied.structuredContent.code, 'evidence_policy_unmet');
  } finally {
    project.cleanup();
  }
});

test('AC-007: 运行时暴露 strictGovernance，/healthz 与 /readyz 与 /health 等价', { skip: SKIP }, async () => {
  const project = makeProject();
  try {
    assert.equal(project.runtime.strictGovernance, true);
    for (const path of ['/health', '/healthz', '/readyz']) {
      const health = await project.runtime.handleRequest({ method: 'GET', path });
      assert.equal(health.status, 200, `${path} must be 200`);
      const payload = JSON.parse(health.body);
      assert.equal(payload.ok, true);
      assert.equal(payload.runtime, 'cloud');
      assert.equal(payload.strictGovernance, true);
    }
  } finally {
    project.cleanup();
  }
});

test('AC-008: 无 legacy 回退——无证据任务跑遍所有已接线工具后仍未 completed', { skip: SKIP }, async () => {  const project = makeProject();
  try {
    const started = (await callTool(project, 'start_task', { title: 'sweep task' })).structuredContent;
    const implemented = project.runtime.application.listImplementedTools();
    const argsByTool = {
      start_task: { title: 'another task' },
      get_task: { task_id: started.task.id },
      list_tasks: {},
      gate_status: {},
      record_approval: { task_id: started.task.id, type: 'requirement' },
      project_init: { project_id: 'PROJECT-SWEEP' },
      project_status: {},
      get_template: { template_id: 'no-such-template' },
      get_next_action: { task_id: started.task.id },
      risk_check: { task_id: started.task.id },
      finish_task: { task_id: started.task.id },
      record_evidence: { task_id: started.task.id, evidence_type: 'log', summary: 'sweep' },
      review_diff: {},
    };
    for (const tool of implemented) {
      await callTool(project, tool, argsByTool[tool] ?? {}, 500);
      const status = project.repositories.tasks.get(started.task.id).status;
      assert.notEqual(status, 'completed', `${tool} must not complete a task without its evidence policy`);
    }
  } finally {
    project.cleanup();
  }
});

// ────────────────────────────────────────────────────────────────
// Cloud 门禁能力：gate_create / gate_clear
// ────────────────────────────────────────────────────────────────

test('G-AC-007: gate_create 落库并可读回；重复建门被拒', { skip: SKIP }, async () => {
  const project = makeProject();
  try {
    const started = (await callTool(project, 'start_task', { title: '新增：gate task' })).structuredContent;
    const created = (await callTool(project, 'gate_create', { task_id: started.task.id })).structuredContent;
    assert.match(created.gateId, /^GATE-\d{14}-[0-9a-f]{8}$/);
    assert.ok(created.remainingPreparation.length > 0);
    assert.equal(created.phase, 'preparation');

    const persisted = project.repositories.gates.loadLatest();
    assert.equal(persisted.ok, true);
    assert.equal(persisted.gateState.id, created.gateId);
    assert.equal(persisted.gateState.taskId, started.task.id);

    const again = await callTool(project, 'gate_create', { task_id: started.task.id });
    assert.equal(again.isError, true);
    assert.equal(again.structuredContent.code, 'gate_already_active');

    const noTask = await callTool(project, 'gate_create', { task_id: 'TASK-NOPE' }, 501);
    assert.equal(noTask.structuredContent.code, 'task_not_found');
  } finally {
    project.cleanup();
  }
});

test('G-AC-008: gate_clear 逐项清理并推进 get_next_action', { skip: SKIP }, async () => {
  const project = makeProject();
  try {
    const started = (await callTool(project, 'start_task', { title: '新增：gate clear task' })).structuredContent;
    await callTool(project, 'gate_create', { task_id: started.task.id });

    const before = (await callTool(project, 'get_next_action', { task_id: started.task.id })).structuredContent;
    assert.equal(before.action, 'gate_clear');

    const status = (await callTool(project, 'gate_status')).structuredContent;
    const [checkId] = status.remainingPreparation;
    const cleared = (await callTool(project, 'gate_clear', { check_id: checkId, note: 'cleared by test' })).structuredContent;
    assert.equal(cleared.cleared, checkId);
    assert.equal(cleared.remainingPreparation.includes(checkId), false);

    const stored = project.repositories.gates.loadLatest().gateState.checks.find(check => check.id === checkId);
    assert.equal(stored.status, 'done');
    assert.equal(stored.note, 'cleared by test');

    const unknown = await callTool(project, 'gate_clear', { check_id: 'no-such-check' }, 502);
    assert.equal(unknown.structuredContent.code, 'unknown_check');
    const machine = await callTool(project, 'gate_clear', { check_id: 'verify-test' }, 503);
    assert.equal(machine.structuredContent.code, 'check_machine_verified');
  } finally {
    project.cleanup();
  }
});

test('G-AC-005: human-WAIT 检查项需先记录审批，机器校验项不可直清', { skip: SKIP }, async () => {
  const project = makeProject();
  try {
    const started = (await callTool(project, 'start_task', { title: '新增：human wait' })).structuredContent;
    await callTool(project, 'gate_create', { task_id: started.task.id });

    // 清掉除人工门以外的准备项
    const humanGates = new Set(['user-confirmed', 'design-confirmed']);
    let status = (await callTool(project, 'gate_status')).structuredContent;
    for (const checkId of [...status.remainingPreparation]) {
      if (humanGates.has(checkId)) continue;
      await callTool(project, 'gate_clear', { check_id: checkId }, 504);
    }
    status = (await callTool(project, 'gate_status')).structuredContent;
    assert.ok(status.remainingPreparation.includes('user-confirmed'), 'user-confirmed must stay pending');
    assert.ok(status.remainingPreparation.every(id => humanGates.has(id)), `unexpected leftover: ${status.remainingPreparation}`);

    const denied = await callTool(project, 'gate_clear', { check_id: 'user-confirmed' }, 505);
    assert.equal(denied.structuredContent.code, 'human_approval_required');
    assert.equal(
      project.repositories.gates.loadLatest().gateState.checks.find(check => check.id === 'user-confirmed').status,
      'pending',
      'refused clear must not persist',
    );

    await callTool(project, 'record_approval', { task_id: started.task.id, type: 'requirement', summary: 'approved' }, 506);
    for (const checkId of [...status.remainingPreparation]) {
      const cleared = await callTool(project, 'gate_clear', { check_id: checkId }, 507);
      assert.equal(cleared.structuredContent.cleared, checkId);
    }
    assert.deepEqual((await callTool(project, 'gate_status')).structuredContent.remainingPreparation, []);

    const next = (await callTool(project, 'get_next_action', { task_id: started.task.id })).structuredContent;
    assert.equal(next.action, 'record_evidence');
  } finally {
    project.cleanup();
  }
});
