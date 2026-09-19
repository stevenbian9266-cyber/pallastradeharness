/**
 * cloud-application.mjs — Cloud 应用/命令层（Batch D / D10，D12 扩展）
 *
 * 分层位置：MCP Adapter → **本层（分发表）** → cloud-commands → Governance Core / 端口 → SQLite。
 *   - 本层是 Cloud 运行时**唯一**接触存储的层（HTTP 层禁止直连 SQLite）；
 *   - 只做分发与装配，**不判定业务结果**（ARCH-R2）：不补造审批/证据，不返回假 PASS；
 *   - 未接线的工具统一返回 `cloud_not_implemented`（显式暴露而非静默降级）。
 */
import { MCP_TOOLS, toolError } from './mcp.mjs';
import { createCloudCommands } from './cloud-commands.mjs';
import { assertCloudStrictGovernance } from './cloud-policy.mjs';
import { createBoundaryEvidenceRepository } from './evidence-boundary.mjs';
import { createSqliteRepositories } from './sqlite-repositories.mjs';

const DEFAULT_TASK_LIMIT = 20;

/** 读取字段（对象缺失或字段缺失 → null；沿用 D08/D09 的助手风格，避免 `??` 堆积）。 */
function fieldOf(source, field) {
  if (!source) return null;
  return source[field] === undefined ? null : source[field];
}

/** 任务摘要（列表视图字段）。 */
function taskSummary(task) {
  return {
    id: task.id,
    title: task.title,
    status: fieldOf(task, 'status'),
    riskLevel: fieldOf(task, 'riskLevel'),
    updatedAt: fieldOf(task, 'updatedAt'),
  };
}

/** 任务列表（默认上限；可按 status 过滤）。 */
function listTasks(repositories, args) {
  const tasks = repositories.tasks.list();
  const status = fieldOf(args, 'status');
  const filtered = status ? tasks.filter(task => task.status === status) : tasks;
  const limit = Number(fieldOf(args, 'limit')) || DEFAULT_TASK_LIMIT;
  const limited = filtered.slice(0, Math.max(1, limit));
  return { count: limited.length, total: filtered.length, tasks: limited.map(taskSummary) };
}

/** 单任务读取（缺 task_id → 明确参数错误；未知 id → null）。 */
function getTask(repositories, args) {
  const taskId = fieldOf(args, 'task_id');
  if (!taskId) return toolError('missing_argument', 'get_task requires task_id', { argument: 'task_id' });
  const task = repositories.tasks.get(taskId);
  return { task };
}

/** 未接线工具的显式降级（不含任何“成功”语义）。 */
function notImplemented(tool) {
  return toolError('cloud_not_implemented', `tool "${tool}" is not wired in the cloud runtime yet (Batch D / D12)`, { tool });
}

/**
 * 创建 Cloud 应用层。
 * @param {object} options
 * @param {object} options.db 已打开的 node:sqlite 句柄
 * @param {object} [options.config]
 */
export function createCloudApplication({ db, config = {} } = {}) {
  if (!db || typeof db.prepare !== 'function') {
    throw new TypeError('createCloudApplication requires an open node:sqlite database handle');
  }
  assertCloudStrictGovernance(config);
  const repositories = createSqliteRepositories({ db, config });
  const evidence = createBoundaryEvidenceRepository(repositories.evidence);

  const handlers = {
    list_tasks: args => listTasks(repositories, args),
    get_task: args => getTask(repositories, args),
    ...createCloudCommands({ repositories, evidence, db, config }),
  };

  return {
    /** Cloud 工具清单 = Local 冻结清单（D12 兼容基础）。 */
    listTools: () => MCP_TOOLS,
    /** 已接线工具名（供文档/运维查询；不参与协议）。 */
    listImplementedTools: () => Object.keys(handlers).sort(),
    callTool: (name, args = {}) => {
      const handler = handlers[name];
      return handler ? handler(args) : notImplemented(name);
    },
  };
}
