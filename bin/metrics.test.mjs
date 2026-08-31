import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { startTask } from './task-orchestrator.mjs';
import { collectMetrics } from './metrics.mjs';

function project() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-metrics-'));
  writeFileSync(join(rootDir, 'README.md'), '# x\n');
  execFileSync('git', ['init', '-b', 'main'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.email', 'h@h'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'H'], { cwd: rootDir });
  execFileSync('git', ['add', '.'], { cwd: rootDir });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: rootDir });
  return { rootDir, config: structuredClone(DEFAULT_CONFIG) };
}

test('metrics on empty project are zeroed', () => {
  const { rootDir, config } = project();
  try {
    const m = collectMetrics({ rootDir, config });
    assert.equal(m.taskStarted, 0);
    assert.equal(m.evidenceRecords, 0);
    assert.equal(m.verificationInvalidations, 0);
    assert.equal(m.timeToFirstEvidenceMinutes, null);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('metrics aggregate task/evidence/gate counts and invalidation', () => {
  const { rootDir, config } = project();
  try {
    const task = startTask({ rootDir, config, title: 'T' });
    const evDir = join(rootDir, '.harness-state', 'evidence', task.id);
    mkdirSync(evDir, { recursive: true });
    const now = new Date().toISOString();
    writeFileSync(join(evDir, 'EVD-1.json'), JSON.stringify({ evidenceType: 'test', taskId: task.id, capturedAt: now, snapshot: { status: 'superseded' } }));
    writeFileSync(join(evDir, 'EVD-2.json'), JSON.stringify({ evidenceType: 'knowledge', taskId: task.id, capturedAt: now, success: true, metadata: { approved: true } }));
    const gateDir = join(rootDir, 'harness', 'gates');
    mkdirSync(gateDir, { recursive: true });
    writeFileSync(join(gateDir, 'GATE-1.json'), JSON.stringify({ id: 'GATE-1', taskId: task.id, cleared: true }));

    const m = collectMetrics({ rootDir, config });
    assert.equal(m.taskStarted, 1);
    assert.equal(m.evidenceRecords, 2);
    assert.equal(m.verificationInvalidations, 1);
    assert.equal(m.approvedManuals, 1);
    assert.equal(m.knowledgeUpdated, 1);
    assert.equal(m.gatesTotal, 1);
    assert.equal(m.gatesCleared, 1);
    assert.ok(m.timeToFirstEvidenceMinutes !== null, 'time to first evidence computed');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('metrics export contains only counts and timestamps (privacy-first)', () => {
  const { rootDir, config } = project();
  try {
    const m = collectMetrics({ rootDir, config });
    const json = JSON.stringify(m);
    // 不含路径/内容/命令
    assert.ok(!json.includes('.harness-state'), 'no state paths');
    assert.ok(!json.includes('README'), 'no file contents');
    for (const [key, value] of Object.entries(m)) {
      if (key === 'generatedAt') { assert.ok(typeof value === 'string'); continue; }
      if (key === 'artifactCounts' || key === 'perTaskDesigns') {
        assert.ok(typeof value === 'object' && value !== null, `${key} is an object`);
        continue;
      }
      assert.ok(typeof value === 'number' || value === null, `${key} is numeric or null`);
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// ── token 优化（AC-008）：产物文档统计 ──
test('metrics counts PRD/REQ/designs artifacts with token estimate', () => {
  const { rootDir, config } = project();
  try {
    const task = startTask({ rootDir, config, title: 'T' });
    // 造 PRD / REQ / designs 产物
    mkdirSync(join(rootDir, 'docs', 'prd'), { recursive: true });
    mkdirSync(join(rootDir, 'harness', 'requirements'), { recursive: true });
    mkdirSync(join(rootDir, 'docs', 'designs', task.id), { recursive: true });
    writeFileSync(join(rootDir, 'docs', 'prd', 'PRD-1.md'), '# PRD body '.repeat(40)); // 400 bytes
    writeFileSync(join(rootDir, 'harness', 'requirements', 'REQ-1.md'), '# REQ body '.repeat(20)); // 180 bytes
    writeFileSync(join(rootDir, 'docs', 'designs', task.id, 'ui.md'), '# ui '.repeat(10)); // 40 bytes
    writeFileSync(join(rootDir, 'docs', 'designs', task.id, 'tech-design.md'), '# tech '.repeat(10)); // 48 bytes

    const m = collectMetrics({ rootDir, config });
    assert.equal(m.artifactCounts.prd.count, 1);
    assert.ok(m.artifactCounts.prd.bytes >= 400, 'PRD bytes counted');
    assert.ok(m.artifactCounts.prd.estTokens > 0, 'PRD token estimate');
    assert.equal(m.artifactCounts.req.count, 1);
    assert.equal(m.artifactCounts.designs.count, 2);
    const perTask = m.perTaskDesigns.find(item => item.taskId === task.id);
    assert.ok(perTask, 'perTaskDesigns includes task with design docs');
    assert.equal(perTask.count, 2);
    assert.ok(perTask.estTokens > 0);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
