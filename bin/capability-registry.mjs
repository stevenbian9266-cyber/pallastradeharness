/**
 * capability-registry.mjs — Agent 插件能力登记（设计文档 §17.3.2）
 *
 * 插件安装成功不等于自动获得信任。登记时必须声明能力与边界，
 * 并诚实标注保护等级（enforced / guarded / advisory）——不能把"给了提示"说成"已经拦住"。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { statePaths } from './state-store.mjs';

export const VALID_CAPABILITIES = Object.freeze([
  'read_governance_context',
  'propose_plan',
  'propose_patch',
  'run_registered_check',
  'request_ai_help',
  'block_write',
  'block_command',
  'block_commit',
  'block_network',
  'display_approval_ui',
  'suspend_resume',
]);

export const VALID_KINDS = Object.freeze(['agent_adapter', 'ai_service']);

export const VALID_CANNOT_DO = Object.freeze([
  'change_locked_policy',
  'approve_own_high_risk_change',
  'write_outside_task_scope',
  'bypass_gate',
  'forge_evidence',
]);

export const VALID_PROTECTION_LEVELS = Object.freeze(['enforced', 'guarded', 'advisory']);

export const PROTECTION_MESSAGES = Object.freeze({
  enforced: '已强制保护：未经 Harness 允许，受限动作确实无法执行',
  guarded: '已开启保护，但仍需注意：存在宿主可绕过的路径',
  advisory: '只能提醒，不能强制拦截：请谨慎处理高影响动作',
});

export function validateCapabilityRegistration(reg) {
  const errors = [];
  if (!reg || typeof reg !== 'object') return ['registration must be an object'];
  if (!reg.id || typeof reg.id !== 'string') errors.push('id (string) required');
  if (reg.kind && !VALID_KINDS.includes(reg.kind)) errors.push(`kind must be one of ${VALID_KINDS.join('|')}, got ${reg.kind}`);
  if (reg.protocol_version == null || Number(reg.protocol_version) < 1) errors.push('protocol_version >= 1 required');
  if (!Array.isArray(reg.capabilities) || reg.capabilities.length === 0) errors.push('capabilities (non-empty array) required');
  else for (const c of reg.capabilities) if (!VALID_CAPABILITIES.includes(c)) errors.push(`unknown capability: ${c}`);
  if (Array.isArray(reg.needs_permission)) for (const p of reg.needs_permission) if (typeof p !== 'string') errors.push('needs_permission entries must be strings');
  if (Array.isArray(reg.cannot_do)) for (const c of reg.cannot_do) if (!VALID_CANNOT_DO.includes(c)) errors.push(`unknown cannot_do: ${c}`);
  if (reg.protection_level && !VALID_PROTECTION_LEVELS.includes(reg.protection_level)) errors.push(`protection_level must be ${VALID_PROTECTION_LEVELS.join('|')}, got ${reg.protection_level}`);
  return errors;
}

/** 保护等级派生：声明可拦截写入+命令/提交 → enforced；任一 block_* → guarded；否则 advisory */
export function deriveProtectionLevel(reg) {
  const caps = new Set(reg?.capabilities || []);
  if (caps.has('block_write') && (caps.has('block_command') || caps.has('block_commit'))) return 'enforced';
  if (caps.has('block_write') || caps.has('block_command') || caps.has('block_commit') || caps.has('block_network')) return 'guarded';
  return 'advisory';
}

/** 诚实报告：保护等级 + 大白话描述 + 能力/禁区清单 */
export function honestReport(reg) {
  const level = reg.protection_level || deriveProtectionLevel(reg);
  return {
    id: reg.id,
    kind: reg.kind || 'agent_adapter',
    protocol_version: reg.protocol_version ?? 1,
    protection_level: level,
    message: PROTECTION_MESSAGES[level],
    capabilities: reg.capabilities || [],
    needs_permission: reg.needs_permission || [],
    cannot_do: reg.cannot_do || [],
  };
}

function adaptersDir(rootDir, config) {
  const dir = join(statePaths(rootDir, config).state, 'adapters');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function registerCapability({ rootDir, config, registration }) {
  const errors = validateCapabilityRegistration(registration);
  if (errors.length > 0) throw new TypeError(`Invalid capability registration: ${errors.join('; ')}`);
  const record = honestReport(registration);
  const path = join(adaptersDir(rootDir, config), `${record.id}.json`);
  writeFileSync(path, JSON.stringify(record, null, 2));
  return record;
}

export function listRegisteredCapabilities({ rootDir, config }) {
  const dir = join(statePaths(rootDir, config).state, 'adapters');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => {
    try { return JSON.parse(readFileSync(join(dir, f), 'utf-8')); } catch { return null; }
  }).filter(Boolean);
}

export function removeCapability({ rootDir, config, id }) {
  const path = join(statePaths(rootDir, config).state, 'adapters', `${id}.json`);
  if (!existsSync(path)) return false;
  rmSync(path);
  return true;
}

export function resolveRegistrationFile(rootDir, file) {
  const abs = resolve(rootDir, file);
  if (!existsSync(abs)) throw new TypeError(`registration file not found: ${file}`);
  return JSON.parse(readFileSync(abs, 'utf-8'));
}
