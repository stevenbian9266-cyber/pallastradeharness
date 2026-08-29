/**
 * visual-regression.mjs — 视觉回归（设计文档 §18.4）
 *
 * golden screenshot 基线 + 像素级 diff：
 *   harness visual:baseline --from <dir>   建立基线（拷贝截图到基线目录）
 *   harness visual:diff    --from <dir>    对照基线做像素 diff，超阈值 exit 1
 *   harness visual:capture                 （可选）playwright 截图入口
 *
 * 降级（设计文档 §16.7）：无基线 / 无截图 → `validation_unavailable` + exit 2，
 * 绝不声称"视觉验证通过"。
 */
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getArg } from './cli-utils.mjs';

export const DEFAULT_VISUAL_CONFIG = Object.freeze({
  enabled: false,
  url: null,
  viewports: ['1280x800'],
  baselineDir: 'artifacts/visual-baseline',
  maxDiffRatio: 0.001,
});

export function visualConfig(config) {
  return { ...DEFAULT_VISUAL_CONFIG, ...(config?.visualRegression || {}) };
}

export function listScreenshots(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.toLowerCase().endsWith('.png')).sort();
}

/** baseline：把 --from 目录中的截图复制到基线目录 */
export function buildBaseline({ from, baselineDir }) {
  mkdirSync(baselineDir, { recursive: true });
  const files = listScreenshots(from);
  if (files.length === 0) return { created: 0, files: [] };
  const copied = [];
  for (const f of files) {
    copyFileSync(join(from, f), join(baselineDir, f));
    copied.push(f);
  }
  return { created: copied.length, files: copied };
}

export function decodePng(filePath) {
  return PNG.sync.read(readFileSync(filePath));
}

/** diff 两张 PNG，返回差异比率（尺寸不同视为完全差异） */
export function diffImages(aPath, bPath) {
  const a = decodePng(aPath);
  const b = decodePng(bPath);
  if (a.width !== b.width || a.height !== b.height) {
    return { ratio: 1, reason: 'dimension_mismatch' };
  }
  const { width, height } = a;
  const diff = new PNG({ width, height });
  const n = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.1 });
  return { ratio: n / (width * height), diffPixels: n, totalPixels: width * height };
}

/** 对照基线 diff 当前截图 */
export function runDiff({ baselineDir, from, maxDiffRatio }) {
  const baselineFiles = listScreenshots(baselineDir);
  const currentFiles = listScreenshots(from);
  if (baselineFiles.length === 0) return { status: 'validation_unavailable', reason: 'no baseline', results: [] };
  if (currentFiles.length === 0) return { status: 'validation_unavailable', reason: 'no screenshots', results: [] };
  const results = [];
  let failed = false;
  for (const f of baselineFiles) {
    const currentPath = join(from, f);
    if (!existsSync(currentPath)) {
      results.push({ file: f, ratio: 1, reason: 'missing_current', threshold: maxDiffRatio, pass: false });
      failed = true;
      continue;
    }
    const r = diffImages(join(baselineDir, f), currentPath);
    const pass = r.ratio <= maxDiffRatio;
    if (!pass) failed = true;
    results.push({ file: f, ...r, threshold: maxDiffRatio, pass });
  }
  return { status: failed ? 'failed' : 'passed', results };
}

export function run({ rootDir, args, config }) {
  const vc = visualConfig(config);
  const sub = args[0];
  const baselineDir = resolve(rootDir, getArg(args, '--baseline-dir') || vc.baselineDir);
  const maxDiffRatio = Number(getArg(args, '--max-diff') ?? vc.maxDiffRatio);
  const from = getArg(args, '--from') ? resolve(rootDir, getArg(args, '--from')) : null;

  if (sub === 'baseline') {
    if (!from) { console.error('visual:baseline requires --from <dir>'); process.exit(2); }
    const result = buildBaseline({ from, baselineDir });
    console.log(`✅ Baseline: ${result.created} screenshot(s) → ${baselineDir}`);
    process.exit(0);
  }

  if (sub === 'diff') {
    if (!from) { console.error('visual:diff requires --from <dir>'); process.exit(2); }
    const result = runDiff({ baselineDir, from, maxDiffRatio });
    if (result.status === 'validation_unavailable') {
      console.log(`🔴 validation_unavailable — ${result.reason}（设计文档 §16.7：不得声称视觉验证通过）`);
      process.exit(2);
    }
    for (const r of result.results) {
      console.log(`${r.pass ? '✅' : '❌'} ${r.file}: max diff ${(r.ratio * 100).toFixed(2)}% (threshold ${(r.threshold * 100).toFixed(2)}%)${r.reason ? ` (${r.reason})` : ''}`);
    }
    if (result.status === 'failed') {
      console.log('❌ Visual regression failed (diff above threshold).');
      process.exit(1);
    }
    console.log('✅ Visual regression passed.');
    process.exit(0);
  }

  if (sub === 'capture') {
    console.log('ℹ️  visual:capture 需要 playwright — 安装 `npm i -D playwright` 并配置 visualRegression.url 后使用；或用外部截图工具生成 PNG 后走 --from 文件流。');
    process.exit(2);
  }

  console.error('Usage: harness visual:baseline|diff [--from <dir>] [--baseline-dir <dir>] [--max-diff <ratio>]');
  process.exit(2);
}

// CLI entry（独立 bin：harness-scan-visual-regression 可选；此处按 harness visual 子命令分发）
const args = process.argv.slice(2);
if (args.length > 0 && ['baseline', 'diff', 'capture'].includes(args[0])) {
  const { loadConfig, resolveProjectRoot } = await import('./config-loader.mjs');
  const rootDir = resolveProjectRoot();
  const { config } = await loadConfig({ rootDir });
  run({ rootDir, args, config });
}
