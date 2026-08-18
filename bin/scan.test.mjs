import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildScanItems, applyAutoFixes, summarize } from './scan.mjs';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), 'harness.mjs');

function sampleProject() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-scan-'));
  return rootDir;
}

test('buildScanItems reports MUST missing items on empty project', () => {
  const rootDir = sampleProject();
  try {
    const items = buildScanItems({ rootDir, config: { name: 'demo' } });
    const byId = Object.fromEntries(items.map(i => [i.id, i]));
    assert.equal(byId['skills-dir'].status, 'missing');
    assert.equal(byId['skills-dir'].tier, 'must');
    assert.equal(byId['agent-readme'].status, 'missing');
    assert.equal(byId['prd-template'].status, 'missing');
    assert.equal(byId['scenarios-json'].status, 'missing');
    assert.equal(byId['agent-agents'].status, 'missing');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('applyAutoFixes creates deterministic L0 assets only', () => {
  const rootDir = sampleProject();
  try {
    const items = buildScanItems({ rootDir, config: { name: 'demo' } });
    const applied = applyAutoFixes(rootDir, items);
    assert.ok(applied.includes('ai/skills'), 'ai/skills dir should be created');
    assert.ok(applied.includes('ai/README.md'), 'ai/README.md should be created');
    assert.ok(applied.includes('harness/scenarios/scenarios.json'), 'scenarios.json should be created');
    assert.ok(applied.includes('harness/standards'), 'standards dir should be created');
    assert.ok(existsSync(join(rootDir, 'ai', 'skills')));
    assert.ok(existsSync(join(rootDir, 'ai', 'README.md')));
    assert.ok(existsSync(join(rootDir, 'harness', 'scenarios', 'scenarios.json')));
    // 非确定性项不应被创建（PRD 模板需 onboard/docs template）
    assert.equal(existsSync(join(rootDir, 'docs', 'prd', '_TEMPLATE.md')), false, 'PRD template must NOT be auto-created');
    // 幂等：再次 fix 不应重复报错
    const again = applyAutoFixes(rootDir, buildScanItems({ rootDir, config: { name: 'demo' } }));
    assert.equal(again.length, 0, 'second run should apply nothing');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('skill freshness: stale authority path is reported', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'ai', 'skills', 'payments'), { recursive: true });
    writeFileSync(join(rootDir, 'ai', 'skills', 'payments', 'SKILL.md'), `---
name: payments
description: Use when working with payments.
---

## 权威文件

- \`src/main/java/com/demo/PaymentService.java\` — 支付服务
`);
    const items = buildScanItems({ rootDir, config: { name: 'demo' } });
    const skill = items.find(i => i.id === 'skill-payments-fresh');
    assert.ok(skill, 'freshness item should exist');
    assert.equal(skill.status, 'stale');
    assert.match(skill.detail, /PaymentService\.java/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('skill structure: frontmatter name mismatch is stale', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'ai', 'skills', 'payments'), { recursive: true });
    writeFileSync(join(rootDir, 'ai', 'skills', 'payments', 'SKILL.md'), `---
name: wrong-name
description: demo
---

body
`);
    const items = buildScanItems({ rootDir, config: { name: 'demo' } });
    const bad = items.find(i => i.id === 'skill-payments-name');
    assert.ok(bad, 'name mismatch item should exist');
    assert.equal(bad.status, 'stale');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('gate ghost refs: read-skill-* referenced skills are checked', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'ai', 'skills'), { recursive: true });
    const config = {
      name: 'demo',
      gates: {
        checkDefs: {
          feature: [
            { id: 'read-skill-customization', label: 'Read Skill: <project>-customization/SKILL.md (always)' },
            { id: 'read-skill-domain', label: 'Read Skill: domain-specific SKILL.md(s)' },
          ],
          security: [
            { id: 'read-skill-security', label: 'Read Skill: <project>-security/SKILL.md' },
          ],
        },
      },
    };
    const items = buildScanItems({ rootDir, config });
    const ghost = items.filter(i => i.category === 'gate-refs' && i.status !== 'ok');
    assert.ok(ghost.some(i => i.id === 'gate-ref-demo-customization'), 'customization ghost ref should be reported');
    assert.ok(ghost.some(i => i.id === 'gate-ref-demo-security'), 'security ghost ref should be reported');
    assert.ok(ghost.some(i => i.id === 'gate-ref-domain'), 'domain ghost ref should be reported');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('CLI: scan --check exits 1 when MUST assets missing', () => {
  const rootDir = sampleProject();
  try {
    const result = spawnSync(process.execPath, [CLI, 'scan', '--check'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(result.status, 1, '--check should fail when must assets missing');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('CLI: scan --fix writes deterministic assets and then --check passes', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'harness'), { recursive: true });
    writeFileSync(join(rootDir, 'AGENTS.md'), '# demo\n');
    writeFileSync(join(rootDir, 'harness.config.mjs'), 'export default { name: "demo", layers: [{ id: "app", path: "src" }], gates: {}, paths: {} };\n');
    const fix = spawnSync(process.execPath, [CLI, 'scan', '--fix'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(fix.status, 0, fix.stderr + fix.stdout);
    assert.ok(existsSync(join(rootDir, 'ai', 'skills')));
    assert.ok(existsSync(join(rootDir, 'ai', 'README.md')));
    assert.ok(existsSync(join(rootDir, 'harness', 'scenarios', 'scenarios.json')));
    // 补齐 must 级但非 L0 自动创建项（模拟 docs template --copy）
    mkdirSync(join(rootDir, 'docs', 'prd'), { recursive: true });
    writeFileSync(join(rootDir, 'docs', 'prd', '_TEMPLATE.md'), '# PRD Template\n');
    const check = spawnSync(process.execPath, [CLI, 'scan', '--check'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(check.status, 0, '--check should pass after L0 fixes when no must items remain');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('summarize groups status by tier', () => {
  const items = [
    { category: 'a', id: 'x', label: 'x', tier: 'must', status: 'ok' },
    { category: 'a', id: 'y', label: 'y', tier: 'must', status: 'missing' },
    { category: 'b', id: 'z', label: 'z', tier: 'should', status: 'stale' },
  ];
  const s = summarize(items);
  assert.equal(s.total, 3);
  assert.equal(s.ok, 1);
  assert.equal(s.missing, 1);
  assert.equal(s.stale, 1);
  assert.equal(s.byTier.must, 1);
  assert.equal(s.byTier.should, 1);
});
