// config-loader contract tests — node:test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  DEFAULT_CONFIG, getLayerSearchChecks, getGateChecks, BASE_VERIFY_CHECK,
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
