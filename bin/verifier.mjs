#!/usr/bin/env node
/**
 * verifier.mjs — Verifier Registry（HTH-005）
 *
 * 把"命令退出 0"升级为"已注册且适用于当前风险的验证器退出 0"。
 * 满足 Gate 的证据必须来自 config.evidence.verifiers 中已注册的验证器；
 * 任意命令仍可通过 evidence run 记录，但降级为 diagnostic，不满足严格 Gate（F-02）。
 */
import { createHash } from 'node:crypto';
import { runEvidenceCommand } from './evidence.mjs';
import { expandCommandArgs } from './glob-utils.mjs';

// ────────────────────────────────────────────────────────────────
// 定义 hash 与注册表
// ────────────────────────────────────────────────────────────────
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** 验证器定义 hash：配置中定义变化 → 旧证据失效（INV-04） */
export function verifierDefinitionHash(verifier) {
  return createHash('sha256').update(stableStringify(verifier || {})).digest('hex');
}

/** 列出已注册验证器 */
export function listVerifiers(config) {
  return Object.entries(config.evidence?.verifiers || {}).map(([id, def]) => ({ id, ...def }));
}

export function getVerifier(config, verifierId) {
  return config.evidence?.verifiers?.[verifierId] || null;
}

// ────────────────────────────────────────────────────────────────
// 运行验证器
// ────────────────────────────────────────────────────────────────
/**
 * 运行已注册验证器并记录 test 类型证据（绑定 verifierId + 定义 hash）。
 */
export function runVerifier({ rootDir, config, task, verifierId }) {
  const verifier = getVerifier(config, verifierId);
  if (!verifier) throw new Error(`Unknown verifier: ${verifierId} (registered: ${listVerifiers(config).map(v => v.id).join(', ') || 'none'})`);
  const command = expandCommandArgs(rootDir, verifier.command);
  if (command.length === 0) throw new Error(`Verifier ${verifierId} produced an empty command`);
  return runEvidenceCommand({
    rootDir,
    config,
    task,
    evidenceType: verifier.type || 'test',
    summary: `verifier:${verifierId}`,
    command,
    verifierId,
    verifierDefinitionHash: verifierDefinitionHash(verifier),
  });
}
