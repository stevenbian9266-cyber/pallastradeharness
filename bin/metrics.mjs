#!/usr/bin/env node
/**
 * metrics.mjs — 本地优先指标（HTH-019）
 *
 * 聚合本地匿名指标（计数与时间戳），默认不上传、不含源码/命令输出/路径/PRD 内容/证据原文。
 *  - `harness metrics`         显示聚合
 *  - `harness metrics export`  导出 JSON 供人工审阅
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
      console.log(`  ${key.padEnd(28)} ${value}`);
    }
    console.log('  (默认不上传；可审阅导出: harness metrics export)');
  }
}
