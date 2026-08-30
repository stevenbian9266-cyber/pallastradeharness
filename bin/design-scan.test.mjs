import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { DEFAULT_CONFIG, getGateChecks } from './config-loader.mjs';
import { scanBusiness, scanData, scanCode, scanAll, extractDataModel } from './design-scan.mjs';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), 'harness.mjs');
const TEMPLATES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'designs');

function sampleProject() {
  return mkdtempSync(join(tmpdir(), 'harness-design-'));
}

// AC-001: templates/designs/ 4 模板存在，tech-design 含 Part A/B/C 骨架
test('AC-001: templates/designs 含 4 模板且 tech-design 有 Part A/B/C', () => {
  for (const name of ['ui.md', 'interaction.md', 'visual.md', 'tech-design.md']) {
    assert.ok(existsSync(join(TEMPLATES_DIR, name)), `${name} missing`);
  }
  const tech = readFileSync(join(TEMPLATES_DIR, 'tech-design.md'), 'utf-8');
  assert.match(tech, /## Part A — 现状识别/);
  assert.match(tech, /## Part B — 复用决策矩阵/);
  assert.match(tech, /## Part C — 实施落点/);
  for (const kind of ['调用已有', '扩展已有', '新封装公用', '新建局部']) {
    assert.ok(tech.includes(kind), `tech-design 模板应含决策 ${kind}`);
  }
});

// AC-004: scanData 提取 prisma model + sql 表字段
test('AC-004: scanData 提取 prisma model 与 sql CREATE TABLE 字段', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'prisma'), { recursive: true });
    mkdirSync(join(rootDir, 'migrations'), { recursive: true });
    writeFileSync(join(rootDir, 'prisma', 'schema.prisma'),
      'model User {\n  id Int @id\n  name String\n}\nmodel Order {\n  id Int\n  total Decimal\n}\n');
    writeFileSync(join(rootDir, 'migrations', '001.sql'),
      'CREATE TABLE IF NOT EXISTS products (\n  id INTEGER PRIMARY KEY,\n  title TEXT NOT NULL\n);\n');
    const models = scanData(rootDir);
    const names = models.map(m => m.model);
    assert.ok(names.includes('User'));
    assert.ok(names.includes('Order'));
    assert.ok(names.includes('products'));
    const user = models.find(m => m.model === 'User');
    assert.ok(user.fields.includes('name:String'));
    const prod = models.find(m => m.model === 'products');
    assert.ok(prod.fields.includes('title:TEXT'));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// AC-003: scanCode 提取导出符号 + 文件位置
test('AC-003: scanCode 提取公共导出符号（函数/常量/类）', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'src', 'lib'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'lib', 'date.ts'), 'export function formatDate(d: Date): string { return ""; }\nexport const DAY_MS = 86400000;\n');
    writeFileSync(join(rootDir, 'src', 'lib', 'user.ts'), 'export class UserRepo {}\n');
    const symbols = scanCode(rootDir);
    assert.ok(symbols.some(s => s.symbol === 'formatDate' && s.kind === 'function' && s.file === 'src/lib/date.ts'));
    assert.ok(symbols.some(s => s.symbol === 'DAY_MS' && s.kind === 'const'));
    assert.ok(symbols.some(s => s.symbol === 'UserRepo' && s.kind === 'class'));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// scanBusiness: 业务模块盘点
test('scanBusiness 列出业务模块（services 下子目录）', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'src', 'services', 'orders'), { recursive: true });
    mkdirSync(join(rootDir, 'src', 'services', 'users'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'services', 'orders', 'order.service.ts'), 'export const x = 1;\n');
    writeFileSync(join(rootDir, 'src', 'services', 'users', 'user.service.ts'), 'export const y = 2;\n');
    const modules = scanBusiness(rootDir);
    assert.ok(modules.some(m => m.module === 'orders'));
    assert.ok(modules.some(m => m.module === 'users'));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// extractDataModel: prisma model 解析
test('extractDataModel 解析 prisma 字段', () => {
  const models = extractDataModel('schema.prisma', 'model A {\n  id Int @id\n  name String\n}');
  assert.equal(models.length, 1);
  assert.ok(models[0].fields.includes('id:Int'));
});

// AC-003 CLI: design:scan --scope code --json
test('AC-003 CLI: design:scan --scope code --json 输出符号清单', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'src', 'lib'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'lib', 'fmt.ts'), 'export function fmt() { return ""; }\n');
    const r = spawnSync(process.execPath, [CLI, 'design:scan', '--scope', 'code', '--json'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const parsed = JSON.parse(r.stdout);
    assert.ok(Array.isArray(parsed.code));
    assert.ok(parsed.code.some(c => c.symbol === 'fmt' && c.file === 'src/lib/fmt.ts'));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// AC-002: feature gate 含 7 设计检查项（在 user-confirmed 之后）；enabled=false / 非 feature 不含
test('AC-002: getGateChecks feature 含设计检查项且顺序正确；关闭/非 feature 不含', () => {
  const checks = getGateChecks({ ...DEFAULT_CONFIG }, 'feature');
  const ids = checks.map(c => c.id);
  const designIds = ['create-ui-doc', 'create-interaction-spec', 'create-visual-spec', 'create-tech-design', 'tech-design-has-baseline', 'tech-design-has-reuse-matrix', 'design-confirmed'];
  for (const id of designIds) assert.ok(ids.includes(id), `${id} missing`);
  const idxUser = ids.indexOf('user-confirmed');
  const idxDesign = ids.indexOf('design-confirmed');
  assert.ok(idxUser >= 0 && idxDesign > idxUser, 'design-confirmed 应在 user-confirmed 之后');
  // enabled=false → 不含
  const off = getGateChecks({ ...DEFAULT_CONFIG, designStage: { enabled: false } }, 'feature');
  assert.ok(!off.some(c => c.id === 'create-ui-doc'));
  assert.ok(!off.some(c => c.id === 'reuse-adherence-gate'));
  // 非 feature（bugfix）→ 不含
  const bugfix = getGateChecks({ ...DEFAULT_CONFIG }, 'bugfix');
  assert.ok(!bugfix.some(c => c.id === 'create-ui-doc'));
  // AC-006: feature enabled 时含 reuse-adherence-gate（verification）
  const reuse = checks.find(c => c.id === 'reuse-adherence-gate');
  assert.ok(reuse && reuse.phase === 'verification');
});
