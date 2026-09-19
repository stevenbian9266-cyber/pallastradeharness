/**
 * template-registry.test.mjs — Template Registry 契约测试（Batch B：B01-B11）
 *
 * 覆盖 PRD AC-001 ~ AC-006：
 *   稳定 ID/Version、精确/最新取用、条件检索、失败模式、现有模板注册、Constitution 模板与机读契约。
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  findTemplates,
  getLatestTemplate,
  getTemplate,
  listTemplates,
  loadTemplateRegistry,
  TEMPLATE_CATEGORIES,
  TEMPLATE_OWNER_ROLES,
  validateTemplateRegistry,
} from './template-registry.mjs';

const ENGINE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REGISTRY = loadTemplateRegistry();

function definition(overrides = {}) {
  return {
    template_id: 'sample', version: '1.0.0', category: 'task', scope: 'runtime',
    source_path: 'package.json', applies_to: ['feature'], required_when: 'when testing',
    owner_role: 'tech_lead', consumed_by: ['tests'], stale_when: ['change'], status: 'active',
    ...overrides,
  };
}

test('AC-001: listTemplates 返回稳定 ID/版本，按 id 升序且隔离事实源', () => {
  const templates = listTemplates();
  assert.ok(templates.length >= 27, `expected >= 27 templates, got ${templates.length}`);
  for (const def of templates) {
    assert.match(def.template_id, /^[a-z][a-z0-9-]*$/);
    assert.match(def.version, /^\d+\.\d+\.\d+$/);
    assert.ok(TEMPLATE_CATEGORIES.includes(def.category), `bad category: ${def.category}`);
    assert.ok(TEMPLATE_OWNER_ROLES.includes(def.owner_role), `bad owner_role: ${def.owner_role}`);
  }
  const ids = templates.map(def => def.template_id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a.localeCompare(b)), 'should be sorted by id');
  templates[0].status = 'mutated';
  assert.notEqual(listTemplates()[0].status, 'mutated', 'fact source must be isolated');
});

test('AC-001: getTemplate 精确取用 / 省略版本取最新 / 未知返回 null', () => {
  const exact = getTemplate('task-tech-design', '1.0.0');
  assert.equal(exact.template_id, 'task-tech-design');
  assert.equal(exact.owner_role, 'tech_lead');
  assert.equal(getTemplate('task-tech-design', '9.9.9'), null);
  assert.equal(getTemplate('no-such-template'), null);
  assert.equal(getTemplate('task-prd').version, getLatestTemplate('task-prd').version);
});

test('AC-002: getLatestTemplate 取最高版本（多版本注入）', () => {
  const definitions = [
    definition({ template_id: 'sample', version: '1.0.0' }),
    definition({ template_id: 'sample', version: '1.2.0' }),
    definition({ template_id: 'sample', version: '1.1.0' }),
  ];
  assert.equal(getLatestTemplate('sample', { definitions }).version, '1.2.0');
  assert.equal(getTemplate('sample', '1.1.0', { definitions }).version, '1.1.0');
  assert.equal(getLatestTemplate('unknown-id', { definitions }), null);
});

test('AC-002: findTemplates 支持标量与数组条件检索', () => {
  const design = findTemplates({ category: 'design' });
  assert.ok(design.length >= 3);
  assert.ok(design.every(def => def.category === 'design'));

  const byRole = findTemplates({ owner_role: 'knowledge_owner' });
  assert.ok(byRole.length >= 12, `expected >= 12 skill templates, got ${byRole.length}`);

  const byApplies = findTemplates({ applies_to: ['feature'] });
  assert.ok(byApplies.length >= 5);
  assert.ok(byApplies.every(def => def.applies_to.includes('feature')));

  assert.deepEqual(findTemplates({ category: 'no-such-category' }), []);
});

test('AC-004: 真实注册表自检通过且 source_path 全部存在', () => {
  const result = validateTemplateRegistry();
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.equal(result.count, REGISTRY.length);
  for (const def of REGISTRY) {
    assert.ok(existsSync(join(ENGINE_ROOT, def.source_path)), `missing source: ${def.source_path}`);
    if (def.contract_path) {
      assert.ok(existsSync(join(ENGINE_ROOT, def.contract_path)), `missing contract: ${def.contract_path}`);
    }
  }
});

test('AC-004: 现有核心模板全部注册', () => {
  const expected = [
    'task-prd', 'task-tech-design', 'task-interaction-design', 'task-ui-design', 'task-visual-design',
    'skill-template',
    'skill-domain-api', 'skill-domain-data-model', 'skill-domain-payment', 'skill-domain-security',
    'skill-domain-deployment', 'skill-domain-testing', 'skill-domain-frontend-style', 'skill-domain-i18n',
    'skill-domain-events', 'skill-domain-observability', 'skill-domain-performance',
    'ops-ai-hooks', 'ops-lefthook',
    'project-overview', 'tech-stack', 'architecture', 'adr', 'engineering-standard',
    'testing-standard', 'acceptance-standard', 'agent-rules',
  ];
  for (const id of expected) {
    const def = getTemplate(id);
    assert.ok(def, `template not registered: ${id}`);
    assert.equal(def.status, 'active');
    assert.ok(def.consumed_by.length > 0 && def.stale_when.length > 0, `${id}: lifecycle metadata required`);
  }
  assert.equal(expected.length, REGISTRY.length);
});

test('AC-003: 重复 (template_id, version) 必须失败', () => {
  const definitions = [definition({ template_id: 'dup', version: '1.0.0' }), definition({ template_id: 'dup', version: '1.0.0' })];
  const result = validateTemplateRegistry({ definitions });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('duplicate template id+version')));
});

test('AC-003: 缺失字段 / 非法枚举 / 非法 ID / 非法版本 / 缺失路径均报错', () => {
  const result = validateTemplateRegistry({
    definitions: [
      definition({ template_id: 'Bad_ID', version: '1.0', category: 'nope', scope: 'galaxy', status: 'whatever', owner_role: 'nobody' }),
      definition({ template_id: 'missing-path', source_path: 'templates/does-not-exist.md' }),
      definition({ template_id: 'missing-fields', version: '2.0.0', applies_to: [], consumed_by: [], stale_when: [], required_when: '' }),
    ],
  });
  assert.equal(result.ok, false);
  const joined = result.errors.join('\n');
  assert.match(joined, /template_id must be stable kebab-case/);
  assert.match(joined, /version must be semver x\.y\.z/);
  assert.match(joined, /category must be one of/);
  assert.match(joined, /scope must be one of/);
  assert.match(joined, /status must be one of/);
  assert.match(joined, /owner_role must be one of/);
  assert.match(joined, /source_path does not exist/);
  assert.match(joined, /applies_to must be a non-empty array/);
  assert.match(joined, /required_when must be a non-empty string/);
});

const CONSTITUTION_SECTIONS = {
  'project-overview': [
    'Project Identity', 'Business Purpose', 'Target Users', 'Core Capabilities', 'Current Scope',
    'Out of Scope', 'Critical Business Flows', 'Key Terminology', 'Business Constraints', 'Related Constitution',
  ],
  'tech-stack': [
    'Runtime', 'Language', 'Package Manager', 'Frontend', 'Backend', 'Database', 'ORM', 'Cache', 'Queue',
    'Search', 'Object Storage', 'Testing', 'Browser / E2E', 'Build', 'Lint / Format', 'Deployment',
    'Observability', 'Approved Libraries', 'Restricted Technologies', 'Deprecated Technologies',
    'Version Policy', 'Related Decisions',
  ],
  architecture: [
    'Architecture Summary', 'System Context', 'Architecture Style', 'Modules', 'Module Responsibilities',
    'Layers', 'Dependency Direction', 'Data Ownership', 'API Boundaries', 'Shared Infrastructure',
    'Core Data Flows', 'Auth Boundary', 'External Integration Boundary', 'Error Handling',
    'Transaction Boundary', 'Performance Constraints', 'Security Constraints', 'Forbidden Patterns',
    'Known Architecture Debt', 'Related ADR',
  ],
  adr: [
    'Status', 'Context', 'Problem', 'Decision', 'Alternatives', 'Consequences', 'Risks', 'Migration',
    'Rollback', 'Constitution Impact', 'Skills Impact', 'Related Task', 'Approval',
  ],
  'engineering-standard': [
    'Directory Rules', 'Naming', 'Module Organization', 'Reuse First', 'Do Not Duplicate', 'Error Handling',
    'Validation', 'Logging', 'Configuration', 'Dependency Policy', 'Type Safety', 'Refactoring Policy',
    'Performance', 'Security Baseline', 'Forbidden Patterns', 'Definition of Done',
  ],
  'testing-standard': [
    'Testing Philosophy', 'Static', 'Unit', 'Integration', 'API', 'Database', 'Migration', 'E2E', 'Browser',
    'Visual', 'Accessibility', 'Performance', 'Security', 'Test Selection Rules', 'Bug Regression Rule',
    'Mock Policy', 'Fixture Policy', 'Test Data', 'Flaky Test Policy', 'Coverage Expectations', 'Evidence Requirements',
  ],
  'acceptance-standard': [
    'General Definition of Done', 'Requirement Acceptance', 'Architecture Acceptance', 'Tech Stack Acceptance',
    'UI Acceptance', 'Testing Acceptance', 'Evidence Acceptance', 'Knowledge Acceptance',
    'Severity Blocking Policy', 'Waiver Policy',
  ],
  'agent-rules': [
    'Task Entry', 'Context Requirement', 'Constitution Requirement', 'Tech Stack Rule', 'Architecture Rule',
    'Reuse Rule', 'UI Rule', 'Implementation Gate', 'Review Rule', 'Test Rule', 'Evidence Rule',
    'Knowledge Rule', 'Finish Rule',
  ],
};

test('AC-005: 8 个 Constitution 模板可读取且必需章节齐全', () => {
  for (const [templateId, sections] of Object.entries(CONSTITUTION_SECTIONS)) {
    const def = getTemplate(templateId);
    assert.ok(def, `missing template: ${templateId}`);
    const content = readFileSync(join(ENGINE_ROOT, def.source_path), 'utf-8');
    for (const section of sections) {
      assert.ok(content.includes(`## ${section}`), `${templateId}: missing section "## ${section}"`);
    }
  }
  const agentRules = readFileSync(join(ENGINE_ROOT, getTemplate('agent-rules').source_path), 'utf-8');
  assert.ok(agentRules.includes('Developer 不拥有最终验收权'));
  assert.ok(agentRules.includes('禁止静默修改 Constitution'));
});

test('AC-006: 机读契约 JSON 可解析且含必需键', () => {
  const techStack = JSON.parse(readFileSync(join(ENGINE_ROOT, getTemplate('tech-stack').contract_path), 'utf-8'));
  assert.equal(techStack.contract, 'TechStack');
  assert.deepEqual(techStack.required, ['schema_version', 'current_technologies', 'restrictions', 'change_policy']);
  assert.ok(techStack.fields.current_technologies.item.category_enum.length >= 15);
  assert.equal(techStack.fields.change_policy.fields.normal_dependency.const, 'DEPENDENCY_CHANGE');
  assert.equal(techStack.fields.change_policy.fields.structural_change.const, 'TECH_STACK_CHANGE');

  const architecture = JSON.parse(readFileSync(join(ENGINE_ROOT, getTemplate('architecture').contract_path), 'utf-8'));
  assert.equal(architecture.contract, 'Architecture');
  for (const key of ['modules', 'dependency_rules', 'rules']) {
    assert.ok(architecture.fields[key], `missing field contract: ${key}`);
  }
  assert.deepEqual(Object.keys(architecture.severity), ['info', 'warning', 'blocking']);
  assert.ok(architecture.fields.rules.item.severity_enum.includes('blocking'));
});

test('AC-004: templates/registry.json 是唯一数据源且无重复', () => {
  const seen = new Set();
  for (const def of REGISTRY) {
    const key = `${def.template_id}@${def.version}`;
    assert.equal(seen.has(key), false, `duplicate in registry data: ${key}`);
    seen.add(key);
  }
  assert.equal(REGISTRY.length, listTemplates().length);
});
