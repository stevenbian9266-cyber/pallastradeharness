#!/usr/bin/env node
/**
 * suggest.mjs — 自学习（Phase 3）：从使用中沉淀规范
 *
 * 分析三类本地数据，输出"规范沉淀建议"：
 *   1. 扫描历史（.harness-cache/scans.json）：同类违规重复 → 建议强化/新增规则
 *   2. gate 履历（harness/gates/*.json）：任务类型分布 → 建议渐进档位
 *   3. 例外清单（gate check 的 note 含"例外/豁免/skip"）→ 建议定期 review
 *
 * 纯本地、无网络依赖。供开发/工程负责人 review，不会自动改动任何规则。
 *
 * 用法：harness suggest [--format json] [--since-days N]
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { aggregateScans, loadScans } from './stats.mjs';

function getArg(args, flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
}

/** 读取 gate 履历 */
function loadGates(rootDir) {
  const dir = resolve(rootDir, 'harness', 'gates');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(readFileSync(join(dir, f), 'utf-8')); } catch { return null; }
    })
    .filter(Boolean);
}

/** 生成建议（纯分析，不改文件） */
export function analyze(rootDir, { sinceDays } = {}) {
  const suggestions = [];
  const cutoff = sinceDays ? Date.now() - sinceDays * 86400000 : null;

  // ── 1. 扫描重复违规 → 规则建议 ──────────────────────────────
  for (const type of ['anti-patterns', 'secrets', 'degraded-loop']) {
    const agg = aggregateScans(rootDir, type);
    for (const r of agg.topRules) {
      if (r.count >= 2) {
        suggestions.push({
          kind: 'rule',
          scope: type,
          title: `「${r.id}」在 ${type} 扫描中累计出现 ${r.count} 次`,
          action: type === 'anti-patterns'
            ? `考虑在 harness/policies/anti-patterns.json 中提高 ${r.id} 严重度，或新增细化规则`
            : `考虑将 ${r.id} 纳入 CI 强制检查`,
        });
      }
    }
  }

  // ── 2. gate 履历 → 渐进档位建议 ─────────────────────────────
  const gates = loadGates(rootDir);
  const filtered = cutoff ? gates.filter(g => new Date(g.createdAt).getTime() >= cutoff) : gates;
  const byType = {};
  for (const g of filtered) byType[g.taskType] = (byType[g.taskType] || 0) + 1;
  const featureCount = byType.feature || 0;
  if (filtered.length >= 5 && featureCount >= 3) {
    suggestions.push({
      kind: 'tier',
      title: `近期 ${filtered.length} 个 gate 中 ${featureCount} 个为 feature 类`,
      action: '建议从 Lite 档升级到 Standard（PRD 工作流 + doc-impact），或开启更多 check',
    });
  }

  // ── 3. 例外/跳过 → review 建议 ──────────────────────────────
  const exceptions = filtered.flatMap(g =>
    (g.checks || [])
      .filter(c => c.status === 'done' && c.note && /例外|豁免|skip|跳过|not needed|无需/i.test(c.note))
      .map(c => ({ gate: g.id, check: c.id, note: c.note }))
  );
  if (exceptions.length >= 2) {
    suggestions.push({
      kind: 'exceptions',
      title: `${exceptions.length} 条 check 被标注例外/跳过`,
      action: '定期 review 这些例外是否应转正为规则、或删除旧例外',
      items: exceptions.slice(0, 5),
    });
  }

  // ── 4. 扫描记录存在性 → 数据健康建议 ─────────────────────────
  const scans = loadScans(rootDir);
  if (scans.length < 3) {
    suggestions.push({
      kind: 'data',
      title: `扫描历史记录仅 ${scans.length} 条`,
      action: '持续运行 `harness check` 积累数据，suggest 才能给出可靠建议',
    });
  }

  return { suggestions, stats: { gates: filtered.length, scans: scans.length, byType } };
}

export async function run({ rootDir = process.cwd(), args = [] } = {}) {
  const json = getArg(args, '--format') === 'json';
  const sinceDays = parseInt(getArg(args, '--since-days') || '0', 10) || null;

  console.log('🔎 harness suggest — 规范自学习建议\n');
  const { suggestions, stats } = analyze(rootDir, { sinceDays });

  if (json) {
    console.log(JSON.stringify({ suggestions, stats }, null, 2));
    return;
  }

  if (suggestions.length === 0) {
    console.log('✅ 暂无建议——继续使用，harness 会从你的实践中沉淀规范。');
    console.log(`   数据：${stats.gates} 个 gate · ${stats.scans} 条扫描记录`);
    return;
  }

  for (const s of suggestions) {
    console.log(`▪ [${s.kind}] ${s.title}`);
    console.log(`    → ${s.action}`);
    if (s.items) {
      for (const it of s.items) console.log(`      - ${it.gate} / ${it.check}: ${it.note.slice(0, 60)}`);
    }
    console.log('');
  }
  console.log('---');
  console.log('以上为建议，不自动修改任何规则。确认后可手动更新 anti-patterns.json / 档位 / 例外清单。');
}
