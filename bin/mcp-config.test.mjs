import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildMcpConfig, DEFAULT_PACKAGE_SPEC, generateMcpConfig, MCP_CONFIG_TARGETS, SERVER_KEY, WORKSPACE_ROOT_TOKEN } from './mcp-config.mjs';

const CLI = fileURLToPath(new URL('./harness.mjs', import.meta.url));

function project() {
  return mkdtempSync(join(tmpdir(), 'harness-mcp-config-'));
}

test('buildMcpConfig: vscode/cursor use ${workspaceFolder} and parse as JSON', () => {
  const rootDir = project();
  try {
    const vscode = buildMcpConfig({ target: 'vscode', rootDir });
    assert.equal(vscode.path, '.vscode/mcp.json');
    const vscodeConfig = JSON.parse(vscode.content);
    assert.equal(vscodeConfig.servers[SERVER_KEY].type, 'stdio');
    assert.ok(vscodeConfig.servers[SERVER_KEY].args.includes(WORKSPACE_ROOT_TOKEN));
    assert.ok(vscodeConfig.servers[SERVER_KEY].args.includes(DEFAULT_PACKAGE_SPEC));

    const cursor = buildMcpConfig({ target: 'cursor', rootDir });
    assert.equal(cursor.path, '.cursor/mcp.json');
    const cursorConfig = JSON.parse(cursor.content);
    assert.ok(cursorConfig.mcpServers[SERVER_KEY].args.includes(WORKSPACE_ROOT_TOKEN));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('buildMcpConfig: claude-code relies on cwd; claude-desktop bakes absolute root + HARNESS_ROOT', () => {
  const rootDir = project();
  try {
    const claudeCode = buildMcpConfig({ target: 'claude-code', rootDir });
    assert.equal(claudeCode.path, '.mcp.json');
    const claudeCodeConfig = JSON.parse(claudeCode.content);
    assert.equal(claudeCodeConfig.mcpServers[SERVER_KEY].args.includes('--root'), false);

    const desktop = buildMcpConfig({ target: 'claude-desktop', rootDir });
    assert.equal(desktop.path, null);
    const desktopConfig = JSON.parse(desktop.content);
    const expectedRoot = join(rootDir).replaceAll('\\', '/');
    assert.ok(desktopConfig.mcpServers[SERVER_KEY].args.includes(expectedRoot));
    assert.equal(desktopConfig.mcpServers[SERVER_KEY].env.HARNESS_ROOT, expectedRoot);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('buildMcpConfig: codex emits a TOML snippet with the pinned spec and absolute root', () => {
  const rootDir = project();
  try {
    const codex = buildMcpConfig({ target: 'codex', rootDir });
    assert.equal(codex.path, null);
    assert.ok(codex.content.startsWith(`[mcp_servers.${SERVER_KEY}]`));
    assert.ok(codex.content.includes(DEFAULT_PACKAGE_SPEC));
    assert.ok(codex.content.includes(join(rootDir).replaceAll('\\', '/')));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('buildMcpConfig: default spec is pinned and --spec overrides it', () => {
  const rootDir = project();
  try {
    assert.ok(DEFAULT_PACKAGE_SPEC.includes('@1.10'));
    const custom = buildMcpConfig({ target: 'vscode', rootDir, packageSpec: 'pallastrade-harness@2.0.0' });
    assert.ok(custom.content.includes('pallastrade-harness@2.0.0'));
    assert.throws(() => buildMcpConfig({ target: 'nope', rootDir }), /Unknown MCP config target/);
    assert.equal(MCP_CONFIG_TARGETS.length, 5);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('generateMcpConfig: --write saves project files idempotently; print-only targets are skipped', () => {
  const rootDir = project();
  try {
    const first = generateMcpConfig({ rootDir, target: 'vscode', write: true });
    assert.equal(first.written, true);
    const file = join(rootDir, '.vscode', 'mcp.json');
    assert.ok(existsSync(file));
    const contentA = readFileSync(file, 'utf-8');
    assert.ok(JSON.parse(contentA).servers[SERVER_KEY]);

    const second = generateMcpConfig({ rootDir, target: 'vscode', write: true });
    assert.equal(second.written, true);
    assert.equal(readFileSync(file, 'utf-8'), contentA, 'generation must be idempotent');

    const desktop = generateMcpConfig({ rootDir, target: 'claude-desktop', write: true });
    assert.equal(desktop.written, false);
    assert.equal(desktop.writeSkipped, true);
    assert.equal(existsSync(join(rootDir, 'claude_desktop_config.json')), false);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('CLI: mcp:config --json prints structured results and --write saves the file', () => {
  const rootDir = project();
  try {
    const dryRun = spawnSync(process.execPath, [CLI, 'mcp:config', '--target', 'vscode', '--json'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(dryRun.status, 0);
    const parsed = JSON.parse(dryRun.stdout);
    assert.equal(parsed[0].path, '.vscode/mcp.json');
    assert.equal(parsed[0].written, false);
    assert.equal(existsSync(join(rootDir, '.vscode', 'mcp.json')), false);

    const written = spawnSync(process.execPath, [CLI, 'mcp:config', '--target', 'vscode', '--write', '--json'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(written.status, 0);
    assert.equal(JSON.parse(written.stdout)[0].written, true);
    assert.ok(existsSync(join(rootDir, '.vscode', 'mcp.json')));

    const all = spawnSync(process.execPath, [CLI, 'mcp:config', '--target', 'all', '--json'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(all.status, 0);
    assert.equal(JSON.parse(all.stdout).length, 5);

    const invalid = spawnSync(process.execPath, [CLI, 'mcp:config', '--target', 'nope'], { cwd: rootDir, encoding: 'utf-8' });
    assert.equal(invalid.status, 2);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
