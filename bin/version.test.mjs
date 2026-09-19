/**
 * version.test.mjs — 版本单一事实源契约（Batch A TASK-A03）
 *
 * 断言 package.json 是唯一产品版本来源，运行时（MCP serverInfo / mcp:config）无漂移，
 * 且包自身不允许回退到旧版本 devDependency（避免 Runtime 意外加载旧 package）。
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { createMcpHandler } from './mcp.mjs';
import { DEFAULT_PACKAGE_SPEC } from './mcp-config.mjs';
import { getHarnessName, getHarnessPackageSpec, getHarnessVersion, getMajorMinor, readHarnessManifest } from './version.mjs';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

test('version: package.json 是唯一产品版本事实源', () => {
  assert.equal(getHarnessVersion(), manifest.version);
  assert.equal(getHarnessName(), manifest.name);
  assert.equal(readHarnessManifest().version, manifest.version);
});

test('version: MCP serverInfo 读取 package.json（无硬编码漂移）', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-version-'));
  try {
    const handler = createMcpHandler({ rootDir, config: structuredClone(DEFAULT_CONFIG) });
    const initialized = await handler({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    assert.equal(initialized.serverInfo.name, manifest.name);
    assert.equal(initialized.serverInfo.version, manifest.version);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('version: mcp:config 默认 spec = <name>@<major.minor>', () => {
  const expected = `${manifest.name}@${manifest.version.split('.').slice(0, 2).join('.')}`;
  assert.equal(DEFAULT_PACKAGE_SPEC, expected);
  assert.equal(getHarnessPackageSpec(), expected);
  assert.equal(getMajorMinor(), manifest.version.split('.').slice(0, 2).join('.'));
  assert.equal(getMajorMinor('2.3.9'), '2.3');
  assert.equal(getMajorMinor('2.3'), '2.3');
  assert.equal(getMajorMinor('dev'), 'dev');
});

test('version: 包自身不得声明自己为 devDependency（防旧包漂移）', () => {
  const selfName = getHarnessName();
  const devDependencies = manifest.devDependencies || {};
  assert.equal(Object.hasOwn(devDependencies, selfName), false);
  const dependencies = manifest.dependencies || {};
  assert.equal(Object.hasOwn(dependencies, selfName), false);
});
