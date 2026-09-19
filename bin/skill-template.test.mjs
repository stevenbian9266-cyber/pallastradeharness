#!/usr/bin/env node
/**
 * skill-template.test.mjs — 领域 Skill 内容模板渲染（v1.5.0）单元测试
 * 运行：node --test bin/skill-template.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadSkillTemplate, renderSkillTemplate, resolveFallbackSkillBody, resolveSkillBody } from './skill-template.mjs';

const ENGINE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('loadSkillTemplate 加载内置领域模板（非空）', () => {
  const tpl = loadSkillTemplate(ENGINE_ROOT, 'api');
  assert.ok(tpl, 'api 模板应存在');
  assert.match(tpl, /\{\{SKILL_ID\}\}/, '模板应含占位符');
  assert.ok(tpl.length > 500, `模板应有实质内容（实际 ${tpl.length} 字符）`);
  assert.equal(loadSkillTemplate(ENGINE_ROOT, 'no-such-domain'), null, '不存在的模板返回 null');
});

test('renderSkillTemplate 替换全部占位符', () => {
  const tpl = 'name: {{SKILL_ID}}\nproject: {{PROJECT_NAME}}\ntitle: {{SKILL_TITLE}}\nn: {{DETECT_NOTE}}\nfiles:\n{{AUTHORITY_FILES}}\ndate: {{TODAY}}';
  const out = renderSkillTemplate(tpl, {
    id: 'payment', projectName: 'demo', title: '支付', note: '（命中架构目录）',
    authorityList: '- `docs/pay.md`', today: '2026-08-19',
  });
  assert.doesNotMatch(out, /\{\{/, '不应残留占位符');
  assert.match(out, /name: payment/);
  assert.match(out, /project: demo/);
  assert.match(out, /title: 支付/);
  assert.match(out, /docs\/pay\.md/);
  assert.match(out, /2026-08-19/);
});

test('resolveSkillBody 有模板返回渲染体，无模板返回 null', () => {
  const body = resolveSkillBody({
    engineRoot: ENGINE_ROOT, templateId: 'api',
    item: { id: 'api', title: 'API / 对外接口' },
    projectName: 'demo', note: 'x', authorityList: '- `f.md`',
  });
  assert.ok(body, '应返回渲染体');
  assert.match(body, /契约优先/, '渲染体应含模板实质内容');
  assert.match(body, /f\.md/, '渲染体应注入权威文件');
  assert.doesNotMatch(body, /\{\{/);

  const none = resolveSkillBody({
    engineRoot: ENGINE_ROOT, templateId: 'nope',
    item: { id: 'nope', title: 'N' }, projectName: 'demo', note: 'x', authorityList: '',
  });
  assert.equal(none, null, '无模板应返回 null 由调用方回退');
});

// ── Batch B / B12：共享治理段落 + canonical 回退 ─────────────

const GOVERNANCE_SECTIONS = [
  'Purpose', 'Applies When', 'Do Not Use When', 'Required Context', 'Related Constitution',
  'Reuse Requirements', 'Forbidden Actions', 'Validation', 'Required Tests', 'Required Evidence',
  'Completion Conditions',
];

test('renderSkillTemplate 注入共享治理段落并解析其内部占位符', () => {
  const out = renderSkillTemplate('intro\n{{GOVERNANCE_SECTIONS}}\n## 核心概念', {
    governanceSections: '## Purpose\n- {{SKILL_TITLE}} 的投影',
    title: '支付',
  });
  assert.match(out, /## Purpose/);
  assert.match(out, /支付 的投影/);
  assert.doesNotMatch(out, /\{\{/);
});

test('resolveSkillBody 为领域模板注入治理段落（无残留占位符）', () => {
  const body = resolveSkillBody({
    engineRoot: ENGINE_ROOT, templateId: 'api',
    item: { id: 'api', title: 'API / 对外接口' },
    projectName: 'demo', note: 'x', authorityList: '- `f.md`',
  });
  assert.ok(body, '应返回渲染体');
  assert.match(body, /## 契约优先|契约优先/, '保留领域内容');
  for (const section of GOVERNANCE_SECTIONS) {
    assert.ok(body.includes(`## ${section}`), `缺少治理段落 ## ${section}`);
  }
  assert.doesNotMatch(body, /\{\{/, '不应残留占位符');
});

test('resolveFallbackSkillBody 渲染 canonical 模板（14 段治理结构）', () => {
  const body = resolveFallbackSkillBody({
    engineRoot: ENGINE_ROOT,
    item: { id: 'mystery-domain', title: 'Mystery' },
    projectName: 'demo', note: 'skill new --domain mystery-domain', authorityList: '- `src/x.mjs`',
  });
  assert.ok(body, 'canonical 模板应存在');
  const allSections = [
    ...GOVERNANCE_SECTIONS,
    'Workflow', 'Common Mistakes', 'Authority Files',
  ];
  for (const section of allSections) {
    assert.ok(body.includes(`## ${section}`), `canonical 模板缺少 ## ${section}`);
  }
  assert.match(body, /# demo — Mystery/);
  assert.doesNotMatch(body, /\{\{/);
});
