/**
 * baseline.mjs — 存量项目质量基线 / no_regression（设计文档 §13.4 / §14.5）
 *
 * 存量项目接入时已有失败不要求立刻清零：先 `baseline:create` 记录"当前已知失败"，
 * 之后 `baseline:check` 只阻断"新增失败"，历史失败仅记录——不让质量变差。
 *
 * 测试失败解析基于 `node --test --test-reporter=tap`（Node 24 无内置 json reporter）。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getArg, hasArg } from './cli-utils.mjs';
import { statePaths, repositoryIdentity } from './state-store.mjs';

export const DEFAULT_BASELINE_TEST = ['node', '--test', '--test-reporter=tap', '**/*.test.mjs'];

/** 从 TAP 输出解析失败测试（name + location 文件） */
export function parseTapFailures(tapOutput) {
  const failures = [];
  const lines = String(tapOutput || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!/^not ok \d+ - /.test(trimmed)) continue;
    const name = trimmed.replace(/^not ok \d+ - /, '').trim();
    let file = null;
    for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
      const m = lines[j].trim().match(/^location: '(.+)'/);
      if (m) { file = m[1]; break; }
    }
    failures.push({ name, file });
  }
  return failures;
}

function failureKey(f) {
  return `${f.name}@${f.file || ''}`;
}

export function baselinePath(rootDir, config) {
  const dir = join(statePaths(rootDir, config).state, 'baseline');
  mkdirSync(dir, { recursive: true });
  return join(dir, 'baseline.json');
}

export function runTestCommand(rootDir, command) {
  const cmd = command || DEFAULT_BASELINE_TEST;
  // 父进程若是 node --test 运行器，会设置 NODE_TEST_CONTEXT=child-v8；
  // 子进程继承后 node 会把自己当作测试子进程，抑制所有 stdout（输出为空、退出码 0）。
  // 运行真实测试命令时必须清除，否则解析不到 TAP 输出。
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  try {
    const stdout = execFileSync(cmd[0], cmd.slice(1), { cwd: rootDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], env });
    return { exitCode: 0, stdout: stdout || '' };
  } catch (e) {
    return { exitCode: e.status ?? 1, stdout: `${e.stdout || ''}\n${e.stderr || ''}` };
  }
}

/** 创建基线：运行测试 → 记录失败集合 + 仓库指纹 */
export function createBaseline({ rootDir, config }) {
  const cmd = config?.qualityBaseline?.testCommand || DEFAULT_BASELINE_TEST;
  const { exitCode, stdout } = runTestCommand(rootDir, cmd);
  const failures = parseTapFailures(stdout);
  const identity = repositoryIdentity(rootDir);
  const baseline = {
    id: `baseline-${new Date().toISOString().slice(0, 10)}`,
    created: new Date().toISOString(),
    repository: identity.repository,
    worktreeId: identity.worktreeId,
    head: identity.head,
    exitCode,
    failureCount: failures.length,
    failures,
  };
  writeFileSync(baselinePath(rootDir, config), `${JSON.stringify(baseline, null, 2)}\n`);
  return baseline;
}

/** 校验基线：区分 新增失败（阻断）/ 历史失败（记录）/ 已修复（改善） */
export function checkBaseline({ rootDir, config }) {
  const path = baselinePath(rootDir, config);
  if (!existsSync(path)) {
    return { status: 'no_baseline', reason: 'run baseline:create first', newFailures: [], existingFailures: [], resolved: [] };
  }
  const baseline = JSON.parse(readFileSync(path, 'utf-8'));
  const cmd = config?.qualityBaseline?.testCommand || DEFAULT_BASELINE_TEST;
  const { exitCode, stdout } = runTestCommand(rootDir, cmd);
  const current = parseTapFailures(stdout);
  const baselineKeys = new Set((baseline.failures || []).map(failureKey));
  const currentKeys = new Set(current.map(failureKey));
  const newFailures = current.filter(f => !baselineKeys.has(failureKey(f)));
  const existingFailures = current.filter(f => baselineKeys.has(failureKey(f)));
  const resolved = (baseline.failures || []).filter(f => !currentKeys.has(failureKey(f)));
  if (newFailures.length > 0) return { status: 'new_failures', exitCode, newFailures, existingFailures, resolved };
  if (existingFailures.length > 0) return { status: 'existing_failures', exitCode, newFailures, existingFailures, resolved };
  return { status: 'passed', exitCode, newFailures: [], existingFailures: [], resolved };
}

// ── CLI ──────────────────────────────────────────────────────────
export function runBaseline({ rootDir, args, config }) {
  const subcommand = args[0] || 'status';
  const json = hasArg(args, '--json') || getArg(args, '--format') === 'json';

  if (subcommand === 'create') {
    const baseline = createBaseline({ rootDir, config });
    if (json) console.log(JSON.stringify(baseline, null, 2));
    else console.log(`✅ 质量基线已创建: ${baseline.failureCount} 个已知失败（${baseline.head.slice(0, 8)}）\n   之后 baseline:check 只阻断\"新增失败\"，历史失败仅记录（§14.5 no_regression）`);
    return;
  }

  if (subcommand === 'check') {
    const result = checkBaseline({ rootDir, config });
    if (result.status === 'no_baseline') {
      if (json) console.log(JSON.stringify(result, null, 2));
      else console.log('🟡 no_baseline — 先运行 `harness baseline:create` 建立存量基线（历史失败不会被计为新增）');
      return;
    }
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`🔵 新增失败 ${result.newFailures.length} / 历史失败 ${result.existingFailures.length} / 已修复 ${result.resolved.length}`);
      for (const f of result.newFailures) console.log(`   ❌ NEW ${f.name} (${f.file})`);
      for (const f of result.resolved) console.log(`   ✅ FIXED ${f.name}`);
      if (result.status === 'new_failures') {
        console.log('❌ no_regression 门禁：本次变更引入了新失败（§14.5）');
        process.exit(1);
      } else if (result.status === 'passed') {
        console.log('✅ 无失败（基线已全绿或新增 = 0）');
      } else {
        console.log('ℹ️  存在历史失败（记录不阻断，no_regression 语义）');
      }
    }
    return;
  }

  if (subcommand === 'status') {
    const path = baselinePath(rootDir, config);
    if (!existsSync(path)) {
      if (json) console.log(JSON.stringify({ exists: false }, null, 2));
      else console.log('○ 尚无质量基线——运行 `harness baseline:create`');
      return;
    }
    const baseline = JSON.parse(readFileSync(path, 'utf-8'));
    if (json) console.log(JSON.stringify(baseline, null, 2));
    else console.log(`质量基线: ${baseline.id}（${baseline.head.slice(0, 8)}）· 已知失败 ${baseline.failureCount}`);
    return;
  }

  console.error('Usage: harness baseline:create|check|status [--json]');
  console.error('  create   建立存量基线（记录当前已知失败）');
  console.error('  check    对比基线，新增失败 exit 1，历史失败记录');
  console.error('  status   查看基线');
  process.exitCode = 2;
}
