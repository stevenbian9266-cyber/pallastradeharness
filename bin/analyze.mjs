#!/usr/bin/env node
/**
 * analyze.mjs — 代码库分析（brownfield 冷启动核心）
 *
 * 扫描现有代码库：推断技术栈 → 推断层结构 → 生成 harness.config.mjs 草案 →
 * 输出「规范差距报告」。让"有代码、没规范"的项目快速接入 harness。
 *
 * 用法：
 *   harness analyze                         # 人类可读报告（不写文件）
 *   harness analyze --write                 # 生成 harness.config.mjs（若不存在）
 *   harness analyze --format json           # 机器可读
 */
import { promises as fs, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const COMMON_LAYER_DIRS = ['src', 'app', 'lib', 'packages', 'apps', 'backend', 'frontend', 'storefront', 'api', 'web', 'services', 'test', 'tests', 'spec'];

function getArg(args, flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
}
function hasArg(args, flag) {
  return args.includes(flag);
}

/**
 * 技术栈推断：读取清单文件判断框架/语言
 */
export async function detectStack(rootDir) {
  const stack = { languages: [], frameworks: [], hints: [] };
  const pkgPath = resolve(rootDir, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      stack.languages.push('TypeScript/JavaScript');
      if (deps.next) { stack.frameworks.push('Next.js'); stack.hints.push('next.config.* 存在则验证'); }
      if (deps.react) stack.frameworks.push('React');
      if (deps.vue || deps.nuxt) stack.frameworks.push('Vue/Nuxt');
      if (deps.express) stack.frameworks.push('Express');
      if (deps['@testing-library/react'] || deps.vitest || deps.jest) stack.hints.push('测试框架已就绪');
    } catch { /* ignore */ }
  }
  if (existsSync(resolve(rootDir, 'Gemfile'))) {
    stack.languages.push('Ruby');
    try {
      const g = await fs.readFile(resolve(rootDir, 'Gemfile'), 'utf-8');
      if (/rails/i.test(g)) stack.frameworks.push('Rails');
    } catch { /* ignore */ }
  }
  if (existsSync(resolve(rootDir, 'pyproject.toml')) || existsSync(resolve(rootDir, 'requirements.txt'))) stack.languages.push('Python');
  if (existsSync(resolve(rootDir, 'go.mod'))) stack.languages.push('Go');
  if (stack.languages.length === 0) stack.hints.push('未识别语言清单（package.json/Gemfile/pyproject/go.mod 均缺失）');
  return stack;
}

/**
 * 层结构推断：扫描常见目录 + 分析目录内文件数
 */
export async function detectLayers(rootDir) {
  const layers = [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist' || e.name === '.next') continue;
    if (!COMMON_LAYER_DIRS.includes(e.name)) continue;
    const count = await countFiles(resolve(rootDir, e.name), 0, 2).catch(() => 0);
    if (count > 0) {
      layers.push({ id: e.name.replace(/[^a-z0-9]/gi, '-'), path: e.name, label: `${e.name}/ (${count}+ files)` });
    }
  }
  // 兜底：一个 app 目录都没有 → 单层默认
  if (layers.length === 0) {
    layers.push({ id: 'app', path: '.', label: 'root (flat project)' });
  }
  return layers;
}

async function countFiles(dir, depth, maxDepth) {
  if (depth > maxDepth) return 0;
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  let count = 0;
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist' || e.name === '.next') continue;
    if (e.isDirectory()) count += await countFiles(resolve(dir, e.name), depth + 1, maxDepth);
    else count += 1;
  }
  return count;
}

/**
 * 规范差距报告：项目缺什么 → 建议
 */
export async function detectGaps(rootDir) {
  const gaps = [];
  if (!existsSync(resolve(rootDir, 'harness.config.mjs')) && !existsSync(resolve(rootDir, 'harness', 'config.json'))) {
    gaps.push({ item: 'harness.config.mjs', severity: 'must', fix: 'npx harness analyze --write 或 npx harness init 生成' });
  }
  if (!existsSync(resolve(rootDir, 'AGENTS.md'))) {
    gaps.push({ item: 'AGENTS.md', severity: 'must', fix: 'harness init 生成（含 gate 流程）' });
  }
  if (!existsSync(resolve(rootDir, 'lefthook.yml'))) {
    gaps.push({ item: 'lefthook.yml', severity: 'must', fix: 'harness init 生成 + npm i -D lefthook && npx lefthook install' });
  }
  if (!existsSync(resolve(rootDir, '.github', 'copilot-instructions.md'))) {
    gaps.push({ item: 'copilot-instructions.md', severity: 'should', fix: 'harness init 生成（AI 强制规则）' });
  }
  if (!existsSync(resolve(rootDir, '.github', 'workflows'))) {
    gaps.push({ item: 'CI workflow (.github/workflows)', severity: 'should', fix: '添加 harness-full workflow（pre-commit 之外的 CI 兜底）' });
  }
  if (!existsSync(resolve(rootDir, 'harness', 'policies', 'anti-patterns.json'))) {
    gaps.push({ item: 'anti-patterns.json', severity: 'should', fix: '创建规则文件（可先用空 rules: []）' });
  }
  return gaps;
}

/**
 * 生成 harness.config.mjs 草案（analyze --write）
 */
function buildConfigDraft(name, stack, layers) {
  const hasModelRule = stack.frameworks.includes('Rails');
  const docImpactBlock = hasModelRule
    ? "    { codeGlob: /^app\\/models\\/.*\\.rb$/, docs: ['docs/README.md'], label: 'Model change' },"
    : '';
  const lines = [
    '// harness.config.mjs — 由 `harness analyze --write` 生成（草案，请 review）',
    `export default {`,
    `  name: ${JSON.stringify(name)},`,
    '',
    '  // ① 层定义（代码库分析推断）',
    `  layers: ${JSON.stringify(layers, null, 2).split('\n').join('\n  ').trim()},`,
    '',
    '  // ② gate（默认档位）',
    '  gates: {},',
    '',
    '  // ③ doc-impact 知识同步规则（改代码 → 必须同步的文档）',
    `  docImpact: { base: 'origin/main', rules: [\n${docImpactBlock}\n  ] },`,
    '',
    '  // ④ 扫描器规则文件',
    "  scanners: { antiPatterns: 'harness/policies/anti-patterns.json' },",
    '',
    '  // ⑤ 状态/产物路径',
    "  paths: { gates: 'harness/gates', requirements: 'harness/requirements', evidence: 'artifacts/harness-evidence', prd: 'docs/prd' },",
    '};\n',
  ];
  return lines.join('\n');
}

export async function run({ rootDir = process.cwd(), args = [] } = {}) {
  const write = hasArg(args, '--write');
  const json = getArg(args, '--format') === 'json';

  console.log('🔍 harness analyze — 代码库分析\n');
  const stack = await detectStack(rootDir);
  const layers = await detectLayers(rootDir);
  const gaps = await detectGaps(rootDir);

  const report = {
    stack,
    layers,
    gaps,
    suggestion: {
      preset: stack.frameworks.includes('Next.js') ? 'nextjs' : stack.frameworks.includes('Rails') ? 'rails' : layers.length > 2 ? 'monorepo' : 'single',
      tier: 'lite',
    },
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('── 技术栈 ─────────────────────────────');
    console.log(`  Languages:   ${stack.languages.join(', ') || '—'}`);
    console.log(`  Frameworks:  ${stack.frameworks.join(', ') || '—'}`);
    for (const h of stack.hints) console.log(`  ℹ️  ${h}`);

    console.log('\n── 层结构（gate 跨层搜索用）──────────────');
    for (const l of layers) console.log(`  - ${l.id}  →  ${l.path}  (${l.label})`);

    console.log('\n── 规范差距 ────────────────────────────');
    if (gaps.length === 0) {
      console.log('  ✅ 已具备完整 harness 接入（无需补充）');
    } else {
      for (const g of gaps) {
        console.log(`  ${g.severity === 'must' ? '❌' : '⚠️'}  ${g.item}`);
        console.log(`     → ${g.fix}`);
      }
    }

    console.log('\n── 建议 ────────────────────────────────');
    console.log(`  npx harness init --preset ${report.suggestion.preset} --tier ${report.suggestion.tier}`);
    console.log('  （或先 `npx harness analyze --write` 生成配置草案，再手动完善）\n');
  }

  // --write：生成配置草案（仅当不存在）
  if (write) {
    const cfgPath = resolve(rootDir, 'harness.config.mjs');
    if (existsSync(cfgPath)) {
      console.log(`⏭  ${cfgPath} already exists — skip.`);
    } else {
      const name = rootDir.split(/[\\/]/).pop() || 'my-project';
      await fs.writeFile(cfgPath, buildConfigDraft(name, stack, layers), 'utf-8');
      console.log(`✅ 生成配置草案: ${cfgPath}（请 review 后使用）`);
    }
  }
}
