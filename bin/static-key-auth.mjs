/**
 * static-key-auth.mjs — Cloud 静态 Key 鉴权（Batch D / D11；ADR-0002 D4）
 *
 * Phase 1 只做最小鉴权：
 *   HARNESS_API_KEY=...  →  Authorization: Bearer <key>
 * 明确**不做**：User / Tenant / Trial / Expiry / Key database / Device / Anti-sharing。
 *
 * 纯逻辑（仅 node:crypto），无 HTTP/存储依赖；由 bin/http-transport.mjs 在进入应用层**之前**调用。
 */
import { createHash, timingSafeEqual } from 'node:crypto';

/** API key 环境变量名。 */
export const API_KEY_ENV = 'HARNESS_API_KEY';

/** 唯一支持的鉴权方案前缀。 */
export const BEARER_PREFIX = 'Bearer ';

/** 读取已配置的 key（空白视为未配置）。 */
export function readApiKey(env = process.env) {
  const value = env?.[API_KEY_ENV];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** 定长指纹（长度不同的输入也能安全比较，且不泄露长度）。 */
const fingerprint = value => createHash('sha256').update(String(value)).digest();

/** 常数时间比较。 */
function safeEqual(a, b) {
  return timingSafeEqual(fingerprint(a), fingerprint(b));
}

/** 从请求头取 authorization（大小写不敏感）。 */
function authHeader(headers = {}) {
  for (const [name, value] of Object.entries(headers)) {
    if (String(name).toLowerCase() === 'authorization') return typeof value === 'string' ? value : null;
  }
  return null;
}

const denied = (status, code, message) => ({ ok: false, status, code, message });

/**
 * 鉴权一个请求。
 * @returns {{ok: true, scheme: 'static_key'}} | {{ok: false, status: 401|503, code: string, message: string}}
 */
export function authorizeRequest({ headers = {}, env = process.env } = {}) {
  const expected = readApiKey(env);
  if (!expected) return denied(503, 'auth_not_configured', `${API_KEY_ENV} is not configured`);
  const header = authHeader(headers);
  if (!header) return denied(401, 'missing_credentials', 'Authorization header is required');
  if (!header.startsWith(BEARER_PREFIX)) return denied(401, 'invalid_scheme', `expected "Bearer" scheme`);
  const provided = header.slice(BEARER_PREFIX.length).trim();
  if (provided.length === 0) return denied(401, 'missing_credentials', 'Bearer token is empty');
  if (!safeEqual(provided, expected)) return denied(401, 'invalid_key', 'invalid API key');
  return { ok: true, scheme: 'static_key' };
}
