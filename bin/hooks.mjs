#!/usr/bin/env node
/**
 * hooks.mjs — Agent Hook 支持矩阵与 `hooks doctor`（HTH-009 / F-04）
 *
 * 支持级别：native-blocking（原生可阻断）/ advisory（仅建议）/ unsupported。
 * doctor 验证：入口存在、各 Agent 配置文件是否安装、模拟危险/安全命令的决策正确。
 * 原则：hook 未安装/未生效时不得显示"已保护"。
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXIT_CODES } from './cli-utils.mjs';

export const ADAPTER_HOOK_SUPPORT = Object.freeze({
  claude: { level: 'native-blocking', config: ['.claude/settings.json'] },
  codex: { level: 'advisory', config: ['.codex/hooks.json'] },
  copilot: { level: 'native-blocking', config: ['.github/copilot-hooks.json'] },
});

export const HOOK_ENTRY = 'bin/hook-agent.mjs';

export const HOOK_SIMULATION_SAMPLES = Object.freeze([
  { name: 'danger-db-drop', input: { tool_name: 'run_in_terminal', tool_input: 'rake db:drop' }, expect: 'block' },
  { name: 'danger-force-push', input: { tool_name: 'run_in_terminal', tool_input: 'git push --force origin main' }, expect: 'block' },
  { name: 'danger-secret', input: { tool_name: 'edit_file', tool_input: "write sk_live_AbC123xYz to config" }, expect: 'block' },
  { name: 'safe-list', input: { tool_name: 'run_in_terminal', tool_input: 'git status' }, expect: 'allow' },
  { name: 'safe-test', input: { tool_name: 'run_in_terminal', tool_input: 'node --test' }, expect: 'allow' },
]);

/** 运行引擎自带 hook-agent 对单个输入做决策（子进程，隔离） */
export function simulateDecision(input) {
  const entry = fileURLToPath(new URL('./hook-agent.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [entry], {
    input: JSON.stringify(input),
    encoding: 'utf-8',
  });
  let decision = 'error';
  try { decision = JSON.parse(result.stdout).decision; } catch { /* noop */ }
  return { status: result.status, decision };
}

export function hooksDoctor({ rootDir }) {
  const entryExists = existsSync(resolve(rootDir, HOOK_ENTRY));
  const checks = Object.entries(ADAPTER_HOOK_SUPPORT).map(([agent, spec]) => ({
    agent,
    level: spec.level,
    configs: spec.config.map(path => ({ path, exists: existsSync(resolve(rootDir, path)) })),
  }));
  const simulation = HOOK_SIMULATION_SAMPLES.map(sample => {
    const { decision } = simulateDecision(sample.input);
    return { name: sample.name, expect: sample.expect, got: decision, pass: decision === sample.expect };
  });
  return { entryExists, checks, simulation };
}

export function runHooks({ rootDir, args }) {
  const sub = args[1] || 'doctor';
  if (sub === 'doctor') {
    const report = hooksDoctor({ rootDir });
    console.log(`${report.entryExists ? '✅' : '❌'} hook entry: ${HOOK_ENTRY}`);
    for (const check of report.checks) {
      const anyConfig = check.configs.some(c => c.exists);
      const configText = check.configs.map(c => `${c.path}${c.exists ? ' ✓' : ''}`).join(', ');
      console.log(`  ${anyConfig ? '✅' : '○'} ${check.agent.padEnd(8)} ${check.level.padEnd(18)} ${configText}`);
    }
    console.log('\nSimulation (hook decision):');
    let passCount = 0;
    for (const sim of report.simulation) {
      console.log(`  ${sim.pass ? '✅' : '❌'} ${sim.name.padEnd(20)} expect ${sim.expect} → got ${sim.got}`);
      if (sim.pass) passCount += 1;
    }
    const allPass = passCount === report.simulation.length && report.entryExists;
    console.log(`\n${allPass ? '✅' : '❌'} hooks doctor — ${passCount}/${report.simulation.length} simulation checks passed.`);
    console.log('   Note: “已保护”仅在各 Agent 配置文件真实安装 hook 且入口可达时成立；未安装时本地 Agent 层未保护，Git/CI 层仍可用。');
    process.exit(allPass ? 0 : EXIT_CODES.POLICY_FAILURE);
  }
  if (sub === 'test') {
    // hooks test '<json>' — 单次模拟判定
    const raw = args.slice(2).join(' ');
    try {
      const input = JSON.parse(raw);
      const { decision } = simulateDecision(input);
      console.log(JSON.stringify({ decision }));
      process.exit(decision === 'block' ? 1 : 0);
    } catch (error) {
      console.error(`❌ hooks test — invalid JSON input: ${error.message}`);
      process.exit(EXIT_CODES.USAGE_OR_CONFIG);
    }
  }
  console.error('Usage: harness hooks doctor|test "<json-input>"');
  process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
}
