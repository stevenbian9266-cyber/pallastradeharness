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
  }
  return { files: files.length, links, broken };
}

export function runDocsCheck({ rootDir, args = [] }) {
  const result = checkDocs({ rootDir });
  if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else if (result.broken.length === 0) console.log(`✅ docs:check — ${result.files} document(s), ${result.links} local link(s), no broken targets.`);
  else {
    console.error(`❌ docs:check — ${result.broken.length} broken local link(s):`);
    for (const item of result.broken) console.error(`  ${item.file}:${item.line} -> ${item.target}`);
  }
  if (result.broken.length > 0) process.exitCode = EXIT_CODES.POLICY_FAILURE;
  return result;
}
