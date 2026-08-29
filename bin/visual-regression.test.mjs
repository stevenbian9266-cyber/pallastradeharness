import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { PNG } from 'pngjs';
import { buildBaseline, runDiff, diffImages } from './visual-regression.mjs';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), 'harness.mjs');

function makePng(width, height, { r, g, b }) {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4] = r;
    png.data[i * 4 + 1] = g;
    png.data[i * 4 + 2] = b;
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

function sampleProject() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-vr-'));
  return rootDir;
}

// AC-001: baseline --from 拷贝截图到基线目录
test('AC-001: buildBaseline 将截图复制到基线目录', () => {
  const rootDir = sampleProject();
  try {
    const from = join(rootDir, 'shots');
    const baseline = join(rootDir, 'baseline');
    mkdirSync(from, { recursive: true });
    writeFileSync(join(from, 'page__1280x800.png'), makePng(4, 4, { r: 255, g: 0, b: 0 }));
    const result = buildBaseline({ from, baselineDir: baseline });
    assert.equal(result.created, 1);
    assert.equal(result.files[0], 'page__1280x800.png');
    assert.ok(existsSync(join(baseline, 'page__1280x800.png')));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// AC-002: 相同截图 diff 差异为 0，status passed
test('AC-002: 相同截图 diff 通过', () => {
  const rootDir = sampleProject();
  try {
    const baseline = join(rootDir, 'baseline');
    const cur = join(rootDir, 'cur');
    mkdirSync(baseline, { recursive: true });
    mkdirSync(cur, { recursive: true });
    const png = makePng(8, 8, { r: 10, g: 20, b: 30 });
    writeFileSync(join(baseline, 'p__1280x800.png'), png);
    writeFileSync(join(cur, 'p__1280x800.png'), png);
    const result = runDiff({ baselineDir: baseline, from: cur, maxDiffRatio: 0.001 });
    assert.equal(result.status, 'passed');
    assert.equal(result.results[0].ratio, 0);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// AC-003: 不同截图 diff 超阈值 → failed
test('AC-003: 不同截图 diff 超阈值 failed', () => {
  const rootDir = sampleProject();
  try {
    const baseline = join(rootDir, 'baseline');
    const cur = join(rootDir, 'cur');
    mkdirSync(baseline, { recursive: true });
    mkdirSync(cur, { recursive: true });
    writeFileSync(join(baseline, 'p__1280x800.png'), makePng(8, 8, { r: 255, g: 255, b: 255 }));
    writeFileSync(join(cur, 'p__1280x800.png'), makePng(8, 8, { r: 0, g: 0, b: 0 }));
    const result = runDiff({ baselineDir: baseline, from: cur, maxDiffRatio: 0.001 });
    assert.equal(result.status, 'failed');
    assert.ok(result.results[0].ratio > 0.9);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// AC-004: 无基线 → validation_unavailable
test('AC-004: 无基线返回 validation_unavailable', () => {
  const rootDir = sampleProject();
  try {
    const cur = join(rootDir, 'cur');
    mkdirSync(cur, { recursive: true });
    writeFileSync(join(cur, 'p.png'), makePng(4, 4, { r: 1, g: 1, b: 1 }));
    const result = runDiff({ baselineDir: join(rootDir, 'nope'), from: cur, maxDiffRatio: 0.001 });
    assert.equal(result.status, 'validation_unavailable');
    assert.equal(result.reason, 'no baseline');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// AC-005: CLI visual:diff 可用（exit 0 通过 / exit 1 失败 / exit 2 降级）
test('AC-005: harness visual:diff CLI 通过/失败/降级', () => {
  const rootDir = sampleProject();
  try {
    const baseline = join(rootDir, 'baseline');
    const cur = join(rootDir, 'cur');
    mkdirSync(baseline, { recursive: true });
    mkdirSync(cur, { recursive: true });
    const png = makePng(4, 4, { r: 9, g: 9, b: 9 });
    writeFileSync(join(baseline, 'p__1280x800.png'), png);

    // 通过
    writeFileSync(join(cur, 'p__1280x800.png'), png);
    let r = spawnSync(process.execPath, [CLI, 'visual:diff', '--from', cur, '--baseline-dir', baseline], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Visual regression passed/);

    // 失败
    writeFileSync(join(cur, 'p__1280x800.png'), makePng(4, 4, { r: 250, g: 250, b: 250 }));
    r = spawnSync(process.execPath, [CLI, 'visual:diff', '--from', cur, '--baseline-dir', baseline], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /failed/);

    // 降级（基线目录不存在）
    r = spawnSync(process.execPath, [CLI, 'visual:diff', '--from', cur, '--baseline-dir', join(rootDir, 'missing')], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stdout, /validation_unavailable/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// diffImages 尺寸不一致 → ratio 1
test('diffImages 尺寸不一致判定完全差异', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'a'), { recursive: true });
    const f1 = join(rootDir, 'a', '1.png');
    const f2 = join(rootDir, 'a', '2.png');
    writeFileSync(f1, makePng(4, 4, { r: 1, g: 1, b: 1 }));
    writeFileSync(f2, makePng(8, 8, { r: 1, g: 1, b: 1 }));
    const r = diffImages(f1, f2);
    assert.equal(r.ratio, 1);
    assert.equal(r.reason, 'dimension_mismatch');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
