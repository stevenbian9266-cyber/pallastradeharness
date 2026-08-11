import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { generateAdapter, updateManagedBlock } from './agent-adapters.mjs';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { loadStandards } from './standards.mjs';

test('managed Agent adapters are idempotent and preserve user text', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-adapter-'));
  try {
    writeFileSync(join(rootDir, 'AGENTS.md'), '# User rules\n\nNever remove this.\n');
    const registry = loadStandards({ rootDir, config: DEFAULT_CONFIG });
    const first = generateAdapter({ rootDir, config: DEFAULT_CONFIG, standards: registry.standards, target: 'codex', write: true });
    const second = generateAdapter({ rootDir, config: DEFAULT_CONFIG, standards: registry.standards, target: 'codex', write: true });
    const content = readFileSync(join(rootDir, 'AGENTS.md'), 'utf-8');
    assert.match(content, /Never remove this/);
    assert.equal((content.match(/harness:managed:start/g) || []).length, 1);
    assert.equal(second.changed, false);
    assert.equal(first.written, true);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('malformed managed markers fail instead of overwriting content', () => {
  assert.throws(() => updateManagedBlock('<!-- harness:managed:start -->\nmissing end', 'x'), /malformed/);
});
