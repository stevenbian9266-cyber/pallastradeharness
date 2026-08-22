import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { buildContextPack, brainStatus, evaluateRetrieval, indexKnowledge, searchIndex, searchKnowledge } from './project-brain.mjs';
import { startTask } from './task-orchestrator.mjs';

function project() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-brain-'));
  mkdirSync(join(rootDir, 'docs'), { recursive: true });
  writeFileSync(join(rootDir, 'AGENTS.md'), '# Agent\n\nAPI changes use the SDK.\n');
  writeFileSync(join(rootDir, 'README.md'), '# Sample\n');
  writeFileSync(join(rootDir, 'docs', 'api.md'), '# API Contract\n');
  writeFileSync(join(rootDir, '.env'), 'SECRET=never-index\n');
  writeFileSync(join(rootDir, 'package.json'), JSON.stringify({ name: 'sample', scripts: { test: 'node --test' } }));
  execFileSync('git', ['init', '-b', 'main'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.email', 'harness@example.test'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'Harness Test'], { cwd: rootDir });
  execFileSync('git', ['add', '.'], { cwd: rootDir });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: rootDir });
  return rootDir;
}

test('project brain indexes safe knowledge and builds a minimal relevant context', () => {
  const rootDir = project();
  try {
    const config = structuredClone(DEFAULT_CONFIG);
    config.brain.sources = ['AGENTS.md', 'README.md', 'docs/**/*.md', '.env'];
    const index = indexKnowledge({ rootDir, config });
    assert.ok(index.assets.some(asset => asset.path === 'AGENTS.md'));
    assert.ok(!index.assets.some(asset => asset.path === '.env'));
    const task = startTask({ rootDir, config, title: 'Change API contract' });
    const context = buildContextPack({ rootDir, config, task });
    assert.ok(context.assets.some(asset => asset.path === 'docs/api.md'));
    assert.ok(context.assets.length < index.assets.length + 1);
    writeFileSync(join(rootDir, 'docs', 'api.md'), '# API Contract v2\n');
    assert.deepEqual(brainStatus({ rootDir, config }).stale, ['docs/api.md']);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('project brain applies deterministic large-repository limits and reports truncation', () => {
  const rootDir = project();
  try {
    const config = structuredClone(DEFAULT_CONFIG);
    config.brain.sources = ['**/*.md'];
    config.brain.maxAssets = 2;
    config.brain.shardSize = 1;
    const index = indexKnowledge({ rootDir, config });
    assert.equal(index.assets.length, 2);
    assert.equal(index.stats.truncated, true);
    assert.equal(index.stats.shardSize, 1);
    assert.deepEqual(index.assets.map(asset => asset.path), [...index.assets.map(asset => asset.path)].sort());
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('project profile discovers stacks from configured monorepo layer roots', () => {
  const rootDir = project();
  try {
    mkdirSync(join(rootDir, 'backend', 'app'), { recursive: true });
    writeFileSync(join(rootDir, 'backend', 'Gemfile'), "source 'https://rubygems.org'\n");
    const config = structuredClone(DEFAULT_CONFIG);
    config.layers = [{ id: 'backend', path: 'backend/app' }];
    const index = indexKnowledge({ rootDir, config });
    assert.deepEqual(index.profile.stacks, ['node', 'ruby']);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('project brain excludes lifecycle runtime state from default knowledge sources', () => {
  const rootDir = project();
  try {
    mkdirSync(join(rootDir, 'harness', 'gates'), { recursive: true });
    writeFileSync(join(rootDir, 'harness', 'gates', 'GATE-old.json'), '{"task":"old"}\n');
    const index = indexKnowledge({ rootDir, config: structuredClone(DEFAULT_CONFIG) });
    assert.ok(!index.assets.some(asset => asset.path.startsWith('harness/gates/')));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('brain query returns deterministic top-K and finds required assets (HTH-017)', () => {
  const rootDir = project();
  try {
    const config = structuredClone(DEFAULT_CONFIG);
    config.brain.sources = ['AGENTS.md', 'docs/**/*.md'];
    const index = indexKnowledge({ rootDir, config });
    const first = searchIndex(index, 'api contract sdk', 10);
    const second = searchIndex(index, 'api contract sdk', 10);
    // 确定性：两次检索结果完全一致（可复现评测）
    assert.deepEqual(first, second);
    assert.ok(first.length > 0);
    assert.ok(first.some(item => item.path === 'docs/api.md'));
    const knowledge = searchKnowledge({ rootDir, config, query: 'api contract', top: 5 });
    assert.equal(knowledge.indexed, true);
    assert.ok(knowledge.count <= 5);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('brain eval computes recall@K and required-asset omission rate (HTH-017)', () => {
  const rootDir = project();
  try {
    const config = structuredClone(DEFAULT_CONFIG);
    config.brain.sources = ['AGENTS.md', 'docs/**/*.md'];
    const index = indexKnowledge({ rootDir, config });
    const queries = [
      { query: 'api contract sdk', requiredAssets: ['docs/api.md'] },
      { query: 'agent policy rules', requiredAssets: ['AGENTS.md'] },
      { query: 'nonexistent topic zzz', requiredAssets: ['docs/api.md'] },
    ];
    const report = evaluateRetrieval({ index, queries, top: 10 });
    assert.equal(report.queries, 3);
    assert.equal(report.rows[0].recall, 1);
    assert.equal(report.rows[1].recall, 1);
    assert.equal(report.rows[2].recall, 0);
    assert.equal(report.recallAtK, 2 / 3);
    assert.equal(report.requiredAssetOmissionRate, 1 / 3);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('bundled brain eval preset loads and is well-formed (HTH-017, 50 queries reproducible)', () => {
  const presetPath = join(process.cwd(), 'presets', 'brain-eval', 'default.json');
  const queries = JSON.parse(readFileSync(presetPath, 'utf-8'));
  assert.ok(Array.isArray(queries));
  assert.equal(queries.length, 50, '50 查询离线评测集');
  for (const entry of queries) {
    assert.ok(typeof entry.query === 'string' && entry.query.length > 0);
    assert.ok(Array.isArray(entry.requiredAssets) && entry.requiredAssets.length > 0);
  }
});
