/**
 * cloud-runtime.mjs — Cloud 运行时组装根（Batch D / D10）
 *
 * 分层串联（唯一装配点，依赖方向单向）：
 *   HTTP Transport（bin/http-transport.mjs）
 *     → Static Key Auth（bin/static-key-auth.mjs）
 *     → MCP Adapter（bin/mcp-jsonrpc.mjs）
 *     → Application/Command（bin/cloud-application.mjs）
 *     → Governance Core / 端口（D06-D09）
 *     → SQLite
 *
 * 本模块只做装配与启动，不含业务规则、不含协议细节。
 */
import { getHarnessName, getHarnessVersion } from './version.mjs';
import { createCloudApplication } from './cloud-application.mjs';
import { cloudStrictPolicy } from './cloud-policy.mjs';
import { createHttpHandler, startHttpServer } from './http-transport.mjs';
import { createJsonRpcAdapter } from './mcp-jsonrpc.mjs';
import { authorizeRequest } from './static-key-auth.mjs';

/**
 * 组装 Cloud 运行时（不监听端口）。
 * @param {object} options
 * @param {object} options.db 已打开的 node:sqlite 句柄
 * @param {object} [options.config]
 * @param {object} [options.env] 环境变量（默认 process.env；测试可注入）
 */
export function createCloudRuntime({ db, config = {}, env = process.env } = {}) {
  const application = createCloudApplication({ db, config });
  const adapter = createJsonRpcAdapter({
    application,
    serverInfo: { name: getHarnessName(), version: getHarnessVersion() },
  });
  const authorize = ({ headers }) => authorizeRequest({ headers, env });
  const strictGovernance = cloudStrictPolicy(config).strictGovernance;
  const handleRequest = createHttpHandler({ authorize, adapter, info: { strictGovernance } });

  return { application, adapter, authorize, handleRequest, strictGovernance };
}

/**
 * 组装并启动 Cloud 运行时（真实监听）。
 * @returns {Promise<{url: string, close: Function, runtime: object}>}
 */
export async function startCloudRuntime({ db, config = {}, env = process.env, port = 0, host = '127.0.0.1' } = {}) {
  const runtime = createCloudRuntime({ db, config, env });
  const server = await startHttpServer({ handler: runtime.handleRequest, port, host });
  return { url: server.url, close: server.close, runtime };
}
