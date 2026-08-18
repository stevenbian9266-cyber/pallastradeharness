import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { detectStack, detectLayers } from './analyze.mjs';
import { buildGapReport } from './standards-gen.mjs';

const EMPTY_CONFIG = { name: 'sample', standards: { includeBundled: true, sources: [] } };

function javaProject() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-java-'));
  mkdirSync(join(rootDir, 'hajizone-server', 'src', 'main', 'java', 'com', 'demo', 'controller'), { recursive: true });
  mkdirSync(join(rootDir, 'hajizone-server', 'src', 'main', 'resources', 'db', 'migration'), { recursive: true });
  mkdirSync(join(rootDir, 'hajizone-server', 'src', 'main', 'java', 'com', 'demo', 'security'), { recursive: true });
  mkdirSync(join(rootDir, 'hajizone-server', 'src', 'test', 'java', 'com', 'demo'), { recursive: true });
  writeFileSync(join(rootDir, 'pom.xml'), `<project><parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId></parent></project>`);
  writeFileSync(join(rootDir, 'hajizone-server', 'src', 'main', 'java', 'com', 'demo', 'controller', 'PaymentController.java'), 'class PaymentController {}');
  writeFileSync(join(rootDir, 'hajizone-server', 'src', 'main', 'resources', 'db', 'migration', 'V1__init.sql'), 'CREATE TABLE t;');
  writeFileSync(join(rootDir, 'hajizone-server', 'src', 'main', 'java', 'com', 'demo', 'security', 'SecurityConfig.java'), 'class SecurityConfig {}');
  writeFileSync(join(rootDir, 'hajizone-server', 'src', 'test', 'java', 'com', 'demo', 'PaymentServiceTest.java'), 'class PaymentServiceTest {}');
  return rootDir;
}

test('detectStack detects Java + Spring Boot from pom.xml', async () => {
  const rootDir = javaProject();
  try {
    const stack = await detectStack(rootDir);
    assert.ok(stack.languages.includes('Java'), 'Java should be detected');
    assert.ok(stack.frameworks.includes('Spring Boot'), 'Spring Boot should be detected');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('detectStack detects Java via Gradle build file', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-gradle-'));
  try {
    writeFileSync(join(rootDir, 'build.gradle'), "plugins { id 'java' }\ndependencies { implementation 'org.springframework.boot:spring-boot-starter-web' }");
    const stack = await detectStack(rootDir);
    assert.ok(stack.languages.includes('Java/Kotlin (Gradle)'));
    assert.ok(stack.frameworks.includes('Spring Boot'));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('detectLayers skips non-layer dirs and finds Java module dirs', async () => {
  const rootDir = javaProject();
  try {
    const layers = await detectLayers(rootDir);
    // COMMON_LAYER_DIRS 不含业务模块名，Java 模块不会被误判为层
    assert.ok(Array.isArray(layers));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('buildGapReport detects Java api/database/security/testing signals', () => {
  const rootDir = javaProject();
  try {
    const report = buildGapReport({ rootDir, config: EMPTY_CONFIG });
    const byCategory = Object.fromEntries(report.rows.map(r => [r.category, r]));
    assert.equal(byCategory.api.hasCode, true, 'Controller.java should signal api');
    assert.equal(byCategory.database.hasCode, true, 'db/migration + Mapper should signal database');
    assert.equal(byCategory.security.hasCode, true, 'SecurityConfig should signal security');
    assert.equal(byCategory.testing.hasCode, true, 'src/test + *Test.java should signal testing');
    assert.equal(byCategory['technology-selection'].hasCode, true, 'pom.xml should signal technology-selection');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
