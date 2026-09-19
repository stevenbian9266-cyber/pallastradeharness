/**
 * runtime-ports.mjs — 运行时端口定义（Batch D / D02；ADR-0002 D1）
 *
 * 定位：Governance Core 与存储/上下文实现之间的**端口契约**（纯定义，无 IO）。
 *   - Local Runtime 以 File* 适配器包装既有存储（见 bin/file-repositories.mjs）；
 *   - Cloud Runtime 将实现同一方法面（Sqlite*，D06/D07）；
 *   - 契约测试对两种适配器运行同一套行为断言（bin/repository-contract.mjs）。
 *
 * 约束：
 *   - 端口只描述**存储/读取语义**；业务规则（Task/Gate/Evidence 判定）留在 Core（ARCH-R1/R2）；
 *   - 方法面冻结于本文件；扩展需 ADR；
 *   - Cloud 模块禁止 import fs/child_process（见 CLOUD_FORBIDDEN_IMPORTS，D08/D10 白名单测试复用）。
 */

/** 端口种类（冻结）。 */
export const RUNTIME_PORT_KINDS = Object.freeze([
  'ProjectRepository',
  'ArtifactRepository',
  'TaskRepository',
  'GateRepository',
  'ApprovalRepository',
  'EvidenceRepository',
  'EventRepository',
]);

/** 各类端口的方法面（冻结；callable 语义见 docs/designs/.../interaction.md）。 */
export const RUNTIME_PORT_METHODS = Object.freeze({
  ProjectRepository: Object.freeze(['getProfile', 'listArtifacts', 'getConstitutionVersion']),
  ArtifactRepository: Object.freeze(['list', 'get', 'upsert', 'refresh']),
  TaskRepository: Object.freeze(['list', 'get', 'save']),
  GateRepository: Object.freeze(['loadLatest', 'statusSnapshot', 'save']),
  ApprovalRepository: Object.freeze(['list', 'record', 'statuses']),
  EvidenceRepository: Object.freeze(['list', 'record', 'bundle']),
  EventRepository: Object.freeze(['append', 'list']),
});

/**
 * Cloud 运行时模块禁止直接 import 的模块前缀。
 * 用途：D08/D10 的 import 白名单测试（Cloud 禁止 readFile(rootDir) / run shell(rootDir)）。
 */
export const CLOUD_FORBIDDEN_IMPORTS = Object.freeze(['node:fs', 'node:child_process']);

/**
 * 通用**方法面校验器**（Repository/Provider 端口共用；避免双份校验逻辑漂移）。
 * @param {object} options
 * @param {string} options.kind 端口种类
 * @param {Record<string, readonly string[]>} options.methodsByKind 该类别的方法面表
 * @param {object} options.implementation 待校验实现
 * @param {string} [options.noun] 错误文案名词（port / provider）
 * @returns {{ok: boolean, errors: string[], missing: string[]}}
 */
export function validateMethodSurface({ kind, methodsByKind, implementation, noun = 'port' }) {
  const methods = methodsByKind[kind];
  if (!methods) return { ok: false, errors: [`unknown ${noun} kind: ${kind}`], missing: [] };
  if (implementation === null || typeof implementation !== 'object') {
    return { ok: false, errors: [`${kind} implementation must be an object`], missing: [...methods] };
  }
  const missing = methods.filter(method => typeof implementation[method] !== 'function');
  const errors = missing.map(method => `${kind}.${method} must be a function`);
  if (implementation.kind !== undefined && implementation.kind !== kind) {
    errors.push(`${kind} implementation declares kind="${implementation.kind}"`);
  }
  return { ok: errors.length === 0, errors, missing };
}

/**
 * 校验一个适配器是否满足端口契约。
 * @returns {{ok: boolean, errors: string[], missing: string[]}}
 */
export function validatePortImplementation(kind, implementation) {
  return validateMethodSurface({ kind, methodsByKind: RUNTIME_PORT_METHODS, implementation });
}

/** 便捷布尔判断。 */
export function isPortImplementation(kind, implementation) {
  return validatePortImplementation(kind, implementation).ok;
}
