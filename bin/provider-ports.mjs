/**
 * provider-ports.mjs — Provider 端口定义（Batch D / D04/D05；ADR-0002 D1/D6）
 *
 * 定位：Governance Core 与**上下文/快照提供者**之间的端口契约（纯定义，无 IO）。
 *   - Local Runtime 以本机适配器包装既有实现（见 bin/local-providers.mjs）；
 *   - Cloud Runtime 以「提交式」实现同一方法面（SubmittedContext / SubmittedGitSnapshot，D08）；
 *   - 契约测试对两种实现运行同一套行为断言（bin/provider-contract.mjs）。
 *
 * 与 runtime-ports.mjs 的区别：
 *   - Repository 端口 = **持久化状态**（读写项目/任务/证据…）；
 *   - Provider 端口 = **派生信息**（画像、索引、上下文包、git 视图），实现可以是纯计算或外部提交。
 *
 * 约束：
 *   - 端口只描述**读取/派生语义**；业务判定留在 Core（ARCH-R1/R2）；
 *   - 方法面冻结于本文件；扩展需 ADR + Decision 留痕；
 *   - 本模块为纯逻辑：禁止 import node:fs / node:child_process（AC-006）。
 *     同一清单 runtime-ports.mjs 已导出为 CLOUD_FORBIDDEN_IMPORTS，供 Cloud 白名单测试复用；
 *   - 校验逻辑复用 runtime-ports.mjs 的 validateMethodSurface（不在本文件重复实现）。
 */

import { validateMethodSurface } from './runtime-ports.mjs';

/** Provider 端口种类（冻结）。 */
export const PROVIDER_PORT_KINDS = Object.freeze([
  'ProjectContextProvider',
  'TaskContextProvider',
  'GitSnapshotProvider',
]);

/** 各类 Provider 的方法面（冻结；语义与缺失归一见 docs/designs/.../interaction.md §1）。 */
export const PROVIDER_PORT_METHODS = Object.freeze({
  ProjectContextProvider: Object.freeze(['profile', 'index', 'search', 'status']),
  TaskContextProvider: Object.freeze(['contextPack', 'recordDecision']),
  GitSnapshotProvider: Object.freeze([
    'changedFiles',
    'diff',
    'showAtRef',
    'createSnapshot',
    'writeSnapshot',
    'readSnapshot',
    'listSnapshots',
  ]),
});

/**
 * 校验一个 Provider 实现是否满足端口契约。
 * @param {string} kind PROVIDER_PORT_KINDS 之一
 * @param {object} implementation 待校验实现
 * @returns {{ok: boolean, errors: string[], missing: string[]}}
 */
export function validateProviderImplementation(kind, implementation) {
  return validateMethodSurface({
    kind,
    methodsByKind: PROVIDER_PORT_METHODS,
    implementation,
    noun: 'provider',
  });
}

/** 便捷布尔判断。 */
export function isProviderImplementation(kind, implementation) {
  return validateProviderImplementation(kind, implementation).ok;
}
