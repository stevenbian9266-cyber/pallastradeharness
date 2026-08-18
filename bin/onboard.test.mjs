import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), 'harness.mjs');

test('onboard --write scaffolds config, policies, PRD template, and standards skeleton', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-onboard-'));
  try {
    mkdirSync(join(rootDir, 'src', 'app'), { recursive: true });
    writeFileSync(join(rootDir, 'package.json'), JSON.stringify({ name: 'demo', dependencies: { next: '15' } }));
    writeFileSync(join(rootDir, 'src', 'app', 'page.tsx'), 'export default function Page() { return null }');

    const result = spawnSync(process.execPath, [CLI, 'onboard', '--write', '--preset', 'nextjs', '--tier', 'standard'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.ok(existsSync(join(rootDir, 'harness.config.mjs')), 'config should be written');
    assert.ok(existsSync(join(rootDir, 'harness', 'policies', 'anti-patterns.json')), 'anti-patterns should be written');
    // 回归：onboard 生成的每条反模式规则必须带 fileGlob（否则扫描器 globSync(undefined) 崩溃）
    const ap = JSON.parse(readFileSync(join(rootDir, 'harness', 'policies', 'anti-patterns.json'), 'utf-8'));
    assert.ok(Array.isArray(ap.rules) && ap.rules.length > 0, 'rules should exist');
    for (const rule of ap.rules) {
      assert.equal(typeof rule.fileGlob, 'string', `rule ${rule.id} must have fileGlob`);
      assert.ok(rule.fileGlob.length > 0, `rule ${rule.id} fileGlob must be non-empty`);
    }
    assert.ok(existsSync(join(rootDir, 'docs', 'prd', '_TEMPLATE.md')), 'PRD template should be written');
    assert.ok(existsSync(join(rootDir, 'harness', 'standards', 'demo.json')), 'standards skeleton should be written');
    // 通用 skills 安装
    assert.ok(existsSync(join(rootDir, 'ai', 'skills', 'harness-standards-audit', 'SKILL.md')), 'standards-audit skill should be installed');
    assert.ok(existsSync(join(rootDir, 'ai', 'skills', 'harness-prd', 'SKILL.md')), 'prd skill should be installed');
    // config 是 nextjs 层
    const config = readFileSync(join(rootDir, 'harness.config.mjs'), 'utf-8');
    assert.match(config, /src/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('onboard dry-run does not write files', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-onboard-'));
  try {
    const result = spawnSync(process.execPath, [CLI, 'onboard'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(rootDir, 'harness.config.mjs')), false, 'dry-run must not write config');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
