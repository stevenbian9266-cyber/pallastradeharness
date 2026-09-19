/**
 * file-repositories.test.mjs — File 适配器契约验证（Batch D / D03，PRD AC-002/AC-003）
 *
 * 通过 bin/repository-contract.mjs 的同一套行为用例驱动 7 个 File 适配器；
 * D07 将以同一套件驱动 Sqlite 适配器（无需修改套件）。
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { createContract } from './contracts.mjs';
import { createFileRepositories } from './file-repositories.mjs';
import { runRepositoryContractTests } from './repository-contract.mjs';
import { validatePortImplementation } from './runtime-ports.mjs';

const REPO_KEY_BY_KIND = {
  ProjectRepository: 'project',
  ArtifactRepository: 'artifacts',
  TaskRepository: 'tasks',
  GateRepository: 'gates',
  ApprovalRepository: 'approvals',
  EvidenceRepository: 'evidence',
  EventRepository: 'events',
};

function makeProject() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-file-repo-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: rootDir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.email', 'harness@example.test'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'Harness Test'], { cwd: rootDir });
  const config = structuredClone(DEFAULT_CONFIG);
  return { rootDir, config, cleanup: () => rmSync(rootDir, { recursive: true, force: true }) };
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

test('AC-002: createFileRepositories 的 7 个适配器满足端口契约', () => {
  const project = makeProject();
  try {
    const repositories = createFileRepositories({ rootDir: project.rootDir, config: project.config });
    for (const [kind, key] of Object.entries(REPO_KEY_BY_KIND)) {
      const result = validatePortImplementation(kind, repositories[key]);
      assert.deepEqual(result.errors, [], `${kind}: ${result.errors.join('; ')}`);
    }
  } finally {
    project.cleanup();
  }
});

for (const [kind, key] of Object.entries(REPO_KEY_BY_KIND)) {
  runRepositoryContractTests({
    kind,
    label: 'file',
    makeRepository: () => {
      const project = makeProject();
      const repositories = createFileRepositories({ rootDir: project.rootDir, config: project.config });
      return {
        repo: repositories[key],
        cleanup: project.cleanup,
        createTask: id => {
          const task = makeTask(id);
          repositories.tasks.save(task);
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

test('AC-003: 契约套件不依赖任何具体适配器实现', () => {
  const source = readFileSync(fileURLToPath(new URL('./repository-contract.mjs', import.meta.url)), 'utf-8');
  assert.equal(/from '\.\/file-repositories\.mjs'/.test(source), false, 'suite must not import the File adapters');
  assert.equal(/from '\.\/[^']*sqlite[^']*'/.test(source), false, 'suite must not import sqlite adapters');
});
