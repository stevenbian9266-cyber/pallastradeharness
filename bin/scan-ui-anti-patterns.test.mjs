import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { DEFAULT_UI_RULES } from './scan-ui-anti-patterns.mjs';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), 'harness.mjs');

function sampleProject() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-ui-'));
  mkdirSync(join(rootDir, 'src'), { recursive: true });
  return rootDir;
}

// AC-002: UI-001 inline style 被识别（error → exit 1）
test('AC-002: UI-001 识别 inline style 并失败', () => {
  const rootDir = sampleProject();
  try {
    writeFileSync(join(rootDir, 'src', 'bad.tsx'), "export const B = () => <div style={{ color: 'red' }} />;\n");
    const result = spawnSync(process.execPath, [CLI, 'scan-ui-anti-patterns', '--files', 'src/bad.tsx'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(result.status, 1, result.stderr + result.stdout);
    assert.match(result.stdout, /UI-001/);
    assert.match(result.stdout, /inline style/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// AC-003: UI-002 硬编码色报错，但 design-tokens 文件豁免
test('AC-003: UI-002 硬编码色报错且 design-tokens 豁免', () => {
  const rootDir = sampleProject();
  try {
    writeFileSync(join(rootDir, 'src', 'a.tsx'), "const c = '#abc';\n");
    writeFileSync(join(rootDir, 'src', 'design-tokens.ts'), "export const tokens = { color: { primary: '#123456' } };\n");
    const result = spawnSync(process.execPath, [CLI, 'scan-ui-anti-patterns', '--files', 'src/a.tsx,src/design-tokens.ts'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(result.status, 1, result.stderr + result.stdout);
    assert.match(result.stdout, /UI-002/);
    assert.match(result.stdout, /src\/a\.tsx/);
    assert.ok(!result.stdout.includes('design-tokens.ts'), 'design tokens 文件不应命中 UI-002');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// AC-004: UI-003 裸 fetch 报错
test('AC-004: UI-003 识别组件裸 fetch', () => {
  const rootDir = sampleProject();
  try {
    writeFileSync(join(rootDir, 'src', 'api.ts'), "export const load = () => fetch('/api/tasks');\n");
    const result = spawnSync(process.execPath, [CLI, 'scan-ui-anti-patterns', '--files', 'src/api.ts'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(result.status, 1, result.stderr + result.stdout);
    assert.match(result.stdout, /UI-003/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// AC-005: UI-005 img 缺 alt 报错，带 alt 不报
test('AC-005: UI-005 img 缺 alt 报错且带 alt 不报', () => {
  const rootDir = sampleProject();
  try {
    writeFileSync(join(rootDir, 'src', 'a.tsx'), "const Img = () => <img src='/x.png' />;\n");
    writeFileSync(join(rootDir, 'src', 'b.tsx'), "const Img2 = () => <img src='/x.png' alt='logo' />;\n");
    const result = spawnSync(process.execPath, [CLI, 'scan-ui-anti-patterns', '--files', 'src/a.tsx,src/b.tsx'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(result.status, 1, result.stderr + result.stdout);
    assert.match(result.stdout, /UI-005/);
    assert.match(result.stdout, /src\/a\.tsx/);
    assert.ok(!result.stdout.includes('src/b.tsx'), '带 alt 的 img 不应命中');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// 干净代码 → 0 违规，exit 0
test('合规 UI 代码无违规并 exit 0', () => {
  const rootDir = sampleProject();
  try {
    writeFileSync(join(rootDir, 'src', 'ok.tsx'),
      "import { tokenClass } from './ui-tokens';\nexport const A = () => <div className={tokenClass('card')}><img src='/x.png' alt='x' /></div>;\n");
    const result = spawnSync(process.execPath, [CLI, 'scan-ui-anti-patterns', '--files', 'src/ok.tsx'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /No UI anti-patterns detected/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// AC-001（契约）: EVIDENCE_TYPES 含 ui-approval（经 contracts 校验函数）
test('AC-001: ui-approval 是合法证据类型', async () => {
  const { EVIDENCE_TYPES, validateContract } = await import('./contracts.mjs');
  assert.ok(EVIDENCE_TYPES.includes('ui-approval'));
  const errs = validateContract('Evidence', {
    schemaVersion: '1.0', type: 'Evidence',
    id: 'EVD-test', evidenceType: 'ui-approval', taskId: 'TASK-x', capturedAt: new Date().toISOString(), summary: '人工确认截图',
  });
  assert.equal(errs.length, 0, `ui-approval 应通过契约校验: ${errs.join('; ')}`);
});

// 内置默认规则非空且含四类 UI 规则
test('DEFAULT_UI_RULES 覆盖 UI-001/002/003/005', () => {
  const ids = DEFAULT_UI_RULES.map(r => r.id);
  for (const id of ['UI-001', 'UI-002', 'UI-003', 'UI-005']) assert.ok(ids.includes(id), `missing ${id}`);
});
