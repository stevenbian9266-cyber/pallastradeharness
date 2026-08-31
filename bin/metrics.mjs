#!/usr/bin/env node
/**
 * metrics.mjs — 本地优先指标（HTH-019）
 *
 * 聚合本地匿名指标（计数与时间戳），默认不上传、不含源码/命令输出/路径/PRD 内容/证据原文。
 *  - `harness metrics`         显示聚合
 *  - `harness metrics export`  导出 JSON 供人工审阅
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { atomicWriteText, listTasks, statePaths } from './state-store.mjs';

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
}

/** 粗略 token 估算：混合中英文文档约 4 字节/ token（可回归对比用，非精确值） */
function estTokens(bytes) {
  return Math.round(bytes / 4);
}

/** 递归统计目录下 .md 文档数量与字节（token 优化可度量，6.6） */
function countDocs(dir) {
  if (!existsSync(dir)) return { count: 0, bytes: 0 };
  let count = 0;
  let bytes = 0;
  const walk = (current) => {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.md')) {
        count += 1;
        try {
          bytes += statSync(full).size;
        } catch { /* 跳过无法读取的文件 */ }
      }
    }
  };
  walk(dir);
  return { count, bytes };
}

/** 聚合本地匿名指标（只含计数与时间戳，绝不包含文件内容/路径/命令） */
export function collectMetrics({ rootDir, config }) {
  const metrics = {
    generatedAt: new Date().toISOString(),
    taskStarted: 0,
    taskCompleted: 0,
    taskAbandoned: 0,
    gatesTotal: 0,
    gatesCleared: 0,
    evidenceRecords: 0,
    verificationInvalidations: 0,
    approvedManuals: 0,
    knowledgeUpdated: 0,
    recoveryPlans: 0,
    timeToFirstEvidenceMinutes: null,
  };
  const ttfe = [];
  const TERMINAL = { completed: 'taskCompleted', cancelled: 'taskAbandoned', abandoned: 'taskAbandoned' };

  const tasks = listTasks(rootDir, config);
  for (const task of tasks) {
    metrics.taskStarted += 1;
    if (TERMINAL[task.status]) metrics[TERMINAL[task.status]] += 1;
    const evDir = statePaths(rootDir, config).evidence + '/' + task.id;
    if (!existsSync(evDir)) continue;
    let first = null;
    for (const file of readdirSync(evDir).filter(f => f.endsWith('.json'))) {
      try {
        const evidence = JSON.parse(readFileSync(join(evDir, file), 'utf-8'));
        metrics.evidenceRecords += 1;
        if (evidence.snapshot?.status === 'superseded') metrics.verificationInvalidations += 1;
        if (evidence.metadata?.approved === true) metrics.approvedManuals += 1;
        if (evidence.evidenceType === 'knowledge' && evidence.success === true) metrics.knowledgeUpdated += 1;
        const captured = Date.parse(evidence.capturedAt);
        if (first === null || captured < first) first = captured;
      } catch { /* 跳过损坏文件 */ }
    }
    if (first !== null && task.createdAt) {
      const delta = (first - Date.parse(task.createdAt)) / 60000;
      if (delta >= 0) ttfe.push(delta);
    }
  }

  const gateDir = resolve(rootDir, config.paths?.gates || 'harness/gates');
  if (existsSync(gateDir)) {
    const files = readdirSync(gateDir).filter(f => f.endsWith('.json'));
    metrics.gatesTotal = files.length;
    for (const file of files) {
      try {
        const gate = JSON.parse(readFileSync(join(gateDir, file), 'utf-8'));
        if (gate.cleared) metrics.gatesCleared += 1;
      } catch { /* 跳过损坏文件 */ }
    }
  }

  const recoveryDir = resolve(rootDir, config.paths?.state || '.harness-state', 'recovery');
  if (existsSync(recoveryDir)) {
    metrics.recoveryPlans = readdirSync(recoveryDir).filter(f => f.endsWith('.json')).length;
  }

  // token 优化（6.6）：产物文档统计（PRD/REQ/designs）+ 每任务 designs 明细，供量化回归
  const prdDir = resolve(rootDir, config.paths?.prd || 'docs/prd');
  const reqDir = resolve(rootDir, config.paths?.requirements || 'harness/requirements');
  const designsRoot = resolve(rootDir, config.designStage?.designsDir || 'docs/designs');
  const prdStats = countDocs(prdDir);
  const reqStats = countDocs(reqDir);
  const designsStats = countDocs(designsRoot);
  metrics.artifactCounts = {
    prd: { count: prdStats.count, bytes: prdStats.bytes, estTokens: estTokens(prdStats.bytes) },
    req: { count: reqStats.count, bytes: reqStats.bytes, estTokens: estTokens(reqStats.bytes) },
    designs: { count: designsStats.count, bytes: designsStats.bytes, estTokens: estTokens(designsStats.bytes) },
  };
  metrics.perTaskDesigns = tasks
    .map(task => {
      const stats = countDocs(join(designsRoot, task.id));
      return stats.count > 0
        ? { taskId: task.id, count: stats.count, bytes: stats.bytes, estTokens: estTokens(stats.bytes) }
        : null;
    })
    .filter(Boolean);

  metrics.timeToFirstEvidenceMinutes = median(ttfe);
  return metrics;
}

export function runMetrics({ rootDir, config, args }) {
  const json = args.includes('--json') || args[0] === 'export';
  const metrics = collectMetrics({ rootDir, config });
  if (args[0] === 'export') {
    const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
    const text = JSON.stringify(metrics, null, 2);
    if (out) {
      atomicWriteText(resolve(rootDir, out), text);
      console.log(`📤 Metrics exported → ${out}`);
    } else {
      console.log(text);
    }
    return;
  }
  if (json) {
    console.log(JSON.stringify(metrics, null, 2));
  } else {
    console.log('Local metrics (anonymous, privacy-first):');
    for (const [key, value] of Object.entries(metrics)) {
      if (key === 'generatedAt') continue;
      if (key === 'artifactCounts') {
        console.log('  artifactCounts (token 估算 ≈ bytes/4):');
        for (const [kind, stats] of Object.entries(value)) {
          console.log(`    ${kind.padEnd(8)} ${stats.count} docs, ${stats.bytes} bytes, ~${stats.estTokens} tokens`);
        }
        continue;
      }
      if (key === 'perTaskDesigns') {
        console.log(`  perTaskDesigns (${value.length} task(s) with design docs):`);
        for (const item of value) {
          console.log(`    ${item.taskId}  ${item.count} docs, ${item.bytes} bytes, ~${item.estTokens} tokens`);
        }
        continue;
      }
      if (typeof value === 'object' && value !== null) {
        console.log(`  ${key.padEnd(28)} ${JSON.stringify(value)}`);
        continue;
      }
      console.log(`  ${key.padEnd(28)} ${value}`);
    }
    console.log('  (默认不上传；可审阅导出: harness metrics export)');
  }
}
