#!/usr/bin/env node
/**
 * skill.mjs — Auto-Skills（能力 B）
 *
 *   harness skill new --domain <x> [--title "..."]  创建领域 Skill 骨架 + 自动注册索引
 *   harness skill check [--files ...] [--freshness] 结构 + 索引一致性 + 可选新鲜度校验
 *   harness skill list [--json]                     领域清单 + 注册状态
 *
 * 注册闭环：生成 ai/skills/<domain>/SKILL.md → 自动在 AGENTS.md §0.1 与
 * ai/README.md 索引插入条目 → AI 填充正文 → harness skill check 校验 → 人确认。
 * 引擎只做骨架与索引，正文由 AI 按 harness-skill-author skill 生成。
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { EXIT_CODES, getArg, hasArg, parseFilesArg } from './cli-utils.mjs';
import { atomicWriteText } from './state-store.mjs';
import { skillRefsExist, gateSkillRefs } from './scan.mjs';

const SKILL_FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const NAME_RE = /^name:\s*([^\r\n]+)$/m;
const DESC_RE = /^description:\s*([^\r\n]+)$/m;

function skillsDir(rootDir) {
  return resolve(rootDir, 'ai', 'skills');
}

function listSkills(rootDir) {
  const dir = skillsDir(rootDir);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = resolve(dir, entry.name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;
    const content = readFileSync(skillFile, 'utf-8');
    const name = content.match(NAME_RE)?.[1]?.trim() || entry.name;
    const description = content.match(DESC_RE)?.[1]?.trim() || '';
    out.push({ dir: entry.name, name, description, path: `ai/skills/${entry.name}/SKILL.md`, file: skillFile });
  }
  return out.sort((a, b) => a.dir.localeCompare(b.dir));
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ── createSkill（可复用数据函数，供 CLI/MCP）──────────────
export function createSkill({ rootDir, config = {}, domain, title }) {
  const domainSlug = slugify(domain || '');
  if (!domainSlug) throw new TypeError('domain must be a non-empty value');
  const titleText = title || domainSlug;
  const projectName = config.name || rootDir.split(/[\\/]/).pop() || 'project';
  const dir = resolve(skillsDir(rootDir), domainSlug);
  const skillFile = resolve(dir, 'SKILL.md');

  if (existsSync(skillFile)) {
    return { domain: domainSlug, path: `ai/skills/${domainSlug}/SKILL.md`, created: false, registered: [] };
  }

  mkdirSync(dir, { recursive: true });
  const content = `---
name: ${domainSlug}
description: Use when the user is working with ${projectName}'s ${titleText} area — <TODO 补全：触发场景/常见表述/操作>. Common phrasings include "<TODO 补全>". Provides the ${titleText} domain knowledge and operations; defers to authoritative files listed below.
---

# ${projectName} ${titleText}

> ⚠️ AI 起草指引：按 \`ai/skills/harness-skill-author/SKILL.md\` 补全本文档正文
> （核心概念 / 常用操作 / 常见问题与陷阱 / 权威文件），完成后运行 \`npx harness skill check\` 校验，
> 经人确认后移除本注释块。

## 核心概念

- （AI 填充：领域概念图与关键实体关系）

## 常用操作

- （AI 填充：本领域最常见的操作与命令）

## 常见问题与陷阱

- （AI 填充：本领域高频报错、反模式与规避方法）

## 权威文件

- （AI 填充：关键源码/文档路径，作为 field-level 细节的权威来源）
`;
  writeFileSync(skillFile, content, 'utf-8');

  // 自动注册索引
  const registered = registerInIndexes(rootDir, domainSlug);
  return { domain: domainSlug, path: `ai/skills/${domainSlug}/SKILL.md`, created: true, registered };
}

// ── skill new ──────────────────────────────────────────────
export async function runNew({ rootDir, args, config }) {
  const domain = slugify(getArg(args, '--domain') || args[2] || '');
  if (!domain) {
    console.error('Usage: harness skill new --domain <domain> [--title "描述"]');
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return;
  }
  const title = getArg(args, '--title');
  const result = createSkill({ rootDir, config, domain, title });
  if (!result.created) {
    console.log(`⏭  Skill 已存在: ${result.path}`);
    process.exitCode = EXIT_CODES.OK;
    return;
  }
  console.log(`✅ 已创建: ${result.path}`);
  for (const r of result.registered) console.log(`   ${r.done ? '✓' : '○'} ${r.where}`);
  console.log('\n  下一步: AI 按 harness-skill-author skill 补全正文 → npx harness skill check');
  process.exitCode = EXIT_CODES.OK;
}

// ── 索引注册：AGENTS.md §0.1 表格 + ai/README.md ──────────
export function registerInIndexes(rootDir, domain) {
  const results = [];
  const agentsPath = resolve(rootDir, 'AGENTS.md');
  if (existsSync(agentsPath)) {
    let agents = readFileSync(agentsPath, 'utf-8');
    if (!agents.includes(`ai/skills/${domain}/SKILL.md`)) {
      // 在 §0.1 表格（第一个 "| `" 开始的表行前）之后插入一行
      const line = `| \`ai/skills/${domain}/SKILL.md\` | Skill | 领域知识权威 | 涉及 ${domain} 代码 | AI 维护 |`;
      // 找到表格头分隔行（|---|），在其后第一行数据前插入
      const sepIndex = agents.indexOf('|---|---|');
      if (sepIndex >= 0) {
        const insertAt = agents.indexOf('\n', sepIndex) + 1;
        agents = agents.slice(0, insertAt) + line + '\n' + agents.slice(insertAt);
      } else {
        agents = agents.replace(/\s*$/, '') + '\n\n### 0.1 规范文件总表（追加）\n\n' + line + '\n';
      }
      writeFileSync(agentsPath, agents, 'utf-8');
      results.push({ where: 'AGENTS.md §0.1', done: true });
    } else {
      results.push({ where: 'AGENTS.md §0.1', done: false, skip: 'already listed' });
    }
  } else {
    results.push({ where: 'AGENTS.md（不存在，跳过）', done: false });
  }

  const readmePath = resolve(rootDir, 'ai', 'README.md');
  if (existsSync(readmePath)) {
    let readme = readFileSync(readmePath, 'utf-8');
    if (!readme.includes(`${domain}`)) {
      readme = readme.replace(/\s*$/, '') + `\n- \`${domain}\` — ${domain} 领域（自动注册 ${new Date().toISOString().slice(0, 10)}）\n`;
      writeFileSync(readmePath, readme, 'utf-8');
      results.push({ where: 'ai/README.md', done: true });
    } else {
      results.push({ where: 'ai/README.md', done: false, skip: 'already listed' });
    }
  } else {
    // 无 ai/README.md 则创建（含索引头）
    mkdirSync(resolve(rootDir, 'ai'), { recursive: true });
    const readme = `# AI Skills 索引\n\n> 由 harness skill new 自动维护。\n\n- \`${domain}\` — ${domain} 领域（自动注册 ${new Date().toISOString().slice(0, 10)}）\n`;
    writeFileSync(readmePath, readme, 'utf-8');
    results.push({ where: 'ai/README.md（新建）', done: true });
  }
  return results;
}

// ── skill check ───────────────────────────────────────────
export async function runCheck({ rootDir, args, config }) {
  const files = parseFilesArg(args) || [];
  const freshness = hasArg(args, '--freshness');
  const all = listSkills(rootDir);
  const targets = files.length > 0 ? all.filter(s => files.some(f => s.path.includes(f) || f.includes(s.dir))) : all;
  const errors = [];
  const warnings = [];

  for (const skill of targets) {
    const content = readFileSync(skill.file, 'utf-8');
    const fm = content.match(SKILL_FRONTMATTER_RE);
    if (!fm) { errors.push(`${skill.path}: 缺少 frontmatter (--- name/description ---)`); continue; }
    if (!content.match(NAME_RE)) errors.push(`${skill.path}: frontmatter 缺 name`);
    if (!content.match(DESC_RE)) errors.push(`${skill.path}: frontmatter 缺 description`);
    if (skill.name !== skill.dir) errors.push(`${skill.path}: frontmatter name(${skill.name}) 与目录名(${skill.dir})不一致`);

    // --freshness：正文反引号引用的权威路径必须真实存在
    if (freshness) {
      const fr = skillRefsExist(rootDir, resolve(rootDir, 'ai', 'skills', skill.dir));
      if (!fr.ok) {
        for (const ref of fr.missing.slice(0, 8)) {
          errors.push(`${skill.path}: 权威路径不存在 — \`${ref}\``);
        }
      }
    }
  }

  // 幽灵引用检测：gate 引用了 read-skill-* 但对应 skill 缺失
  if (config) {
    for (const ref of gateSkillRefs(config)) {
      if (ref === '<domain>') {
        const anyDomain = existsSync(resolve(rootDir, 'ai', 'skills')) && readdirSync(resolve(rootDir, 'ai', 'skills'), { withFileTypes: true }).some(e => e.isDirectory() && existsSync(join(resolve(rootDir, 'ai', 'skills'), e.name, 'SKILL.md')));
        if (!anyDomain) warnings.push(`gate 引用 read-skill-domain 但 ai/skills/ 下无任何领域 Skill（检查将空转）`);
        continue;
      }
      const skillName = ref.replace(/\.md$/, '');
      if (!existsSync(join(rootDir, 'ai', 'skills', skillName, 'SKILL.md'))) {
        warnings.push(`gate 引用 \`${ref}\` 但 ai/skills/${skillName}/SKILL.md 缺失（幽灵引用）— 运行 npx harness skill new --domain ${skillName}`);
      }
    }
  }

  for (const w of warnings) console.log(`⚠️  ${w}`);
  if (errors.length > 0) {
    for (const e of errors) console.error(`❌ ${e}`);
    process.exitCode = EXIT_CODES.POLICY_FAILURE;
  } else {
    console.log(`✅ skill check — ${targets.length} 个 Skill 结构合规${freshness ? ' + 新鲜度' : ''}${warnings.length ? `（${warnings.length} 个幽灵引用警告）` : ''}`);
  }
}

// ── skill list ────────────────────────────────────────────
export async function runList({ rootDir, args }) {
  const json = getArg(args, '--format') === 'json';
  const all = listSkills(rootDir);
  if (json) {
    console.log(JSON.stringify(all.map(s => ({ dir: s.dir, name: s.name, description: s.description, path: s.path })), null, 2));
    return;
  }
  console.log(`📚 领域 Skills（${all.length}）\n`);
  for (const s of all) {
    console.log(`  ${s.dir.padEnd(32)} ${s.description ? s.description.slice(0, 60) : '（无描述）'}`);
  }
}

export async function run({ rootDir = process.cwd(), args = [], config = {} } = {}) {
  const sub = args[1] || 'list';
  // v1.3.0：skill audit / skill catalog — Skill 自动治理（通用）
  if (sub === 'audit' || sub === 'catalog') {
    const auditModule = await import('./skill-audit.mjs');
    const handled = await auditModule.run({ rootDir, args, config });
    if (handled !== null) return;
  }
  if (sub === 'new') return runNew({ rootDir, args, config });
  if (sub === 'check') return runCheck({ rootDir, args, config });
  if (sub === 'list') return runList({ rootDir, args });
  console.error(`Unknown skill subcommand: ${sub}`);
  console.error('Usage: harness skill new --domain <x> | check | list | audit [--json|--generate|--check] | catalog list|add');
  process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
}
