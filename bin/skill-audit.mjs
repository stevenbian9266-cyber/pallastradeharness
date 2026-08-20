#!/usr/bin/env node
/**
 * skill-audit.mjs — Skill 自动治理（v1.3.0 新增能力，通用化）
 *
 *   harness skill audit [--json] [--generate] [--check]
 *   harness skill catalog list | add <path|owner/repo>
 *
 * 通用闭环（不绑定任何具体项目/语言/领域）：
 *   ① 能力指纹检测 —— 纯本地、零外部依赖：
 *        语言/框架（build 文件） + 架构目录 + 领域关键词命中统计
 *   ② 三层目录匹配 —— 内置基线(presets) + 项目目录(harness/catalog/*.json) + 订阅目录
 *        → 应有 skill 清单（每条含 priority）
 *   ③ 对比现有 ai/skills/ → MISSING（缺）/ STALE（需升级）/ OK（健康）
 *   ④ 升级检测四级：
 *        L1 结构（SKILL.md/frontmatter/name 一致）
 *        L2 权威路径（skill 引用的文件是否真实存在）
 *        L3 内容漂移（引用的权威文件 contentHash 变化 → 提示升级）
 *        L4 元数据过期（frontmatter lastReviewedAt 超阈值 / 落后目录模板版本）
 *   ⑤ --generate 产出「Skill 起草包」（四段式提纲 + 权威文件素材）供 AI/人确认
 *
 * 设计原则：引擎提供「元能力」，领域知识全部来自可插拔目录；不写死业务词。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { globSync } from 'glob';
import { EXIT_CODES, getArg, hasArg } from './cli-utils.mjs';
import { skillRefsExist } from './scan.mjs';
import { registerInIndexes } from './skill.mjs';
import { resolveSkillBody } from './skill-template.mjs';

// ── 常量 ─────────────────────────────────────────────────────
const SKILL_FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const NAME_RE = /^name:\s*([^\r\n]+)$/m;
const REVIEWED_RE = /^lastReviewedAt:\s*([^\r\n]+)$/m;
// 权威文件引用行：`- \`path\`` 或 `- path`（反引号可选）
// 注意：长扩展名(如 json/tsx/yaml)必须排在短前缀(js/ts/yml)之前，并用 (?![\w]) 防截断
const REF_LINE_RE = /^[-*]\s*`?([a-zA-Z0-9_.\/\-\[\]*]+\.(?:json|tsx|yaml|java|ts|jsx|js|yml|rb|md|mjs|css|vue|xml|sql|properties))(?![\w])`?/m;
const ILLUSTRATIVE_RE = /\b(create|generate|install|rename|mkdir|touch)\b|创建|生成|安装|示例|example|output at|generated at/i;

// 内置目录文件（与 presets/ 对齐）
function bundledCatalogPath(engineRoot) {
  return resolve(engineRoot, 'presets', 'skill-catalog.json');
}

// ── jsonc 解析（目录文件允许 // 与 /* */ 注释）─────────────
function stripJsonComments(text) {
  // 粗略但够用：逐字符扫描，跳过字符串字面量内的 // 与 /* */
  let out = '';
  let inStr = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (inStr) {
      out += ch;
      if (ch === '\\') { out += next ?? ''; i += 2; continue; }
      if (ch === '"') inStr = false;
      i++; continue;
    }
    if (ch === '"') { inStr = true; out += ch; i++; continue; }
    if (ch === '/' && next === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (ch === '/' && next === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i += 2; continue; }
    out += ch;
    i++;
  }
  return out;
}

function parseJsonc(file) {
  return JSON.parse(stripJsonComments(readFileSync(file, 'utf-8')));
}

// ── 目录加载（三层合并）─────────────────────────────────────
export function loadCatalog({ rootDir, config = {} }) {
  const sources = [];
  const catalog = [];

  // ① 内置基线（引擎自带）
  //    本文件位于 <repo>/bin/，presets 在 <repo>/presets/
  const engineRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const bundledPath = bundledCatalogPath(engineRoot);
  if (existsSync(bundledPath)) {
    try {
      const data = parseJsonc(bundledPath);
      if (Array.isArray(data.catalog)) {
        for (const item of data.catalog) catalog.push({ ...item, source: 'bundled' });
        sources.push({ kind: 'bundled', name: 'presets/skill-catalog.json', items: data.catalog.length });
      }
    } catch { /* 忽略坏文件 */ }
  }

  // ② 项目自定义目录（config.skills.catalogSources，默认 harness/catalog/*.json）
  const projectGlobs = config.skills?.catalogSources || ['harness/catalog/*.json'];
  const projectFiles = [];
  for (const g of projectGlobs) {
    try { projectFiles.push(...globSync(g, { cwd: rootDir, absolute: true })); } catch { /* 忽略 */ }
  }
  for (const f of [...new Set(projectFiles)]) {
    try {
      const data = parseJsonc(f);
      if (Array.isArray(data.catalog)) {
        for (const item of data.catalog) catalog.push({ ...item, source: 'project' });
        sources.push({ kind: 'project', name: relative(rootDir, f), items: data.catalog.length });
      }
    } catch { /* 忽略坏文件 */ }
  }

  // ③ 订阅目录（skill catalog add 写入 harness/catalog/__subscribed__/*.json，已含于②）
  //    去重：同 id 项目优先于内置
  const byId = new Map();
  for (const item of catalog) {
    const priority = item.source === 'project' ? 2 : item.source === 'subscribed' ? 1 : 0;
    const existing = byId.get(item.id);
    if (!existing || priority > existing._priority) {
      byId.set(item.id, { ...item, _priority: priority });
    }
  }
  const merged = [...byId.values()].map(({ _priority, ...rest }) => rest);
  return { catalog: merged, sources };
}

// ── 能力指纹检测 ────────────────────────────────────────────
const LANG_MARKERS = [
  { lang: 'java',     file: 'pom.xml',            frameworks: ['spring-boot', 'maven'] },
  { lang: 'java',     file: 'build.gradle',       frameworks: ['gradle'] },
  { lang: 'node',     file: 'package.json',       frameworks: [] },
  { lang: 'ruby',     file: 'Gemfile',            frameworks: ['rails'] },
  { lang: 'python',   file: 'pyproject.toml',     frameworks: [] },
  { lang: 'python',   file: 'requirements.txt',   frameworks: [] },
  { lang: 'go',       file: 'go.mod',             frameworks: [] },
  { lang: 'php',      file: 'composer.json',      frameworks: [] },
  { lang: 'dotnet',   file: '*.csproj',           frameworks: [] },
];

function detectStack({ rootDir, config = {} }) {
  const rootFiles = existsSync(rootDir) ? readdirSync(rootDir) : [];
  const stack = { lang: null, framework: null };
  for (const marker of LANG_MARKERS) {
    const hit = marker.file.includes('*')
      ? rootFiles.some(f => f.endsWith(marker.file.replace('*', '')))
      : rootFiles.includes(marker.file);
    if (hit) {
      stack.lang = marker.lang;
      if (marker.frameworks.length > 0) stack.framework = marker.frameworks[0];
      // node 项目细分框架
      if (marker.lang === 'node') {
        try {
          const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf-8'));
          const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
          if (deps['@dcloudio/uni-app']) stack.framework = 'uni-app';
          else if (deps['next']) stack.framework = 'next';
          else if (deps['react']) stack.framework = 'react';
          else if (deps['vue']) stack.framework = 'vue';
        } catch { /* 忽略 */ }
      }
      break;
    }
  }
  // 架构目录（从 config.layers + 常见目录）
  const layerDirs = (config.layers || []).map(l => l.path);
  const archDirs = ['apps', 'src', 'domains', 'modules', 'services', 'platform', 'deploy', '.github', 'docs', 'ai', 'harness'];
  const arch = {};
  for (const d of [...new Set([...layerDirs, ...archDirs])]) {
    arch[d] = existsSync(resolve(rootDir, d));
  }
  return { stack, arch };
}

/** 领域关键词扫描：遍历可扫描目录，统计每个领域的命中关键词数（每词限 +1，文件数受限） */
function scanDomainKeywords({ rootDir, config = {}, catalog }) {
  const MAX_FILES = 500;          // 全项目最多扫描文件数
  const MAX_PER_DIR = 80;         // 每目录最多文件数
  const SKIP_DIRS = new Set(['.git', 'node_modules', 'target', 'dist', 'build', '.harness-cache', '.harness-state', 'coverage', '.next', '.nuxt']);
  const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.woff', '.woff2', '.lock', '.min.js', '.map']);
  const MAX_BYTES = 512 * 1024;   // 单文件最大 512KB

  const scanRoots = [];
  const layerPaths = (config.layers || []).map(l => l.path).filter(p => p && p !== '.');
  // 层目录 + 根级子目录（一层深），避免全盘递归过慢
  const rootEntries = existsSync(rootDir) ? readdirSync(rootDir, { withFileTypes: true }) : [];
  const rootDirs = rootEntries.filter(e => e.isDirectory() && !SKIP_DIRS.has(e.name)).map(e => e.name);
  scanRoots.push(...[...new Set([...layerPaths, ...rootDirs])].slice(0, 20));

  const counts = {};
  for (const item of catalog) counts[item.id] = 0;
  const keywordIndex = new Map(); // keyword -> [catalog ids]
  for (const item of catalog) {
    for (const kw of item.detect?.keywords || []) {
      if (!keywordIndex.has(kw)) keywordIndex.set(kw, []);
      keywordIndex.get(kw).push(item.id);
    }
  }

  let scanned = 0;
  outer:
  for (const rel of scanRoots) {
    const base = resolve(rootDir, rel);
    if (!existsSync(base)) continue;
    const walk = (dir, depth) => {
      if (scanned >= MAX_FILES) return;
      let entries;
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
      let filesInDir = 0;
      for (const e of entries) {
        if (scanned >= MAX_FILES) return;
        const full = resolve(dir, e.name);
        if (e.isDirectory()) {
          if (depth < 5 && !SKIP_DIRS.has(e.name)) walk(full, depth + 1);
          continue;
        }
        if (!e.isFile()) continue;
        const ext = e.name.slice(e.name.lastIndexOf('.')).toLowerCase();
        if (SKIP_EXT.has(ext)) continue;
        try {
          if (statSync(full).size > MAX_BYTES) continue;
        } catch { continue; }
        filesInDir++;
        if (filesInDir > MAX_PER_DIR) continue;
        scanned++;
        let text;
        try { text = readFileSync(full, 'utf-8'); } catch { continue; }
        const lower = text.toLowerCase();
        const seen = new Set();
        for (const [kw, ids] of keywordIndex) {
          if (seen.has(kw)) continue;
          if (lower.includes(String(kw).toLowerCase())) {
            seen.add(kw);
            for (const id of ids) counts[id] = (counts[id] || 0) + 1;
          }
        }
      }
    };
    walk(base, 0);
    if (scanned >= MAX_FILES) break outer;
  }
  return counts;
}

/** 完整能力指纹 */
export function detectFingerprint({ rootDir, config = {}, catalog }) {
  const { stack, arch } = detectStack({ rootDir, config });
  // 补充 catalog 动态声明的检测目录（如 payment/、locales/…）到架构指纹
  for (const item of catalog) {
    for (const d of item.detect?.dirs || []) {
      if (arch[d] === undefined) arch[d] = existsSync(resolve(rootDir, d));
    }
  }
  const domainHits = scanDomainKeywords({ rootDir, config, catalog });
  return { stack, arch, domainHits };
}

// ── 目录匹配 → 应有 skill 清单 ──────────────────────────────
export function buildExpected({ catalog, fingerprint }) {
  const expected = [];
  for (const item of catalog) {
    const dirsHit = (item.detect?.dirs || []).some(d => fingerprint.arch[d] === true);
    // fileGlobs 命中
    let fileHits = 0;
    for (const g of item.detect?.fileGlobs || []) {
      try { if (globSync(g, { cwd: process.cwd(), nodir: true, ignore: ['**/node_modules/**', '**/target/**', '**/dist/**'] }).length > 0) fileHits++; } catch { /* 忽略 */ }
    }
    const kwHits = fingerprint.domainHits[item.id] || 0;
    const score = fileHits + kwHits;
    const matched = dirsHit || score >= (item.minScore ?? 2);
    if (matched) {
      expected.push({
        id: item.id,
        title: item.title,
        priority: item.priority || 'nice',
        score,
        dirsHit,
        source: item.source,
        authorityGlobs: item.authorityGlobs || [],
      });
    }
  }
  // 按优先级排序
  const order = { must: 0, should: 1, nice: 2 };
  return expected.sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3) || b.score - a.score);
}

// ── skill 升级检测（L1-L4）──────────────────────────────────
function extractSkillRefs(content) {
  const refs = [];
  for (const line of content.split('\n')) {
    if (ILLUSTRATIVE_RE.test(line)) continue;
    const m = line.match(REF_LINE_RE);
    if (m) {
      const ref = m[1];
      if (!ref.includes('/') || ref.startsWith('http') || ref.includes(' ') || ref.includes('*')) continue;
      if (ref.startsWith('dist/') || ref.includes('node_modules/')) continue;
      refs.push(ref);
    }
  }
  return refs;
}

function loadSkillMeta(rootDir) {
  const p = resolve(rootDir, '.harness-cache', 'skill-meta.json');
  try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return { schemaVersion: 1, skills: {} }; }
}

function saveSkillMeta(rootDir, meta) {
  const p = resolve(rootDir, '.harness-cache', 'skill-meta.json');
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(meta, null, 2) + '\n', 'utf-8');
}

function hashFile(p) {
  try { return createHash('sha1').update(readFileSync(p)).digest('hex').slice(0, 12); }
  catch { return null; }
}

/**
 * 审计单个 skill：
 *  L1 结构（SKILL.md/frontmatter/name）→ must 级
 *  L2 权威路径存活（skillRefsExist）→ should 级
 *  L3 内容漂移：权威文件 contentHash 变化 → should 级
 *  L4 元数据过期：lastReviewedAt 超阈值 → should 级
 */
export function auditOneSkill({ rootDir, skillDir, name, freshnessDays = 90 }) {
  const skillFile = join(skillDir, 'SKILL.md');
  if (!existsSync(skillFile)) {
    return { status: 'missing-file', tier: 'must', label: `${name} 缺 SKILL.md`, detail: '运行 harness skill new --domain <x> 或 skill audit --generate' };
  }
  const content = readFileSync(skillFile, 'utf-8');
  const fm = content.match(SKILL_FRONTMATTER_RE);
  const nameMatch = content.match(NAME_RE);
  if (!fm || !nameMatch) {
    return { status: 'stale', tier: 'must', label: `${name} 缺 frontmatter`, detail: '补齐 --- name/description ---' };
  }
  if (nameMatch[1].trim() !== name) {
    return { status: 'stale', tier: 'should', label: `${name} frontmatter name 与目录名不一致`, detail: `name=${nameMatch[1].trim()} ≠ 目录 ${name}` };
  }

  // L2 权威路径
  const refs = extractSkillRefs(content);
  const broken = refs.filter(r => !existsSync(resolve(rootDir, r)));

  // L3 内容漂移（对比 .harness-cache/skill-meta.json）
  const meta = loadSkillMeta(rootDir);
  const prev = meta.skills?.[name];
  const current = {};
  for (const r of refs) {
    const p = resolve(rootDir, r);
    if (existsSync(p)) current[r] = hashFile(p);
  }
  const drift = prev ? refs.filter(r => prev.refs?.[r] && prev.refs[r] !== current[r]) : [];
  // 首次运行记录基线（不报 stale）
  meta.skills = meta.skills || {};
  if (!prev) {
    meta.skills[name] = { refs: current, reviewedAt: new Date().toISOString().slice(0, 10) };
    saveSkillMeta(rootDir, meta);
  } else if (drift.length > 0) {
    meta.skills[name] = { ...prev, refs: current, lastDriftAt: new Date().toISOString().slice(0, 10) };
    saveSkillMeta(rootDir, meta);
  }

  // L4 元数据过期
  const reviewed = content.match(REVIEWED_RE)?.[1]?.trim();
  let staleMeta = null;
  if (reviewed) {
    const days = (Date.now() - Date.parse(reviewed)) / 86400000;
    if (days > freshnessDays) staleMeta = `lastReviewedAt=${reviewed}（${Math.floor(days)} 天前）`;
  }

  const issues = [];
  if (broken.length > 0) issues.push(`权威路径失效 ${broken.length} 个：${broken.slice(0, 3).join(', ')}`);
  if (drift.length > 0) issues.push(`权威文件内容漂移 ${drift.length} 个：${drift.slice(0, 3).join(', ')}`);
  if (staleMeta) issues.push(`久未复审：${staleMeta}`);

  return {
    status: issues.length > 0 ? 'stale' : 'ok',
    tier: issues.length > 0 ? 'should' : 'must',
    label: name,
    detail: issues.join('；') || '健康',
    refs,
    drift,
  };
}

// ── 审计主流程 ──────────────────────────────────────────────
export function audit({ rootDir, config = {} }) {
  const catalog = loadCatalog({ rootDir, config });
  const fingerprint = detectFingerprint({ rootDir, config, catalog: catalog.catalog });
  const expected = buildExpected({ catalog: catalog.catalog, fingerprint });

  // 现有 skills
  const skillsDir = resolve(rootDir, 'ai', 'skills');
  const existing = new Map();
  if (existsSync(skillsDir)) {
    for (const e of readdirSync(skillsDir, { withFileTypes: true })) {
      if (e.isDirectory() && existsSync(join(skillsDir, e.name, 'SKILL.md'))) existing.set(e.name, e.name);
    }
  }

  const freshnessDays = config.skills?.freshnessDays ?? 90;
  const missing = [];
  const stale = [];
  const ok = [];

  for (const exp of expected) {
    if (existing.has(exp.id)) {
      const r = auditOneSkill({ rootDir, skillDir: join(skillsDir, exp.id), name: exp.id, freshnessDays });
      if (r.status === 'stale') stale.push({ ...exp, ...r });
      else ok.push({ ...exp, ...r });
    } else {
      missing.push(exp);
    }
  }

  // 项目已有但不在目录匹配中的 skill（自定义/历史）：同样做 L1-L4 健康检查
  for (const name of existing.keys()) {
    if (expected.some(e => e.id === name)) continue;
    const r = auditOneSkill({ rootDir, skillDir: join(skillsDir, name), name, freshnessDays });
    if (r.status === 'stale') stale.push({ id: name, title: name, priority: 'nice', source: 'existing', ...r });
    else ok.push({ id: name, title: name, priority: 'nice', source: 'existing', ...r });
  }

  // 疑似新领域（新增功能 → 未被 catalog/现有 skill 覆盖的高领域目录）
  const newDomains = findNewDomains({ rootDir, config, catalog: catalog.catalog });

  return { catalog: catalog.sources, fingerprint, expected, missing, stale, ok, newDomains };
}

// ── 草稿生成（--generate）──────────────────────────────────
export function generateDrafts({ rootDir, config = {}, missing }) {
  const draftsDir = resolve(rootDir, '.harness-cache', 'skill-drafts');
  const created = [];
  for (const item of missing) {
    const draftFile = join(draftsDir, `${item.id}.md`);
    mkdirSync(draftsDir, { recursive: true });
    // 权威文件素材：从 authorityGlobs 找真实存在的文件（路径统一正斜杠，跨平台）
    const authority = [];
    for (const g of item.authorityGlobs || []) {
      try {
        for (const f of globSync(g, { cwd: rootDir, nodir: true, ignore: ['**/node_modules/**', '**/target/**'] }).slice(0, 10)) {
          authority.push(f.replace(/\\/g, '/'));
        }
      } catch { /* 忽略 */ }
    }
    const scoreNote = item.dirsHit ? '（命中架构目录）' : `（关键词/文件命中 ${item.score}）`;
    const engineRoot = dirname(dirname(fileURLToPath(import.meta.url)));
    const projectName = config.name || rootDir.split(/[\\/]/).pop() || 'project';
    const authorityList = authority.length > 0 ? authority.map(a => `- \`${a}\``).join('\n') : '- （AI 填充：关键源码/文档路径）';
    const rendered = resolveSkillBody({ engineRoot, templateId: item.template, item, projectName, note: scoreNote, authorityList });
    const body = rendered ?? `---
name: ${item.id}
description: Use when the user is working on this project's ${item.title} area — <TODO 补全：触发场景/常见表述/操作>. Common phrasings include "<TODO 补全>".
lastReviewedAt: ${new Date().toISOString().slice(0, 10)}
---

# ${item.id} — ${item.title}（Skill 草稿）

> ⚠️ 由 \`harness skill audit --generate\` 生成草稿。请按 \`ai/skills/harness-skill-author/SKILL.md\` 补全正文，
> 确认后移动到 \`ai/skills/${item.id}/SKILL.md\` 并运行 \`npx harness skill check\`。
> 检测依据：${scoreNote}，来源 ${item.source}。

## 核心概念

- （AI 填充：本项目 ${item.title} 领域的概念图与关键实体）

## 常用操作

- （AI 填充：本项目该领域最常见的操作、命令、入口）

## 常见问题与陷阱

- （AI 填充：本项目该领域高频报错、反模式与规避方法）

## 权威文件

${authorityList}
`;
    writeFileSync(draftFile, body, 'utf-8');
    created.push({ id: item.id, draft: relative(rootDir, draftFile), authority: authority.length });
  }
  return created;
}

// ── 自动创建缺失 Skill 正式文件（--generate 核心动作）─────────
// 语义：缺的自动补——把草稿直接落位为 ai/skills/<id>/SKILL.md + 注册索引，
// 骨架可先用，AI/人后续按 harness-skill-author 完善正文。
export function createMissingSkills({ rootDir, config = {}, missing }) {
  const created = [];
  for (const item of missing) {
    const dir = resolve(rootDir, 'ai', 'skills', item.id);
    const skillFile = join(dir, 'SKILL.md');
    if (existsSync(skillFile)) { created.push({ id: item.id, created: false, path: `ai/skills/${item.id}/SKILL.md` }); continue; }

    // 权威文件素材：从 authorityGlobs 找真实存在的文件（路径统一正斜杠）
    const authority = [];
    for (const g of item.authorityGlobs || []) {
      try {
        for (const f of globSync(g, { cwd: rootDir, nodir: true, ignore: ['**/node_modules/**', '**/target/**'] }).slice(0, 10)) {
          authority.push(f.replace(/\\/g, '/'));
        }
      } catch { /* 忽略 */ }
    }
    const scoreNote = item.dirsHit ? '（命中架构目录）' : `（关键词/文件命中 ${item.score}）`;
    const engineRoot = dirname(dirname(fileURLToPath(import.meta.url)));
    const projectName = config.name || rootDir.split(/[\\/]/).pop() || 'project';
    const authorityList = authority.length > 0 ? authority.map(a => `- \`${a}\``).join('\n') : '- （AI 填充：关键源码/文档路径）';
    const rendered = resolveSkillBody({ engineRoot, templateId: item.template, item, projectName, note: scoreNote, authorityList });
    const body = rendered ?? `---
name: ${item.id}
description: Use when working on this project's ${item.title} area — <TODO 补全：触发场景/常见表述/操作>. Common phrasings include "<TODO 补全>".
lastReviewedAt: ${new Date().toISOString().slice(0, 10)}
---

# ${item.title}

> ⚠️ 由 \`harness skill audit --generate\` 自动创建。请按 \`ai/skills/harness-skill-author/SKILL.md\` 补全正文
> （核心概念 / 常用操作 / 常见问题与陷阱 / 权威文件），完成后运行 \`npx harness skill check\`。
> 检测依据：${scoreNote}，来源 ${item.source}。

## 核心概念

- （AI 填充：本项目 ${item.title} 领域的概念图与关键实体）

## 常用操作

- （AI 填充：本项目该领域最常见的操作、命令、入口）

## 常见问题与陷阱

- （AI 填充：本项目该领域高频报错、反模式与规避方法）

## 权威文件

${authorityList}
`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(skillFile, body, 'utf-8');
    // 注册索引（AGENTS.md §0.1 + ai/README.md）
    const registered = registerInIndexes(rootDir, item.id);
    created.push({ id: item.id, created: true, path: `ai/skills/${item.id}/SKILL.md`, authority: authority.length, registered });
  }
  return created;
}

// ── 新领域增量检测（v1.3.0：新增功能 → 自动发现 → 补目录 → 建 skill）──
// 领域信号：`xxx-domains/domain-<x>`、`modules/<x>`、`services/<x>` 等新出现的高领域目录。
// 未被 catalog 覆盖且无对应 skill → 判定为「疑似新领域」。

function loadAuditState(rootDir) {
  const p = resolve(rootDir, '.harness-cache', 'skill-audit-state.json');
  try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return { schemaVersion: 1, newDomains: {} }; }
}
function saveAuditState(rootDir, state) {
  const p = resolve(rootDir, '.harness-cache', 'skill-audit-state.json');
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ ...state, lastRunAt: new Date().toISOString() }, null, 2) + '\n', 'utf-8');
}

/** 扫描潜在领域目录（目录名即领域信号） */
export function detectCandidateDomains({ rootDir }) {
  const candidates = [];
  const rootEntries = existsSync(rootDir) ? readdirSync(rootDir, { withFileTypes: true }) : [];
  for (const e of rootEntries) {
    if (!e.isDirectory()) continue;
    // xxx-domains/domain-*（如 hajizone-domains/domain-lottery）
    if (/-domains$/.test(e.name)) {
      let subs = [];
      try { subs = readdirSync(resolve(rootDir, e.name), { withFileTypes: true }); } catch { continue; }
      for (const s of subs) {
        const m = /^domain-([a-z0-9-]+)$/.exec(s.name);
        if (s.isDirectory() && m) candidates.push({ dir: `${e.name}/${s.name}`, slug: m[1], kind: 'domain' });
      }
    }
    // modules/* 或 services/*（单层）
    if (/^(modules|services)$/.test(e.name)) {
      let subs = [];
      try { subs = readdirSync(resolve(rootDir, e.name), { withFileTypes: true }); } catch { continue; }
      for (const s of subs) {
        if (s.isDirectory() && /^[a-z0-9-]+$/.test(s.name)) candidates.push({ dir: `${e.name}/${s.name}`, slug: s.name, kind: 'module' });
      }
    }
  }
  return candidates;
}

/** 疑似新领域 = 候选目录 - (catalog 已覆盖 | 已有 skill | 已创建) */
export function findNewDomains({ rootDir, config = {}, catalog }) {
  const candidates = detectCandidateDomains({ rootDir });
  const existingSkills = (() => {
    const dir = resolve(rootDir, 'ai', 'skills');
    if (!existsSync(dir)) return new Set();
    return new Set(readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name));
  })();
  const coveredIds = new Set();
  const coveredDirs = new Set();
  for (const item of catalog) {
    coveredIds.add(item.id);
    for (const d of item.detect?.dirs || []) coveredDirs.add(d);
  }
  const state = loadAuditState(rootDir);
  state.newDomains = state.newDomains || {};
  const newDomains = [];
  for (const c of candidates) {
    if (coveredIds.has(c.slug) || coveredDirs.has(c.dir) || existingSkills.has(c.slug)) continue;
    const rec = state.newDomains[c.dir];
    if (rec?.createdAt) continue; // 已自动创建过，不再重复报
    newDomains.push({ ...c, firstSeenAt: rec?.firstSeenAt || new Date().toISOString().slice(0, 10), reported: !!rec });
  }
  // 记录本次发现（供后续 delta 判断 / 防重复刷屏）
  for (const n of newDomains) {
    if (!state.newDomains[n.dir]) state.newDomains[n.dir] = { id: n.slug, firstSeenAt: n.firstSeenAt };
  }
  saveAuditState(rootDir, state);
  return newDomains;
}

/** 把新领域沉淀为项目级 catalog 条目（harness/catalog/<slug>.json，可提交可共享） */
export function createProjectCatalogEntry({ rootDir, domain }) {
  const { dir, slug } = domain;
  const file = resolve(rootDir, 'harness', 'catalog', `${slug}.json`);
  if (existsSync(file)) return { slug, created: false, path: `harness/catalog/${slug}.json` };
  const entry = {
    schemaVersion: 1,
    catalog: [{
      id: slug,
      title: `${slug}（${dir}）`,
      detect: { dirs: [dir], keywords: [slug] },
      minScore: 1,
      authorityGlobs: [`${dir}/**`, `docs/**/*${slug}*`],
      template: slug,
      priority: 'nice',
    }],
  };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(entry, null, 2) + '\n', 'utf-8');
  return { slug, created: true, path: `harness/catalog/${slug}.json` };
}

// ── catalog 子命令 ──────────────────────────────────────────
function runCatalogList({ rootDir, config }) {
  const { catalog, sources } = loadCatalog({ rootDir, config });
  console.log('Skill Catalog 来源：');
  for (const s of sources) console.log(`  ${s.kind === 'bundled' ? '① 内置' : s.kind === 'project' ? '② 项目' : '③ 订阅'} ${s.name}（${s.items} 项）`);
  console.log('\n目录项：');
  for (const item of catalog) {
    console.log(`  ${item.priority === 'must' ? '🔴' : item.priority === 'should' ? '🟡' : '🟢'} ${item.id} — ${item.title}（${item.source}）`);
  }
  return catalog;
}

function runCatalogAdd({ rootDir, args }) {
  const target = getArg(args, '--path') || args[2];
  if (!target) {
    console.error('Usage: harness skill catalog add <owner/repo> 或 --path <本地目录或 json 文件>');
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return;
  }
  if (target.includes('/') && !target.endsWith('.json') && !existsSync(target)) {
    console.log(`⏭  GitHub 订阅 ${target} 需网络，v1.3.1 支持。本地原型请用 --path <本地 json>`);
    process.exitCode = EXIT_CODES.OK;
    return;
  }
  // 本地 json 文件 → 复制到 harness/catalog/
  const src = target.endsWith('.json') ? target : resolve(target, 'skill-catalog.json');
  if (!existsSync(src)) {
    console.error(`❌ 未找到目录文件: ${src}`);
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return;
  }
  const destDir = resolve(rootDir, 'harness', 'catalog');
  mkdirSync(destDir, { recursive: true });
  const name = `sub-${Date.now().toString(36)}.json`;
  const dest = join(destDir, name);
  writeFileSync(dest, readFileSync(src, 'utf-8'), 'utf-8');
  console.log(`✅ 已订阅本地目录 → ${relative(rootDir, dest)}`);
}

// ── 主入口 ──────────────────────────────────────────────────
export async function run({ rootDir = process.cwd(), args = [], config = {} } = {}) {
  const sub = args[1];
  if (sub === 'catalog') {
    const act = args[2] || 'list';
    if (act === 'list') return runCatalogList({ rootDir, config });
    if (act === 'add') return runCatalogAdd({ rootDir, args: args.slice(2) });
    console.error('Usage: harness skill catalog list | add <owner/repo|--path <json>>');
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return;
  }
  if (sub !== 'audit') return null; // 交给 skill.mjs 处理 new/check/list

  let result = audit({ rootDir, config });
  const json = hasArg(args, '--json');

  if (json) {
    console.log(JSON.stringify({
      stack: result.fingerprint.stack,
      domains: result.fingerprint.domainHits,
      expected: result.expected.map(e => e.id),
      missing: result.missing.map(m => ({ id: m.id, priority: m.priority })),
      stale: result.stale.map(s => ({ id: s.id, tier: s.tier, detail: s.detail })),
      ok: result.ok.map(o => o.id),
      newDomains: result.newDomains.map(n => ({ dir: n.dir, id: n.slug })),
    }, null, 2));
  } else {
    const { stack, arch } = result.fingerprint;
    console.log('🔍 技术栈指纹:', stack.lang ? `${stack.lang}${stack.framework ? ` + ${stack.framework}` : ''}` : '未知');
    console.log('  架构目录:', Object.keys(arch).filter(k => arch[k]).join(', ') || '无');
    const doms = Object.entries(result.fingerprint.domainHits).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (doms.length > 0) console.log('  领域命中:', doms.map(([k, v]) => `${k}=${v}`).join(' '));

    console.log('\n🟡 应有 Skill（目录匹配）:', result.expected.length ? result.expected.map(e => `${e.id}(${e.priority})`).join(' ') : '无');
    console.log('\n❌ MISSING（缺）：');
    if (result.missing.length === 0) console.log('  （无）');
    for (const m of result.missing) console.log(`  ${m.priority === 'must' ? '🔴' : m.priority === 'should' ? '🟡' : '🟢'} ${m.id} — ${m.title}（${m.source}，命中 ${m.dirsHit ? '目录' : `词/文件 ${m.score}`}）`);
    console.log('\n⚠️ STALE（需升级）：');
    if (result.stale.length === 0) console.log('  （无）');
    for (const s of result.stale) console.log(`  ${s.id}: ${s.detail}`);
    console.log('\n✅ OK（健康）:', result.ok.length ? result.ok.map(o => o.id).join(' ') : '（无匹配）');

    console.log('\n🔍 疑似新领域（目录存在但无 skill/catalog 覆盖，新增功能？）:');
    if (result.newDomains.length === 0) console.log('  （无）');
    for (const n of result.newDomains) {
      console.log(`  🆕 ${n.slug} — ${n.dir}${n.firstSeenAt ? `（首次发现 ${n.firstSeenAt}）` : ''}`);
    }

    const gen = hasArg(args, '--generate');
    if (gen) {
      // ① 新领域 → 沉淀为项目级 catalog 条目
      let createdEntry = 0;
      for (const nd of result.newDomains) {
        const r = createProjectCatalogEntry({ rootDir, domain: nd });
        if (r.created) createdEntry++;
        console.log(`  ${r.created ? '✅' : '⏭'} 新领域目录条目 ${r.path}`);
        const st = loadAuditState(rootDir);
        st.newDomains[nd.dir] = { ...(st.newDomains[nd.dir] || {}), id: nd.slug, createdAt: new Date().toISOString().slice(0, 10) };
        saveAuditState(rootDir, st);
      }
      // ② 重跑 audit（新目录条目并入后，新领域进入 expected/missing）→ 自动创建 skill
      if (result.newDomains.length > 0) result = audit({ rootDir, config });
      if (result.missing.length > 0) {
        const created = createMissingSkills({ rootDir, config, missing: result.missing });
        console.log('\n📝 已自动创建缺失 Skill（ai/skills/）：');
        for (const c of created) {
          console.log(`  ${c.created ? '✅' : '⏭'} ${c.id} → ${c.path}${c.authority !== undefined ? `（权威文件素材 ${c.authority} 个）` : ''}`);
          for (const r of c.registered || []) console.log(`      ${r.done ? '✓' : '○'} ${r.where}`);
        }
        console.log('\n  下一步：AI 按 harness-skill-author 补全正文 → npx harness skill check');
      } else if (createdEntry === 0) {
        console.log('\n📝 无缺失 skill 需创建');
      }
    }
  }

  // --check：must 级缺失硬卡
  if (hasArg(args, '--check')) {
    const mustMissing = result.missing.filter(m => m.priority === 'must');
    if (mustMissing.length > 0) {
      console.error(`\n❌ skill audit --check 失败：${mustMissing.length} 个 must 级 skill 缺失（${mustMissing.map(m => m.id).join(', ')}）`);
      process.exitCode = EXIT_CODES.CHECKS_FAILED;
      return;
    }
  }
  process.exitCode = EXIT_CODES.OK;
}
