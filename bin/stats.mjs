#!/usr/bin/env node
/**
 * stats.mjs — 扫描统计累积（Phase 3：suggest / report 的数据源）
 *
 * 每次反模式/密钥/循环扫描后，把结果追加到 .harness-cache/scans.json，
 * 形成"违规趋势"历史，供：
 *   - harness suggest  分析重复违规 → 建议沉淀规则
 *   - harness report   输出违规趋势 / 门禁通过率
 *
 * 纯本地、无网络依赖（符合"自有项目效率/隐私"约束）。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const MAX_RECORDS = 200;

export function scansFile(rootDir) {
  return resolve(rootDir, '.harness-cache', 'scans.json');
}

/** 读取全部扫描记录（无则空数组） */
export function loadScans(rootDir) {
  const f = scansFile(rootDir);
  if (!existsSync(f)) return [];
  try {
    const data = JSON.parse(readFileSync(f, 'utf-8'));
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

/**
 * 追加一条扫描记录（截断到 MAX_RECORDS）。
 * @param {string} rootDir
 * @param {{type: string, total: number, errors: number, warnings: number, byRule?: object, files?: string[]}} stats
 */
export function recordScan(rootDir, { type, total = 0, errors = 0, warnings = 0, byRule = {}, files = [] }) {
  const records = loadScans(rootDir);
  records.push({
    ts: new Date().toISOString(),
    type,
    total,
    errors,
    warnings,
    byRule,
    files: (files || []).slice(0, 20),
  });
  const trimmed = records.slice(-MAX_RECORDS);
  const f = scansFile(rootDir);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(trimmed, null, 2));
}

/** 按类型聚合统计：总数/违规趋势/高频规则 */
export function aggregateScans(rootDir, type) {
  const records = loadScans(rootDir).filter(r => !type || r.type === type);
  const byRule = {};
  let totalViolations = 0;
  let totalErrors = 0;
  for (const r of records) {
    totalViolations += r.total || 0;
    totalErrors += r.errors || 0;
    for (const [id, n] of Object.entries(r.byRule || {})) {
      byRule[id] = (byRule[id] || 0) + n;
    }
  }
  const topRules = Object.entries(byRule)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, count]) => ({ id, count }));
  return { records: records.length, totalViolations, totalErrors, topRules };
}
