import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), 'harness.mjs');

function sampleProject() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-ap-'));
  mkdirSync(join(rootDir, 'harness', 'policies'), { recursive: true });
  mkdirSync(join(rootDir, 'src'), { recursive: true });
  return rootDir;
}

test('rule without fileGlob does not crash scanner (regression for v1.2.0)', () => {
  const rootDir = sampleProject();
  try {
    // 复现 v1.2.0 onboard 生成的非法规则：缺 fileGlob
    writeFileSync(join(rootDir, 'harness', 'policies', 'anti-patterns.json'), JSON.stringify({
      rules: [{ id: 'AP-001', pattern: 'color:\\s*#[0-9a-fA-F]{3,6}', message: '硬编码颜色值', severity: 'warning' }],
      severity: 'warning',
    }, null, 2));
    writeFileSync(join(rootDir, 'src', 'app.tsx'), "export const B = () => <div style={{ color: #abc }} />;\n");

    const result = spawnSync(process.execPath, [CLI, 'scan-anti-patterns', '--files', 'src/app.tsx'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(result.status, 0, `scanner must not crash: ${result.stderr + result.stdout}`);
    assert.ok(!result.stdout.includes('error scanning'), 'no scan error expected');
    // fileGlob 兜底为 **/* 后应能扫到该文件并命中
    assert.match(result.stdout, /violation\(s\)/, 'pattern should be detected');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('rule with fileGlob detects violations and stays green on warnings', () => {
  const rootDir = sampleProject();
  try {
    writeFileSync(join(rootDir, 'harness', 'policies', 'anti-patterns.json'), JSON.stringify({
      rules: [{
        id: 'STARTER-002', severity: 'warning', pattern: '#[0-9a-fA-F]{3,8}\\b',
        fileGlob: '**/*.{tsx,jsx,css}',
        excludeGlob: '**/node_modules/**|**/dist/**|**/*.test.*',
        message: 'Hardcoded color', fix: 'use token',
      }],
      severity: 'warning',
    }, null, 2));
    writeFileSync(join(rootDir, 'src', 'a.tsx'), "const c = '#abc';\n");
    writeFileSync(join(rootDir, 'src', 'b.java'), "String c = \"#abc\";\n"); // 不在 fileGlob 内，不应命中

    const result = spawnSync(process.execPath, [CLI, 'scan-anti-patterns', '--files', 'src/a.tsx,src/b.java'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /1 violation\(s\)/, 'only the tsx file should match');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('clean code with missing fileGlob reports no anti-patterns', () => {
  const rootDir = sampleProject();
  try {
    writeFileSync(join(rootDir, 'harness', 'policies', 'anti-patterns.json'), JSON.stringify({
      rules: [{ id: 'AP-001', pattern: 'color:\\s*#[0-9a-fA-F]{3,6}', message: 'x', severity: 'warning' }],
    }, null, 2));
    writeFileSync(join(rootDir, 'src', 'app.tsx'), "export const A = () => <div className=\"ok\" />;\n");

    const result = spawnSync(process.execPath, [CLI, 'scan-anti-patterns', '--files', 'src/app.tsx'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /No anti-patterns detected/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
