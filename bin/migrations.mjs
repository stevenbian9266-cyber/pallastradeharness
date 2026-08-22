import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { globSync } from 'glob';
import { EXIT_CODES, hasArg } from './cli-utils.mjs';
import { findConfigPath } from './config-loader.mjs';
import { atomicWriteJson, atomicWriteText, readJson, statePaths } from './state-store.mjs';

export const CONFIG_SCHEMA_VERSION = '1.0';

function configMigrationReport(path, from) {
  if (from !== 'legacy' && from !== CONFIG_SCHEMA_VERSION) {
    return { path, status: 'unsupported-future', from, to: CONFIG_SCHEMA_VERSION, changes: [] };
  }
  const current = from === CONFIG_SCHEMA_VERSION;
  return {
    path,
    status: current ? 'current' : 'needs-migration',
    from,
    to: CONFIG_SCHEMA_VERSION,
    changes: current ? [] : ['add schemaVersion'],
  };
}

export function inspectConfigMigration(path) {
  if (!path || !existsSync(path)) return { path, status: 'missing', from: null, to: CONFIG_SCHEMA_VERSION, changes: ['create a config with schemaVersion 1.0'] };
  const content = readFileSync(path, 'utf-8');
  if (path.endsWith('.json')) {
    const value = JSON.parse(content);
    return configMigrationReport(path, value.schemaVersion || 'legacy');
  }
  const match = content.match(/\bschemaVersion\s*:\s*['"]([^'"]+)['"]/);
  return configMigrationReport(path, match?.[1] || 'legacy');
}

export function migrateConfig({ rootDir, write = false }) {
  const path = findConfigPath(rootDir);
  const report = inspectConfigMigration(path);
  if (!write || report.status !== 'needs-migration') return report;
  const content = readFileSync(path, 'utf-8');
  const backup = `${path}.pre-harness-1.0.bak`;
  if (!existsSync(backup)) atomicWriteText(backup, content);
  if (path.endsWith('.json')) {
    const value = JSON.parse(content);
    atomicWriteJson(path, { schemaVersion: CONFIG_SCHEMA_VERSION, ...value });
  } else {
    const migrated = content.replace(/export\s+default\s*\{/, match => `${match}\n  schemaVersion: '${CONFIG_SCHEMA_VERSION}',`);
    if (migrated === content) throw new TypeError('Cannot safely locate `export default {` in the config; migrate manually');
    atomicWriteText(path, migrated);
  }
  return { ...report, status: 'migrated', backup };
}

export function migrateState({ rootDir, config, write = false }) {
  const state = statePaths(rootDir, config).state;
  if (!existsSync(state)) return { state, scanned: 0, migrated: 0, future: [], backups: [], files: [] };
  const files = globSync('**/*.json', { cwd: state, nodir: true, windowsPathsNoEscape: true });
  const result = { state, scanned: files.length, migrated: 0, future: [], backups: [], files: [] };
  for (const file of files) {
    const path = resolve(state, file);
    const value = readJson(path);
    const version = value.stateSchemaVersion || value.schemaVersion || null;
    if (version && version !== '1.0') {
      result.future.push({ file, version });
      continue;
    }
    if (version === '1.0') continue;
    result.migrated++;
    result.files.push(file);
    if (write) {
      // 幂等：已有备份则不再重复创建
      const backup = `${path}.pre-harness-1.0.bak`;
      if (!existsSync(backup)) {
        atomicWriteText(backup, readFileSync(path, 'utf-8'));
        result.backups.push(relative(rootDir, backup));
      }
      atomicWriteJson(path, { stateSchemaVersion: '1.0', ...value });
    }
  }
  return result;
}

export function runMigrations({ rootDir, config, args, kind }) {
  const write = hasArg(args, '--write');
  const json = hasArg(args, '--json');
  const report = kind === 'config' ? migrateConfig({ rootDir, write }) : migrateState({ rootDir, config, write });
  if (json) console.log(JSON.stringify(report, null, 2));
  else if (kind === 'config') console.log(`${report.status === 'unsupported-future' ? '❌' : report.status === 'current' ? '✅' : '○'} Config migration: ${report.status} (${report.from || 'none'} → ${report.to})${report.backup ? `; backup ${relative(rootDir, report.backup)}` : ''}`);
  else console.log(`${report.future.length ? '❌' : '✅'} State migration: ${report.migrated}/${report.scanned} ${write ? 'migrated' : 'need migration'}, ${report.future.length} future-schema file(s)${report.backups?.length ? `; backups: ${report.backups.join(', ')}` : ''}.`);
  if (report.status === 'unsupported-future' || report.future?.length > 0) process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
}
