/**
 * sqlite-repositories.test.mjs — Sqlite 仓储契约验证（Batch D / D07，PRD AC-001~AC-004/AC-008/AC-009）
 *
 * 关键：与 bin/file-repositories.test.mjs 复用**同一套**契约用例（bin/repository-contract.mjs），
 * 仅替换 fixture（File → Sqlite）——任何一侧行为漂移都会让 test:core 变红。
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { createContract } from './contracts.mjs';
import { REPOSITORY_CONTRACT_CASES, runRepositoryContractTests } from './repository-contract.mjs';
import { RUNTIME_PORT_KINDS, validatePortImplementation } from './runtime-ports.mjs';
import { createSqliteRepositories } from './sqlite-repositories.mjs';
import { openHarnessDatabaseSync } from './sqlite-store.mjs';

let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  DatabaseSync = null;
}

const SKIP = typeof DatabaseSync === 'function' ? false : 'node:sqlite unavailable (requires Node >= 22.5)';

const REPO_KEY_BY_KIND = {
  ProjectRepository: 'project',
  ArtifactRepository: 'artifacts',
  TaskRepository: 'tasks',
  GateRepository: 'gates',
  ApprovalRepository: 'approvals',
  EvidenceRepository: 'evidence',
  EventRepository: 'events',
};

/** 隔离项目：临时目录 + 文件库（WAL）+ 已迁移 schema。 */
function makeProject() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-sqlite-repo-'));
  const db = openHarnessDatabaseSync({ file: join(rootDir, 'harness.sqlite'), DatabaseSync });
  const config = structuredClone(DEFAULT_CONFIG);
  const repositories = createSqliteRepositories({ db, config });
  return {
    rootDir,
    config,
    db,
    repositories,
    cleanup: () => {
      try { db.close(); } catch { /* closed */ }
      rmSync(rootDir, { recursive: true, force: true });
    },
  };
}

function makeTask(id) {
  return createContract('Task', {
    id,
    title: `contract ${id}`,
    status: 'planned',
    riskLevel: 'quick',
    createdAt: new Date().toISOString(),
  });
}

test('AC-001: createSqliteRepositories 的 7 个适配器满足端口契约', { skip: SKIP }, () => {
  const project = makeProject();
  try {
    for (const [kind, key] of Object.entries(REPO_KEY_BY_KIND)) {
      const result = validatePortImplementation(kind, project.repositories[key]);
      assert.deepEqual(result.errors, [], `${kind}: ${result.errors.join('; ')}`);
    }
  } finally {
    project.cleanup();
  }
});

test('AC-002: 契约套件覆盖全部 7 个端口 kind（无遗漏）', () => {
  for (const kind of RUNTIME_PORT_KINDS) {
    const cases = REPOSITORY_CONTRACT_CASES[kind];
    assert.ok(Array.isArray(cases) && cases.length >= 2, `${kind} must have >= 2 contract cases`);
  }
  assert.deepEqual(Object.keys(REPOSITORY_CONTRACT_CASES).sort(), [...RUNTIME_PORT_KINDS].sort());
});

if (SKIP) {
  test('AC-003: sqlite 适配器契约套件（跳过：node:sqlite 不可用）', { skip: SKIP }, () => {});
} else {
  for (const [kind, key] of Object.entries(REPO_KEY_BY_KIND)) {
    runRepositoryContractTests({
      kind,
      label: 'sqlite',
      makeRepository: () => {
        const project = makeProject();
        return {
          repo: project.repositories[key],
          cleanup: project.cleanup,
          createTask: id => {
            const task = makeTask(id);
            project.repositories.tasks.save(task);
            return task;
          },
          seedFile: (relPath, content) => {
            const abs = join(project.rootDir, relPath);
            mkdirSync(dirname(abs), { recursive: true });
            writeFileSync(abs, content, 'utf-8');
          },
        };
      },
    });
  }
}

test('AC-008: SQL 播种后的非空路径（gate / profile / constitution）', { skip: SKIP }, () => {
  const project = makeProject();
  const { db, repositories } = project;
  try {
    db.prepare(`INSERT INTO projects (id, name, data_json, updated_at) VALUES (?, ?, ?, ?)`)
      .run('PROJECT-1', 'cloud-project', JSON.stringify({ id: 'PROJECT-1', name: 'cloud-project' }), new Date().toISOString());
    db.prepare(`INSERT INTO constitution_versions (version, data_json, created_at) VALUES (?, ?, ?)`)
      .run('constitution-v1', JSON.stringify({ version: 'constitution-v1' }), '2026-09-19T10:00:00.000Z');
    db.prepare(`INSERT INTO project_artifacts (id, type, path, data_json, updated_at) VALUES (?, ?, ?, ?, ?)`)
      .run('artifact-1', 'constitution', 'harness/constitution/architecture.json', JSON.stringify({ id: 'artifact-1' }), new Date().toISOString());
    db.prepare(`INSERT INTO gates (id, task_id, data_json, created_at) VALUES (?, ?, ?, ?)`)
      .run('GATE-1', 'TASK-1', JSON.stringify({
        id: 'GATE-1',
        cleared: false,
        implementationReady: true,
        checks: [
          { id: 'search-bin', phase: 'preparation', status: 'done' },
          { id: 'verify-test', phase: 'verification', status: 'pending' },
        ],
      }), new Date().toISOString());

    assert.equal(repositories.project.getProfile().id, 'PROJECT-1');
    assert.equal(repositories.project.getConstitutionVersion().version, 'constitution-v1');
    assert.equal(repositories.project.listArtifacts().length, 1);

    const latest = repositories.gates.loadLatest();
    assert.equal(latest.ok, true);
    assert.equal(latest.gateId, 'GATE-1');
    const snapshot = repositories.gates.statusSnapshot();
    assert.equal(snapshot.ok, true);
    assert.equal(snapshot.phase, 'implementation');
    assert.deepEqual(snapshot.remainingPreparation, []);
    assert.deepEqual(snapshot.remainingVerification, ['verify-test']);
  } finally {
    project.cleanup();
  }
});

test('AC-009: Cloud 存储模块不 import 本机 IO 模块', () => {
  for (const file of ['./sqlite-store.mjs', './sqlite-repositories.mjs']) {
    const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf-8');
    assert.equal(/from 'node:fs'/.test(source), false, `${file} must not import node:fs`);
    assert.equal(/from 'node:child_process'/.test(source), false, `${file} must not import node:child_process`);
  }
});
