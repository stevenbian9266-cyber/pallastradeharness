import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { startTask } from './task-orchestrator.mjs';
import { getVerifier, listVerifiers, runVerifier, verifierDefinitionHash } from './verifier.mjs';
import { collectGlob, expandCommandArgs } from './glob-utils.mjs';

function project() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-verifier-'));
  mkdirSync(join(rootDir, 'src'), { recursive: true });
  writeFileSync(join(rootDir, 'README.md'), '# Sample\n');
  writeFileSync(join(rootDir, 'src', 'ok.test.mjs'), "import { test } from 'node:test'; test('ok', () => {});\n");
  execFileSync('git', ['init', '-b', 'main'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.email', 'harness@example.test'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'Harness Test'], { cwd: rootDir });
  execFileSync('git', ['add', '.'], { cwd: rootDir });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: rootDir });
  const config = structuredClone(DEFAULT_CONFIG);
  const task = startTask({ rootDir, config, title: 'T' });
  return { rootDir, config, task };
}

test('listVerifiers exposes registered verifiers from config', () => {
  const { config } = project();
  const verifiers = listVerifiers(config);
  assert.ok(verifiers.length >= 2);
  assert.ok(verifiers.some(v => v.id === 'unit' && v.type === 'test'));
});

test('getVerifier returns null for unknown id', () => {
  const { config } = project();
  assert.equal(getVerifier(config, 'nope'), null);
  assert.ok(getVerifier(config, 'unit'));
});

test('verifierDefinitionHash is stable and sensitive to definition changes', () => {
  const v1 = { type: 'test', command: ['node', '--test'], profiles: ['quick'] };
  const v2 = { type: 'test', command: ['node', '--test'], profiles: ['standard'] };
  assert.equal(verifierDefinitionHash(v1), verifierDefinitionHash({ profiles: ['quick'], command: ['node', '--test'], type: 'test' }));
  assert.notEqual(verifierDefinitionHash(v1), verifierDefinitionHash(v2));
});

test('collectGlob matches recursively and skips ignored dirs', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-glob-'));
  try {
    mkdirSync(join(rootDir, 'src'), { recursive: true });
    mkdirSync(join(rootDir, 'node_modules'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'a.test.mjs'), '');
    writeFileSync(join(rootDir, 'b.test.mjs'), '');
    writeFileSync(join(rootDir, 'node_modules', 'c.test.mjs'), '');
    const files = collectGlob(rootDir, '**/*.test.mjs');
    const rel = files.map(f => f.replaceAll('\\', '/'));
    assert.ok(rel.some(f => f.endsWith('src/a.test.mjs')));
    assert.ok(rel.some(f => f.endsWith('b.test.mjs')));
    assert.ok(!rel.some(f => f.includes('node_modules')), 'node_modules must be skipped');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('expandCommandArgs expands glob segments and keeps plain args', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-glob2-'));
  try {
    mkdirSync(join(rootDir, 'src'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'a.test.mjs'), '');
    const out = expandCommandArgs(rootDir, ['node', '--test', '**/*.test.mjs']);
    assert.equal(out[0], 'node');
    assert.equal(out[1], '--test');
    assert.ok(out.slice(2).some(a => a.endsWith('a.test.mjs')));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('runVerifier records evidence bound to verifierId (not diagnostic)', () => {
  const { rootDir, config, task } = project();
  try {
    const evidence = runVerifier({ rootDir, config, task, verifierId: 'unit' });
    assert.equal(evidence.verifierId, 'unit');
    assert.ok(evidence.verifierDefinitionHash);
    assert.equal(evidence.metadata?.diagnostic, undefined);
    assert.equal(evidence.success, true);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('runVerifier rejects unknown verifier', () => {
  const { rootDir, config, task } = project();
  try {
    assert.throws(() => runVerifier({ rootDir, config, task, verifierId: 'nope' }), /Unknown verifier/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
