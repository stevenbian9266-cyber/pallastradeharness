import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createSkill } from './skill.mjs';

function sampleProject() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-skill-'));
  mkdirSync(join(rootDir, 'ai'), { recursive: true });
  return rootDir;
}

test('createSkill creates skeleton, frontmatter, and ai/README index', () => {
  const rootDir = sampleProject();
  try {
    const result = createSkill({ rootDir, config: { name: 'sample' }, domain: 'payments', title: '支付' });
    assert.equal(result.created, true);
    assert.equal(result.domain, 'payments');
    const skillFile = join(rootDir, 'ai', 'skills', 'payments', 'SKILL.md');
    assert.ok(existsSync(skillFile), 'SKILL.md should exist');
    const content = readFileSync(skillFile, 'utf-8');
    assert.match(content, /^---/);
    assert.match(content, /name: payments/);
    assert.match(content, /description:/);
    // ai/README.md 应被创建并注册
    const readme = readFileSync(join(rootDir, 'ai', 'README.md'), 'utf-8');
    assert.match(readme, /payments/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('createSkill registers into existing AGENTS.md §0.1 table', () => {
  const rootDir = sampleProject();
  try {
    writeFileSync(join(rootDir, 'AGENTS.md'), '# sample\n\n### 0.1 规范文件总表\n\n| 文件 | 类别 |\n|---|---|\n| `AGENTS.md` | 导航 |\n');
    const result = createSkill({ rootDir, config: { name: 'sample' }, domain: 'catalog', title: '目录' });
    assert.equal(result.created, true);
    const agents = readFileSync(join(rootDir, 'AGENTS.md'), 'utf-8');
    assert.match(agents, /ai\/skills\/catalog\/SKILL\.md/);
    // 幂等：再次创建不应重复
    const again = createSkill({ rootDir, config: { name: 'sample' }, domain: 'catalog', title: '目录' });
    assert.equal(again.created, false);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('createSkill rejects empty domain', () => {
  const rootDir = sampleProject();
  try {
    assert.throws(() => createSkill({ rootDir, config: {}, domain: '' }), /domain must be a non-empty value/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// ── skill check --freshness / 幽灵引用 ─────────────────────
import { skillRefsExist } from './scan.mjs';

test('skillRefsExist detects stale authority paths', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'ai', 'skills', 'payments'), { recursive: true });
    writeFileSync(join(rootDir, 'ai', 'skills', 'payments', 'SKILL.md'), `---
name: payments
description: payments domain
---

## 权威文件

- \`app/services/payment_service.rb\` — 权威
- \`src/main/java/com/demo/Missing.java\` — 失效
`);
    const fr = skillRefsExist(rootDir, join(rootDir, 'ai', 'skills', 'payments'));
    assert.equal(fr.ok, false);
    assert.ok(fr.missing.includes('src/main/java/com/demo/Missing.java'));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('skillRefsExist ignores illustrative lines (create/example/output)', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'ai', 'skills', 'payments'), { recursive: true });
    writeFileSync(join(rootDir, 'ai', 'skills', 'payments', 'SKILL.md'), `---
name: payments
description: payments domain
---

## 操作

- 创建 \`app/services/payment_service.rb\`（示例）
- 输出到 \`tmp/generated.rb\`
`);
    const fr = skillRefsExist(rootDir, join(rootDir, 'ai', 'skills', 'payments'));
    assert.equal(fr.ok, true, 'illustrative paths must not be treated as stale');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
