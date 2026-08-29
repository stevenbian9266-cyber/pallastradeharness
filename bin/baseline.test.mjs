import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { DEFAULT_CONFIG, getGateChecks } from './config-loader.mjs';
import { parseTapFailures, createBaseline, checkBaseline, runTestCommand } from './baseline.mjs';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), 'harness.mjs');

function sampleConfig() {
  return { ...DEFAULT_CONFIG, qualityBaseline: { enabled: true, testCommand: ['node', '--test', '--test-reporter=tap', '*.test.mjs'] } };
}

function sampleProject() {
  return mkdtempSync(join(tmpdir(), 'harness-base-'));
}

const TAP_SAMPLE = `TAP version 13
# Subtest: should pass
ok 1 - should pass
  ---
  duration_ms: 0.2
  ...
# Subtest: should fail
not ok 2 - should fail
  ---
  duration_ms: 1.4
  type: 'test'
  location: 'C:\\\\tmp\\\\a.test.mjs:3:1'
  failureType: 'testCodeFailure'
  error: 'boom'
  ...
1..2
# tests 2
# fail 1
`;

// AC-001: TAP 解析
test('AC-001: parseTapFailures 提取失败测试 name + location', () => {
  const failures = parseTapFailures(TAP_SAMPLE);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].name, 'should fail');
  assert.match(failures[0].file, /a\.test\.mjs/);
  assert.equal(parseTapFailures('ok 1 - x\nok 2 - y\n').length, 0);
});

// AC-002/003/004: create + check 三态（临时项目真实 node --test）
test('AC-002~004: create/check 区分 新增/历史/已修复', () => {
  const rootDir = sampleProject();
  try {
    writeFileSync(join(rootDir, 'ok.test.mjs'), "import { test } from 'node:test';\ntest('ok', () => {});\n");
    writeFileSync(join(rootDir, 'fail1.test.mjs'), "import { test } from 'node:test';\ntest('legacy fail', () => { throw new Error('legacy'); });\n");

    // 建基线：1 个已知失败
    const baseline = createBaseline({ rootDir, config: sampleConfig() });
    assert.ok(baseline.failureCount >= 1);
    assert.ok(baseline.failures.some(f => f.name === 'legacy fail'));

    // 相同失败 → existing_failures（exit 0 语义）
    let result = checkBaseline({ rootDir, config: sampleConfig() });
    assert.equal(result.status, 'existing_failures');
    assert.equal(result.newFailures.length, 0);
    assert.equal(result.existingFailures.length, 1);

    // 新增失败 → new_failures（阻断）
    writeFileSync(join(rootDir, 'fail2.test.mjs'), "import { test } from 'node:test';\ntest('new regression', () => { throw new Error('new'); });\n");
    result = checkBaseline({ rootDir, config: sampleConfig() });
    assert.equal(result.status, 'new_failures');
    assert.ok(result.newFailures.some(f => f.name === 'new regression'));

    // 修复历史失败（删 fail1），保留新增 → new_failures + resolved=[legacy fail]
    rmSync(join(rootDir, 'fail1.test.mjs'));
    result = checkBaseline({ rootDir, config: sampleConfig() });
    assert.equal(result.status, 'new_failures');
    assert.ok(result.resolved.some(f => f.name === 'legacy fail'));

    // 全绿 → passed
    rmSync(join(rootDir, 'fail2.test.mjs'));
    result = checkBaseline({ rootDir, config: sampleConfig() });
    assert.equal(result.status, 'passed');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// 无基线 → no_baseline
test('无基线时 check 返回 no_baseline', () => {
  const rootDir = sampleProject();
  try {
    writeFileSync(join(rootDir, 'ok.test.mjs'), "import { test } from 'node:test';\ntest('ok', () => {});\n");
    const result = checkBaseline({ rootDir, config: sampleConfig() });
    assert.equal(result.status, 'no_baseline');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// AC-005: CLI create/check
test('AC-005: baseline CLI create/check', () => {
  const rootDir = sampleProject();
  try {
    writeFileSync(join(rootDir, 'ok.test.mjs'), "import { test } from 'node:test';\ntest('ok', () => {});\n");
    writeFileSync(join(rootDir, 'fail.test.mjs'), "import { test } from 'node:test';\ntest('legacy', () => { throw new Error('legacy'); });\n");
    let r = spawnSync(process.execPath, [CLI, 'baseline:create'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /质量基线已创建/);
    r = spawnSync(process.execPath, [CLI, 'baseline:check', '--json'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const result = JSON.parse(r.stdout);
    assert.equal(result.status, 'existing_failures');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// AC-006: enabled 时 gate 含 baseline-gate
test('AC-006: getGateChecks 在 enabled 时含 baseline-gate', () => {
  const config = { ...DEFAULT_CONFIG, qualityBaseline: { enabled: true } };
  const checks = getGateChecks(config, 'feature');
  assert.ok(checks.some(c => c.id === 'baseline-gate' && c.phase === 'verification'));
  const disabled = getGateChecks(DEFAULT_CONFIG, 'feature');
  assert.ok(!disabled.some(c => c.id === 'baseline-gate'));
});

// runTestCommand 基本可用
test('runTestCommand 运行测试命令', () => {
  const rootDir = sampleProject();
  try {
    writeFileSync(join(rootDir, 'ok.test.mjs'), "import { test } from 'node:test';\ntest('ok', () => {});\n");
    const { exitCode, stdout } = runTestCommand(rootDir, ['node', '--test', '--test-reporter=tap', '*.test.mjs']);
    assert.equal(exitCode, 0);
    assert.match(stdout, /TAP version 13/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
