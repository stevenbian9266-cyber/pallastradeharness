import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { resolveSmartPath, resolveSmartDir } from './eval-ai.mjs';

function sampleProject() {
  return mkdtempSync(join(tmpdir(), 'harness-evalai-'));
}

test('resolveSmartPath: storefront src shorthand avoids src/src doubling', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'storefront', 'src', 'lib', 'data'), { recursive: true });
    writeFileSync(join(rootDir, 'storefront', 'src', 'lib', 'data', 'posts.ts'), 'export {};\n');
    const found = resolveSmartPath(rootDir, 'src/lib/data/posts.ts');
    assert.equal(found, join(rootDir, 'storefront', 'src', 'lib', 'data', 'posts.ts'));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('resolveSmartPath: backend-relative path resolves to backend/', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'backend', 'config', 'initializers'), { recursive: true });
    writeFileSync(join(rootDir, 'backend', 'config', 'initializers', 'pallastrade.rb'), '# config\n');
    const found = resolveSmartPath(rootDir, 'config/initializers/pallastrade.rb');
    assert.equal(found, join(rootDir, 'backend', 'config', 'initializers', 'pallastrade.rb'));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('resolveSmartPath: old gem path maps to pallastrade_gems/', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'backend', 'pallastrade_gems', 'pallastrade_api', 'app', 'serializers'), { recursive: true });
    writeFileSync(join(rootDir, 'backend', 'pallastrade_gems', 'pallastrade_api', 'app', 'serializers', 'product_serializer.rb'), 'class ProductSerializer; end\n');
    const found = resolveSmartPath(rootDir, 'pallastrade/api/app/serializers/product_serializer.rb');
    assert.equal(found, join(rootDir, 'backend', 'pallastrade_gems', 'pallastrade_api', 'app', 'serializers', 'product_serializer.rb'));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('resolveSmartPath: packages/ maps to platform/packages/', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'platform', 'packages', 'sdk', 'src'), { recursive: true });
    writeFileSync(join(rootDir, 'platform', 'packages', 'sdk', 'src', 'store-client.ts'), 'export {};\n');
    const found = resolveSmartPath(rootDir, 'packages/sdk/src/store-client.ts');
    assert.equal(found, join(rootDir, 'platform', 'packages', 'sdk', 'src', 'store-client.ts'));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('resolveSmartPath: glob ref returns its static root when matched', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'storefront', 'messages'), { recursive: true });
    writeFileSync(join(rootDir, 'storefront', 'messages', 'en.json'), '{}');
    const found = resolveSmartPath(rootDir, 'storefront/messages/*.json');
    assert.equal(found, join(rootDir, 'storefront', 'messages'));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('resolveSmartPath: returns null for a genuinely missing file', () => {
  const rootDir = sampleProject();
  try {
    assert.equal(resolveSmartPath(rootDir, 'src/does/not/exist.ts'), null);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('resolveSmartDir: storefront src dir resolves without doubling', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'storefront', 'src', 'components', 'product'), { recursive: true });
    const found = resolveSmartDir(rootDir, 'src/components/product/');
    assert.equal(found, join(rootDir, 'storefront', 'src', 'components', 'product'));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('resolveSmartDir: artifacts/ runtime dir is a valid resolution target', () => {
  const rootDir = sampleProject();
  try {
    mkdirSync(join(rootDir, 'artifacts', 'harness-evidence'), { recursive: true });
    const found = resolveSmartDir(rootDir, 'artifacts/harness-evidence/');
    assert.equal(found, join(rootDir, 'artifacts', 'harness-evidence'));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
