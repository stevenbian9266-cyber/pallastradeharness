#!/usr/bin/env node
/**
 * skill-audit.test.mjs — Skill 自动治理（v1.3.0）单元测试
 * 运行：node --test bin/skill-audit.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import {
  loadCatalog, detectFingerprint, buildExpected,
  auditOneSkill, audit, generateDrafts,
} from './skill-audit.mjs';

function makeTmp() {
  const dir = mkdtempSync(join(tmpdir(), 'harness-skill-audit-'));
  return { root: dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
const w = (root, rel, content) => {
  const p = resolve(root, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, content, 'utf-8');
};

// ── loadCatalog ─────────────────────────────────────────────
test('loadCatalog 加载内置目录（bundled 来源）', () => {
  const { root, cleanup } = makeTmp();
  try {
    const { catalog, sources } = loadCatalog({ rootDir: root, config: {} });
    assert.ok(sources.some(s => s.kind === 'bundled'), '应含内置来源');
    assert.ok(catalog.length >= 10, `内置目录应 ≥10 项（实际 ${catalog.length}）`);
    assert.ok(catalog.some(c => c.id === 'payment' && c.source === 'bundled'));
    assert.ok(catalog.every(c => c.detect && c.minScore !== undefined));
  } finally { cleanup(); }
});

test('loadCatalog 合并项目自定义目录（project 优先同 id）', () => {
  const { root, cleanup } = makeTmp();
  try {
    w(root, 'harness/catalog/custom.json', JSON.stringify({
      schemaVersion: 1,
      catalog: [{ id: 'payment', title: '自定义支付', detect: { dirs: [], keywords: ['zpay'] }, minScore: 1, priority: 'must' }],
    }));
    const { catalog, sources } = loadCatalog({ rootDir: root, config: {} });
    assert.ok(sources.some(s => s.kind === 'project'));
    const payment = catalog.find(c => c.id === 'payment');
    assert.equal(payment.source, 'project', '同 id 项目应覆盖内置');
    assert.equal(payment.priority, 'must');
  } finally { cleanup(); }
});

// ── detectFingerprint ───────────────────────────────────────
test('detectFingerprint 识别 Java + 支付领域词', () => {
  const { root, cleanup } = makeTmp();
  try {
    w(root, 'pom.xml', '<project><artifactId>x</artifactId></project>');
    w(root, 'src/main/java/com/x/payment/PayService.java',
      'public class PayService { void refund() {} } // 微信支付 回调 验签');
    const catalog = loadCatalog({ rootDir: root, config: {} }).catalog;
    const fp = detectFingerprint({ rootDir: root, config: { layers: [{ path: 'src/main/java' }] }, catalog });
    assert.equal(fp.stack.lang, 'java');
    assert.ok((fp.domainHits.payment || 0) >= 2, `payment 命中应 ≥2（实际 ${fp.domainHits.payment}）`);
    assert.ok(fp.arch.src === true);
  } finally { cleanup(); }
});

test('detectFingerprint 识别 UniApp（node + vue）', () => {
  const { root, cleanup } = makeTmp();
  try {
    w(root, 'package.json', JSON.stringify({ dependencies: { '@dcloudio/uni-app': '3.0.0' } }));
    const fp = detectFingerprint({ rootDir: root, config: {}, catalog: [] });
    assert.equal(fp.stack.lang, 'node');
    assert.equal(fp.stack.framework, 'uni-app');
  } finally { cleanup(); }
});

// ── buildExpected ───────────────────────────────────────────
test('buildExpected 目录命中即推荐', () => {
  const catalog = [{ id: 'payment', detect: { dirs: ['payment'], keywords: [] }, minScore: 99, priority: 'should' }];
  const fp = { arch: { payment: true }, domainHits: { payment: 0 } };
  const exp = buildExpected({ catalog, fingerprint: fp });
  assert.equal(exp.length, 1);
  assert.equal(exp[0].id, 'payment');
  assert.equal(exp[0].dirsHit, true);
});

// ── auditOneSkill（L1-L4）───────────────────────────────────
test('L1 结构：缺 frontmatter → must', () => {
  const { root, cleanup } = makeTmp();
  try {
    const dir = resolve(root, 'ai/skills/x');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), '# no frontmatter', 'utf-8');
    const r = auditOneSkill({ rootDir: root, skillDir: dir, name: 'x' });
    assert.equal(r.status, 'stale');
    assert.equal(r.tier, 'must');
  } finally { cleanup(); }
});

test('L2 权威路径失效 → stale', () => {
  const { root, cleanup } = makeTmp();
  try {
    const dir = resolve(root, 'ai/skills/x');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), `---
name: x
description: d
---

## 权威文件

- \`docs/not-exist.md\`
`, 'utf-8');
    const r = auditOneSkill({ rootDir: root, skillDir: dir, name: 'x' });
    assert.equal(r.status, 'stale');
    assert.match(r.detail, /权威路径失效/);
  } finally { cleanup(); }
});

test('L3 内容漂移：权威文件变更后二次审计 → stale', () => {
  const { root, cleanup } = makeTmp();
  try {
    w(root, 'docs/spec.md', '# v1');
    const dir = resolve(root, 'ai/skills/x');
    mkdirSync(dir, { recursive: true });
    const skill = `---
name: x
description: d
---

## 权威文件

- \`docs/spec.md\`
`;
    writeFileSync(join(dir, 'SKILL.md'), skill, 'utf-8');
    // 首次：建立基线 → ok
    const r1 = auditOneSkill({ rootDir: root, skillDir: dir, name: 'x' });
    assert.equal(r1.status, 'ok');
    // 修改权威文件 → 二次审计 → 漂移
    w(root, 'docs/spec.md', '# v2 全变了');
    const r2 = auditOneSkill({ rootDir: root, skillDir: dir, name: 'x' });
    assert.equal(r2.status, 'stale');
    assert.match(r2.detail, /内容漂移/);
  } finally { cleanup(); }
});

test('L4 元数据过期：lastReviewedAt 超阈值 → stale', () => {
  const { root, cleanup } = makeTmp();
  try {
    const dir = resolve(root, 'ai/skills/x');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), `---
name: x
description: d
lastReviewedAt: 2020-01-01
---

## 核心概念
- a
`, 'utf-8');
    const r = auditOneSkill({ rootDir: root, skillDir: dir, name: 'x', freshnessDays: 30 });
    assert.equal(r.status, 'stale');
    assert.match(r.detail, /久未复审/);
  } finally { cleanup(); }
});

// ── audit 整体流程 ──────────────────────────────────────────
test('audit 整体：缺 payment、已有 x 健康', () => {
  const { root, cleanup } = makeTmp();
  try {
    w(root, 'pom.xml', '<project/>');
    w(root, 'src/payment/PayService.java', 'class PayService { void refund(){} } // 支付 回调');
    // 已有 skill x（payment 缺）
    const dir = resolve(root, 'ai/skills/x');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), `---
name: x
description: d
---

## 核心概念
- a
`, 'utf-8');
    const config = { layers: [{ path: 'src' }], skills: { freshnessDays: 90 } };
    const result = audit({ rootDir: root, config });
    assert.ok(result.missing.some(m => m.id === 'payment'), 'payment 应缺失');
    assert.ok(result.ok.some(o => o.id === 'x'), 'x 应健康');
    assert.equal(typeof result.fingerprint.domainHits, 'object');
  } finally { cleanup(); }
});

test('generateDrafts 产出草稿并含权威文件素材', () => {
  const { root, cleanup } = makeTmp();
  try {
    w(root, 'docs/api/store.yaml', 'openapi: 3.0');
    const missing = [{ id: 'api', title: 'API', priority: 'should', source: 'bundled', score: 3, dirsHit: false, authorityGlobs: ['docs/api/**'] }];
    const created = generateDrafts({ rootDir: root, config: {}, missing });
    assert.equal(created.length, 1);
    assert.equal(created[0].id, 'api');
    assert.equal(created[0].authority, 1);
    const draft = join(root, '.harness-cache/skill-drafts/api.md');
    const content = readFileSync(draft, 'utf-8');
    assert.match(content, /docs\/api\/store\.yaml/);
  } finally { cleanup(); }
});
