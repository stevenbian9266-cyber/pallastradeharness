import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { resolveSmartDir, resolveSmartPath } from './eval-ai.mjs';
import { check as checkEval } from './eval-llm.mjs';
import { check as checkGenerated } from './generated-check.mjs';
import { getChangedFiles } from './git-files.mjs';

test('eval-llm check reports missing generated config', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-eval-'));
  try {
    mkdirSync(join(rootDir, 'harness', 'scenarios'), { recursive: true });
    writeFileSync(join(rootDir, 'harness', 'scenarios', 'scenarios.json'), JSON.stringify({ scenarios: [{ id: 'GS-001', name: 'x' }] }));
    const result = checkEval({ rootDir, config: { scenarios: 'harness/scenarios/scenarios.json' } });
    assert.equal(result.ok, false);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('generated-check fails closed when a configured generator fails', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-generated-'));
  const previous = process.exitCode;
  try {
    const result = checkGenerated({
      rootDir,
      config: { generatedCheck: { checks: [{ name: 'broken', cwd: '.', cmd: 'node -e "process.exit(9)"' }] } },
    });
    assert.equal(result.ok, false);
    assert.equal(result.failures.length, 1);
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previous;
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('generated-check compares before and after instead of rejecting pre-existing changes', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-generated-baseline-'));
  const previous = process.exitCode;
  try {
    execFileSync('git', ['init', '-b', 'main'], { cwd: rootDir });
    execFileSync('git', ['config', 'user.email', 'harness@example.test'], { cwd: rootDir });
    execFileSync('git', ['config', 'user.name', 'Harness Test'], { cwd: rootDir });
    writeFileSync(join(rootDir, 'config.json'), '{"before":true}\n');
    execFileSync('git', ['add', 'config.json'], { cwd: rootDir });
    execFileSync('git', ['commit', '-m', 'baseline'], { cwd: rootDir });
    writeFileSync(join(rootDir, 'config.json'), '{"planned":true}\n');
    const result = checkGenerated({
      rootDir,
      config: { generatedCheck: { checks: [{ name: 'noop', cwd: '.', cmd: 'node -e "process.exit(0)"' }] } },
    });
    assert.equal(result.ok, true);
    assert.equal(result.drift, false);
  } finally {
    process.exitCode = previous;
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('generated-check detects newly created untracked generated files', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-generated-drift-'));
  const previous = process.exitCode;
  try {
    execFileSync('git', ['init', '-b', 'main'], { cwd: rootDir });
    execFileSync('git', ['config', 'user.email', 'harness@example.test'], { cwd: rootDir });
    execFileSync('git', ['config', 'user.name', 'Harness Test'], { cwd: rootDir });
    writeFileSync(join(rootDir, 'README.md'), 'baseline\n');
    execFileSync('git', ['add', 'README.md'], { cwd: rootDir });
    execFileSync('git', ['commit', '-m', 'baseline'], { cwd: rootDir });
    const result = checkGenerated({
      rootDir,
      config: { generatedCheck: { checks: [{ name: 'generate', cwd: '.', cmd: 'node -e "require(\'fs\').writeFileSync(\'generated.json\', \'{}\')"' }] } },
    });
    assert.equal(result.ok, false);
    assert.equal(result.drift, true);
  } finally {
    process.exitCode = previous;
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('git arguments are passed without shell evaluation', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-git-'));
  const marker = join(rootDir, 'injected.txt');
  try {
    const result = getChangedFiles(rootDir, `HEAD;node -e "require('fs').writeFileSync('${marker.replaceAll('\\', '\\\\')}','x')"`);
    assert.ok(result.errors.length > 0);
    assert.equal(existsSync(marker), false);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('changed files preserve Unicode paths instead of Git quoted octal escapes', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-unicode-'));
  try {
    execFileSync('git', ['init', '-b', 'main'], { cwd: rootDir });
    execFileSync('git', ['config', 'user.email', 'harness@example.test'], { cwd: rootDir });
    execFileSync('git', ['config', 'user.name', 'Harness Test'], { cwd: rootDir });
    writeFileSync(join(rootDir, 'baseline.txt'), 'baseline\n');
    execFileSync('git', ['add', 'baseline.txt'], { cwd: rootDir });
    execFileSync('git', ['commit', '-m', 'baseline'], { cwd: rootDir });
    writeFileSync(join(rootDir, '升级方案.md'), '# plan\n');
    const result = getChangedFiles(rootDir, 'HEAD');
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.files, ['升级方案.md']);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('skill freshness resolves convention globs and storefront-relative directories', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-freshness-'));
  try {
    mkdirSync(join(rootDir, 'storefront', 'src', 'components', 'home'), { recursive: true });
    writeFileSync(join(rootDir, 'storefront', 'src', 'components', 'home', 'Hero.tsx'), 'export {}\n');
    mkdirSync(join(rootDir, 'platform', 'packages'), { recursive: true });
    assert.equal(resolveSmartDir(rootDir, 'components/home'), join(rootDir, 'storefront', 'src', 'components', 'home'));
    assert.equal(resolveSmartPath(rootDir, 'components/home/Hero.tsx'), join(rootDir, 'storefront', 'src', 'components', 'home', 'Hero.tsx'));
    assert.equal(resolveSmartPath(rootDir, 'platform/packages/*/tests/*.test.ts'), join(rootDir, 'platform', 'packages'));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
