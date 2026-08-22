import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkDocs } from './docs-check.mjs';

test('docs-check validates relative links and reports broken targets with locations', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-docs-'));
  try {
    mkdirSync(join(rootDir, 'docs'), { recursive: true });
    writeFileSync(join(rootDir, 'README.md'), '[Guide](docs/guide.md)\n[Missing](docs/missing.md)\n[Web](https://example.com)\n');
    writeFileSync(join(rootDir, 'docs', 'guide.md'), '[Home](../README.md)\n');
    const result = checkDocs({ rootDir, sources: ['README.md', 'docs/**/*.md'] });
    assert.equal(result.files, 2);
    assert.equal(result.links, 3);
    assert.deepEqual(result.broken, [{ file: 'README.md', target: 'docs/missing.md', line: 2 }]);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('docs-check flags outdated manual verify-test clear in fenced code blocks (HTH-011)', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-docs-outdated-'));
  try {
    mkdirSync(join(rootDir, 'docs'), { recursive: true });
    // 正常代码块含过时命令 → 应命中
    writeFileSync(join(rootDir, 'docs', 'bad.md'), '# Bad\n\n```bash\nnpx harness gate:clear --gate GATE-1 --clear verify-test --note x\n```\n');
    // 警示块（含"已禁止"）→ 应跳过
    writeFileSync(join(rootDir, 'docs', 'warn.md'), '# Warn\n\n> ⚠️ 已禁止：\n\n```bash\nnpx harness gate:clear --gate GATE-1 --clear verify-test\n```\n');
    // 正常流程（无 verify-test 手工清除）→ 不命中
    writeFileSync(join(rootDir, 'docs', 'good.md'), '# Good\n\n```bash\nnpx harness gate:clear --gate GATE-1 --clear search-app\nnpx harness evidence verify --task TASK-1 --gate GATE-1\n```\n');
    const result = checkDocs({ rootDir, sources: ['docs/**/*.md'] });
    assert.equal(result.outdated.length, 1, `expected 1 outdated, got ${JSON.stringify(result.outdated)}`);
    assert.equal(result.outdated[0].rule, 'manual-verify-test-clear');
    assert.ok(result.outdated[0].file.replaceAll('\\', '/').endsWith('docs/bad.md'), `unexpected file: ${result.outdated[0].file}`);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
