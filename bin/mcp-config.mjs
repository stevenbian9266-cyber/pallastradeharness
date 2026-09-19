/**
 * mcp-config.mjs — MCP 客户端接入配置生成器（RFC-0004 Phase 1 收尾）
 *
 * CLI：harness mcp:config --target <vscode|cursor|claude-code|claude-desktop|codex|all>
 *      [--write] [--json] [--spec <pkg@ver>]
 *
 * 约定：
 *   - 启动命令统一为 `npx -y -p <spec> harness-mcp [--root <dir>]`（消除 npx 多 bin 歧义）
 *   - 默认 pin 包版本（供应链缓解 T-MCP-08）
 *   - 项目内文件可 --write；用户级/无变量客户端（claude-desktop/codex）仅打印片段
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { atomicWriteText } from './state-store.mjs';
import { EXIT_CODES, getArg, hasArg } from './cli-utils.mjs';
import { getHarnessPackageSpec } from './version.mjs';

export const MCP_CONFIG_TARGETS = Object.freeze(['vscode', 'cursor', 'claude-code', 'claude-desktop', 'codex']);
// A03：默认 spec 由 package.json 版本推导（name@major.minor），消除硬编码漂移
export const DEFAULT_PACKAGE_SPEC = getHarnessPackageSpec();
export const SERVER_KEY = 'pallastrade-harness';
export const WORKSPACE_ROOT_TOKEN = '${workspaceFolder}';

function serverArgs(spec, root) {
  return ['-y', '-p', spec, 'harness-mcp', ...(root ? ['--root', root] : [])];
}

function normalizedAbsolute(rootDir) {
  return resolve(rootDir).replaceAll('\\', '/');
}

/**
 * 构造单个目标的配置产物（纯函数）。
 * @returns {{ target: string, path: string|null, content: string, notes: string[] }}
 */
export function buildMcpConfig({ target, rootDir, packageSpec = DEFAULT_PACKAGE_SPEC }) {
  if (!MCP_CONFIG_TARGETS.includes(target)) {
    throw new TypeError(`Unknown MCP config target: ${target} (available: ${MCP_CONFIG_TARGETS.join(', ')})`);
  }
  const spec = String(packageSpec || DEFAULT_PACKAGE_SPEC);

  if (target === 'vscode') {
    const content = {
      servers: {
        [SERVER_KEY]: { type: 'stdio', command: 'npx', args: serverArgs(spec, WORKSPACE_ROOT_TOKEN) },
      },
    };
    return {
      target,
      path: '.vscode/mcp.json',
      content: `${JSON.stringify(content, null, 2)}\n`,
      notes: ['可提交到仓库全员共享；${workspaceFolder} 由 VS Code 展开为本机路径'],
    };
  }

  if (target === 'cursor') {
    const content = {
      mcpServers: {
        [SERVER_KEY]: { command: 'npx', args: serverArgs(spec, WORKSPACE_ROOT_TOKEN) },
      },
    };
    return {
      target,
      path: '.cursor/mcp.json',
      content: `${JSON.stringify(content, null, 2)}\n`,
      notes: ['可提交到仓库；${workspaceFolder} 由 Cursor 展开为本机路径'],
    };
  }

  if (target === 'claude-code') {
    const content = {
      mcpServers: {
        [SERVER_KEY]: { command: 'npx', args: serverArgs(spec, null) },
      },
    };
    return {
      target,
      path: '.mcp.json',
      content: `${JSON.stringify(content, null, 2)}\n`,
      notes: ['Claude Code 以项目根为 cwd 启动服务；cwd 不可靠时可设 HARNESS_ROOT 环境变量'],
    };
  }

  if (target === 'claude-desktop') {
    const absolute = normalizedAbsolute(rootDir);
    const content = {
      mcpServers: {
        [SERVER_KEY]: { command: 'npx', args: serverArgs(spec, absolute), env: { HARNESS_ROOT: absolute } },
      },
    };
    return {
      target,
      path: null,
      content: `${JSON.stringify(content, null, 2)}\n`,
      notes: ['用户级配置（claude_desktop_config.json），请手动合并到 mcpServers；含绝对路径，项目移动后需重新生成'],
    };
  }

  // codex
  const absolute = normalizedAbsolute(rootDir);
  const argsToml = ['-y', '-p', spec, 'harness-mcp', '--root', absolute].map(value => JSON.stringify(value)).join(', ');
  return {
    target: 'codex',
    path: null,
    content: `[mcp_servers.${SERVER_KEY}]\ncommand = "npx"\nargs = [${argsToml}]\n`,
    notes: ['Codex CLI config.toml 片段；请与 Codex 官方文档核对键名后手动合并'],
  };
}

/**
 * 生成 + 可选写盘。仅项目内目标（path 非 null）允许写入；用户级目标返回 writeSkipped。
 */
export function generateMcpConfig({ rootDir, target, write = false, packageSpec = DEFAULT_PACKAGE_SPEC }) {
  const built = buildMcpConfig({ target, rootDir, packageSpec });
  const writable = Boolean(write && built.path);
  if (writable) {
    const absolutePath = resolve(rootDir, built.path);
    mkdirSync(dirname(absolutePath), { recursive: true });
    atomicWriteText(absolutePath, built.content);
  }
  return { ...built, written: writable, writeSkipped: Boolean(write && !built.path) };
}

/** CLI：harness mcp:config */
export function runMcpConfig({ rootDir, args = [] }) {
  const json = hasArg(args, '--json');
  const write = hasArg(args, '--write');
  const targetArg = getArg(args, '--target');
  const spec = getArg(args, '--spec') || DEFAULT_PACKAGE_SPEC;

  if (!targetArg) {
    console.error(`Usage: harness mcp:config --target <${MCP_CONFIG_TARGETS.join('|')}|all> [--write] [--json] [--spec <pkg@ver>]`);
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return;
  }

  const targets = targetArg === 'all' ? [...MCP_CONFIG_TARGETS] : [targetArg];
  let results;
  try {
    results = targets.map(target => generateMcpConfig({ rootDir, target, write, packageSpec: spec }));
  } catch (error) {
    console.error(`❌ mcp:config: ${error.message}`);
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return;
  }

  if (json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  for (const result of results) {
    const location = result.path
      ? `${result.path}${result.written ? ' (written)' : ' (dry-run — add --write to save)'}`
      : '(print-only — merge manually into the user-level config)';
    console.log(`📄 ${result.target} → ${location}`);
    for (const note of result.notes) console.log(`   note: ${note}`);
    console.log(result.content.trimEnd());
    console.log('');
  }
}
