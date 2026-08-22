#!/usr/bin/env node
/**
 * guide.mjs — 引导式体验：`harness do` / `harness next`（HTH-013）
 *
 * 把多命令治理流程压缩为"开始—执行—验证—完成"：
 *  - `harness next` 分析当前任务/Gate 状态，输出稳定 nextAction（phase/blockingReason/commands）
 *  - `harness do "<需求>"` 是 next 的引导入口（无活动任务时提示创建）
 * 机器调用使用 --json，返回 { taskId, gateId, phase, blockingReason, nextAction, commands, humanDecisionRequired }。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { listTasks, repositoryIdentity } from './state-store.mjs';

const TERMINAL = new Set(['completed', 'cancelled', 'abandoned']);

function activeTasks(rootDir, config) {
  const tasks = listTasks(rootDir, config);
  const worktree = repositoryIdentity(rootDir).worktreeId;
  return tasks
    .filter(task => !TERMINAL.has(task.status) && (!task.worktreeId || task.worktreeId === worktree))
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
}

function loadGates(rootDir, config) {
  const dir = resolve(rootDir, config.paths?.gates || 'harness/gates');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .map(file => {
      try { return JSON.parse(readFileSync(join(dir, file), 'utf-8')); } catch { return null; }
    })
    .filter(Boolean);
}

/** 推断当前任务的下一个动作（稳定 JSON） */
export function nextAction({ rootDir, config }) {
  const tasks = activeTasks(rootDir, config);
  if (tasks.length === 0) {
    return {
      taskId: null, gateId: null, phase: 'no-task',
      blockingReason: '没有进行中的任务',
      nextAction: '开始一个新任务',
      commands: ['npx harness do "优化：描述你的需求"'],
      humanDecisionRequired: true,
    };
  }
  const task = tasks[0];
  const gates = loadGates(rootDir, config).filter(gate => gate.taskId === task.id);
  if (gates.length === 0) {
    return {
      taskId: task.id, gateId: null, phase: 'no-gate',
      blockingReason: `任务 ${task.id} 还没有 Gate`,
      nextAction: '打开任务 Gate',
      commands: [`npx harness gate --task "${task.title}" --task-id ${task.id}`],
      humanDecisionRequired: false,
    };
  }
  const gate = gates.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  const prepPending = (gate.checks || []).filter(check => check.phase === 'preparation' && check.status !== 'done');
  if (prepPending.length > 0) {
    return {
      taskId: task.id, gateId: gate.id, phase: 'preparation',
      blockingReason: `Gate ${gate.id} 还有 ${prepPending.length} 个准备检查未完成`,
      nextAction: '完成准备检查',
      commands: prepPending.map(check => `npx harness gate:clear --gate ${gate.id} --clear ${check.id}`),
      humanDecisionRequired: false,
    };
  }
  if (!gate.cleared) {
    return {
      taskId: task.id, gateId: gate.id, phase: 'verification',
      blockingReason: '准备完成，等待客观验证（verify-test）',
      nextAction: '运行受信验证器并关闭验证',
      commands: [
        `npx harness verify unit --task ${task.id}`,
        `npx harness evidence record --task ${task.id} --type review --summary "review done" --approve`,
        `npx harness evidence record --task ${task.id} --type knowledge --summary "knowledge assessed" --approve`,
        `npx harness evidence verify --task ${task.id} --gate ${gate.id}`,
      ],
      humanDecisionRequired: false,
    };
  }
  return {
    taskId: task.id, gateId: gate.id, phase: 'finish',
    blockingReason: 'Gate 已完成',
    nextAction: '完成任务（须在提交/HEAD 移动之前）',
    commands: [`npx harness task finish --task ${task.id}`],
    humanDecisionRequired: false,
  };
}

/** `harness do`：引导入口（无活动任务时提示创建） */
export function doTask({ rootDir, config, description, allow }) {
  const tasks = activeTasks(rootDir, config);
  if (tasks.length === 0) {
    const startCmd = allow
      ? `npx harness task start --title "${description}" --allow "${allow}"`
      : `npx harness task start --title "${description}"`;
    return {
      taskId: null, gateId: null, phase: 'no-task',
      blockingReason: '没有进行中的任务',
      nextAction: '创建任务',
      commands: [startCmd, 'npx harness brain context --task <TASK-ID>', 'npx harness risk check --task <TASK-ID>'],
      humanDecisionRequired: true,
    };
  }
  return nextAction({ rootDir, config });
}

export function runGuide({ rootDir, config, args }) {
  const cmd = args[0];
  const json = args.includes('--json');
  const output = cmd === 'do'
    ? doTask({
        rootDir,
        config,
        description: args.slice(1).join(' ').replace(/^--allow\s+\S+\s*/, '').trim() || '优化：<描述>',
        allow: args.includes('--allow') ? args[args.indexOf('--allow') + 1] : undefined,
      })
    : nextAction({ rootDir, config });
  if (json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`阶段：${output.phase}`);
    console.log(`下一步：${output.nextAction}`);
    console.log(`原因：${output.blockingReason}`);
    for (const command of output.commands) console.log(`  $ ${command}`);
  }
  return output;
}
