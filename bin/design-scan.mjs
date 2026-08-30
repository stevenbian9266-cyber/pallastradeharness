/**
 * design-scan.mjs — 设计阶段现状识别（设计阶段治理）
 *
 * PRD 确认后、编程前，技术方案（tech-design.md）的 Part A 现状识别
 * 必须以本命令输出为"事实来源"，防止 AI 臆造现状：
 *   - business：业务系统/模块/服务盘点
 *   - data    ：数据模型 / 字段盘点（migrations / prisma / sequelize / mongoose / entity / sql）
 *   - code    ：公共方法 / 组件 / 工具符号清单（含文件位置）
 *
 * CLI：harness design:scan [--scope business|data|code|all] [--json]
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { collectGlob } from './glob-utils.mjs';
import { getArg, hasArg } from './cli-utils.mjs';

export const VALID_SCOPES = ['business', 'data', 'code', 'all'];

// 常见源码目录（相对 rootDir 的 glob；collectGlob 已跳过 node_modules/.git 等）
const BUSINESS_GLOBS = [
  'src/services/**/*.{js,ts,mjs,jsx,tsx}',
  'src/modules/**/*.{js,ts,mjs,jsx,tsx}',
  'app/controllers/**/*.{js,ts}',
  'app/services/**/*.{js,ts}',
  'app/models/**/*.{js,ts}',
];

const DATA_GLOBS = [
  '**/migrations/**/*.{js,ts,sql}',
  '**/prisma/schema.prisma',
  '**/models/**/*.{js,ts,mjs}',
  '**/*.entity.{ts,js}',
  '**/*.model.{js,ts,mjs}',
  '**/schema.sql',
  '**/schema.prisma',
];

const CODE_GLOBS = [
  'src/lib/**/*.{js,ts,mjs,jsx,tsx}',
  'src/utils/**/*.{js,ts,mjs,jsx,tsx}',
  'src/components/**/*.{js,ts,mjs,jsx,tsx}',
  'lib/**/*.{js,ts,mjs}',
  'utils/**/*.{js,ts,mjs}',
  'app/helpers/**/*.{js,ts}',
  'bin/*.mjs',
];

const EXPORT_RE = /\bexport\s+(?:async\s+)?(?:function|const|class|let|var)\s+([A-Za-z_$][\w$]*)/g;

function rel(rootDir, abs) {
  return relative(rootDir, abs).replaceAll('\\', '/');
}

/** 业务系统盘点：列出业务模块/服务文件（相对路径 + 模块名） */
export function scanBusiness(rootDir) {
  const seen = new Set();
  const modules = [];
  for (const pattern of BUSINESS_GLOBS) {
    for (const abs of collectGlob(rootDir, pattern)) {
      const r = rel(rootDir, abs);
      if (seen.has(r)) continue;
      seen.add(r);
      // 模块名：取 src/services/ 等下的第一层子目录名，否则用文件名去扩展名
      const segments = r.split('/');
      const depth = segments.findIndex(s => ['services', 'modules', 'controllers', 'models'].includes(s));
      const name = depth >= 0 && segments[depth + 1] ? segments[depth + 1] : segments[segments.length - 1].replace(/\.[^.]+$/, '');
      modules.push({ module: name, path: r });
    }
  }
  return modules.sort((a, b) => a.path.localeCompare(b.path));
}

/** 从文件内容提取数据模型与字段（prisma model / CREATE TABLE / 通用文件名兜底） */
export function extractDataModel(file, content) {
  if (file.endsWith('.prisma')) {
    const models = [];
    const modelRe = /\bmodel\s+(\w+)\s*\{([^}]*)\}/g;
    let m;
    while ((m = modelRe.exec(content)) !== null) {
      const fields = [];
      const fieldRe = /^\s+(\w+)\s+(\w+)/gm;
      let fm;
      const body = m[2];
      while ((fm = fieldRe.exec(body)) !== null) fields.push(`${fm[1]}:${fm[2]}`);
      models.push({ model: m[1], fields });
    }
    return models;
  }
  if (file.endsWith('.sql')) {
    const tables = [];
    const tableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"\w.]+)\s*\(([^;]*?)\)/gis;
    let m;
    while ((m = tableRe.exec(content)) !== null) {
      const fields = [];
      const fieldRe = /^\s*([`"\w]+)\s+(\w+)/gm;
      let fm;
      while ((fm = fieldRe.exec(m[2])) !== null) fields.push(`${fm[1]}:${fm[2]}`);
      tables.push({ model: m[1].replace(/[`"]/g, ''), fields });
    }
    return tables;
  }
  // 通用：文件名作为模型名（js/ts model/entity/migration 文件），不解析字段
  const name = file.split('/').pop().replace(/\.[^.]+$/, '');
  return [{ model: name, fields: [] }];
}

/** 数据模型识别：扫描模型/迁移/实体文件，输出模型 + 字段 */
export function scanData(rootDir) {
  const seen = new Set();
  const models = [];
  for (const pattern of DATA_GLOBS) {
    for (const abs of collectGlob(rootDir, pattern)) {
      const r = rel(rootDir, abs);
      if (seen.has(r)) continue;
      seen.add(r);
      let content = '';
      try { content = readFileSync(abs, 'utf-8'); } catch { continue; }
      for (const model of extractDataModel(r, content)) {
        models.push({ model: model.model, file: r, fields: model.fields });
      }
    }
  }
  return models.sort((a, b) => a.model.localeCompare(b.model));
}

/** 代码结构：扫描公共目录导出符号（函数/常量/类 + 文件位置） */
export function scanCode(rootDir) {
  const seen = new Set();
  const symbols = [];
  for (const pattern of CODE_GLOBS) {
    for (const abs of collectGlob(rootDir, pattern)) {
      const r = rel(rootDir, abs);
      if (seen.has(r)) continue;
      seen.add(r);
      let content = '';
      try { content = readFileSync(abs, 'utf-8'); } catch { continue; }
      const re = new RegExp(EXPORT_RE.source, 'g');
      let m;
      while ((m = re.exec(content)) !== null) {
        const decl = content.slice(m.index, m.index + m[0].length);
        const kind = /\bclass\b/.test(decl) ? 'class' : /\bconst\b|\blet\b|\bvar\b/.test(decl) ? 'const' : 'function';
        symbols.push({ symbol: m[1], kind, file: r });
      }
    }
  }
  return symbols.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/** 按 scope 扫描全部 */
export function scanAll(rootDir) {
  return {
    business: scanBusiness(rootDir),
    data: scanData(rootDir),
    code: scanCode(rootDir),
  };
}

function printHuman(result, scope) {
  if (scope === 'business' || scope === 'all') {
    console.log(`📦 业务模块（${result.business.length}）`);
    for (const b of result.business.slice(0, 30)) console.log(`   ${b.module}  (${b.path})`);
    if (result.business.length > 30) console.log(`   … 等 ${result.business.length} 个`);
  }
  if (scope === 'data' || scope === 'all') {
    console.log(`🗄️  数据模型（${result.data.length}）`);
    for (const d of result.data.slice(0, 30)) {
      console.log(`   ${d.model}  (${d.file})${d.fields.length ? `  [${d.fields.slice(0, 8).join(', ')}${d.fields.length > 8 ? ', …' : ''}]` : ''}`);
    }
    if (result.data.length > 30) console.log(`   … 等 ${result.data.length} 个`);
  }
  if (scope === 'code' || scope === 'all') {
    console.log(`🧩 公共符号（${result.code.length}）`);
    for (const c of result.code.slice(0, 40)) console.log(`   ${c.kind} ${c.symbol}  (${c.file})`);
    if (result.code.length > 40) console.log(`   … 等 ${result.code.length} 个`);
  }
}

/** CLI：harness design:scan [--scope business|data|code|all] [--json] */
export function runDesignScan({ rootDir, args, config }) {
  const scope = getArg(args, '--scope') || 'all';
  const json = hasArg(args, '--json') || getArg(args, '--format') === 'json';
  if (!VALID_SCOPES.includes(scope)) {
    console.error(`❌ Invalid scope: ${scope} (valid: ${VALID_SCOPES.join(', ')})`);
    process.exitCode = 1;
    return;
  }
  const result = scanAll(rootDir);
  if (json) console.log(JSON.stringify(result, null, 2));
  else printHuman(result, scope);
}
