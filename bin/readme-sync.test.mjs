// readme-sync.test.mjs — README 版本信息防漂移同步的单元测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseChangelog,
  findCurrentVersionLine,
  tableRows,
  insertVersionRows,
  syncReadme,
} from './readme-sync.mjs';

const CHANGELOG = `# Changelog

## [Unreleased]

### Guided UX (1.8.0) — 实施中

- 交互式 TUI

## [1.7.0] — 2026-08-22

### Trust Kernel

- ChangeSnapshot: Task/Gate/Evidence/commit 绑定同一可重算变更快照
- Verifier Registry: \`harness verify\`

## [1.6.0] — 2026-08-20

- feat: automated trigger completion
`;

function fixture({ version = '1.7.0', readme, enReadme, changelog = CHANGELOG } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'readme-sync-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version }, null, 2), 'utf-8');
  writeFileSync(join(dir, 'CHANGELOG.md'), changelog, 'utf-8');
  if (readme) writeFileSync(join(dir, 'README.md'), readme, 'utf-8');
  if (enReadme) writeFileSync(join(dir, 'README.en.md'), enReadme, 'utf-8');
  return dir;
}

const ZH_README = `# pallastrade-harness

### 发布信息

- 当前源码版本：\`1.6.0\`；\`v1.6.0\` tag 由 GitHub OIDC workflow 发布并生成 provenance

### 版本记录

| 版本 | 亮点 |
|---|---|
| **v1.6.0** | **自动化触发补全**：人工撰写的富文本 |
`;

const EN_README = `### Version highlights

| Version | Highlight |
|---|---|
| **v1.6.0** | Automated trigger completion |
`;

// 已同步的 README（当前版本 1.7.0 + 版本表含 v1.7.0/v1.6.0 两行）
const SYNCED_ZH = `# pallastrade-harness

### 发布信息

- 当前源码版本：\`1.7.0\`；\`v1.7.0\` tag 由 GitHub OIDC workflow 发布并生成 provenance

### 版本记录

| 版本 | 亮点 |
|---|---|
| **v1.7.0** | **Trust Kernel**：ChangeSnapshot 等 |
| **v1.6.0** | **自动化触发补全**：人工撰写的富文本 |
`;

const SYNCED_EN = `### Version highlights

| Version | Highlight |
|---|---|
| **v1.7.0** | Trust Kernel |
| **v1.6.0** | Automated trigger completion |
`;

test('parseChangelog：提取已发布版本与首条亮点，跳过 Unreleased', () => {
  const released = parseChangelog(CHANGELOG);
  assert.deepEqual(released.map(v => v.version), ['1.7.0', '1.6.0']);
  assert.match(released[0].highlight, /ChangeSnapshot/);
  assert.ok(!released.some(v => v.version === 'Unreleased'));
});

test('parseChangelog：亮点为空时返回空串（无 bullet 段）', () => {
  const released = parseChangelog('## [9.9.9] — 2026-01-01\n\nno bullets here\n');
  assert.equal(released[0].highlight, '');
});

test('findCurrentVersionLine：命中当前源码版本行', () => {
  const cur = findCurrentVersionLine(ZH_README);
  assert.ok(cur);
  assert.equal(cur.version, '1.6.0');
  assert.equal(cur.tagVersion, '1.6.0');
  assert.match(cur.line, /当前源码版本/);
});

test('findCurrentVersionLine：无匹配返回 null', () => {
  assert.equal(findCurrentVersionLine('## no version line\n'), null);
});

test('tableRows：只提取指定表头后的表格行', () => {
  const rows = tableRows(ZH_README, /\|\s*版本\s*\|\s*亮点\s*\|/);
  assert.ok(rows.length >= 1);
  assert.match(rows[0], /v1\.6\.0/);
});

test('insertVersionRows：在表头分隔行后插入，保持降序', () => {
  const rowsToInsert = ['| **v1.7.0** | ⚠️ 【自动生成·待润色】 placeholder |'];
  const { content, inserted } = insertVersionRows(ZH_README, /\|\s*版本\s*\|\s*亮点\s*\|/, rowsToInsert);
  assert.equal(inserted, 1);
  const lines = content.split(/\r?\n/);
  const headerIdx = lines.findIndex(l => /\|\s*版本\s*\|\s*亮点\s*\|/.test(l));
  assert.equal(lines[headerIdx + 2].startsWith('| **v1.7.0** |'), true);
});

test('AC-001：--check 检测当前源码版本漂移 → issues / ok=false', () => {
  const dir = fixture({ readme: ZH_README, enReadme: EN_README });
  const result = syncReadme({ rootDir: dir, write: false });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some(i => i.includes('当前源码版本 1.6.0')));
  assert.ok(result.issues.some(i => i.includes('版本表缺行 1.7.0')));
  // en：最新已发布版本 1.7.0 缺行
  assert.ok(result.issues.some(i => i.includes('README.en.md')));
});

test('AC-002/003：--write 更新当前版本行 + 补齐缺失表行，随后 --check 通过（roundtrip）', () => {
  const dir = fixture({ readme: ZH_README, enReadme: EN_README });
  const written = syncReadme({ rootDir: dir, write: true });
  assert.equal(written.ok, true);
  assert.ok(written.changes.some(c => c.includes('1.6.0 → 1.7.0')));
  assert.ok(written.changes.some(c => c.includes('补齐缺失行 1.7.0')));

  const zh = readFileSync(join(dir, 'README.md'), 'utf-8');
  assert.match(zh, /当前源码版本：`1\.7\.0`；`v1\.7\.0` tag/);
  assert.match(zh, /\|\s*\*\*v1\.7\.0\*\*\s*\|/);
  // 手写富文本行不被覆盖
  assert.match(zh, /人工撰写的富文本/);

  const en = readFileSync(join(dir, 'README.en.md'), 'utf-8');
  assert.match(en, /\|\s*\*\*v1\.7\.0\*\*\s*\|/);

  const checked = syncReadme({ rootDir: dir, write: false });
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.issues, []);
});

test('--check：版本一致时 ok=true', () => {
  const dir = fixture({ readme: SYNCED_ZH, enReadme: SYNCED_EN });
  const result = syncReadme({ rootDir: dir, write: false });
  assert.equal(result.ok, true);
});

test('en 表为人工精选：--check 只要求最新已发布版本有行', () => {
  // en 表为人工精选（只列主要版本），缺 1.6.0 之前的旧版 → 不报缺行
  const dir = fixture({ readme: SYNCED_ZH, enReadme: SYNCED_EN });
  const result = syncReadme({ rootDir: dir, write: false });
  assert.equal(result.ok, true);
});

test('parseChangelog：版本号非法时 syncReadme 报错', () => {
  const dir = fixture({ version: 'not-a-version', readme: ZH_README });
  const result = syncReadme({ rootDir: dir, write: false });
  assert.equal(result.ok, false);
  assert.ok(result.issues[0].includes('版本非法'));
});
