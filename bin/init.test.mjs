import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), 'harness.mjs');

test('init writes gates.checkDefs and starter policy assets', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-init-'));
  try {
    const result = spawnSync(process.execPath, [CLI, 'init', '--preset', 'single', '--tier', 'standard', '--name', 'sample'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(result.status, 0, result.stderr);
    const config = readFileSync(join(rootDir, 'harness.config.mjs'), 'utf-8');
    assert.match(config, /"checkDefs"/);
    assert.doesNotMatch(config, /"gates"\s*:\s*\{\s*"feature"/);
    assert.match(config, /includeBundled: false/);
    assert.ok(existsSync(join(rootDir, 'harness', 'policies', 'anti-patterns.json')));
    assert.ok(existsSync(join(rootDir, 'harness', 'standards', 'base-standards.json')));
    assert.match(readFileSync(join(rootDir, 'AGENTS.md'), 'utf-8'), /^# sample/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
