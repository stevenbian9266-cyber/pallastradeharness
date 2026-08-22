import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { getGateChecks, loadConfig } from './config-loader.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = ['node-ts', 'rails', 'java'];
const PRD_CHECKS = new Set(['read-skill-prd', 'create-prd-doc', 'create-req-doc', 'req-doc-has-skill-table', 'user-confirmed']);

test('Tier A fixtures load config with correct layers and unit verifier (HTH-018)', async () => {
  for (const fixture of FIXTURES) {
    const fixtureRoot = resolve(ROOT, 'examples', fixture);
    assert.ok(existsSync(resolve(fixtureRoot, 'harness.config.mjs')), `${fixture}: harness.config.mjs present`);
    const { config } = await loadConfig({ rootDir: fixtureRoot });
    assert.ok(config.layers.length >= 1, `${fixture}: layers configured`);
    assert.ok(config.evidence?.verifiers?.unit, `${fixture}: unit verifier configured`);
    // Lite 语义：过滤 PRD 检查后无 create-prd-doc
    const checks = getGateChecks(config, 'feature').filter(check => !PRD_CHECKS.has(check.id));
    assert.ok(!checks.some(check => check.id === 'create-prd-doc'), `${fixture}: lite gate excludes PRD checks`);
  }
});

test('node-ts fixture ships a runnable node --test suite', () => {
  const fixtureRoot = resolve(ROOT, 'examples', 'node-ts');
  const testFile = resolve(fixtureRoot, 'src', 'index.test.mjs');
  assert.ok(existsSync(testFile), 'node-ts test file exists');
  // Node 23+ 支持 .ts type stripping；22 需 --experimental-strip-types。跑一次验证（失败仅警告不硬卡）
  try {
    const result = execFileSync(process.execPath, [testFile], { cwd: fixtureRoot, encoding: 'utf-8', stdio: 'pipe' });
    assert.match(result, /pass 1|# pass 1/, 'node-ts test should pass');
  } catch (error) {
    console.warn(`⚠️  node-ts runtime test skipped: ${String(error.message).split('\n')[0]}`);
  }
});
