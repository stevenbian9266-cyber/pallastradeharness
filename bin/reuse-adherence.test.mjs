import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parseReuseMatrix, checkReuseAdherence } from './reuse-adherence.mjs';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), 'harness.mjs');

function sampleProject() {
  return mkdtempSync(join(tmpdir(), 'harness-reuse-'));
}

function writeTechDesign(rootDir, rows) {
  const dir = join(rootDir, 'docs', 'designs', 'TASK-x');
  mkdirSync(dir, { recursive: true });
  const header = `# 技术方案\n\n## Part A — 现状识别\n\n### A1 业务\n\n## Part B — 复用决策矩阵\n\n| 能力需求 | 决策 | 目标 | 依据 |\n|---|---|---|---|\n`;
  const body = rows.map(r => `| ${r.need} | ${r.decision} | ${r.target} | ${r.basis} |`).join('\n');
  writeFileSync(join(dir, 'tech-design.md'), header + body + '\n');
}

// 解析：表头/分隔行过滤，正确提取 决策/目标/依据
test('parseReuseMatrix 解析表格行并过滤表头/分隔行', () => {
  const content = [
    '| 能力需求 | 决策 | 目标 | 依据 |',
    '|---|---|---|---|',
    '| 日期格式化 | 调用已有 | formatDate | src/lib/date.ts:12 |',
    '| 分页查询 | 扩展已有 | queryPage | src/lib/api.ts:88 |',
    '| 权限校验 | 新封装公用 | assertPerm | src/lib/auth.ts |',
    '| 下拉选择 | 新建局部 | Dropdown | — |',
  ].join('\n');
  const rows = parseReuseMatrix(content);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], { need: '日期格式化', decision: '调用已有', target: 'formatDate', basis: 'src/lib/date.ts:12' });
  assert.equal(rows[2].decision, '新封装公用');
  assert.equal(rows[3].decision, '新建局部');
  assert.equal(parseReuseMatrix('| a | b | c |').length, 0);
});

// 调用已有：源码引用 → pass；未引用 → fail
test('AC-005 调用已有: 引用 pass / 未引用 fail', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'src', 'lib'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'lib', 'date.ts'), 'export function formatDate(d: Date): string { return ""; }\n');
    writeFileSync(join(rootDir, 'src', 'app.ts'), 'import { formatDate } from "./lib/date";\nexport function run() { return formatDate(new Date()); }\n');
    // 引用存在 → pass
    writeTechDesign(rootDir, [{ need: '日期格式化', decision: '调用已有', target: 'formatDate', basis: 'src/lib/date.ts:12' }]);
    let r = checkReuseAdherence({ rootDir });
    assert.equal(r.verdicts.fail, 0);
    assert.equal(r.verdicts.pass, 1);
    // 未引用 → fail
    writeTechDesign(rootDir, [{ need: '日期格式化', decision: '调用已有', target: 'formatDate', basis: 'src/lib/date.ts:12' }]);
    writeFileSync(join(rootDir, 'src', 'app.ts'), 'export function run() { return new Date().toISOString(); }\n');
    r = checkReuseAdherence({ rootDir });
    assert.equal(r.verdicts.fail, 1);
    assert.match(r.checks[0].reason, /not referenced/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// 新封装公用：导出+引用 pass；未导出 fail；导出未用 fail
test('AC-005 新封装公用: 导出且引用 pass / 未导出 fail / 没人用 fail', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'src', 'lib'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'lib', 'auth.ts'), 'export function assertPerm(role: string): boolean { return true; }\n');
    writeFileSync(join(rootDir, 'src', 'app.ts'), 'import { assertPerm } from "./lib/auth";\nexport function run() { return assertPerm("admin"); }\n');
    writeTechDesign(rootDir, [{ need: '权限校验', decision: '新封装公用', target: 'assertPerm', basis: 'src/lib/auth.ts' }]);
    let r = checkReuseAdherence({ rootDir });
    assert.equal(r.verdicts.pass, 1, JSON.stringify(r.checks));
    // 导出但没人用 → fail
    writeFileSync(join(rootDir, 'src', 'app.ts'), 'export function run() { return true; }\n');
    r = checkReuseAdherence({ rootDir });
    assert.equal(r.verdicts.fail, 1);
    assert.match(r.checks[0].reason, /封装了没人用/);
    // 完全没导出 → fail
    writeFileSync(join(rootDir, 'src', 'lib', 'auth.ts'), 'function assertPerm(role: string): boolean { return true; }\n');
    r = checkReuseAdherence({ rootDir });
    assert.equal(r.verdicts.fail, 1);
    assert.match(r.checks[0].reason, /not exported/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// 扩展已有：依据文件存在 → pass；无法判定 → warning
test('AC-005 扩展已有: 依据文件存在 pass / 无法判定 warning', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'src', 'lib'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'lib', 'api.ts'), 'export function queryPage() { return []; }\n');
    writeTechDesign(rootDir, [{ need: '分页查询', decision: '扩展已有', target: 'queryPage', basis: 'src/lib/api.ts:88' }]);
    let r = checkReuseAdherence({ rootDir });
    assert.equal(r.verdicts.pass, 1, JSON.stringify(r.checks));
    // 依据文件不存在且目标也不在源码 → warning（不阻断）
    writeTechDesign(rootDir, [{ need: '分页查询', decision: '扩展已有', target: 'ghostFn', basis: 'src/ghost.ts:1' }]);
    r = checkReuseAdherence({ rootDir });
    assert.equal(r.verdicts.fail, 0);
    assert.equal(r.verdicts.warning, 1);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// 新建局部：单文件 pass / 跨文件引用 fail
test('AC-005 新建局部: 单文件 pass / 跨文件 fail', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'src'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'a.ts'), 'function Dropdown() { return null; }\n');
    writeTechDesign(rootDir, [{ need: '下拉选择', decision: '新建局部', target: 'Dropdown', basis: '—' }]);
    let r = checkReuseAdherence({ rootDir });
    assert.equal(r.verdicts.pass, 1, JSON.stringify(r.checks));
    writeFileSync(join(rootDir, 'src', 'b.ts'), 'function useDropdown() { return Dropdown(); }\nfunction Dropdown() { return null; }\n');
    r = checkReuseAdherence({ rootDir });
    assert.equal(r.verdicts.fail, 1);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// CLI: fail>0 → exit 1；无 tech-design → exit 0
test('AC-005 CLI: reuse-adherence fail 时 exit 1；无设计文档 exit 0', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'src'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'app.ts'), 'export function run() { return 1; }\n');
    writeTechDesign(rootDir, [{ need: '日期格式化', decision: '调用已有', target: 'formatDate', basis: 'src/lib/date.ts:12' }]);
    let r = spawnSync(process.execPath, [CLI, 'reuse-adherence'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    // 空项目无 tech-design → exit 0
    const empty = sampleProject();
    try {
      r = spawnSync(process.execPath, [CLI, 'reuse-adherence'], { cwd: empty, encoding: 'utf-8' });
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /no tech-design/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
