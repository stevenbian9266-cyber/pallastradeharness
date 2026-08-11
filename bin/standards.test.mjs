import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadStandards, selectStandards, standardsCoverage } from './standards.mjs';
import { STANDARD_CATEGORIES } from './contracts.mjs';

test('bundled registry validates and reports enforcement coverage', () => {
  const registry = loadStandards({ rootDir: process.cwd(), config: { standards: { includeBundled: true, sources: [] } } });
  assert.deepEqual(registry.errors, []);
  assert.ok(registry.standards.length >= 10);
  assert.deepEqual([...new Set(registry.standards.map(item => item.category))].sort(), [...STANDARD_CATEGORIES].sort());
  assert.equal(new Set(registry.standards.map(item => item.id)).size, registry.standards.length);
  const coverage = standardsCoverage(registry.standards);
  assert.equal(coverage.total, registry.standards.length);
  assert.ok(coverage.machineEnforced > 0);
  assert.ok(coverage.documentedOnly > 0);
});

test('registry selects standards by changed file scope', () => {
  const registry = loadStandards({ rootDir: process.cwd(), config: { standards: { includeBundled: true, sources: [] } } });
  const selected = selectStandards(registry.standards, ['app/components/button.tsx']);
  assert.ok(selected.some(item => item.id === 'STD-UI-001'));
  assert.ok(selected.some(item => item.id === 'STD-SCOPE-001'));
  assert.ok(!selected.some(item => item.id === 'STD-DB-001'));
});

test('duplicate IDs within a project registry fail validation', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-standards-'));
  try {
    mkdirSync(join(rootDir, 'harness', 'standards'), { recursive: true });
    const standard = {
      schemaVersion: '1.0', type: 'Standard', id: 'STD-X-001', category: 'testing', title: 'x',
      authority: { file: 'AGENTS.md' }, scope: ['**/*'], severity: 'error', enforcement: { level: 'verified' },
    };
    writeFileSync(join(rootDir, 'harness', 'standards', 'duplicates.json'), JSON.stringify({ standards: [standard, standard] }));
    const registry = loadStandards({ rootDir, config: { standards: { includeBundled: false, sources: ['harness/standards/*.json'] } } });
    assert.ok(registry.errors.some(error => error.includes('duplicate standard id')));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
