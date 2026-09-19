/**
 * local-providers.test.mjs — 本机 Provider 契约验证（Batch D / D04/D05，PRD AC-003/AC-004/AC-005）
 *
 * 通过 bin/provider-contract.mjs 的同一套行为用例驱动 3 个本机 Provider；
 * D08 的提交式实现 / D07 的 Sqlite 装配将以同一套件驱动（无需修改套件）。
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { createLocalProviders } from './local-providers.mjs';
import { runProviderContractTests } from './provider-contract.mjs';
import { validateProviderImplementation } from './provider-ports.mjs';

const PROVIDER_KEY_BY_KIND = {
  ProjectContextProvider: 'projectContext',
  TaskContextProvider: 'taskContext',
  GitSnapshotProvider: 'gitSnapshot',
};

/** 隔离项目：临时目录 + git 仓库（含初始提交，保证 HEAD 可解析）。 */
function makeProject() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-local-provider-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: rootDir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.email', 'harness@example.test'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'Harness Test'], { cwd: rootDir });
  writeFileSync(join(rootDir, 'package.json'), JSON.stringify({ name: 'provider-fixture', version: '0.0.0' }, null, 2));
  execFileSync('git', ['add', '.'], { cwd: rootDir, stdio: 'pipe' });
  execFileSync('git', ['commit', '-m', 'fixture: initial'], { cwd: rootDir, stdio: 'pipe' });
  return { rootDir, config: structuredClone(DEFAULT_CONFIG), cleanup: () => rmSync(rootDir, { recursive: true, force: true }) };
}

/** 写入种子文件并提交（Git 端口契约用例依赖 HEAD 内容可读）。 */
function makeSeedFile(rootDir) {
  return (relPath, content) => {
    const abs = join(rootDir, relPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf-8');
    execFileSync('git', ['add', relPath], { cwd: rootDir, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', `seed ${relPath}`], { cwd: rootDir, stdio: 'pipe' });
  };
}

test('AC-003: createLocalProviders 的 3 个 Provider 满足端口契约', () => {
  const project = makeProject();
  try {
    const providers = createLocalProviders({ rootDir: project.rootDir, config: project.config });
    for (const [kind, key] of Object.entries(PROVIDER_KEY_BY_KIND)) {
      const result = validateProviderImplementation(kind, providers[key]);
      assert.deepEqual(result.errors, [], `${kind}: ${result.errors.join('; ')}`);
    }
  } finally {
    project.cleanup();
  }
});

for (const [kind, key] of Object.entries(PROVIDER_KEY_BY_KIND)) {
  runProviderContractTests({
    kind,
    label: 'local',
    makeProvider: () => {
      const project = makeProject();
      const providers = createLocalProviders({ rootDir: project.rootDir, config: project.config });
      return {
        provider: providers[key],
        seedFile: makeSeedFile(project.rootDir),
        cleanup: project.cleanup,
      };
    },
  });
}

test('AC-004: 契约套件不依赖任何具体 Provider 实现', () => {
  const source = readFileSync(fileURLToPath(new URL('./provider-contract.mjs', import.meta.url)), 'utf-8');
  assert.equal(/from '\.\/local-providers\.mjs'/.test(source), false, 'suite must not import the local adapters');
  assert.equal(/from '\.\/project-brain\.mjs'/.test(source), false, 'suite must not import brain internals');
  assert.equal(/from '\.\/[^']*(sqlite|submitted)[^']*'/.test(source), false, 'suite must not import cloud adapters');
});
