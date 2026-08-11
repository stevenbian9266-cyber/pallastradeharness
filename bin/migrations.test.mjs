import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { inspectConfigMigration, migrateConfig, migrateState } from './migrations.mjs';

test('config migration is dry-run by default, backed up, and idempotent', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-migrate-config-'));
  try {
    const path = join(rootDir, 'harness.config.mjs');
    writeFileSync(path, "export default { name: 'sample', layers: [{ id: 'src', path: 'src' }] };\n");
    assert.equal(migrateConfig({ rootDir }).status, 'needs-migration');
    assert.doesNotMatch(readFileSync(path, 'utf-8'), /schemaVersion/);
    const migrated = migrateConfig({ rootDir, write: true });
    assert.equal(migrated.status, 'migrated');
    assert.match(readFileSync(path, 'utf-8'), /schemaVersion: '1\.0'/);
    assert.ok(existsSync(`${path}.pre-harness-1.0.bak`));
    assert.equal(migrateConfig({ rootDir }).status, 'current');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('future config and state schemas are rejected without downgrade', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-migrate-state-'));
  try {
    const configPath = join(rootDir, 'harness.config.json');
    writeFileSync(configPath, JSON.stringify({ schemaVersion: '2.0' }));
    assert.equal(inspectConfigMigration(configPath).status, 'unsupported-future');
    const state = join(rootDir, '.harness-state', 'tasks');
    mkdirSync(state, { recursive: true });
    writeFileSync(join(state, 'legacy.json'), JSON.stringify({ type: 'Task', id: 'TASK-1' }));
    writeFileSync(join(state, 'future.json'), JSON.stringify({ stateSchemaVersion: '2.0', type: 'Task', id: 'TASK-2' }));
    writeFileSync(join(state, 'current-contract.json'), JSON.stringify({ schemaVersion: '1.0', type: 'ContextPack', id: 'CTX-1' }));
    const report = migrateState({ rootDir, config: DEFAULT_CONFIG, write: true });
    assert.equal(report.migrated, 1);
    assert.equal(report.future.length, 1);
    assert.equal(report.scanned, 3);
    assert.equal(JSON.parse(readFileSync(join(state, 'legacy.json'), 'utf-8')).stateSchemaVersion, '1.0');
    assert.equal(JSON.parse(readFileSync(join(state, 'future.json'), 'utf-8')).stateSchemaVersion, '2.0');
    assert.equal(JSON.parse(readFileSync(join(state, 'current-contract.json'), 'utf-8')).stateSchemaVersion, undefined);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
