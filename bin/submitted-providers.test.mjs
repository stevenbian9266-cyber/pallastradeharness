/**
 * submitted-providers.test.mjs — Cloud（Submitted）Provider 契约验证（Batch D / D08，PRD AC-006~AC-009/AC-012/AC-013）
 *
 * 关键：与 bin/local-providers.test.mjs 复用**同一套**契约用例（bin/provider-contract.mjs），
 * 仅替换 fixture（Local → Submitted），确保 Cloud 与 Local 行为一致（防双轨漂移）。
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { buildGitSnapshotSubmission, buildProjectContextSubmission, buildTaskContextSubmission } from './submitted-context.mjs';
import { createSubmittedProviders, recordSubmission } from './submitted-providers.mjs';
import { runProviderContractTests } from './provider-contract.mjs';
import { validateProviderImplementation } from './provider-ports.mjs';
import { openHarnessDatabaseSync } from './sqlite-store.mjs';

let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  DatabaseSync = null;
}

const SKIP = typeof DatabaseSync === 'function' ? false : 'node:sqlite unavailable (requires Node >= 22.5)';

const PROVIDER_KEY_BY_KIND = {
  ProjectContextProvider: 'projectContext',
  TaskContextProvider: 'taskContext',
  GitSnapshotProvider: 'gitSnapshot',
};

const GIT_SUBMISSION = {
  id: 'SUB-git-1',
  task_id: 'TASK-SUB-1',
  commit: 'a1b2c3d4e5',
  base_commit: 'e4f5a6b7c8',
  changed_files: ['bin/x.mjs', 'docs/y.md'],
  tree_hash: 'sha256:tree',
  diff_hash: 'sha256:diff',
  workspace_hash: 'sha256:ws',
  summary: '2 files changed',
};

/** 隔离项目：临时目录 + 文件库（迁移到当前 schema 版本）。 */
function makeProject() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-submitted-'));
  const db = openHarnessDatabaseSync({ file: join(rootDir, 'cloud.sqlite'), DatabaseSync });
  const config = structuredClone(DEFAULT_CONFIG);
  return {
    rootDir,
    config,
    db,
    cleanup: () => {
      try { db.close(); } catch { /* closed */ }
      rmSync(rootDir, { recursive: true, force: true });
    },
  };
}

/** 带上提交内容的 fixture（契约用例自身不需要提交数据，但真实 Cloud 场景总是先提交）。 */
function makeSeededProject() {
  const project = makeProject();
  recordSubmission({ db: project.db, submission: buildProjectContextSubmission({ id: 'PROJECT-1', summary: 'project submitted' }) });
  recordSubmission({ db: project.db, submission: buildTaskContextSubmission({ task_id: 'TASK-SUB-1', summary: 'task submitted' }) });
  recordSubmission({ db: project.db, submission: buildGitSnapshotSubmission(GIT_SUBMISSION) });
  return project;
}

test('AC-006: createSubmittedProviders 的 3 个 Provider 满足端口契约', { skip: SKIP }, () => {
  const project = makeProject();
  try {
    const providers = createSubmittedProviders({ db: project.db, config: project.config });
    for (const [kind, key] of Object.entries(PROVIDER_KEY_BY_KIND)) {
      const result = validateProviderImplementation(kind, providers[key]);
      assert.deepEqual(result.errors, [], `${kind}: ${result.errors.join('; ')}`);
    }
  } finally {
    project.cleanup();
  }
});

if (SKIP) {
  test('AC-007: submitted 契约套件（跳过：node:sqlite 不可用）', { skip: SKIP }, () => {});
} else {
  for (const [kind, key] of Object.entries(PROVIDER_KEY_BY_KIND)) {
    runProviderContractTests({
      kind,
      label: 'submitted',
      makeProvider: () => {
        const project = makeSeededProject();
        return {
          provider: createSubmittedProviders({ db: project.db, config: project.config })[key],
          cleanup: project.cleanup,
        };
      },
    });
  }
}

test('AC-008: 提交→读取链路（profile / status / search / contextPack / changedFiles）', { skip: SKIP }, () => {
  const project = makeSeededProject();
  try {
    const providers = createSubmittedProviders({ db: project.db, config: project.config });
    assert.equal(providers.projectContext.profile().id, 'PROJECT-1');
    assert.equal(providers.projectContext.status().indexed, true);
    assert.deepEqual(providers.projectContext.search('x').results, []);
    assert.equal(providers.taskContext.contextPack({ id: 'TASK-SUB-1' }).summary, 'task submitted');
    assert.deepEqual(providers.gitSnapshot.changedFiles().files, ['bin/x.mjs', 'docs/y.md']);
  } finally {
    project.cleanup();
  }
});

test('AC-009: Cloud 不保存完整 diff/源码（仅 hash + 文件清单）', { skip: SKIP }, () => {
  const project = makeSeededProject();
  try {
    const providers = createSubmittedProviders({ db: project.db, config: project.config });
    const diff = providers.gitSnapshot.diff();
    assert.equal(diff.diff, '', 'cloud must not serve a full diff');
    assert.equal(diff.diff_hash, 'sha256:diff');
    assert.equal(providers.gitSnapshot.showAtRef('HEAD', 'bin/x.mjs').content, null);

    const rows = project.db.prepare('SELECT data_json FROM git_snapshots').all().map(row => row.data_json).join('\n');
    for (const key of ['"content"', '"patch"', '"full_diff"', '"source_code"']) {
      assert.equal(rows.includes(key), false, `cloud snapshot rows must not contain ${key}`);
    }
  } finally {
    project.cleanup();
  }
});

test('AC-012: 迁移 v2 已应用（提交表存在且版本记录完整）', { skip: SKIP }, () => {
  const project = makeProject();
  try {
    const names = new Set(project.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name));
    assert.ok(names.has('context_submissions'), 'context_submissions must exist');
    assert.ok(names.has('git_snapshots'), 'git_snapshots must exist');
    const versions = project.db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(row => Number(row.version));
    assert.deepEqual(versions, [1, 2]);
  } finally {
    project.cleanup();
  }
});

test('AC-013: Cloud 提交/证据模块不 import 本机 IO 模块', () => {
  for (const file of ['./submitted-context.mjs', './submitted-providers.mjs', './evidence-boundary.mjs']) {
    const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf-8');
    assert.equal(/from 'node:fs'/.test(source), false, `${file} must not import node:fs`);
    assert.equal(/from 'node:child_process'/.test(source), false, `${file} must not import node:child_process`);
  }
});
