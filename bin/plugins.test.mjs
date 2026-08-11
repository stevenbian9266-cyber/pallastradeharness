import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadPlugins, normalizePlugins } from './plugins.mjs';

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
