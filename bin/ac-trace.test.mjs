import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { parseAcsFromPrd, findPrdFile, findAcTestFiles, checkAcCoverage, checkUnclaimedAcs } from './ac-trace.mjs';

function repository() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-actsem-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.email', 'harness@example.test'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'Harness Test'], { cwd: rootDir });
  execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: rootDir });
  return rootDir;
}

// AC-001（语义模块）: parseAcsFromPrd 忽略 HTML 注释、去重
test('parseAcsFromPrd 忽略注释示例并去重', () => {
  const content = [
    '<!-- 模板示例 AC-999 不应计入 -->',
    '## 验收标准',
    '- AC-001：...',
    '- AC-002：...',
    '- AC-001：重复出现只计一次',
    '- 文本里提到 AC-003（无横杠分隔也算）',
  ].join('\n');
  const acs = parseAcsFromPrd(content);
  assert.deepEqual(acs, ['AC-001', 'AC-002', 'AC-003']);
});

// findPrdFile 跨分类查找
test('findPrdFile 在 docs/prd/<category>/ 下找到 PRD 文件', () => {
  const rootDir = repository();
  try {
    const prdDir = join(rootDir, 'docs', 'prd');
    mkdirSync(join(prdDir, 'other'), { recursive: true });
    writeFileSync(join(prdDir, 'other', 'PRD-20260828-test-demo.md'), '# PRD\n- AC-001');
    writeFileSync(join(prdDir, '_TEMPLATE.md'), '# template');
    assert.equal(findPrdFile(prdDir, 'PRD-20260828-test-demo'), join(prdDir, 'other', 'PRD-20260828-test-demo.md'));
    assert.equal(findPrdFile(prdDir, 'PRD-NOT-EXISTS'), null);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// AC-003（追溯）: 有测试覆盖 vs 缺失
test('checkAcCoverage 识别有覆盖与缺失 AC', () => {
  const rootDir = repository();
  try {
    mkdirSync(join(rootDir, 'test'), { recursive: true });
    writeFileSync(join(rootDir, 'test', 'demo.test.mjs'), 'test("PRD-20260828-test-demo AC-001", () => { assert.equal(1, 1); });');
    execFileSync('git', ['add', 'test'], { cwd: rootDir });
    execFileSync('git', ['commit', '-m', 'add test'], { cwd: rootDir });
    const result = checkAcCoverage({ rootDir, prdId: 'PRD-20260828-test-demo', acs: ['AC-001', 'AC-002'] });
    assert.equal(result.covered['AC-001'].length, 1);
    assert.deepEqual(result.missing, ['AC-002']);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// AC-004/AC-006: 未认领 AC 检查（跨任务）
test('checkUnclaimedAcs 识别未被任务认领的 AC', () => {
  const rootDir = repository();
  try {
    const prdDir = join(rootDir, 'docs', 'prd');
    mkdirSync(join(prdDir, 'other'), { recursive: true });
    writeFileSync(join(prdDir, 'other', 'PRD-20260828-test-demo.md'), '# PRD\n- AC-001\n- AC-002\n- AC-003\n');
    // 任务 A 认领 AC-001/AC-002
    const tasksDir = join(rootDir, '.harness-state', 'tasks');
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, 'TASK-a.json'), JSON.stringify({ id: 'TASK-a', status: 'planned', linkedPrd: 'PRD-20260828-test-demo', acceptanceCriteria: ['AC-001', 'AC-002'] }));
    const unclaimed = checkUnclaimedAcs({ rootDir, config: DEFAULT_CONFIG, prdId: 'PRD-20260828-test-demo' });
    assert.deepEqual(unclaimed, ['AC-003']);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
