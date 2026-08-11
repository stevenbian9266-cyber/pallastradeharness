import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { buildContextPack, brainStatus, indexKnowledge } from './project-brain.mjs';
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
