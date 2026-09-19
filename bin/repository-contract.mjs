/**
 * repository-contract.mjs — 仓储端口契约测试套件（Batch D / D03）
 *
 * 同一套行为断言可对**任意**适配器运行：
 *   - File 适配器（本批，bin/file-repositories.mjs，由 bin/file-repositories.test.mjs 驱动）；
 *   - Sqlite 适配器（D07，同一套用例 + 独立 fixture，无需改动本文件）。
 *
 * 约束（PRD AC-003）：本套件不得 import 任何具体适配器实现。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

const CASES = {
  TaskRepository: [
    { name: 'save → get round-trips', run: async (repo, fx) => { const task = await fx.createTask('TASK-CT-1'); assert.equal(repo.get(task.id).id, task.id); } },
    { name: 'get unknown returns null', run: async repo => { assert.equal(repo.get('TASK-CT-NOPE'), null); } },
    { name: 'list includes persisted task', run: async (repo, fx) => { const task = await fx.createTask('TASK-CT-2'); assert.ok(repo.list().some(item => item.id === task.id)); } },
  ],
  GateRepository: [
    { name: 'loadLatest exposes machine-readable ok flag', run: async repo => { const latest = repo.loadLatest(); assert.equal(typeof latest?.ok, 'boolean'); } },
    { name: 'statusSnapshot exposes ok flag', run: async repo => { const snapshot = repo.statusSnapshot(); assert.equal(typeof snapshot?.ok, 'boolean'); } },
    {
      name: 'save → loadLatest round-trips（同 id 覆盖，不重复）',
      run: async repo => {
        const gateState = {
          schemaVersion: '2.0',
          id: 'GATE-CT-1',
          taskType: 'feature',
          taskDescription: 'contract gate',
          taskId: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          cleared: false,
          implementationReady: false,
          checks: [{ id: 'search-bin', label: 'search bin', phase: 'preparation', status: 'pending' }],
        };
        repo.save(gateState);
        const first = repo.loadLatest();
        assert.equal(first.ok, true);
        assert.equal(first.gateState.id, 'GATE-CT-1');
        repo.save({ ...gateState, taskDescription: 'contract gate (updated)' });
        const second = repo.loadLatest();
        assert.equal(second.gateState.taskDescription, 'contract gate (updated)', 'same id must overwrite, not duplicate');
      },
    },
  ],
  ApprovalRepository: [
    { name: 'record → list contains the approval', run: async (repo, fx) => { const task = await fx.createTask('TASK-CT-3'); const record = repo.record({ taskId: task.id, type: 'requirement', summary: 'contract case' }); assert.ok(repo.list().some(item => item.id === record.id)); } },
    { name: 'statuses returns an array', run: async repo => { assert.ok(Array.isArray(repo.statuses())); } },
  ],
  EvidenceRepository: [
    { name: 'record → list returns the evidence for the task', run: async (repo, fx) => { const task = await fx.createTask('TASK-CT-4'); const record = repo.record({ task, evidenceType: 'review', summary: 'contract case' }); assert.ok(repo.list(task.id).some(item => item.id === record.id)); } },
    { name: 'list of unknown task returns an array', run: async repo => { assert.ok(Array.isArray(repo.list('TASK-CT-NOPE'))); } },
  ],
  ArtifactRepository: [
    { name: 'list returns an array', run: async repo => { assert.ok(Array.isArray(repo.list())); } },
    { name: 'get unknown returns null', run: async repo => { assert.equal(repo.get('no-such-artifact'), null); } },
    {
      name: 'upsert → get round-trips（需要 seedFile fixture）',
      run: async (repo, fx) => {
        if (!fx.seedFile) return;
        fx.seedFile('contract/artifact.md', '# contract artifact\n');
        const record = repo.upsert({ id: 'contract-artifact', type: 'constitution', path: 'contract/artifact.md' });
        assert.equal(repo.get('contract-artifact').id, record.id);
      },
    },
  ],
  ProjectRepository: [
    { name: 'getProfile returns null on empty project', run: async repo => { assert.equal(repo.getProfile(), null); } },
    { name: 'listArtifacts returns an array', run: async repo => { assert.ok(Array.isArray(repo.listArtifacts())); } },
    { name: 'getConstitutionVersion returns null on empty project', run: async repo => { assert.equal(repo.getConstitutionVersion(), null); } },
  ],
  EventRepository: [
    {
      name: 'append → list preserves order',
      run: async (repo, fx) => {
        const task = await fx.createTask('TASK-CT-5');
        repo.append(task.id, { type: 'contract.one', payload: { n: 1 } });
        repo.append(task.id, { type: 'contract.two', payload: { n: 2 } });
        const list = repo.list(task.id);
        assert.equal(list.length, 2);
        assert.equal(list[0].type, 'contract.one');
        assert.equal(list[1].payload.n, 2);
      },
    },
    { name: 'list of unknown task returns empty array', run: async repo => { assert.deepEqual(repo.list('TASK-CT-NOPE'), []); } },
  ],
};

/** 契约用例表（只读；供审查与文档引用）。 */
export const REPOSITORY_CONTRACT_CASES = Object.freeze(CASES);

/**
 * 对某个适配器运行契约套件（每个用例一个独立测试；fixture 负责隔离与清理）。
 * @param {object} options
 * @param {string} options.kind 端口种类（RUNTIME_PORT_KINDS 之一）
 * @param {() => {repo: object, createTask: (id: string) => object, cleanup?: () => void, seedFile?: (relPath: string, content: string) => void}} options.makeRepository
 *        每个用例调用一次：返回**全新**适配器（隔离项目）、Task 播种器与可选清理/制品播种器；
 *        `createTask` 必须用**该运行时自己的 TaskRepository**持久化（与被测 kind 无关）
 * @param {string} [options.label] 用例名前缀（如 file / sqlite）
 */
export function runRepositoryContractTests({ kind, makeRepository, label = 'repo' }) {
  const cases = CASES[kind];
  if (!cases) throw new TypeError(`no contract cases for kind: ${kind}`);
  if (typeof makeRepository !== 'function') {
    throw new TypeError('runRepositoryContractTests requires makeRepository');
  }
  for (const contractCase of cases) {
    test(`${label}:${kind}: ${contractCase.name}`, async t => {
      const made = makeRepository();
      if (!made || typeof made.createTask !== 'function') {
        throw new TypeError(`${label}:${kind}: fixture must provide createTask(id)`);
      }
      t.after(() => { try { made.cleanup?.(); } catch { /* fixture cleanup best-effort */ } });
      const fixture = { createTask: made.createTask, seedFile: made.seedFile };
      await contractCase.run(made.repo, fixture);
    });
  }
}
