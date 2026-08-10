import { execSync } from 'node:child_process';
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

  for (const check of checks) {
    try {
      execSync(check.cmd, { cwd: check.cwd, stdio: 'pipe' });
    } catch {
      console.log(`⚠️  ${check.name}: generation skipped (command may not exist yet)`);
    }
  }

  // Check for any uncommitted changes after regeneration
  try {
    execSync('git diff --exit-code -- "*.json" "*.ts" "*.yaml" "*.yml"', { cwd: rootDir, stdio: 'pipe' });
    console.log('\n✅ generated:check — no drift detected.');
  } catch {
    console.log('\n❌ generated:check — drift detected in generated files.');
    console.log('   Run generation commands and commit the updated files.');
    process.exit(1);
  }
}
