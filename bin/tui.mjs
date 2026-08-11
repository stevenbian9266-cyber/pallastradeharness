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

export function runTui({ rootDir, config, args }) {
  const json = hasArg(args, '--json') || getArg(args, '--format') === 'json';
  const watch = hasArg(args, '--watch');
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
