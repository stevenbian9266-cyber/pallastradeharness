#!/usr/bin/env node
/**
 * skill-template.mjs — 领域 Skill 内容模板加载与渲染（v1.5.0）
 *
 * 背景：v1.5.0 之前 `skill new` / `skill audit --generate` 只产出"空骨架"
 * （frontmatter + 四个占位章节），AI 需手动补全，导致安装后没有触发内容生成。
 * 现在为 skill-catalog.json 的每个元领域提供 `presets/skills/<id>.md` 通用内容模板，
 * 生成器加载模板并注入项目检测信息 → 产出「有实际内容」的 SKILL.md。
 *
 * 占位符（模板内使用）：
 *   {{PROJECT_NAME}}     项目名（config.name 或目录名）
 *   {{SKILL_ID}}         skill 目录 id（kebab-case）
 *   {{SKILL_TITLE}}      领域人类可读标题
 *   {{DETECT_NOTE}}      检测依据（命中架构目录 / 关键词命中）
 *   {{AUTHORITY_FILES}}  从 authorityGlobs 扫描到的真实权威文件列表
 *   {{TODAY}}            当天日期（YYYY-MM-DD）
 *
 * 设计原则：
 *   - 模板是"通用元领域基线"（不绑定具体技术栈），可被项目后续 AI 化细化
 *   - 模板缺失时回退到旧版空骨架（向后兼容）
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** 模板目录：<engineRoot>/presets/skills/<id>.md */
export function skillTemplatePath(engineRoot, templateId) {
  return resolve(engineRoot, 'presets', 'skills', `${templateId}.md`);
}

/** canonical Skill 模板：<engineRoot>/templates/skill/SKILL.md（B12） */
export function canonicalSkillTemplatePath(engineRoot) {
  return resolve(engineRoot, 'templates', 'skill', 'SKILL.md');
}

/** 共享治理段落：<engineRoot>/templates/skill/governance-sections.md（B12） */
export function governanceSectionsPath(engineRoot) {
  return resolve(engineRoot, 'templates', 'skill', 'governance-sections.md');
}

/** 加载共享治理段落；不存在/读取失败返回 ''（不产生残缺占位符）。 */
export function loadGovernanceSections(engineRoot) {
  const p = governanceSectionsPath(engineRoot);
  if (!existsSync(p)) return '';
  try { return readFileSync(p, 'utf-8'); } catch { return ''; }
}

/** 加载 canonical Skill 模板；不存在返回 null。 */
export function loadCanonicalSkillTemplate(engineRoot) {
  const p = canonicalSkillTemplatePath(engineRoot);
  if (!existsSync(p)) return null;
  try { return readFileSync(p, 'utf-8'); } catch { return null; }
}

/** 加载模板；不存在返回 null */
export function loadSkillTemplate(engineRoot, templateId) {
  if (!templateId) return null;
  const p = skillTemplatePath(engineRoot, templateId);
  if (!existsSync(p)) return null;
  try { return readFileSync(p, 'utf-8'); } catch { return null; }
}

/** 渲染模板：替换全部占位符（GOVERNANCE_SECTIONS 先注入，其内部占位符随后被替换） */
export function renderSkillTemplate(template, ctx = {}) {
  const map = {
    '{{GOVERNANCE_SECTIONS}}': ctx.governanceSections ?? '',
    '{{PROJECT_NAME}}': ctx.projectName ?? 'project',
    '{{SKILL_ID}}': ctx.id ?? '',
    '{{SKILL_TITLE}}': ctx.title ?? ctx.id ?? '',
    '{{DETECT_NOTE}}': ctx.note ?? '',
    '{{AUTHORITY_FILES}}': ctx.authorityList ?? '- （AI 填充：关键源码/文档路径）',
    '{{TODAY}}': ctx.today ?? new Date().toISOString().slice(0, 10),
  };
  let out = template;
  for (const [k, v] of Object.entries(map)) out = out.split(k).join(v);
  return out;
}

/**
 * 生成 SKILL.md 正文：
 *  - 有模板 → 渲染模板（有实质内容）
 *  - 无模板 → 返回 null（调用方回退旧骨架）
 */
export function resolveSkillBody({ engineRoot, templateId, item = {}, projectName, note, authorityList }) {
  const tpl = loadSkillTemplate(engineRoot, templateId || item.id);
  if (!tpl) return null;
  return renderSkillTemplate(tpl, {
    projectName,
    id: item.id,
    title: item.title || item.id,
    note,
    authorityList,
    governanceSections: loadGovernanceSections(engineRoot),
    today: new Date().toISOString().slice(0, 10),
  });
}

/**
 * canonical 模板渲染（未知领域回退，B12）：
 *  - 有 templates/skill/SKILL.md → 渲染（含共享治理段落，产出 14 段治理结构）
 *  - 缺失 → null（调用方继续回退内联骨架，保持向后兼容）
 */
export function resolveFallbackSkillBody({ engineRoot, item = {}, projectName, note, authorityList }) {
  const tpl = loadCanonicalSkillTemplate(engineRoot);
  if (!tpl) return null;
  return renderSkillTemplate(tpl, {
    projectName,
    id: item.id,
    title: item.title || item.id,
    note,
    authorityList,
    governanceSections: loadGovernanceSections(engineRoot),
    today: new Date().toISOString().slice(0, 10),
  });
}
