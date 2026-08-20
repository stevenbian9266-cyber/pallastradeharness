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
  auditOneSkill, audit, generateDrafts, createMissingSkills,
  detectCandidateDomains, findNewDomains, createProjectCatalogEntry,
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

test('detectCandidateDomains 扫描 domain-*/modules/* 领域目录', () => {
  const { root, cleanup } = makeTmp();
  try {
    w(root, 'hajizone-domains/domain-lottery/pom.xml', '');
    w(root, 'hajizone-domains/domain-payment/pom.xml', '');
    w(root, 'modules/foo/src/a.js', 'x');
    const c = detectCandidateDomains({ rootDir: root });
    assert.ok(c.some(x => x.slug === 'lottery' && x.dir === 'hajizone-domains/domain-lottery'));
    assert.ok(c.some(x => x.slug === 'payment'));
    assert.ok(c.some(x => x.slug === 'foo' && x.kind === 'module'));
  } finally { cleanup(); }
});

test('findNewDomains 识别未被覆盖的新领域（跳过已有 skill/catalog）', () => {
  const { root, cleanup } = makeTmp();
  try {
    w(root, 'hajizone-domains/domain-lottery/pom.xml', '');
    w(root, 'hajizone-domains/domain-payment/pom.xml', '');
    // payment 已有 skill → 不算新领域
    w(root, 'ai/skills/payment/SKILL.md', '---\nname: payment\ndescription: d\n---\n\n## 核心概念\n- a\n');
    const catalog = loadCatalog({ rootDir: root, config: {} }).catalog;
    const fresh = findNewDomains({ rootDir: root, config: {}, catalog });
    const slugs = fresh.map(n => n.slug);
    assert.ok(slugs.includes('lottery'), 'lottery 应为新领域');
    assert.ok(!slugs.includes('payment'), 'payment 已有 skill 不应算新领域');
    // 二次运行：已在状态中，不再重复报（reported 标记）
    const fresh2 = findNewDomains({ rootDir: root, config: {}, catalog });
    assert.ok(!fresh2.some(n => n.slug === 'lottery' && !n.reported), '二次运行不应重复刷屏');
  } finally { cleanup(); }
});

test('createProjectCatalogEntry 生成项目级 catalog 条目（可被 audit 再次加载）', () => {
  const { root, cleanup } = makeTmp();
  try {
    const r = createProjectCatalogEntry({ rootDir: root, domain: { dir: 'hajizone-domains/domain-lottery', slug: 'lottery' } });
    assert.equal(r.created, true);
    assert.equal(r.path, 'harness/catalog/lottery.json');
    const { catalog, sources } = loadCatalog({ rootDir: root, config: {} });
    assert.ok(sources.some(s => s.kind === 'project'), '项目目录应被加载');
    const item = catalog.find(c => c.id === 'lottery');
    assert.ok(item, 'lottery 应进入合并目录');
    assert.ok(item.detect.dirs.includes('hajizone-domains/domain-lottery'));
    // 幂等
    const r2 = createProjectCatalogEntry({ rootDir: root, domain: { dir: 'hajizone-domains/domain-lottery', slug: 'lottery' } });
    assert.equal(r2.created, false);
  } finally { cleanup(); }
});

test('audit 集成：新增领域目录后返回 newDomains', () => {
  const { root, cleanup } = makeTmp();
  try {
    w(root, 'pom.xml', '<project/>');
    w(root, 'hajizone-domains/domain-lottery/src/LotteryService.java', 'class LotteryService { void draw(){} } // 抽奖 积分');
    const result = audit({ rootDir: root, config: { layers: [{ path: 'src' }] } });
    assert.ok(result.newDomains.some(n => n.slug === 'lottery'), '应检测到 lottery 新领域');
  } finally { cleanup(); }
});

test('createMissingSkills 自动创建正式 SKILL.md 并注册索引', () => {
  const { root, cleanup } = makeTmp();
  try {
    w(root, 'AGENTS.md', '# AGENTS\n\n### 0.1 规范文件总表\n\n| 文件 | 类别 |\n|---|---|\n');
    w(root, 'ai/README.md', '# AI Skills 索引\n');
    w(root, 'docs/api/store.yaml', 'openapi: 3.0');
    const missing = [{ id: 'api', title: 'API', priority: 'should', source: 'bundled', score: 3, dirsHit: false, authorityGlobs: ['docs/api/**'] }];
    const created = createMissingSkills({ rootDir: root, config: {}, missing });
    assert.equal(created.length, 1);
    assert.equal(created[0].created, true);
    assert.equal(created[0].path, 'ai/skills/api/SKILL.md');
    // 正式文件存在且含权威文件素材
    const skill = readFileSync(join(root, 'ai/skills/api/SKILL.md'), 'utf-8');
    assert.match(skill, /^---\r?\nname: api/m);
    assert.match(skill, /docs\/api\/store\.yaml/);
    // 索引已注册
    const agents = readFileSync(join(root, 'AGENTS.md'), 'utf-8');
    assert.match(agents, /ai\/skills\/api\/SKILL\.md/);
    const readme = readFileSync(join(root, 'ai/README.md'), 'utf-8');
    assert.match(readme, /api/);
    // 幂等：重复创建不重复写
    const created2 = createMissingSkills({ rootDir: root, config: {}, missing });
    assert.equal(created2[0].created, false);
  } finally { cleanup(); }
});

// ── v1.5.0：内容模板渲染（非空骨架）────────────────────────
test('createMissingSkills 用内容模板渲染（有实质内容，非空骨架）', () => {
  const { root, cleanup } = makeTmp();
  try {
    w(root, 'AGENTS.md', '# AGENTS\n\n### 0.1 规范文件总表\n\n| 文件 | 类别 |\n|---|---|\n');
    w(root, 'ai/README.md', '# AI Skills 索引\n');
    const missing = [{ id: 'api', title: 'API / 对外接口', priority: 'should', source: 'bundled', score: 3, dirsHit: false, authorityGlobs: [] }];
    const created = createMissingSkills({ rootDir: root, config: { name: 'demo' }, missing });
    assert.equal(created.length, 1);
    assert.equal(created[0].created, true);
    const skill = readFileSync(join(root, 'ai/skills/api/SKILL.md'), 'utf-8');
    // 有实质内容：模板的通用最佳实践在文件中
    assert.match(skill, /契约优先/, '应含模板实质内容（契约优先）');
    assert.match(skill, /幂等/, '应含模板实质内容（幂等）');
    assert.match(skill, /## 常用操作/);
    // 占位符全部替换
    assert.doesNotMatch(skill, /\{\{/, '不应残留占位符');
    // 项目名注入
    assert.match(skill, /demo/);
    // 不是空骨架（不含 AI 填充主结构）
    assert.doesNotMatch(skill, /# 核心概念\n\n- （AI 填充：本项目/);
  } finally { cleanup(); }
});

test('createMissingSkills 无模板领域回退旧骨架（向后兼容）', () => {
  const { root, cleanup } = makeTmp();
  try {
    w(root, 'AGENTS.md', '# AGENTS\n\n### 0.1 规范文件总表\n\n| 文件 | 类别 |\n|---|---|\n');
    w(root, 'ai/README.md', '# AI Skills 索引\n');
    const missing = [{ id: 'lottery', title: '抽奖', priority: 'nice', source: 'project', score: 1, dirsHit: true, authorityGlobs: [] }];
    const created = createMissingSkills({ rootDir: root, config: {}, missing });
    const skill = readFileSync(join(root, 'ai/skills/lottery/SKILL.md'), 'utf-8');
    assert.match(skill, /^---\r?\nname: lottery/m);
    assert.match(skill, /AI 填充/, '无模板应回退旧骨架（含 AI 填充指引）');
  } finally { cleanup(); }
});
