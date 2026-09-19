/**
 * mcp-jsonrpc.mjs — MCP JSON-RPC 适配层（Batch D / D10）
 *
 * 职责：把 JSON-RPC 消息翻译成对**应用层**的调用，协议语义与 Local stdio（bin/mcp.mjs）一致。
 *   - 复用同一 protocolVersion / 同一 `MCP_TOOLS` 清单 / 同一结果信封（content / toolError）；
 *   - **不判定业务结果**（ARCH-R2）：本模块不认识 SQLite、不认识领域模块，只做委托。
 */
import { MCP_PROTOCOL_VERSION, MCP_TOOLS, content, toolError } from './mcp.mjs';

const methodNotFound = method => Object.assign(new TypeError(`Unknown MCP method: ${method}`), { code: -32601 });

/** 构造 MCP 适配器（协议 → 应用层）。 */
export function createJsonRpcAdapter({ application, serverInfo } = {}) {
  if (!application || typeof application.callTool !== 'function' || typeof application.listTools !== 'function') {
    throw new TypeError('createJsonRpcAdapter requires an application with listTools() and callTool()');
  }
  const info = serverInfo ?? { name: 'pallastrade-harness', version: '0.0.0' };

  /** tools/call：委托给应用层并统一结果信封（本层不判定业务结果）。 */
  const callTool = async request => {
    const name = request.params?.name;
    if (typeof name !== 'string' || name.length === 0) return toolError('missing_tool_name', 'tools/call requires params.name');
    const result = await application.callTool(name, request.params?.arguments ?? {});
    if (result && typeof result === 'object' && Array.isArray(result.content)) return result;
    return content(result);
  };

  const handlers = {
    initialize: () => ({
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: info,
    }),
    ping: () => ({}),
    'notifications/initialized': () => null,
    'tools/list': () => ({ tools: application.listTools() }),
    'tools/call': callTool,
  };

  return async function handle(request) {
    if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
      throw new TypeError('Invalid JSON-RPC request');
    }
    const handler = handlers[request.method];
    if (!handler) throw methodNotFound(request.method);
    return handler(request);
  };
}

/** 冻结工具清单（供断言与文档引用；来自 Local MCP，Cloud 不得漂移）。 */
export const FROZEN_TOOL_CATALOG = MCP_TOOLS;
