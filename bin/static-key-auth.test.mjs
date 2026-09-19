/**
 * static-key-auth.test.mjs — 静态 Key 鉴权（Batch D / D11，PRD AC-001/AC-002）
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { API_KEY_ENV, BEARER_PREFIX, authorizeRequest, readApiKey } from './static-key-auth.mjs';

const KEY = 'test-key-1234567890';
const env = { [API_KEY_ENV]: KEY };
const withKey = headers => authorizeRequest({ headers, env });

test('AC-001: 未配置 key → 503 auth_not_configured', () => {
  assert.equal(readApiKey({}), null);
  const denied = authorizeRequest({ headers: { authorization: `Bearer ${KEY}` }, env: {} });
  assert.equal(denied.ok, false);
  assert.equal(denied.status, 503);
  assert.equal(denied.code, 'auth_not_configured');
});

test('AC-001: 缺 header → 401 missing_credentials', () => {
  const denied = withKey({});
  assert.equal(denied.status, 401);
  assert.equal(denied.code, 'missing_credentials');
  assert.equal(withKey({ authorization: 'Bearer ' }).code, 'missing_credentials');
});

test('AC-001: 非 Bearer 方案 → 401 invalid_scheme；key 错误 → 401 invalid_key', () => {
  assert.equal(withKey({ authorization: `Basic ${KEY}` }).code, 'invalid_scheme');
  const wrong = withKey({ authorization: 'Bearer wrong-key' });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.code, 'invalid_key');
});

test('AC-001: 正确 Bearer（大小写不敏感头名）→ 放行', () => {
  assert.deepEqual(withKey({ authorization: `Bearer ${KEY}` }), { ok: true, scheme: 'static_key' });
  assert.equal(withKey({ Authorization: `Bearer ${KEY}` }).ok, true);
  assert.equal(BEARER_PREFIX, 'Bearer ');
  assert.equal(API_KEY_ENV, 'HARNESS_API_KEY');
});

test('AC-002: 空白 key 视为未配置；长度不同不抛错；比较走常数时间 API', () => {
  assert.equal(readApiKey({ [API_KEY_ENV]: '   ' }), null);
  assert.equal(readApiKey({ [API_KEY_ENV]: 42 }), null);
  assert.equal(readApiKey({ [API_KEY_ENV]: ` ${KEY} ` }), KEY, 'surrounding whitespace is trimmed');

  assert.equal(withKey({ authorization: 'Bearer short' }).code, 'invalid_key');
  assert.equal(withKey({ authorization: `Bearer ${KEY}${KEY}` }).code, 'invalid_key');

  const source = readFileSync(fileURLToPath(new URL('./static-key-auth.mjs', import.meta.url)), 'utf-8');
  assert.ok(source.includes('timingSafeEqual'), 'must use a constant-time comparison');
  assert.equal(/user|tenant|trial|expiry/i.test(source.replace(/\/\*\*[\s\S]*?\*\//g, '')), false, 'no user/tenant/trial/expiry features');
});
