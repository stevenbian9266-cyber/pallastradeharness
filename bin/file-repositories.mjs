/**
 * file-repositories.mjs — File 适配器（Batch D / D03；ADR-0002 D1）
 *
 * 定位：把既有 Local 存储（state-store / .harness-state / harness/gates / approvals / artifacts /
 * evidence / constitution）**包装**成 Runtime Ports（D02 定义），行为与现状一致：
 *   - 方法名映射 + 参数转发（禁止在此实现业务规则）；
 *   - 缺失归一：`get` 类方法"不存在"返回 null（不抛出）；
 *   - 写操作按既有函数语义抛出（fail-loud）。
 *
 * 本任务不接线生产调用点（D10 起按需接线，见 PRD Out of Scope）。
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { atomicWriteJson, listTasks, loadTask, saveTask, statePaths } from './state-store.mjs';
import { gateStatusSnapshot, loadLatestGate } from './gate-commands.mjs';
import { buildEvidenceBundle, listEvidence, recordEvidence } from './evidence.mjs';
import { approvalStatuses, listApprovals, recordApproval } from './approvals.mjs';
import { getArtifact, listArtifacts, refreshArtifacts, upsertArtifact } from './project-artifacts.mjs';
import { getCurrentConstitutionVersion } from './constitution.mjs';
import { readProfile } from './governance.mjs';

const MISSING_RE = /not found|no such file|ENOENT/i;

/** 缺失归一：底层"不存在"异常 → null；其余异常照抛。 */
function nullOnMissing(loader) {
  return (...args) => {
    try {
      return loader(...args);
    } catch (error) {
      if (MISSING_RE.test(String(error?.message ?? error))) return null;
      throw error;
    }
  };
}

/** 事件日志文件（本地 JSONL；仅本模块内部使用）。 */
function eventsFile(rootDir, config, taskId) {
  const dir = resolve(statePaths(rootDir, config).state, 'events');
  return { dir, path: resolve(dir, `${taskId}.ndjson`) };
}

export function createFileRepositories({ rootDir, config }) {
  const project = {
    kind: 'ProjectRepository',
    getProfile: () => readProfile({ rootDir, config }),
    listArtifacts: () => listArtifacts({ rootDir, config }),
    getConstitutionVersion: () => getCurrentConstitutionVersion({ rootDir, config }),
  };

  const artifacts = {
    kind: 'ArtifactRepository',
    list: () => listArtifacts({ rootDir, config }),
    get: id => getArtifact({ rootDir, config, id }),
    upsert: input => upsertArtifact({ rootDir, config, ...input }),
    refresh: () => refreshArtifacts({ rootDir, config }),
  };

  const tasks = {
    kind: 'TaskRepository',
    list: () => listTasks(rootDir, config),
    get: nullOnMissing(taskId => loadTask(rootDir, config, taskId)),
    save: task => saveTask(rootDir, config, task),
  };

  const gates = {
    kind: 'GateRepository',
    loadLatest: () => loadLatestGate({ rootDir, config }),
    statusSnapshot: () => gateStatusSnapshot({ rootDir, config }),
    save(gateState) {
      if (!gateState?.id) throw new TypeError('GateRepository.save requires gateState.id');
      const dir = resolve(rootDir, config.paths.gates);
      mkdirSync(dir, { recursive: true });
      atomicWriteJson(resolve(dir, `${gateState.id}.json`), gateState);
      return gateState;
    },
  };

  const approvals = {
    kind: 'ApprovalRepository',
    list: () => listApprovals({ rootDir, config }),
    record: input => recordApproval({ rootDir, config, ...input }),
    statuses: () => approvalStatuses({ rootDir, config }),
  };

  const evidence = {
    kind: 'EvidenceRepository',
    list: taskId => listEvidence(rootDir, config, taskId),
    record: input => recordEvidence({ rootDir, config, ...input }),
    bundle: task => buildEvidenceBundle({ rootDir, config, task }),
  };

  const events = {
    kind: 'EventRepository',
    append(taskId, event = {}) {
      const { dir, path } = eventsFile(rootDir, config, taskId);
      mkdirSync(dir, { recursive: true });
      const record = { at: new Date().toISOString(), ...event };
      appendFileSync(path, `${JSON.stringify(record)}\n`, 'utf-8');
      return record;
    },
    list(taskId) {
      const { path } = eventsFile(rootDir, config, taskId);
      let raw = '';
      try {
        raw = readFileSync(path, 'utf-8');
      } catch (error) {
        if (MISSING_RE.test(String(error?.message ?? error))) return [];
        throw error;
      }
      return raw.split('\n').filter(Boolean).map(line => JSON.parse(line));
    },
  };

  return { project, artifacts, tasks, gates, approvals, evidence, events };
}
