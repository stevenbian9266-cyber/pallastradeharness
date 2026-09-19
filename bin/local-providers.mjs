/**
 * local-providers.mjs — Provider 端口的**本机适配器**（Batch D / D04/D05）
 *
 * 逐方法包装既有实现，**行为零变化**：
 *   - ProjectContextProvider → bin/project-brain.mjs（profile/index/search/status）
 *   - TaskContextProvider    → bin/project-brain.mjs（contextPack/recordDecision）
 *   - GitSnapshotProvider    → bin/git-files.mjs + bin/change-snapshot.mjs
 *
 * 约定：
 *   - 工厂绑定 rootDir/config；方法只收业务参数（Cloud 实现无需知道本地路径概念）；
 *   - 返回值**原样透传**（不做字段映射、不吞异常）——保证 D08/D12 切换时行为等价；
 *   - 每个 provider 带 `kind` 字段，可直接交给 isProviderImplementation 校验。
 */
import {
  brainStatus,
  buildContextPack,
  buildProjectProfile,
  indexKnowledge,
  recordDecision,
  searchKnowledge,
} from './project-brain.mjs';
import { getChangedFiles, getDiff, showFileAtRef } from './git-files.mjs';
import { createSnapshot, listSnapshots, readSnapshot, writeSnapshot } from './change-snapshot.mjs';

/** 工厂：返回绑定到某个项目根目录的三个本机 Provider。 */
export function createLocalProviders({ rootDir, config }) {
  return {
    projectContext: createProjectContextProvider(rootDir, config),
    taskContext: createTaskContextProvider(rootDir, config),
    gitSnapshot: createGitSnapshotProvider(rootDir, config),
  };
}

/** ProjectContextProvider：项目画像 / 知识索引 / 检索 / 索引状态。 */
export function createProjectContextProvider(rootDir, config) {
  return {
    kind: 'ProjectContextProvider',
    profile: () => buildProjectProfile({ rootDir, config }),
    index: () => indexKnowledge({ rootDir, config }),
    search: (query, top = 10) => searchKnowledge({ rootDir, config, query, top }),
    status: () => brainStatus({ rootDir, config }),
  };
}

/** TaskContextProvider：任务上下文包 / 决策留痕。 */
export function createTaskContextProvider(rootDir, config) {
  return {
    kind: 'TaskContextProvider',
    contextPack: (task, refresh = false) => buildContextPack({ rootDir, config, task, refresh }),
    recordDecision: ({ taskId, title, decision, reason }) =>
      recordDecision({ rootDir, config, taskId, title, decision, reason }),
  };
}

/** GitSnapshotProvider：git 视图（变更/差异/内容）+ 变更快照（生成/落盘/读回/列举）。 */
export function createGitSnapshotProvider(rootDir, config) {
  return {
    kind: 'GitSnapshotProvider',
    changedFiles: (base = 'origin/main') => getChangedFiles(rootDir, base),
    diff: (base = 'origin/main', { unified = 0 } = {}) => getDiff(rootDir, base, { unified }),
    showAtRef: (ref, file) => showFileAtRef(rootDir, ref, file),
    createSnapshot: ({ taskId, branch, baseHead, allow = [] }) =>
      createSnapshot({ rootDir, taskId, branch, baseHead, allow, config }),
    writeSnapshot: snapshot => writeSnapshot(rootDir, config, snapshot),
    readSnapshot: snapshotId => readSnapshot(rootDir, config, snapshotId),
    listSnapshots: () => listSnapshots(rootDir, config),
  };
}
