import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { validateContract } from './contracts.mjs';
import { loadStandards } from './standards.mjs';
import { buildChangePlan, reviewDiff } from './supervisor.mjs';

function git(rootDir, args) {
  return execFileSync('git', args, { cwd: rootDir, encoding: 'utf-8' });
}

function project() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-supervisor-'));
  mkdirSync(join(rootDir, 'src'), { recursive: true });
  mkdirSync(join(rootDir, 'server'), { recursive: true });
  writeFileSync(join(rootDir, 'src', 'index.js'), 'export const value = 1\n');
  writeFileSync(join(rootDir, 'server', 'secret.js'), 'export const secret = 1\n');
  writeFileSync(join(rootDir, 'package.json'), JSON.stringify({ name: 'sample', dependencies: {} }, null, 2));
  git(rootDir, ['init', '-b', 'main']);
  git(rootDir, ['config', 'user.email', 'harness@example.test']);
  git(rootDir, ['config', 'user.name', 'Harness Test']);
  git(rootDir, ['add', '.']);
  git(rootDir, ['commit', '-m', 'baseline']);
  return rootDir;
}

test('supervisor emits standard-linked scope and technology findings', () => {
  const rootDir = project();
  try {
    const config = structuredClone(DEFAULT_CONFIG);
    config.layers = [{ id: 'src', path: 'src' }];
    config.standards = { includeBundled: true, sources: [] };
    config.supervisor.boundaries = [{ id: 'client-server', from: 'src/**', denyImports: ['../server/**'] }];
    const registry = loadStandards({ rootDir, config });
    const plan = buildChangePlan({ rootDir, config, task: 'Add UI dependency', base: 'HEAD', allow: ['src/**', 'package.json'], deny: [], standards: registry.standards });
    writeFileSync(join(rootDir, 'src', 'index.js'), "import { secret } from '../server/secret.js'\nexport const value = secret\n");
    writeFileSync(join(rootDir, 'package.json'), JSON.stringify({ name: 'sample', dependencies: { minimatch: '^10.0.0' } }, null, 2));
    writeFileSync(join(rootDir, 'outside.js'), 'export const outside = true\n');
    const { errors, report } = reviewDiff({ rootDir, config, base: 'HEAD', plan, standards: registry.standards });
    assert.deepEqual(errors, []);
    assert.ok(report.findings.some(item => item.standardId === 'STD-SCOPE-001' && item.file === 'outside.js'));
    assert.ok(report.findings.some(item => item.standardId === 'STD-TECH-001'));
    assert.ok(report.findings.some(item => item.standardId === 'STD-ARCH-001'));
    for (const finding of report.findings) assert.deepEqual(validateContract('Finding', finding), []);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
test('supervisor leaves unchanged dependency manifests and in-scope code clean', () => {
  const rootDir = project();
  try {
    const config = structuredClone(DEFAULT_CONFIG);
    config.layers = [{ id: 'src', path: 'src' }];
    config.standards = { includeBundled: true, sources: [] };
    const registry = loadStandards({ rootDir, config });
    const plan = buildChangePlan({ rootDir, config, task: 'Small code fix', base: 'HEAD', allow: ['src/**'], deny: [], standards: registry.standards });
    writeFileSync(join(rootDir, 'src', 'index.js'), 'export const value = 2\n');
    const { report } = reviewDiff({ rootDir, config, base: 'HEAD', plan, standards: registry.standards });
    assert.equal(report.summary.blocking, 0);
    assert.ok(!report.findings.some(item => item.standardId === 'STD-TECH-001'));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
