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
import { loadConfig, resolveProjectRoot, DEFAULT_CONFIG } from './config-loader.mjs';
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
  return `harness-mcp — pallastrade-harness MCP server (stdio | http)

Usage:
  npx -y -p pallastrade-harness harness-mcp [--root <dir>]
  node bin/mcp-server.mjs --http [--port 3110] [--host 127.0.0.1] [--db /data/harness-cloud.db]

Options:
  --root <dir>      stdio mode: project root to govern (--root > HARNESS_ROOT > cwd lookup)
  --http            HTTP mode: Cloud runtime (Streamable HTTP v0); see deploy/README.md
  --port <n>        HTTP mode listen port (default: PORT env or 3110)
  --host <addr>     HTTP mode bind address (default: 127.0.0.1)
  --db <path>       HTTP mode SQLite file (default: HARNESS_CLOUD_DB or $DATA_DIR/harness-cloud.db)
  -h, --help        Show this help

Environment:
  HARNESS_ROOT      Fallback project root when --root is absent (stdio mode)
  HARNESS_API_KEY   REQUIRED in --http mode (server refuses to start without it)
  PORT / DATA_DIR   HTTP mode port and data directory (container default: /data)
`;
}

/**
 * 启动 HTTP 模式（复用 Cloud 运行时；不新造服务实现）。
 * 失败即抛错（缺 Key / 无 node:sqlite / DB 不可写）——服务不进入“半开”状态。
 * @param {object} [options]
 * @param {string[]} [options.args] CLI 参数（--port / --host / --db）
 * @param {object} [options.env] 环境变量（默认 process.env；测试可注入）
 */
export async function startHttpService({ args = [], env = process.env } = {}) {
  const apiKey = String(env.HARNESS_API_KEY ?? '').trim();
  if (!apiKey) throw new Error('HARNESS_API_KEY is required in --http mode (set it in deploy/.env.mcp)');
  const port = Number(getArg(args, '--port') || env.PORT || 3110);
  const host = getArg(args, '--host') || '127.0.0.1';
  const dataDir = env.DATA_DIR || process.cwd();
  const dbFile = getArg(args, '--db') || env.HARNESS_CLOUD_DB || resolve(dataDir, 'harness-cloud.db');

  const { DatabaseSync } = await import('node:sqlite').catch(() => ({}));
  if (!DatabaseSync) {
    throw new Error('node:sqlite unavailable — HTTP mode needs Node >= 22.5 (>= 23.4 without --experimental-sqlite)');
  }
  const { openHarnessDatabaseSync } = await import('./sqlite-store.mjs');
  const db = openHarnessDatabaseSync({ file: dbFile, DatabaseSync });
  const config = env.HARNESS_ROOT
    ? (await loadConfig({ rootDir: resolve(env.HARNESS_ROOT) })).config
    : structuredClone(DEFAULT_CONFIG);
  const { startCloudRuntime } = await import('./cloud-runtime.mjs');
  const started = await startCloudRuntime({ db, config, env, port, host });
  return { ...started, db, dbFile };
}

async function main() {
  const args = process.argv.slice(2);
  if (hasArg(args, '--help') || hasArg(args, '-h')) {
    process.stdout.write(mcpServerHelp());
    return;
  }
  try {
    if (hasArg(args, '--http')) {
      const service = await startHttpService({ args });
      console.log(`harness-mcp (http) listening on ${service.url}`);
      console.log(`  db: ${service.dbFile} | strictGovernance: ${service.runtime.strictGovernance} | auth: HARNESS_API_KEY`);
      const shutdown = async () => {
        await service.close();
        try { service.db.close(); } catch { /* already closed */ }
        process.exit(0);
      };
      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
      return;
    }
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
