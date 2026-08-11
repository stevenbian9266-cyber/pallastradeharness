import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { countFiles } from './report.mjs';

test('report counts nested PRD and requirement assets recursively', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-report-'));
  try {
    mkdirSync(join(rootDir, 'docs', 'prd', 'feature'), { recursive: true });
    writeFileSync(join(rootDir, 'docs', 'prd', 'root.md'), '# root');
    writeFileSync(join(rootDir, 'docs', 'prd', 'feature', 'nested.md'), '# nested');
    assert.equal(countFiles(rootDir, 'docs/prd'), 2);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
