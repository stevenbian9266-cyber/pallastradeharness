#!/usr/bin/env node
/**
 * readme-sync.mjs — README 版本信息防漂移同步（确定性、零 LLM）
 *
 * 问题：发布新版本后 README「发布信息/版本记录」依赖人工同步，容易漂移
 * （例如 package.json 已是 1.7.0，README 还写 1.6.0）。
 *
 * 数据源：
 *   - package.json → 当前源码版本
 *   - CHANGELOG.md → 已发布版本列表（`## [x.y.z] — date` 段，跳过 Unreleased）
 *
 * 目标文件：
 *   - README.md    → 「当前源码版本」行 + 「版本记录」表（全量补齐缺失行）
 *   - README.en.md → 「Version highlights」表（仅保证最新已发布版本有行——en 表为人工精选，不强推全量）
 *
 * 用法：
 *   node bin/readme-sync.mjs --check   # 存在漂移 → exit 1（CI 门禁）
 *   node bin/readme-sync.mjs --write   # 就地修复漂移（更新版本行 + 补齐缺失表行）
 *   node bin/readme-sync.mjs --json    # 结构化输出
 *
 * 约定：版本表既有行为人工撰写的富文本，脚本只做两件事——
 *   1. 校正「当前源码版本」行；
 *   2. 为 CHANGELOG 已发布但版本表缺失的版本补齐表行（内容自动生成并标注「待润色」，不覆盖手写行）。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXIT_CODES } from './cli-utils.mjs';

const VERSION_RE = /\d+\.\d+\.\d+/;
const ZH_MARK = '【自动生成·待润色】';
const EN_MARK = '[auto-generated, please polish]';

/** 解析 CHANGELOG，返回已发布版本 [{ version, highlight }]，按文档出现顺序（通常为降序） */
export function parseChangelog(content) {
  const sections = [];
  let current = null;
  for (const line of content.split(/\r?\n/)) {
    const heading = line.match(/^##\s+\[(\d+\.\d+\.\d+)\]/);
    if (heading) {
      current = { version: heading[1], body: [] };
      sections.push(current);
      continue;
    }
    if (current) current.body.push(line);
  }
  return sections.map(s => ({ version: s.version, highlight: firstBullet(s.body) }));
}

/** 取段内第一条 bullet（约 120 字截断）作为自动生成行的占位亮点 */
function firstBullet(body) {
  for (const line of body) {
    if (/^\s*[-*]\s+/.test(line)) {
      let text = line.replace(/^\s*[-*]\s+/, '').trim();
      if (text.length > 120) text = text.slice(0, 120) + '…';
      return text;
    }
  }
  return '';
}

/** 提取 README.md 的「当前源码版本」行；未找到返回 null。
 * 注意：该行位于文件中部，必须用 m 标志让 ^ 锚定到行首。 */
export function findCurrentVersionLine(content) {
  const m = content.match(/^- 当前源码版本：`(\d+\.\d+\.\d+)`；`v(\d+\.\d+\.\d+)`/m);
  return m ? { line: m[0], version: m[1], tagVersion: m[2] } : null;
}

/** 提取指定表头下的数据行（表头命中后直到首个非表格行，跳过 |---|---| 分隔行） */
export function tableRows(content, headerRegex) {
  const out = [];
  let inTable = false;
  for (const line of content.split(/\r?\n/)) {
    if (!inTable && headerRegex.test(line)) { inTable = true; continue; }
    if (inTable) {
      if (!line.trim().startsWith('|')) break;
      // 跳过纯分隔行（|---| 或 |:--:| 等）
      if (/^\|\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|$/.test(line.trim())) continue;
      out.push(line);
    }
  }
  return out;
}

/** 从表格行提取已覆盖的版本集合 */
function versionsFromRows(rows) {
  const set = new Set();
  for (const row of rows) {
    const m = row.match(/v(\d+\.\d+\.\d+)/);
    if (m) set.add(m[1]);
  }
  return set;
}

/** 在表头分隔行（|---|）后插入缺失行；返回 { content, inserted } */
export function insertVersionRows(content, headerRegex, rowsToInsert) {
  if (rowsToInsert.length === 0) return { content, inserted: 0 };
  const lines = content.split(/\r?\n/);
  const headerIdx = lines.findIndex(l => headerRegex.test(l));
  if (headerIdx === -1) return { content, inserted: 0 };
  // 分隔行：表头后下一个表格行中形如 |---|---| 者；找不到则回退 headerIdx+1
  let sepIdx = headerIdx + 1;
  for (let i = headerIdx + 1; i < lines.length && lines[i].trim().startsWith('|'); i++) {
    if (/^\|\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|$/.test(lines[i].trim())) { sepIdx = i; break; }
  }
  const newLines = [];
  let inserted = 0;
  for (let i = 0; i < lines.length; i++) {
    newLines.push(lines[i]);
    if (i === sepIdx) {
      for (const row of rowsToInsert) { newLines.push(row); inserted++; }
    }
  }
  return { content: newLines.join('\n'), inserted };
}

/**
 * 同步 README 版本信息。
 * @returns {{ ok: boolean, issues: string[], changes: string[] }}
 *   write=false：发现漂移写入 issues（ok=false）；
 *   write=true ：就地修复并写入 changes；无法修复的项才进 issues。
 */
export function syncReadme({ rootDir, write = false }) {
  const issues = [];
  const changes = [];
  const pkgPath = resolve(rootDir, 'package.json');
  const changelogPath = resolve(rootDir, 'CHANGELOG.md');
  if (!existsSync(pkgPath) || !existsSync(changelogPath)) {
    return { ok: false, issues: ['package.json 或 CHANGELOG.md 缺失，无法校验版本信息'], changes: [] };
  }
  const version = String(JSON.parse(readFileSync(pkgPath, 'utf-8')).version ?? '');
  if (!VERSION_RE.test(version)) {
    return { ok: false, issues: [`package.json 版本非法: ${version}`], changes: [] };
  }
  const released = parseChangelog(readFileSync(changelogPath, 'utf-8'));
  const latest = released[0] ?? null;

  for (const file of ['README.md', 'README.en.md']) {
    const path = resolve(rootDir, file);
    if (!existsSync(path)) continue;
    let content = readFileSync(path, 'utf-8');
    const isEn = file.endsWith('.en.md');
    const header = isEn ? /\|\s*Version\s*\|\s*Highlight\s*\|/ : /\|\s*版本\s*\|\s*亮点\s*\|/;
    const present = versionsFromRows(tableRows(content, header));
    const missing = isEn
      ? (latest && !present.has(latest.version) ? [latest] : [])
      : released.filter(v => !present.has(v.version));

    if (!isEn) {
      const cur = findCurrentVersionLine(content);
      if (!cur) {
        issues.push(`${file}: 未找到「当前源码版本」行`);
      } else if (cur.version !== version) {
        if (write) {
          const next = cur.line
            .replace(/`v\d+\.\d+\.\d+`/g, `\`v${version}\``)
            .replace(/`\d+\.\d+\.\d+`/g, `\`${version}\``);
          content = content.replace(cur.line, next);
          changes.push(`${file}: 当前源码版本 ${cur.version} → ${version}`);
        } else {
          issues.push(`${file}: 当前源码版本 ${cur.version} ≠ package.json ${version}`);
        }
      }
    }

    if (missing.length > 0) {
      if (write) {
        const mark = isEn ? EN_MARK : ZH_MARK;
        const rowsToInsert = missing.map(v =>
          `| **v${v.version}** | ⚠️ ${mark} ${v.highlight || '（CHANGELOG 无条目）'} |`);
        const res = insertVersionRows(content, header, rowsToInsert);
        content = res.content;
        changes.push(`${file}: 版本表补齐缺失行 ${missing.map(v => v.version).join(', ')}`);
      } else {
        issues.push(`${file}: 版本表缺行 ${missing.map(v => v.version).join(', ')}`);
      }
    }

    if (write && changes.some(c => c.startsWith(file))) {
      writeFileSync(path, content, 'utf-8');
    }
  }

  return { ok: issues.length === 0, issues, changes };
}

export function runReadmeSync({ rootDir, args = [] }) {
  const write = args.includes('--write');
  const json = args.includes('--json');
  const result = syncReadme({ rootDir, write });
  const version = (() => {
    try { return JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf-8')).version; } catch { return '?'; }
  })();
  if (json) {
    console.log(JSON.stringify({ ...result, version }, null, 2));
  } else if (result.ok) {
    const suffix = write && result.changes.length > 0 ? `；已更新：${result.changes.join('；')}` : '';
    console.log(`✅ readme:sync — 版本信息一致（package.json ${version}）${suffix}`);
  } else {
    console.error(`❌ readme:sync — ${result.issues.length} 处版本漂移（package.json ${version}）：`);
    for (const issue of result.issues) console.error(`  - ${issue}`);
    console.error('  修复：`node bin/readme-sync.mjs --write` 或 `npx harness readme:sync --write`');
  }
  if (!result.ok) process.exitCode = EXIT_CODES.POLICY_FAILURE;
  return result;
}

// 支持直接运行：node bin/readme-sync.mjs --check
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runReadmeSync({ rootDir: process.cwd(), args: process.argv.slice(2) });
}
