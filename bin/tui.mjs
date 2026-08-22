import { spawnSync } from 'node:child_process';
import { createInterface, emitKeypressEvents } from 'node:readline';
import { getArg, hasArg } from './cli-utils.mjs';
import { listEvidence } from './evidence.mjs';
import { listTasks } from './state-store.mjs';

function nextAction(task, evidenceCount) {
  if (['paused', 'blocked'].includes(task.status)) return `resume ${task.id}`;
  if (task.status === 'planned') return `brain context --task ${task.id}`;
  if (task.status === 'implementing') return `supervise diff --task ${task.id}`;
  if (task.status === 'reviewing') return `evidence run --task ${task.id}`;
  if (task.status === 'verifying') return `evidence verify --task ${task.id}`;
  if (task.status === 'completed') return `evidence bundle --task ${task.id}`;
  return evidenceCount === 0 ? `evidence run --task ${task.id}` : `task status --task ${task.id}`;
}

export function buildDashboard({ rootDir, config }) {
  const tasks = listTasks(rootDir, config).map(task => {
    const evidence = listEvidence(rootDir, config, task.id);
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      risk: task.riskLevel,
      evidence: evidence.length,
      blockers: (task.blockers || []).length,
      nextAction: nextAction(task, evidence.length),
      updatedAt: task.updatedAt || task.createdAt,
    };
  });
  return {
    schemaVersion: '1.0', type: 'HarnessDashboard', generatedAt: new Date().toISOString(),
    summary: { tasks: tasks.length, active: tasks.filter(task => !['completed', 'cancelled', 'superseded'].includes(task.status)).length, critical: tasks.filter(task => task.risk === 'critical').length },
    tasks,
  };
}

function render(dashboard, color = false) {
  const bold = value => color ? `\u001b[1m${value}\u001b[0m` : value;
  const lines = [bold(`Harness · ${dashboard.summary.active} active / ${dashboard.summary.tasks} total / ${dashboard.summary.critical} critical`)];
  if (dashboard.tasks.length === 0) lines.push('No tasks. Next: harness task start --title "..."');
  for (const task of dashboard.tasks) {
    lines.push(`${task.risk === 'critical' ? '!' : task.risk === 'standard' ? '~' : '·'} ${task.id}  ${task.status.padEnd(12)} evidence:${String(task.evidence).padEnd(2)} ${task.title}`);
    lines.push(`    next: harness ${task.nextAction}`);
  }
  return lines.join('\n');
}

// ================================================================
// HTH-016：任务详情视图（纯函数，可测）
// ================================================================
export function buildTaskDetail(task, evidence) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    risk: task.riskLevel || 'standard',
    evidenceCount: (evidence || []).length,
    evidence: (evidence || []).map(ev => ({ id: ev.id, type: ev.evidenceType, capturedAt: ev.capturedAt })),
    goals: task.goals || [],
    acceptanceCriteria: task.acceptanceCriteria || [],
    blockers: task.blockers || [],
    nextAction: nextAction(task, (evidence || []).length),
  };
}

export function renderDetail(detail, color = false) {
  const bold = value => color ? `\u001b[1m${value}\u001b[0m` : value;
  const lines = [
    bold(`Task ${detail.id}`),
    `  title:    ${detail.title}`,
    `  status:   ${detail.status}`,
    `  risk:     ${detail.risk}`,
    `  evidence: ${detail.evidenceCount}`,
  ];
  if (detail.goals.length > 0) { lines.push('  goals:'); for (const goal of detail.goals) lines.push(`    - ${goal}`); }
  if (detail.acceptanceCriteria.length > 0) { lines.push('  acceptance criteria:'); for (const criterion of detail.acceptanceCriteria) lines.push(`    - ${criterion}`); }
  if (detail.blockers.length > 0) { lines.push('  blockers:'); for (const blocker of detail.blockers) lines.push(`    - ${blocker}`); }
  if (detail.evidence.length > 0) { lines.push('  evidence:'); for (const record of detail.evidence) lines.push(`    - ${record.type} ${record.id} @ ${record.capturedAt}`); }
  lines.push(`  next:      harness ${detail.nextAction}`);
  lines.push(bold('  [Enter] run next action · [b] back · [r] refresh · [q] quit'));
  return lines.join('\n');
}

// ================================================================
// HTH-016：交互状态机（纯函数，可测）— 所有动作均有 CLI/JSON 等价物
// ================================================================
export function interactiveReduce(state, key, taskCount) {
  const next = { ...state, runAction: false, refresh: false, exit: false };
  if (key === 'q' || key === 'escape') { next.exit = true; return next; }
  if (state.mode === 'list') {
    if (key === 'up') next.cursor = Math.max(0, state.cursor - 1);
    else if (key === 'down') next.cursor = Math.min(Math.max(taskCount - 1, 0), state.cursor + 1);
    else if (key === 'return' || key === 'd') { next.mode = 'detail'; next.detailTaskId = state.cursor; }
    else if (key === 'r') next.refresh = true;
  } else {
    if (key === 'b' || key === 'left') { next.mode = 'list'; next.detailTaskId = null; }
    else if (key === 'return') next.runAction = true;
    else if (key === 'r') next.refresh = true;
  }
  return next;
}

function runInteractive({ rootDir, config }) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  process.stdin.setRawMode(true);
  process.stdin.resume();
  emitKeypressEvents(process.stdin, rl);
  let state = { mode: 'list', cursor: 0, detailTaskId: null, exit: false, runAction: false, refresh: false };
  let paused = false;
  const allTasks = () => listTasks(rootDir, config)
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
  const draw = () => {
    process.stdout.write('\u001b[2J\u001b[H');
    const all = allTasks();
    if (state.mode === 'list') {
      const lines = all.map((task, index) => {
        const marker = index === state.cursor ? '>' : ' ';
        const evidence = listEvidence(rootDir, config, task.id).length;
        return `${marker} ${task.id}  ${String(task.status).padEnd(12)} evidence:${String(evidence).padEnd(2)} ${task.title}`;
      });
      if (all.length === 0) lines.push('No tasks. Next: harness task start --title "..."');
      console.log(lines.join('\n'));
      console.log('\u001b[2m↑/↓ navigate · Enter detail · r refresh · q quit\u001b[0m');
    } else {
      const task = all[state.detailTaskId];
      if (!task) { state.mode = 'list'; state.detailTaskId = null; return draw(); }
      console.log(renderDetail(buildTaskDetail(task, listEvidence(rootDir, config, task.id)), true));
    }
  };
  const resume = () => {
    paused = false;
    state = { mode: 'list', cursor: Math.max(0, state.detailTaskId ?? 0), detailTaskId: null, exit: false, runAction: false, refresh: false };
    draw();
  };
  const cleanup = () => {
    try { process.stdin.setRawMode(false); } catch { /* stdin may be closed */ }
    process.stdin.pause();
    rl.close();
  };
  const keypress = (str, key) => {
    if (paused) return;
    const name = key?.name || String(str || '').toLowerCase();
    if (key?.ctrl && name === 'c') { cleanup(); process.exit(0); }
    const all = allTasks();
    const next = interactiveReduce(state, name, all.length);
    if (next.exit) { cleanup(); process.exit(0); }
    if (next.runAction) {
      const task = all[state.detailTaskId];
      if (task) {
        const detail = buildTaskDetail(task, listEvidence(rootDir, config, task.id));
        process.stdout.write('\u001b[2J\u001b[H');
        console.log(`Running: npx harness ${detail.nextAction}\n`);
        const result = spawnSync('npx', ['harness', ...detail.nextAction.split(' ')], { stdio: 'inherit', shell: process.platform === 'win32' });
        console.log(`\n[exited ${result.status}] — press any key to return`);
        paused = true;
        process.stdin.once('keypress', () => resume());
      }
      return;
    }
    state = next;
    if (next.refresh) draw();
  };
  process.stdin.on('keypress', keypress);
  draw();
}

export function runTui({ rootDir, config, args }) {
  const json = hasArg(args, '--json') || getArg(args, '--format') === 'json';
  const watch = hasArg(args, '--watch');
  const interactive = (hasArg(args, '--interactive') || (!json && !watch)) && !hasArg(args, '--no-interactive');
  if (interactive && process.stdin.isTTY && process.stdout.isTTY) return runInteractive({ rootDir, config });
  const draw = () => {
    const dashboard = buildDashboard({ rootDir, config });
    if (watch && process.stdout.isTTY) process.stdout.write('\u001b[2J\u001b[H');
    console.log(json ? JSON.stringify(dashboard, null, 2) : render(dashboard, Boolean(process.stdout.isTTY)));
  };
  draw();
  if (watch && process.stdout.isTTY) {
    const interval = setInterval(draw, Number(getArg(args, '--interval') || 2000));
    process.on('SIGINT', () => { clearInterval(interval); process.exit(0); });
  }
}
