#!/usr/bin/env node
/**
 * glob-utils.mjs — 命令 glob 展开工具（verifier/evidence 共用，避免循环依赖）
 *
 * Windows 无 shell glob 展开；这里用 minimatch 把命令参数中的 glob 段
 * 展开为实际文件列表（跳过 node_modules/.git 等目录）。
 */
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { minimatch } from 'minimatch';

export const IGNORED_DIRS = new Set(['node_modules', '.git', '.harness-state', '.harness-cache', 'artifacts', 'coverage', 'dist', '.next', 'build']);

/** 递归收集匹配 glob 的文件（绝对路径，UTF-8 码点排序） */
export function collectGlob(rootDir, pattern) {
  const results = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const abs = join(dir, entry.name);
      const rel = relative(rootDir, abs).replaceAll('\\', '/');
      if (entry.isDirectory()) stack.push(abs);
      else if (minimatch(rel, pattern, { dot: true })) results.push(abs);
    }
  }
  return results.sort();
}

/** 展开命令参数中的 glob 段为实际文件列表（无匹配则保留原参数） */
export function expandCommandArgs(rootDir, command) {
  const out = [];
  for (const arg of command || []) {
    if (/[*?[\]]/.test(arg)) {
      const matched = collectGlob(rootDir, arg);
      if (matched.length > 0) { out.push(...matched); continue; }
    }
    out.push(arg);
  }
  return out;
}
