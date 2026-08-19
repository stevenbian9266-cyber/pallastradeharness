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

// ── 修复回归：monorepo 相对路径不应误报 ──────────────────────
// 2026-08-19: scan 曾把 skill 中合理的相对路径（backend/ storefront/ platform/
// 前缀省略）误判为"权威路径失效"。修复后 skillRefsExist 使用智能解析。
test('skill freshness: backend-relative path resolves (no false positive)', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'backend', 'config', 'initializers'), { recursive: true });
    writeFileSync(join(rootDir, 'backend', 'config', 'initializers', 'pallastrade.rb'), '# config\n');
    mkdirSync(join(rootDir, 'ai', 'skills', 'payments'), { recursive: true });
    writeFileSync(join(rootDir, 'ai', 'skills', 'payments', 'SKILL.md'), `---
name: payments
description: Use when working with payments.
---

## 权威文件

- \`config/initializers/pallastrade.rb\` — runtime config
`);
    const items = buildScanItems({ rootDir, config: { name: 'demo' } });
    const skill = items.find(i => i.id === 'skill-payments-fresh');
    assert.equal(skill, undefined, 'backend-relative path should resolve; no stale item expected');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('skill freshness: storefront src shorthand resolves (no false positive)', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'storefront', 'src', 'lib', 'data'), { recursive: true });
    writeFileSync(join(rootDir, 'storefront', 'src', 'lib', 'data', 'posts.ts'), 'export {};\n');
    mkdirSync(join(rootDir, 'ai', 'skills', 'cms'), { recursive: true });
    writeFileSync(join(rootDir, 'ai', 'skills', 'cms', 'SKILL.md'), `---
name: cms
description: Use when working with CMS.
---

## 权威文件

- \`src/lib/data/posts.ts\` — data layer
`);
    const items = buildScanItems({ rootDir, config: { name: 'demo' } });
    const skill = items.find(i => i.id === 'skill-cms-fresh');
    assert.equal(skill, undefined, 'storefront src shorthand should resolve; no stale item expected');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('skill freshness: glob paths resolve (no false positive)', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'storefront', 'messages'), { recursive: true });
    writeFileSync(join(rootDir, 'storefront', 'messages', 'en.json'), '{}');
    mkdirSync(join(rootDir, 'ai', 'skills', 'i18n'), { recursive: true });
    writeFileSync(join(rootDir, 'ai', 'skills', 'i18n', 'SKILL.md'), `---
name: i18n
description: Use when working with i18n.
---

## 权威文件

- \`storefront/messages/*.json\` — locale files
`);
    const items = buildScanItems({ rootDir, config: { name: 'demo' } });
    const skill = items.find(i => i.id === 'skill-i18n-fresh');
    assert.equal(skill, undefined, 'glob path should resolve; no stale item expected');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('skill freshness: generator-output table rows and negative instructions are skipped', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'ai', 'skills', 'admin'), { recursive: true });
    writeFileSync(join(rootDir, 'ai', 'skills', 'admin', 'SKILL.md'), `---
name: admin
description: Use when working with admin.
---

## Scaffold output

| File | Purpose |
|---|---|
| \`backend/app/controllers/pallastrade/admin/brands_controller.rb\` | generated controller |

Do NOT add \`storefront/src/middleware.ts\` — it must not exist.
`);
    const items = buildScanItems({ rootDir, config: { name: 'demo' } });
    const skill = items.find(i => i.id === 'skill-admin-fresh');
    assert.equal(skill, undefined, 'generator table rows + negative instructions should be skipped');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('skill freshness: storefront page shorthand resolves via app route dir', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'storefront', 'src', 'app', '[country]', '[locale]', '(storefront)', 'account'), { recursive: true });
    writeFileSync(join(rootDir, 'storefront', 'src', 'app', '[country]', '[locale]', '(storefront)', 'account', 'page.tsx'), 'export default () => null;\n');
    mkdirSync(join(rootDir, 'ai', 'skills', 'storefront'), { recursive: true });
    writeFileSync(join(rootDir, 'ai', 'skills', 'storefront', 'SKILL.md'), `---
name: storefront
description: Use when working with the storefront.
---

## 权威文件

- \`account/page.tsx\` — account page
`);
    const items = buildScanItems({ rootDir, config: { name: 'demo' } });
    const skill = items.find(i => i.id === 'skill-storefront-fresh');
    assert.equal(skill, undefined, 'storefront page shorthand should resolve via app route dir');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
