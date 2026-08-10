#!/usr/bin/env node
/**
 * report.mjs — 工程机制报告（Phase 3）
 *
 * 汇总：
 *   - gate 履历：总数 / 通过率 / 类型分布 / 平均完成时长
 *   - 扫描历史：各类型违规趋势 / 高频规则
 *   - 文档资产：PRD / requirements / scenarios 数量
 *
 * 用法：harness report [--format json] [--since-days N]
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { loadScans, aggregateScans } from './stats.mjs';

function getArg(args, flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
}

function countFiles(rootDir, glob) {
  // 简单目录计数（glob 由调用方指定相对路径）
  const dir = resolve(rootDir, glob.split('/')[0] || '.');
  if (!existsSync(dir)) return 0;
  try {
    return readdirSync(dir).filter(f => f.endsWith('.md') || f.endsWith('.json')).length;
  } catch { return 0; }
}

export function analyze(rootDir, { sinceDays } = {}) {
  const cutoff = sinceDays ? Date.now() - sinceDays * 86400000 : null;

  // ── gate 履历 ────────────────────────────────────────────────
  const gatesDir = resolve(rootDir, 'harness', 'gates');
  const gates = existsSync(gatesDir)
    ? readdirSync(gatesDir).filter(f => f.endsWith('.json')).map(f => {
        try { return JSON.parse(readFileSync(join(gatesDir, f), 'utf-8')); } catch { return null; }
      }).filter(Boolean)
    : [];
  const filtered = cutoff ? gates.filter(g => new Date(g.createdAt).getTime() >= cutoff) : gates;
  const byType = {};
  let cleared = 0;
  let totalHours = 0;
  let withDuration = 0;
  for (const g of filtered) {
    byType[g.taskType] = (byType[g.taskType] || 0) + 1;
    if (g.cleared) cleared++;
    const doneTimes = (g.checks || []).map(c => c.completedAt).filter(Boolean).map(t => new Date(t).getTime());
    if (doneTimes.length > 0) {
      const last = Math.max(...doneTimes);
      const start = new Date(g.createdAt).getTime();
      totalHours += (last - start) / 3600000;
      withDuration++;
    }
  }

  // ── 扫描历史 ─────────────────────────────────────────────────
  const scans = loadScans(rootDir);
  const scanByType = {};
  for (const type of ['anti-patterns', 'secrets', 'degraded-loop']) {
    const agg = aggregateScans(rootDir, type);
    scanByType[type] = {
      records: agg.records,
      totalViolations: agg.totalViolations,
      totalErrors: agg.totalErrors,
      topRules: agg.topRules.slice(0, 3),
    };
  }

  // ── 文档资产 ─────────────────────────────────────────────────
  const prdCount = countFiles(rootDir, 'docs/prd');
  const reqCount = countFiles(rootDir, 'harness/requirements');
  const scenarios = existsSync(resolve(rootDir, 'harness/scenarios/scenarios.json'))
    ? (JSON.parse(readFileSync(resolve(rootDir, 'harness/scenarios/scenarios.json'), 'utf-8')).scenarios || []).length
    : 0;

  return {
    gates: {
      total: filtered.length,
      cleared,
      passRate: filtered.length ? Math.round((cleared / filtered.length) * 100) : 0,
      byType,
      avgHours: withDuration ? Math.round((totalHours / withDuration) * 10) / 10 : 0,
    },
    scans: { total: scans.length, byType: scanByType },
    docs: { prds: prdCount, requirements: reqCount, scenarios },
  };
}

export async function run({ rootDir = process.cwd(), args = [] } = {}) {
  const json = getArg(args, '--format') === 'json';
  const sinceDays = parseInt(getArg(args, '--since-days') || '0', 10) || null;

  const r = analyze(rootDir, { sinceDays });

  if (json) {
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  console.log('📊 harness report — 工程机制报告\n');

  console.log('── Gate 门禁 ─────────────────────────────────');
  console.log(`  总数: ${r.gates.total} · 已放行: ${r.gates.cleared} · 通过率: ${r.gates.passRate}% · 平均完成 ${r.gates.avgHours}h`);
  const typeStr = Object.entries(r.gates.byType).map(([t, n]) => `${t}:${n}`).join('  ') || '—';
  console.log(`  类型分布: ${typeStr}`);

  console.log('\n── 扫描违规 ─────────────────────────────────');
  if (r.scans.total === 0) {
    console.log('  （暂无扫描记录——运行 `harness check` 累积）');
  } else {
    for (const [type, s] of Object.entries(r.scans.byType)) {
      const top = s.topRules.map(x => `${x.id}×${x.count}`).join(', ') || '—';
      console.log(`  ${type}: ${s.records} 次扫描 · ${s.totalViolations} 违规（${s.totalErrors} error）`);
      if (s.topRules.length) console.log(`    高频: ${top}`);
    }
  }

  console.log('\n── 文档资产 ─────────────────────────────────');
  console.log(`  PRD: ${r.docs.prds} · Requirements: ${r.docs.requirements} · Scenarios: ${r.docs.scenarios}`);

  console.log('\n提示: harness suggest 会基于以上数据给出规范沉淀建议。');
}
