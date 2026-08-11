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
