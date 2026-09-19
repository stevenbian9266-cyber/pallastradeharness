/**
 * constitution-compliance.test.mjs — Architecture / Tech Stack 合规（Batch C / C13 / AC-009）
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  collectArchitectureViolations, collectTechStackViolations, loadMachineArtifacts,
} from './constitution-compliance.mjs';
import { upsertArtifact } from './project-artifacts.mjs';

const CONFIG = { paths: { state: '.harness-state' }, constitution: { dir: 'harness/constitution' } };

test('AC-009: architecture dependency deny 违规 → blocking（无规则/无制品 → 空）', () => {
  const architecture = {
    dependency_rules: [
      { id: 'ARCH-001', from: 'cli', rule: 'deny direct persistence', deny: ['node:sqlite', 'better-sqlite3'], reason: 'persistence must go through repository ports' },
      { id: 'ARCH-002', from: 'transport', rule: 'no direct SQL', deny: [] },
    ],
  };
  const lines = [
    { file: 'bin/handler.mjs', line: 3, text: "import { x } from 'node:sqlite';" },
    { file: 'bin/other.mjs', line: 7, text: "const y = require('better-sqlite3');" },
    { file: 'bin/clean.mjs', line: 1, text: "import { z } from './repo.mjs';" },
  ];
  const violations = collectArchitectureViolations({ architecture, lines });
  assert.equal(violations.length, 2);
  assert.ok(violations.every(item => item.blocking === true && item.standardId === 'STD-ARCH-001'));
  assert.ok(violations[0].message.includes('ARCH-001'));
  assert.deepEqual(collectArchitectureViolations({ architecture: null, lines }), []);
  assert.deepEqual(collectArchitectureViolations({ architecture: { dependency_rules: [] }, lines }), []);
});

test('AC-009: restricted / deprecated 技术使用 → blocking', () => {
  const techStack = {
    restrictions: [{ technology: 'lodash', reason: 'supply-chain policy', instead: 'native utils' }],
    deprecated_technologies: [{ technology: 'moment', migration_target: 'Intl API' }],
  };
  const lines = [
    { file: 'bin/a.mjs', line: 2, text: "import _ from 'lodash';" },
    { file: 'bin/b.mjs', line: 9, text: "import moment from 'moment';" },
    { file: 'bin/c.mjs', line: 1, text: "import { ok } from './ok.mjs';" },
  ];
  const violations = collectTechStackViolations({ techStack, lines });
  assert.equal(violations.length, 2);
  assert.ok(violations.every(item => item.standardId === 'STD-TECH-001' && item.blocking === true));
  assert.ok(violations[0].recommendation.includes('native utils'));
  assert.deepEqual(collectTechStackViolations({ techStack: null, lines }), []);
});

test('AC-009: 未登记依赖 → warning（blocking=false）；已登记 → 无 finding', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-compliance-'));
  try {
    writeFileSync(join(rootDir, 'package.json'), JSON.stringify({ name: 'x', dependencies: { glob: '^13.0.0', lodash: '^4.0.0' } }));
    const techStack = { current_technologies: [{ category: 'library', technology: 'glob' }], approved_libraries: [], restrictions: [], deprecated_technologies: [] };
    const violations = collectTechStackViolations({ techStack, files: ['package.json'], lines: [], rootDir });
    assert.equal(violations.length, 1);
    assert.equal(violations[0].blocking, false);
    assert.ok(violations[0].message.includes('lodash'));
    const declared = collectTechStackViolations({
      techStack: { ...techStack, approved_libraries: [{ library: 'lodash', purpose: 'legacy' }] },
      files: ['package.json'], lines: [], rootDir,
    });
    assert.deepEqual(declared, []);
    assert.deepEqual(collectTechStackViolations({ techStack, files: ['bin/x.mjs'], lines: [], rootDir }), [], 'package.json 未变更 → 不评估依赖登记');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('AC-009: loadMachineArtifacts 按 x.md ↔ x.json 约定读取机读制品', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-compliance-load-'));
  try {
    mkdirSync(join(rootDir, 'harness/constitution'), { recursive: true });
    writeFileSync(join(rootDir, 'harness/constitution/architecture.md'), '# Architecture\n');
    writeFileSync(join(rootDir, 'harness/constitution/architecture.json'), JSON.stringify({ contract: 'Architecture', dependency_rules: [], rules: [] }));
    upsertArtifact({ rootDir, config: CONFIG, id: 'architecture', type: 'constitution', path: 'harness/constitution/architecture.md' });
    const loaded = loadMachineArtifacts({ rootDir, config: CONFIG });
    assert.equal(loaded.architecture.contract, 'Architecture');
    assert.equal(loaded.techStack, null, '未注册的 tech_stack → null');
    assert.deepEqual(loadMachineArtifacts({ rootDir: tmpdir(), config: CONFIG }).architecture, null);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
