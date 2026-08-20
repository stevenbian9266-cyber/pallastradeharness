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

// ── v1.6.0：lefthook / AI hooks / 深度配置 ─────────────────
test('v1.6.0: onboard 生成 lefthook.yml + ai/hooks + 深度配置段', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-onboard-v160-'));
  try {
    mkdirSync(join(rootDir, 'src'), { recursive: true });
    writeFileSync(join(rootDir, 'package.json'), JSON.stringify({ name: 'demo' }));

    const result = spawnSync(process.execPath, [CLI, 'onboard', '--write', '--preset', 'single', '--tier', 'standard'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(result.status, 0, result.stderr + result.stdout);

    // lefthook.yml（提交物理拦截）
    assert.ok(existsSync(join(rootDir, 'lefthook.yml')), 'lefthook.yml should be written');
    const lh = readFileSync(join(rootDir, 'lefthook.yml'), 'utf-8');
    assert.match(lh, /gate:required/, 'lefthook 应含 gate:required');
    assert.match(lh, /doc-impact/, 'lefthook 应含 pre-push doc-impact');

    // ai/hooks（AI 行为级安全钩子）
    assert.ok(existsSync(join(rootDir, 'ai', 'hooks', 'hooks.json')), 'hooks.json should be written');
    assert.ok(existsSync(join(rootDir, 'ai', 'hooks', 'block_destructive_db.sh')), 'block_destructive_db.sh should be written');
    assert.ok(existsSync(join(rootDir, 'ai', 'hooks', 'warn_on_secrets.sh')), 'warn_on_secrets.sh should be written');
    const hooks = JSON.parse(readFileSync(join(rootDir, 'ai', 'hooks', 'hooks.json'), 'utf-8'));
    assert.ok(hooks.hooks.PreToolUse, 'PreToolUse hook should exist');
    assert.ok(hooks.hooks.PostToolUse, 'PostToolUse hook should exist');

    // 深度配置段（自动化触发基础）
    const config = readFileSync(join(rootDir, 'harness.config.mjs'), 'utf-8');
    assert.match(config, /profiles:/, '应含 profiles 档位');
    assert.match(config, /coverage:/, '应含 coverage 门禁配置');
    assert.match(config, /risk:/, '应含 risk 路径');
    assert.match(config, /brain:/, '应含 brain 来源');
    assert.match(config, /syncCheck:/, '应含 syncCheck 矩阵');
    assert.match(config, /generatedCheck:/, '应含 generatedCheck');
    assert.match(config, /evidence: \{ autoVerify: true/, '应含 evidence.autoVerify');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('v1.6.0: lite tier 不生成深度档位（profiles/coverage 等）', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-onboard-v160-lite-'));
  try {
    mkdirSync(join(rootDir, 'src'), { recursive: true });
    writeFileSync(join(rootDir, 'package.json'), JSON.stringify({ name: 'demo' }));
    const result = spawnSync(process.execPath, [CLI, 'onboard', '--write', '--preset', 'single', '--tier', 'lite'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const config = readFileSync(join(rootDir, 'harness.config.mjs'), 'utf-8');
    assert.doesNotMatch(config, /profiles:/, 'lite 不应生成 profiles');
    assert.doesNotMatch(config, /coverage:/, 'lite 不应生成 coverage');
    assert.match(config, /risk:/, 'lite 仍应生成核心治理段 risk');
    // lefthook 与 ai-hooks 仍应生成（物理拦截对任何档位都重要）
    assert.ok(existsSync(join(rootDir, 'lefthook.yml')), 'lite 也应生成 lefthook.yml');
    assert.ok(existsSync(join(rootDir, 'ai', 'hooks', 'hooks.json')), 'lite 也应生成 ai/hooks');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
