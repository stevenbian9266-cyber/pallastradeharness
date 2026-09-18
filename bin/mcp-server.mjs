#!/usr/bin/env node
/**
 * mcp-server.mjs — 独立 MCP 入口（零安装接入，RFC-0004 Phase 1）
 *
 * bin 名：harness-mcp（package.json）。
 * 根定位优先级：--root > HARNESS_ROOT >（客户端 roots 协商，见 mcp.mjs）> cwd 向上查找。
 * 同时导出 resolveServerContext，供 `harness mcp` 分支复用（单一事实源）。
 */
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, resolveProjectRoot } from './config-loader.mjs';
import { EXIT_CODES, getArg, hasArg } from './cli-utils.mjs';

/**
 * 解析 MCP 服务上下文。
 * @param {object} options
 * @param {string[]} [options.args] CLI 参数（支持 --root）
 * @param {{rootDir: string, config: object}|null} [options.fallback] 调用方已解析的上下文（如 harness mcp）
 * @returns {Promise<{rootDir: string, config: object, rootSource: 'explicit'|'auto'}>}
 */
export async function resolveServerContext({ args = [], fallback = null } = {}) {
  const flagRoot = getArg(args, '--root');
  const envRoot = process.env.HARNESS_ROOT;
  const explicit = flagRoot || envRoot;
  if (explicit) {
    const rootDir = resolve(explicit);
    if (!existsSync(rootDir) || !statSync(rootDir).isDirectory()) {
      throw new Error(`MCP root is not a directory: ${rootDir}${flagRoot ? ' (from --root)' : ' (from HARNESS_ROOT)'}`);
    }
    const { config } = await loadConfig({ rootDir });
    return { rootDir, config, rootSource: 'explicit' };
  }
  if (fallback) return { rootDir: fallback.rootDir, config: fallback.config, rootSource: 'auto' };
  const rootDir = resolveProjectRoot();
  const { config } = await loadConfig({ rootDir });
  return { rootDir, config, rootSource: 'auto' };
}

export function mcpServerHelp() {
  return `harness-mcp — pallastrade-harness stdio MCP server (zero-install)

Usage:
  npx -y -p pallastrade-harness harness-mcp [--root <dir>]

Options:
  --root <dir>      Project root to govern (default: --root > HARNESS_ROOT > cwd lookup)
  -h, --help        Show this help

Environment:
  HARNESS_ROOT      Fallback project root when --root is absent
`;
}

async function main() {
  const args = process.argv.slice(2);
  if (hasArg(args, '--help') || hasArg(args, '-h')) {
    process.stdout.write(mcpServerHelp());
    return;
  }
  try {
    const { runMcpStdio } = await import('./mcp.mjs');
    const context = await resolveServerContext({ args });
    runMcpStdio(context);
  } catch (error) {
    console.error(`❌ harness-mcp: ${error.message}`);
    process.exit(EXIT_CODES.USAGE_OR_CONFIG);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
