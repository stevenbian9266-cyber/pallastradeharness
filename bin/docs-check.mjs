import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { globSync } from 'glob';
import { EXIT_CODES } from './cli-utils.mjs';

const DEFAULT_SOURCES = [
  'AGENTS.md',
  'README.md',
  '**/AGENTS.md',
  '**/CLAUDE.md',
  'docs/**/*.{md,mdx}',
];

// HTH-011（F-06）：过时命令模式 → 防漂移检查（仅在 fenced code block 内匹配，
// 且跳过含警示词的块——那些是"不要这样做"的教学示例）。
const OUTDATED_PATTERNS = [
  {
    id: 'manual-verify-test-clear',
    pattern: /gate:clear[^\n]*--clear[^\n]*verify-test/g,
    message: '手工清除 verify-test 已被禁止（HTH-007）：verification 只能由 `harness evidence verify` 关闭',
  },
];
const WARN_MARKERS = ['过时用法', '已禁止', '已被移除', '已被禁止', 'outdated', 'deprecated', 'removed', '不要这样'];

/** 解析 fenced code blocks，对非警示块检查过时模式（警示词在块内或块前 3 行） */
function outdatedInFencedBlocks(content) {
  const outdated = [];
  const lines = content.split(/\r?\n/);
  for (const block of content.matchAll(/```[a-z]*\r?\n([\s\S]*?)```/g)) {
    const text = block[1];
    const blockStartLine = content.slice(0, block.index).split(/\r?\n/).length;
    const before = lines.slice(Math.max(0, blockStartLine - 4), blockStartLine - 1).join(' ');
    if (WARN_MARKERS.some(marker => text.includes(marker) || before.includes(marker))) continue;
    for (const rule of OUTDATED_PATTERNS) {
      for (const match of text.matchAll(rule.pattern)) {
        const line = blockStartLine + text.slice(0, match.index).split(/\r?\n/).length - 1;
        outdated.push({ rule: rule.id, message: rule.message, line });
      }
    }
  }
  return outdated;
}

function localTarget(raw) {
  let target = raw.trim().replace(/^<|>$/g, '');
  if (!target || /^(?:#|https?:|mailto:|tel:|data:)/i.test(target)) return null;
  target = target.split('#')[0].replace(/\s+["'][^"']*["']$/, '');
  if (!target || /[{}*]/.test(target)) return null;
  try { return decodeURIComponent(target); } catch { return target; }
}

export function checkDocs({ rootDir, sources = DEFAULT_SOURCES }) {
  const files = [...new Set(sources.flatMap(pattern => globSync(pattern, {
    cwd: rootDir,
    nodir: true,
    dot: true,
    ignore: ['**/node_modules/**', '**/.git/**', '**/.harness-cache/**'],
  })))].sort();
  const broken = [];
  const outdated = [];
  let links = 0;
  for (const file of files) {
    const content = readFileSync(resolve(rootDir, file), 'utf-8');
    for (const match of content.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = localTarget(match[1]);
      if (!target) continue;
      links++;
      const withoutLine = target.replace(/:\d+(?::\d+)?$/, '');
      const path = withoutLine.startsWith('/')
        ? resolve(rootDir, withoutLine.slice(1))
        : resolve(rootDir, dirname(file), withoutLine);
      if (!existsSync(path)) broken.push({ file, target, line: content.slice(0, match.index).split(/\r?\n/).length });
    }
    for (const item of outdatedInFencedBlocks(content)) {
      outdated.push({ file, ...item });
    }
  }
  return { files: files.length, links, broken, outdated };
}

export function runDocsCheck({ rootDir, args = [] }) {
  const result = checkDocs({ rootDir });
  if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else if (result.broken.length === 0 && result.outdated.length === 0) console.log(`✅ docs:check — ${result.files} document(s), ${result.links} local link(s), no broken targets, no outdated command examples.`);
  else {
    if (result.broken.length > 0) {
      console.error(`❌ docs:check — ${result.broken.length} broken local link(s):`);
      for (const item of result.broken) console.error(`  ${item.file}:${item.line} -> ${item.target}`);
    }
    if (result.outdated.length > 0) {
      console.error(`❌ docs:check — ${result.outdated.length} outdated command example(s):`);
      for (const item of result.outdated) console.error(`  ${item.file}:${item.line} [${item.rule}] ${item.message}`);
    }
  }
  if (result.broken.length > 0 || result.outdated.length > 0) process.exitCode = EXIT_CODES.POLICY_FAILURE;
  return result;
}
