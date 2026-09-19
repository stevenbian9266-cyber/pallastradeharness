/**
 * http-transport.mjs — Cloud HTTP 传输层（Batch D / D10；ADR-0002 D3：Streamable HTTP v0）
 *
 * 分层位置：HTTP Transport → (Static Key Auth) → MCP Adapter。
 *   - 本层**不做业务、不碰存储**（不 import SQLite / 领域模块）——防 `HTTP handler → direct SQLite`；
 *   - `handleHttpRequest` 为纯函数（可直接单测）；`startHttpServer` 仅做 socket 适配；
 *   - 只做 POST /mcp（不做 SSE / 长连接，D3）。
 */
import { createServer } from 'node:http';

/** JSON-RPC 错误码（仅本模块使用）。 */
const JSON_RPC_ERROR_CODES = Object.freeze({
  parseError: -32700,
  invalidRequest: -32600,
  internalError: -32603,
});

const JSON_HEADERS = Object.freeze({ 'content-type': 'application/json' });

const json = (status, payload, headers = {}) => ({ status, headers: { ...JSON_HEADERS, ...headers }, body: JSON.stringify(payload) });

const rpcError = (status, code, message) => json(status, { jsonrpc: '2.0', id: null, error: { code, message } });

/** 校验 JSON-RPC 请求形状（返回 null 表示合法）。 */
function validateRpcRequest(request) {
  if (!request) return 'request body must be a JSON object';
  if (request.jsonrpc !== '2.0') return 'jsonrpc must be "2.0"';
  if (typeof request.method !== 'string') return 'method must be a string';
  return null;
}

/** 通知（无 id）不返回响应体。 */
const isNotification = result => result === null || result === undefined;

/** 错误码映射：未知方法透传 -32601，其余归为内部错误。 */
const errorCode = error => (error?.code === -32601 ? -32601 : JSON_RPC_ERROR_CODES.internalError);

const rpcResult = (id, payload) => json(200, { jsonrpc: '2.0', id: id ?? null, ...payload });

/**
 * 创建一个 HTTP 处理器。
 * @param {object} options
 * @param {Function} options.authorize 鉴权函数 `({ headers }) => { ok, status?, code?, message? }`
 * @param {Function} options.adapter MCP 适配器 `(request) => Promise<result|null>`
 * @param {object} [options.info] `/health` 附带的运行时信息（如 `{ strictGovernance: true }`）
 */
export function createHttpHandler({ authorize, adapter, info = {} } = {}) {
  if (typeof authorize !== 'function' || typeof adapter !== 'function') {
    throw new TypeError('createHttpHandler requires authorize() and adapter()');
  }

  return async function handleHttpRequest({ method = 'GET', path = '/', headers = {}, body = '' } = {}) {
    if (path === '/health' && method === 'GET') return json(200, { ok: true, runtime: 'cloud', ...info });
    if (path !== '/mcp') return json(404, { error: 'not_found' });
    if (method !== 'POST') return json(405, { error: 'method_not_allowed' }, { allow: 'POST' });

    const auth = authorize({ headers });
    if (!auth.ok) return json(auth.status, { error: auth.code, message: auth.message });

    let request = null;
    try {
      request = JSON.parse(body || '{}');
    } catch {
      return rpcError(400, JSON_RPC_ERROR_CODES.parseError, 'invalid JSON body');
    }
    const invalid = validateRpcRequest(request);
    if (invalid) return rpcError(400, JSON_RPC_ERROR_CODES.invalidRequest, invalid);

    try {
      const result = await adapter(request);
      if (isNotification(result)) return { status: 202, headers: {}, body: '' };
      return rpcResult(request.id, { result });
    } catch (error) {
      return rpcResult(request.id, { error: { code: errorCode(error), message: error?.message ?? 'internal error' } });
    }
  };
}

/**
 * 启动真实 HTTP 监听（部署/D14 使用）。
 * @param {object} options
 * @param {Function} options.handler `handleHttpRequest`
 * @param {number} [options.port] 0 = 由系统分配空闲端口
 * @param {string} [options.host]
 */
export function startHttpServer({ handler, port = 0, host = '127.0.0.1' } = {}) {
  if (typeof handler !== 'function') throw new TypeError('startHttpServer requires a handler');
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      handler({
        method: req.method,
        path: new URL(req.url, `http://${req.headers.host || host}`).pathname,
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf-8'),
      }).then(response => {
        res.writeHead(response.status, response.headers);
        res.end(response.body);
      });
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      resolve({
        server,
        url: `http://${host}:${address.port}`,
        close: () => new Promise(done => server.close(done)),
      });
    });
  });
}
