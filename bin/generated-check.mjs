import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { loadConfig } from './config-loader.mjs';

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

  // Check for any uncommitted changes after regeneration
  try {
    execFileSync('git', ['diff', '--exit-code', '--', '*.json', '*.ts', '*.yaml', '*.yml'], { cwd: rootDir, stdio: 'pipe' });
    console.log('\n✅ generated:check — no drift detected.');
    return { ok: true, failures: [], drift: false };
  } catch {
    console.log('\n❌ generated:check — drift detected in generated files.');
    console.log('   Run generation commands and commit the updated files.');
    process.exitCode = 1;
    return { ok: false, failures: [], drift: true };
  }
}
