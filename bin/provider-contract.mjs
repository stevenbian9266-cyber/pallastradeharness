/**
 * provider-contract.mjs — Provider 端口契约测试套件（Batch D / D04/D05）
 *
 * 同一套行为断言可对**任意**实现运行：
 *   - Local 适配器（本批，bin/local-providers.mjs，由 bin/local-providers.test.mjs 驱动）；
 *   - Cloud 提交式实现（D08）与 Sqlite 装配（D07）复用同一套用例 + 独立 fixture。
 *
 * 约束（PRD AC-004）：本套件不得 import 任何具体实现。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

/** 契约用的任务对象（TaskContextProvider 输入；字段与 Task 契约一致）。 */
const CONTRACT_TASK = Object.freeze({
  id: 'TASK-CT-PROVIDER',
  title: 'contract task',
  goals: ['exercise provider contract'],
  acceptanceCriteria: ['contract suite passes'],
});

/** Git 契约用种子文件（fixture 负责写入并提交）。 */
const SEED_FILE = 'contract-seed.txt';
const SEED_CONTENT = 'provider-contract';

const CASES = {
  ProjectContextProvider: [
    { name: 'profile returns an object with string id', run: provider => { assert.equal(typeof provider.profile()?.id, 'string'); } },
    { name: 'status returns an indexed flag', run: provider => { assert.equal(typeof provider.status()?.indexed, 'boolean'); } },
    { name: 'search returns a results array', run: provider => { assert.ok(Array.isArray(provider.search('contract', 3)?.results)); } },
    { name: 'index returns an assets array', run: provider => { assert.ok(Array.isArray(provider.index()?.assets)); } },
  ],
  TaskContextProvider: [
    { name: 'contextPack returns an assets array', run: provider => { assert.ok(Array.isArray(provider.contextPack(CONTRACT_TASK)?.assets)); } },
    {
      name: 'recordDecision returns a decision with string id',
      run: provider => {
        const value = provider.recordDecision({
          taskId: CONTRACT_TASK.id,
          title: 'contract decision',
          decision: 'use provider port',
          reason: 'contract suite',
        });
        assert.equal(typeof value?.id, 'string');
        assert.equal(value.taskId, CONTRACT_TASK.id);
      },
    },
  ],
  GitSnapshotProvider: [
    { name: 'changedFiles returns an envelope with files array', run: provider => { assert.ok(Array.isArray(provider.changedFiles('HEAD')?.files)); } },
    { name: 'diff returns an envelope with diff string', run: provider => { assert.equal(typeof provider.diff('HEAD')?.diff, 'string'); } },
    {
      name: 'showAtRef reads a committed file（需要 seedFile fixture）',
      run: (provider, fx) => {
        if (!fx.seedFile) return;
        fx.seedFile(SEED_FILE, SEED_CONTENT);
        assert.ok(String(provider.showAtRef('HEAD', SEED_FILE)?.content).includes(SEED_CONTENT));
      },
    },
    {
      name: 'snapshot round-trips through write/read/list',
      run: provider => {
        const snapshot = provider.createSnapshot({ taskId: CONTRACT_TASK.id, branch: 'main', baseHead: 'HEAD', allow: [] });
        assert.equal(typeof snapshot?.id, 'string');
        provider.writeSnapshot(snapshot);
        assert.equal(provider.readSnapshot(snapshot.id)?.id, snapshot.id);
        assert.ok(provider.listSnapshots().some(item => item?.id === snapshot.id));
      },
    },
  ],
};

/** 契约用例表（只读；供审查与文档引用）。 */
export const PROVIDER_CONTRACT_CASES = Object.freeze(CASES);

/**
 * 对某个 Provider 实现运行契约套件（每个用例一个独立测试；fixture 负责隔离与清理）。
 * @param {object} options
 * @param {string} options.kind PROVIDER_PORT_KINDS 之一
 * @param {() => {provider: object, seedFile?: (relPath: string, content: string) => void, cleanup?: () => void}} options.makeProvider
 *        每个用例调用一次：返回**全新**实现（隔离项目）与可选清理/种子写入器；
 *        Git 端口要求 fixture 提供可用 git 仓库（git init + 初始提交）
 * @param {string} [options.label] 用例名前缀（如 local / submitted）
 */
export function runProviderContractTests({ kind, makeProvider, label = 'provider' }) {
  const cases = CASES[kind];
  if (!cases) throw new TypeError(`no contract cases for kind: ${kind}`);
  if (typeof makeProvider !== 'function') {
    throw new TypeError('runProviderContractTests requires makeProvider');
  }
  for (const contractCase of cases) {
    test(`${label}:${kind}: ${contractCase.name}`, async t => {
      const made = makeProvider();
      if (!made || typeof made.provider !== 'object' || made.provider === null) {
        throw new TypeError(`${label}:${kind}: fixture must provide { provider }`);
      }
      t.after(() => { try { made.cleanup?.(); } catch { /* fixture cleanup best-effort */ } });
      await contractCase.run(made.provider, { seedFile: made.seedFile });
    });
  }
}
