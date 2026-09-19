/**
 * template-registry.mjs — Template Registry（Batch B：B01/B02/B03）
 *
 * 定位：模板体系的**单一事实源**读取层。
 *   - 数据源固定为 `templates/registry.json`（显式注册，不做磁盘扫描发现）；
 *   - 只读：不写盘、不依赖数据库、不通过 MCP 暴露（指令 B02）；
 *   - 定义合法性复用 `bin/contracts.mjs` 的 `Template` 契约（B01），
 *     注册表层再叠加枚举 / 稳定 ID / 版本 / 重复 / 路径存在性校验。
 *
 * 导出 API（指令 B02 约定）：
 *   listTemplates(options?)            — 全部定义（按 template_id + 版本升序）
 *   getTemplate(id, version?, opts?)   — 精确 id（+版本）取用；无 version 取最新
 *   getLatestTemplate(id, opts?)       — 最高版本
 *   findTemplates(criteria, opts?)     — 条件检索（category/scope/status/owner_role/applies_to/consumed_by…）
 *   validateTemplateRegistry(opts?)    — 注册表自检 { ok, errors, warnings, count }
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_VERSION, validateContract } from './contracts.mjs';

export const TEMPLATE_CATEGORIES = Object.freeze([
  'project', 'product', 'architecture', 'engineering', 'design', 'quality', 'operations', 'agent', 'task',
]);
export const TEMPLATE_SCOPES = Object.freeze(['project', 'task', 'runtime', 'domain']);
export const TEMPLATE_STATUSES = Object.freeze(['active', 'draft', 'deprecated']);
export const TEMPLATE_OWNER_ROLES = Object.freeze([
  'product_manager', 'tech_lead', 'ux_designer', 'ui_designer', 'knowledge_owner', 'quality_owner', 'operations_owner',
]);
export const TEMPLATE_REQUIRED_FIELDS = Object.freeze([
  'template_id', 'version', 'category', 'scope', 'source_path',
  'applies_to', 'required_when', 'owner_role', 'consumed_by', 'stale_when', 'status',
]);

const REGISTRY_FILE = fileURLToPath(new URL('../templates/registry.json', import.meta.url));
const ENGINE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

let cachedDefinitions = null;

/** 读取注册表定义数组（文件级缓存；解析失败即抛错，不静默降级）。 */
export function loadTemplateRegistry({ registryFile = REGISTRY_FILE } = {}) {
  if (registryFile === REGISTRY_FILE && cachedDefinitions) return cachedDefinitions;
  const parsed = JSON.parse(readFileSync(registryFile, 'utf-8'));
  const definitions = Array.isArray(parsed) ? parsed : parsed?.templates;
  if (!Array.isArray(definitions)) {
    throw new TypeError(`template registry must contain a templates array: ${registryFile}`);
  }
  if (registryFile === REGISTRY_FILE) cachedDefinitions = definitions;
  return definitions;
}

/** 语义化版本比较（仅支持 x.y.z；非法输入退化为字符串比较）。 */
export function compareTemplateVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  if (pa.length !== 3 || pb.length !== 3 || pa.some(Number.isNaN) || pb.some(Number.isNaN)) {
    return String(a).localeCompare(String(b));
  }
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function resolved({ definitions = null } = {}) {
  return definitions || loadTemplateRegistry();
}

function ordered(definitions) {
  return [...definitions].sort((a, b) =>
    String(a?.template_id).localeCompare(String(b?.template_id)) ||
    compareTemplateVersions(a?.version, b?.version));
}

/** 全部模板定义（按 template_id + 版本升序；返回深拷贝，保护事实源）。 */
export function listTemplates(options = {}) {
  return structuredClone(ordered(resolved(options)));
}

/** 精确取用：指定 version → 精确匹配；省略 version → 该 id 的最高版本；未知 → null。 */
export function getTemplate(templateId, version = null, options = {}) {
  const candidates = resolved(options).filter(def => def?.template_id === templateId);
  if (version === null || version === undefined) return getLatestTemplate(templateId, options);
  const found = candidates.find(def => def.version === version);
  return found ? structuredClone(found) : null;
}

/** 该 template_id 的最高版本定义；未知 id → null。 */
export function getLatestTemplate(templateId, options = {}) {
  const candidates = resolved(options)
    .filter(def => def?.template_id === templateId)
    .sort((a, b) => compareTemplateVersions(b.version, a.version));
  return candidates.length > 0 ? structuredClone(candidates[0]) : null;
}

/**
 * 条件检索。criteria 支持按字段子集过滤：
 *   - 标量条件：严格相等；若定义字段为数组则按"包含"判断；
 *   - 数组条件：与定义数组求交集（非空即命中）。
 */
export function findTemplates(criteria = {}, options = {}) {
  const entries = Object.entries(criteria).filter(([, value]) => value !== undefined && value !== null);
  const matched = resolved(options).filter(def => entries.every(([key, expected]) => {
    const actual = def?.[key];
    if (Array.isArray(expected)) {
      return Array.isArray(actual) && expected.some(value => actual.includes(value));
    }
    if (Array.isArray(actual)) return actual.includes(expected);
    return actual === expected;
  }));
  return structuredClone(ordered(matched));
}

function validateEnums(def, label, errors) {
  if (def.category && !TEMPLATE_CATEGORIES.includes(def.category)) {
    errors.push(`${label}: category must be one of: ${TEMPLATE_CATEGORIES.join(', ')}`);
  }
  if (def.scope && !TEMPLATE_SCOPES.includes(def.scope)) {
    errors.push(`${label}: scope must be one of: ${TEMPLATE_SCOPES.join(', ')}`);
  }
  if (def.status && !TEMPLATE_STATUSES.includes(def.status)) {
    errors.push(`${label}: status must be one of: ${TEMPLATE_STATUSES.join(', ')}`);
  }
  if (def.owner_role && !TEMPLATE_OWNER_ROLES.includes(def.owner_role)) {
    errors.push(`${label}: owner_role must be one of: ${TEMPLATE_OWNER_ROLES.join(', ')}`);
  }
}

/**
 * 注册表自检。
 * @returns {{ok: boolean, errors: string[], warnings: string[], count: number}}
 */
export function validateTemplateRegistry({ definitions = null, engineRoot = ENGINE_ROOT } = {}) {
  const errors = [];
  const warnings = [];
  const list = resolved({ definitions });
  if (list.length === 0) errors.push('template registry is empty');
  const seen = new Map();
  for (const def of list) {
    const label = def?.template_id ? `${def.template_id}@${def.version ?? '?'}` : '(missing template_id)';
    const contractErrors = validateContract('Template', {
      schemaVersion: SCHEMA_VERSION, type: 'Template', ...def,
    });
    for (const error of contractErrors) errors.push(`${label}: ${error}`);
    if (def?.template_id && !ID_PATTERN.test(String(def.template_id))) {
      errors.push(`${label}: template_id must be stable kebab-case (^[a-z][a-z0-9-]*$)`);
    }
    validateEnums(def || {}, label, errors);
    const key = `${def?.template_id}@${def?.version}`;
    if (seen.has(key)) errors.push(`${label}: duplicate template id+version (${key})`);
    seen.set(key, def);
    for (const field of ['source_path', 'contract_path']) {
      const value = def?.[field];
      if (typeof value === 'string' && value.length > 0 && !existsSync(resolve(engineRoot, value))) {
        errors.push(`${label}: ${field} does not exist: ${value}`);
      }
    }
  }
  return { ok: errors.length === 0, errors, warnings, count: list.length };
}
