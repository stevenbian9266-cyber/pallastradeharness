import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from './config-loader.mjs';

const GENERATED_PATHS = ['*.json', '*.ts', '*.yaml', '*.yml'];

function workspaceSnapshot(rootDir) {
  try {
    const diff = execFileSync('git', ['diff', 'HEAD', '--binary', '--', ...GENERATED_PATHS], { cwd: rootDir, encoding: 'utf-8' });
    const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', ...GENERATED_PATHS], { cwd: rootDir, encoding: 'utf-8' })
      .split(/\r?\n/).filter(Boolean).sort();
    const hash = createHash('sha256').update(diff);
    for (const file of untracked) hash.update(file).update('\0').update(readFileSync(resolve(rootDir, file)));
    return { ok: true, hash: hash.digest('hex') };
  } catch (error) {
    return { ok: false, error: error.stderr?.toString().trim() || error.message };
  }
}

export function check({ rootDir, config }) {
  console.log('Checking generated files for drift...\n');

  // 生成命令由 harness.config.mjs → generatedCheck.checks 驱动（默认空 = 跳过）
  const checks = (config?.generatedCheck?.checks || []).map(c => ({
    name: c.name,
    cwd: resolve(rootDir, c.cwd || '.'),
    cmd: c.cmd,
  }));
  if (checks.length === 0) {
    console.log('⚠️  generated:check — no generation commands configured (harness.config.mjs → generatedCheck).');
  }

  const before = workspaceSnapshot(rootDir);
  const failures = [];
  for (const item of checks) {
    if (!item.name || !item.cmd) {
      failures.push(`${item.name || 'unnamed check'}: name and cmd are required`);
      continue;
    }
    const result = spawnSync(item.cmd, { cwd: item.cwd, shell: true, encoding: 'utf-8', stdio: 'pipe' });
    if (result.error || result.status !== 0) {
      const detail = result.error?.message || result.stderr?.trim() || `exit ${result.status}`;
      failures.push(`${item.name}: ${detail}`);
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`❌ generated:check — ${failure}`);
    process.exitCode = 1;
    return { ok: false, failures, drift: false };
  }

  if (!before.ok) {
    const failure = `git baseline: ${before.error}`;
    console.error(`❌ generated:check — ${failure}`);
    process.exitCode = 1;
    return { ok: false, failures: [failure], drift: false };
  }

  const after = workspaceSnapshot(rootDir);
  if (!after.ok) {
    const failure = `git verification: ${after.error}`;
    console.error(`❌ generated:check — ${failure}`);
    process.exitCode = 1;
    return { ok: false, failures: [failure], drift: false };
  }
  if (before.hash === after.hash) {
    console.log('\n✅ generated:check — no drift detected.');
    return { ok: true, failures: [], drift: false };
  }
  console.log('\n❌ generated:check — generator changed tracked or untracked generated files.');
  console.log('   Run generation commands and commit the updated files.');
  process.exitCode = 1;
  return { ok: false, failures: [], drift: true };
}
