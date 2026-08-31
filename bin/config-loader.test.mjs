// config-loader contract tests — node:test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  DEFAULT_CONFIG, getLayerSearchChecks, getGateChecks, BASE_VERIFY_CHECK, designStageActive,
  findConfigPath, validateConfig, loadConfig,
} from './config-loader.mjs';

function makeTmpProject(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'harness-cfg-'));
  for (const [rel, content] of Object.entries(files)) {
    const p = resolve(dir, rel);
    mkdirSync(resolve(p, '..'), { recursive: true });
    writeFileSync(p, content);
  }
  return dir;
}

test('DEFAULT_CONFIG has required top-level sections', () => {
  for (const key of ['layers', 'gates', 'docImpact', 'coverage', 'scanners', 'scenarios', 'profiles', 'doctor', 'paths']) {
    assert.ok(key in DEFAULT_CONFIG, `missing ${key}`);
  }
  assert.ok(Array.isArray(DEFAULT_CONFIG.layers));
  assert.ok(DEFAULT_CONFIG.docImpact.rules.length === 0, 'default docImpact rules must be empty (universal)');
});

test('getLayerSearchChecks generates one check per layer', () => {
  const layers = [{ id: 'api', path: 'backend/app' }, { id: 'web', path: 'storefront/src' }];
  const checks = getLayerSearchChecks(layers);
  assert.equal(checks.length, 2);
  assert.equal(checks[0].id, 'search-api');
  assert.equal(checks[0].label, 'Cross-layer: Search backend/app/');
  assert.equal(checks[1].id, 'search-web');
});

test('getGateChecks = search + base + extra + verify', () => {
  const config = {
    layers: [{ id: 'api', path: 'backend/app' }],
    gates: { checkDefs: { feature: [{ id: 'create-prd-doc', label: 'PRD' }, { id: 'user-confirmed', label: 'Confirm' }] } },
  };
  const checks = getGateChecks(config, 'feature');
  const ids = checks.map(c => c.id);
  assert.deepEqual(ids[0], 'search-api');
  assert.ok(ids.includes('read-skill-customization'));
  assert.ok(ids.includes('read-skill-domain'));
  assert.ok(ids.includes('create-prd-doc'));
  assert.ok(ids.includes('user-confirmed'));
  assert.deepEqual(ids[ids.length - 1], 'verify-test');
  assert.ok(checks.every(c => c.label && c.id));
});

test('getGateChecks falls back to feature set for unknown task type', () => {
  const checks = getGateChecks(DEFAULT_CONFIG, 'unknown-type');
  assert.ok(checks.some(c => c.id === 'read-skill-customization'));
  assert.deepEqual(checks[checks.length - 1], BASE_VERIFY_CHECK);
});

test('v1.4.0: feature 默认内置 PRD 工作流 check（所有项目触发）', () => {
  // 空项目配置（未声明任何 checkDefs）→ feature gate 也应强制 PRD 流程
  const checks = getGateChecks(DEFAULT_CONFIG, 'feature');
  const ids = checks.map(c => c.id);
  for (const prdCheck of ['read-skill-prd', 'create-prd-doc', 'create-req-doc', 'req-doc-has-skill-table', 'user-confirmed']) {
    assert.ok(ids.includes(prdCheck), `feature 应默认含 ${prdCheck}`);
  }
  // 非 feature 类型不受影响（bugfix 不强制 PRD）
  const bugfixIds = getGateChecks(DEFAULT_CONFIG, 'bugfix').map(c => c.id);
  assert.ok(!bugfixIds.includes('create-prd-doc'), 'bugfix 不应强制 PRD');
});

test('v1.4.0: getGateChecks 按 id 去重（项目重复配置不重复出现）', () => {
  const config = {
    layers: [{ id: 'app', path: 'src' }],
    gates: {
      checkDefs: {
        feature: [
          { id: 'create-prd-doc', label: 'PRD（项目重复）' },
          { id: 'create-req-doc', label: 'REQ（项目重复）' },
          { id: 'project-only-check', label: '仅项目有' },
        ],
      },
    },
  };
  const checks = getGateChecks(config, 'feature');
  const ids = checks.map(c => c.id);
  assert.equal(ids.filter(id => id === 'create-prd-doc').length, 1, 'create-prd-doc 不应重复');
  assert.equal(ids.filter(id => id === 'create-req-doc').length, 1, 'create-req-doc 不应重复');
  assert.ok(ids.includes('project-only-check'), '项目独有 check 应保留');
});

test('findConfigPath returns null when no config exists', () => {
  const dir = makeTmpProject({});
  assert.equal(findConfigPath(dir), null);
  rmSync(dir, { recursive: true, force: true });
});

test('findConfigPath finds harness.config.mjs walking up', () => {
  const dir = makeTmpProject({ 'harness.config.mjs': 'export default { name: "x" };' });
  const nested = join(dir, 'a', 'b');
  mkdirSync(nested, { recursive: true });
  const found = findConfigPath(nested);
  assert.ok(found.endsWith('harness.config.mjs'));
  rmSync(dir, { recursive: true, force: true });
});

test('findConfigPath finds legacy harness/config.json', () => {
  const dir = makeTmpProject({ 'harness/config.json': '{"profiles":{}}' });
  const found = findConfigPath(dir);
  assert.ok(found.replaceAll('\\', '/').endsWith('harness/config.json'));
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig uses defaults when no config file', async () => {
  const dir = makeTmpProject({});
  const { config, sourcePath, usedDefaults } = await loadConfig({ rootDir: dir });
  assert.equal(sourcePath, null);
  assert.ok(usedDefaults.length > 0);
  assert.equal(config.name, 'project');
  assert.equal(config.layers[0].id, 'app');
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig merges mjs config over defaults (arrays override)', async () => {
  const dir = makeTmpProject({
    'harness.config.mjs': `export default {
      name: 'toy',
      layers: [{ id: 'api', path: 'backend/app' }, { id: 'web', path: 'storefront/src' }],
      docImpact: { rules: [{ codeGlob: 'x', docs: ['y'], label: 'z' }] },
    };`,
  });
  const { config, sourcePath } = await loadConfig({ rootDir: dir });
  assert.ok(sourcePath.endsWith('harness.config.mjs'));
  assert.equal(config.name, 'toy');
  assert.equal(config.layers.length, 2);
  assert.equal(config.layers[1].id, 'web');
  assert.equal(config.docImpact.rules.length, 1);
  // paths defaults preserved (deep merge)
  assert.equal(config.paths.gates, 'harness/gates');
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig merges legacy config.json profiles', async () => {
  const dir = makeTmpProject({
    'harness/config.json': '{"profiles":{"quick":{"checks":["lint"]}}}',
  });
  const { config } = await loadConfig({ rootDir: dir });
  assert.equal(config.profiles.quick.checks[0], 'lint');
  rmSync(dir, { recursive: true, force: true });
});

test('validateConfig rejects empty layers', () => {
  const errors = validateConfig({ ...DEFAULT_CONFIG, layers: [] });
  assert.ok(errors.some(e => e.includes('layers')));
});

test('validateConfig accepts a valid config', () => {
  assert.equal(validateConfig(DEFAULT_CONFIG).length, 0);
});

// ── token 优化（AC-005/AC-007/AC-006）──
test('AC-005: gates.disableChecks 移除内置 check 且 verify-test 不可禁用', () => {
  const config = {
    ...structuredClone(DEFAULT_CONFIG),
    gates: { disableChecks: { feature: ['read-skill-prd', 'create-prd-doc'] } },
  };
  const checks = getGateChecks(config, 'feature');
  const ids = checks.map(c => c.id);
  assert.ok(!ids.includes('read-skill-prd'), 'read-skill-prd 应被禁用');
  assert.ok(!ids.includes('create-prd-doc'), 'create-prd-doc 应被禁用');
  assert.ok(ids.includes('verify-test'), 'verify-test 证据门不可禁用');
  // 未配置的任务类型不受影响
  const bugfix = getGateChecks(config, 'bugfix');
  assert.ok(bugfix.some(c => c.id === 'read-skill-domain'));
  // 默认 disableChecks 为空 → 约束零变化
  const defaults = getGateChecks(DEFAULT_CONFIG, 'feature');
  assert.ok(defaults.some(c => c.id === 'read-skill-prd'));
  // 设计检查项同样可禁用
  const designOff = getGateChecks({
    ...structuredClone(DEFAULT_CONFIG),
    gates: { disableChecks: { feature: ['create-tech-design'] } },
  }, 'feature');
  assert.ok(!designOff.some(c => c.id === 'create-tech-design'));
});

test('AC-007: output 配置段默认值 = 现状（gateListVerbose true / limit 20 / requireSkillRead true）', () => {
  assert.equal(DEFAULT_CONFIG.output.gateListVerbose, true);
  assert.equal(DEFAULT_CONFIG.output.taskListDefaultLimit, 20);
  assert.equal(DEFAULT_CONFIG.output.requireSkillRead, true);
  assert.deepEqual(Object.keys(DEFAULT_CONFIG.gates.disableChecks), []);
});

test('AC-006: designStage auto 模式按 uiKeywords 决定是否插入设计检查', () => {
  // enabled='auto' + 命中 UI 关键词 → 含设计检查
  const uiConfig = { ...structuredClone(DEFAULT_CONFIG), designStage: { enabled: 'auto', uiKeywords: ['ui', '页面', '组件'] } };
  const uiChecks = getGateChecks(uiConfig, 'feature', '新增：用户登录页面');
  assert.ok(uiChecks.some(c => c.id === 'create-ui-doc'), '命中「页面」应含设计检查');
  assert.ok(uiChecks.some(c => c.id === 'reuse-adherence-gate'), '命中时应含 reuse-adherence-gate');
  // enabled='auto' + 未命中（后端任务）→ 不含设计检查
  const backendChecks = getGateChecks(uiConfig, 'feature', '优化：引擎 token 输出精简');
  assert.ok(!backendChecks.some(c => c.id === 'create-ui-doc'), '未命中 UI 关键词不应含设计检查');
  assert.ok(!backendChecks.some(c => c.id === 'reuse-adherence-gate'));
  // enabled='true' 始终插入（默认，约束不变）
  const always = getGateChecks(DEFAULT_CONFIG, 'feature', '优化：纯后端任务');
  assert.ok(always.some(c => c.id === 'create-ui-doc'));
  // 无 taskDesc 时 auto 视同不命中（保守）
  assert.ok(!getGateChecks(uiConfig, 'feature').some(c => c.id === 'create-ui-doc'));
});

test('designStageActive 布尔/auto/false 语义', () => {
  assert.equal(designStageActive(DEFAULT_CONFIG, '任意'), true);
  assert.equal(designStageActive({ designStage: { enabled: false } }, '任意'), false);
  assert.equal(designStageActive({ designStage: { enabled: 'auto', uiKeywords: ['ui'] } }, '构建 UI 组件'), true);
  assert.equal(designStageActive({ designStage: { enabled: 'auto', uiKeywords: ['ui'] } }, 'build'), false); // 'ui' 词边界不命中 build
  assert.equal(designStageActive({ designStage: { enabled: 'auto', uiKeywords: ['storefront'] } }, '优化 storefront 页面'), true);
});

test('loadConfig memoizes within same process (per rootDir)', async () => {
  const dir = makeTmpProject({ 'harness.config.mjs': 'export default { name: "memo-a" };' });
  const first = await loadConfig({ rootDir: dir });
  const second = await loadConfig({ rootDir: dir });
  assert.equal(first, second, 'same rootDir returns memoized result');
  // Different rootDir → fresh load (memo is per-root)
  const dir2 = makeTmpProject({ 'harness.config.mjs': 'export default { name: "memo-b" };' });
  const other = await loadConfig({ rootDir: dir2 });
  assert.notEqual(other, first);
  assert.equal(other.config.name, 'memo-b');
  rmSync(dir, { recursive: true, force: true });
  rmSync(dir2, { recursive: true, force: true });
});
