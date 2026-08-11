import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadPlugins, normalizePlugins, PLUGIN_API_VERSION, validatePluginManifest } from './plugins.mjs';

test('plugin import failures are returned as fail-closed errors', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-plugin-'));
  try {
    mkdirSync(join(rootDir, 'harness', 'plugins'), { recursive: true });
    writeFileSync(join(rootDir, 'harness', 'plugins', 'broken.mjs'), 'throw new Error("broken plugin")');
    const loaded = await loadPlugins(rootDir, {});
    assert.equal(loaded.errors.length, 1);
    assert.match(loaded.errors[0], /broken plugin/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('invalid plugin contracts are errors instead of skipped warnings', () => {
  const normalized = normalizePlugins({ checks: [{ id: 'missing-run', label: 'bad' }] });
  assert.equal(normalized.checks.length, 0);
  assert.equal(normalized.errors.length, 1);
});

test('1.0 plugin manifests negotiate capabilities and reject future APIs', () => {
  assert.deepEqual(validatePluginManifest({ name: 'sample', apiVersion: PLUGIN_API_VERSION, capabilities: ['checks'] }), { errors: [], warnings: [] });
  assert.match(validatePluginManifest({ name: 'future', apiVersion: '9.0', capabilities: [] }).errors[0], /unsupported/);
  assert.match(validatePluginManifest(null).warnings[0], /legacy/);
  assert.match(validatePluginManifest(null, { strict: true }).errors[0], /required/);
});
