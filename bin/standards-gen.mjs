#!/usr/bin/env node
/**
 * standards-gen.mjs — Auto-Standards（能力 A）
 *
 * 让"有代码、没规范"的项目快速建立机器可读规范：
 *   harness standards gap        确定性分析：项目代码领域 vs 规范覆盖缺口
 *   harness standards validate   校验项目 standards 文件（schema + 加载冒烟）
 *   harness standards generate   生成规范起草包（骨架 + 安装 standards-audit skill + 下一步指引）
 *
 * 设计原则：引擎不调用 LLM。generate 生成"AI 起草任务包 + 方法论 skill"，
 * 由 AI 补全内容，人确认后写回。generate 是 dry-run 优先，写回前自动备份。
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'glob';
import { EXIT_CODES, getArg, hasArg } from './cli-utils.mjs';
import { loadStandards, standardsCoverage } from './standards.mjs';
import { validateContract, STANDARD_CATEGORIES } from './contracts.mjs';
import { atomicWriteText } from './state-store.mjs';
import { detectStack, detectLayers } from './analyze.mjs';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLED_SKILLS = resolve(PACKAGE_ROOT, 'skills');

// ── 领域 → 代码路径信号（用于 gap 分析：项目里有哪些领域代码）──
const DOMAIN_SIGNALS = [
  { id: 'architecture',    label: '架构',       signals: ['app/services', 'app/domain', 'src/services', 'src/lib', 'packages/*/src'] },
  { id: 'technology-selection', label: '技术选型', signals: ['package.json', 'Gemfile', 'pyproject.toml', 'go.mod', 'requirements.txt'] },
  { id: 'code-quality',    label: '代码质量',   signals: ['src', 'app', 'lib', 'packages'] },
  { id: 'database',        label: '数据库',     signals: ['db/migrate', 'migrations', 'prisma', 'schema.rb', '**/models/*.rb', '**/models/**/*.py'] },
  { id: 'api',             label: '接口',       signals: ['app/controllers', '**/routes/*', 'src/app/api', '**/api/**/route.ts', '**/api/**/*.rb'] },
  { id: 'security',        label: '安全',       signals: ['app/models/user', '**/auth', '**/security', '**/permissions', '**/middleware/auth'] },
  { id: 'ui-style',        label: 'UI 样式',    signals: ['**/*.css', '**/*.scss', '**/*.tsx', '**/*.jsx', '**/*.vue', 'tailwind.config.*'] },
  { id: 'interaction',     label: '交互',       signals: ['**/components', '**/*.tsx', '**/*.jsx', '**/*.vue'] },
  { id: 'accessibility',   label: '无障碍',     signals: ['**/*.tsx', '**/*.jsx', '**/*.vue', '**/*.html'] },
  { id: 'testing',         label: '测试',       signals: ['**/*.test.*', '**/*.spec.*', '**/test/**', '**/tests/**', '**/spec/**'] },
  { id: 'documentation',   label: '文档',       signals: ['README.md', 'docs/**', '**/*.md'] },
  { id: 'knowledge',       label: '知识',       signals: ['AGENTS.md', 'CLAUDE.md', 'ai/skills/**', '.github/copilot-instructions.md'] },
  { id: 'deployment',      label: '部署',       signals: ['Dockerfile', 'docker-compose*', '.github/workflows/**', 'k8s/**', '**/Dockerfile'] },
];

function hasAny(rootDir, patterns) {
  // 用 glob 匹配（相对 rootDir），命中即 true；忽略 node_modules/.next/dist 等
  for (const pattern of patterns) {
    const matches = globSync(pattern, { cwd: rootDir, nodir: true, dot: true, ignore: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/.git/**', '**/vendor/**'], windowsPathsNoEscape: true });
    if (matches.length > 0) return true;
  }
  return false;
}

/**
 * buildGapReport — 领域代码存在性 vs 规范覆盖缺口（可复用数据函数，供 CLI/MCP）
 */
export function buildGapReport({ rootDir, config }) {
  const { standards, sources, errors } = loadStandards({ rootDir, config });
  const coverage = standardsCoverage(standards);
  const byCategory = coverage.byCategory || {};

  const rows = [];
  for (const domain of DOMAIN_SIGNALS) {
    const hasCode = hasAny(rootDir, domain.signals);
    const cat = byCategory[domain.id];
    const covered = Boolean(cat && cat.total > 0);
    rows.push({
      category: domain.id,
      label: domain.label,
      hasCode,
      covered,
      total: cat?.total || 0,
      verified: cat?.verified || 0,
      status: hasCode && !covered ? 'gap' : hasCode ? 'covered' : 'n/a',
    });
  }

  const gaps = rows.filter(r => r.status === 'gap');
  return { gaps, rows, sources, errors, summary: { total: rows.length, gap: gaps.length } };
}

/**
 * standards gap — 领域代码存在性 vs 规范覆盖缺口
 */
export async function runGap({ rootDir, config, args }) {
  const json = getArg(args, '--format') === 'json';
  const { gaps, rows, sources, errors, summary } = buildGapReport({ rootDir, config });
  if (json) {
    console.log(JSON.stringify({ gaps, rows, sources, errors, summary }, null, 2));
  } else {
    console.log('📋 standards gap — 领域代码 vs 规范覆盖\n');
    for (const r of rows) {
      if (r.status === 'n/a') continue;
      const mark = r.status === 'gap' ? '⚠️' : '✅';
      console.log(`  ${mark} ${r.category.padEnd(22)} code=${r.hasCode ? 'yes' : 'no '.padEnd(3)} covered=${r.covered ? `yes (${r.total})` : 'NO'}`);
    }
    console.log(`\n  缺口: ${gaps.length}/${rows.length} 个领域有代码但无规范`);
    if (gaps.length > 0) {
      console.log(`  下一步: npx harness standards generate [--domains ${gaps.slice(0, 4).map(g => g.category).join(',')}]`);
    }
    if (errors.length > 0) {
      console.error(`\n⚠️ 规范加载警告:`);
      for (const e of errors) console.error(`  ${e}`);
    }
  }
  process.exitCode = gaps.length > 0 ? EXIT_CODES.OK : EXIT_CODES.OK;
}

/**
 * standards validate — 校验项目 standards 文件
 */
export async function runValidate({ rootDir, config, args }) {
  const json = getArg(args, '--format') === 'json';
  const { standards, sources, errors } = loadStandards({ rootDir, config });

  // 逐文件重新校验（loadStandards 已做加载时校验；这里再给文件级报告）
  const fileResults = [];
  for (const source of sources) {
    const local = new URL(`file://${source.replace(/\\/g, '/')}`).pathname;
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(source, 'utf-8'));
    } catch (e) {
      fileResults.push({ file: source, ok: false, errors: [`JSON 解析失败: ${e.message}`], count: 0 });
      continue;
    }
    const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.standards) ? parsed.standards : []);
    const fileErrors = [];
    for (const s of list) {
      const missing = validateContract('Standard', s);
      if (missing.length > 0) fileErrors.push(`${s.id || '?'}: ${missing.join('; ')}`);
    }
    fileResults.push({ file: source, ok: fileErrors.length === 0, errors: fileErrors, count: list.length });
  }

  if (json) {
    console.log(JSON.stringify({ ok: errors.length === 0 && fileResults.every(r => r.ok), sources, fileResults, loadErrors: errors, total: standards.length }, null, 2));
  } else {
    console.log('🔍 standards validate — 规范文件校验\n');
    for (const fr of fileResults) {
      console.log(`  ${fr.ok ? '✅' : '❌'} ${fr.file.replace(rootDir + '/', '')} (${fr.count} 条)`);
      for (const e of fr.errors.slice(0, 5)) console.log(`     ↳ ${e}`);
    }
    if (errors.length > 0) {
      console.log(`\n⚠️ 加载错误（可能影响 coverage/supervisor）:`);
      for (const e of errors) console.log(`  ❌ ${e}`);
    }
    console.log(`\n  合计 ${standards.length} 条规范（bundled + project）`);
  }
  process.exitCode = errors.length === 0 && fileResults.every(r => r.ok) ? EXIT_CODES.OK : EXIT_CODES.USAGE_OR_CONFIG;
}

/**
 * standards generate — 生成规范起草包（dry-run 优先，写回自动备份）
 */
export async function runGenerate({ rootDir, config, args }) {
  const dryRun = hasArg(args, '--dry-run') || !hasArg(args, '--write');
  const requestedDomains = (getArg(args, '--domains') || '').split(',').map(s => s.trim()).filter(Boolean);
  const json = getArg(args, '--format') === 'json';

  const stack = await detectStack(rootDir);
  const layers = await detectLayers(rootDir);
  const { standards, sources } = loadStandards({ rootDir, config });
  const coverage = standardsCoverage(standards);
  const byCategory = coverage.byCategory || {};

  // 目标规范文件：从 config.standards.sources 推导；无则用 harness/standards/<name>.json
  const projectName = config.name || rootDir.split(/[\\/]/).pop() || 'my-project';
  let standardsFile = null;
  for (const pattern of config.standards?.sources || []) {
    if (pattern.includes('*')) continue;
    standardsFile = resolve(rootDir, pattern);
    break;
  }
  if (!standardsFile) standardsFile = resolve(rootDir, 'harness', 'standards', `${projectName}.json`);

  // 计算缺口领域（有代码但无规范）
  const gapDomains = DOMAIN_SIGNALS
    .filter(d => (requestedDomains.length === 0 || requestedDomains.includes(d.id)) && hasAny(rootDir, d.signals))
    .filter(d => !(byCategory[d.id] && byCategory[d.id].total > 0))
    .map(d => d.id);

  const writes = [];

  // 1) 规范骨架
  const existingStandards = existsSync(standardsFile) ? JSON.parse(readFileSync(standardsFile, 'utf-8')) : null;
  if (!existingStandards) {
    const skeleton = {
      schemaVersion: '1.0',
      // draft: 由 AI 按 harness-standards-audit skill 补全后，删除本注释字段
      draft: true,
      generatedAt: new Date().toISOString(),
      project: projectName,
      stack: { languages: stack.languages, frameworks: stack.frameworks },
      standards: gapDomains.map(cat => ({
        schemaVersion: '1.0',
        type: 'Standard',
        id: `STD-${projectName.toUpperCase().replace(/[^A-Z0-9]/g, '-')}-${cat.toUpperCase().slice(0, 4)}-001`,
        category: cat,
        title: `TODO: ${cat} 规范标题`,
        authority: { file: 'AGENTS.md', section: 'TODO: 权威章节' },
        scope: ['TODO: 匹配文件 glob'],
        severity: 'warning',
        enforcement: { level: 'advisory', type: 'review' },
        evidence: [],
        fix: 'TODO: 违规修复指引',
        exception: { allowed: true, requiresReason: true },
        knowledgeImpact: [],
      })),
    };
    writes.push({ path: standardsFile, content: JSON.stringify(skeleton, null, 2) });
  }

  // 2) 安装 standards-audit skill（随包分发 → 项目 ai/skills/）
  const skillSrc = resolve(BUNDLED_SKILLS, 'harness-standards-audit', 'SKILL.md');
  const skillDst = resolve(rootDir, 'ai', 'skills', 'harness-standards-audit', 'SKILL.md');
  if (existsSync(skillSrc) && !existsSync(skillDst)) {
    writes.push({ path: skillDst, content: readFileSync(skillSrc, 'utf-8') });
  }

  // 3) 起草任务包（给 AI 的指令清单）
  const taskNotePath = resolve(rootDir, 'harness', 'standards', 'GENERATE-NOTES.md');
  const notes = [
    `# standards generate 起草任务包（${new Date().toISOString().slice(0, 10)}）`,
    '',
    `项目: ${projectName}  技术栈: ${stack.languages.join(', ') || '未知'}  ${stack.frameworks.join(', ') || ''}`,
    `规范文件: ${standardsFile.replace(rootDir + '/', '')}`,
    `缺口领域: ${gapDomains.length ? gapDomains.join(', ') : '（无）'}`,
    '',
    '## AI 起草指引',
    '1. 阅读 `ai/skills/harness-standards-audit/SKILL.md` 方法论',
    '2. 对每个缺口领域：读代表性业务代码 → 按 Standard schema 填写',
    '3. 必须填: id/category/title/authority(真实文件+章节)/scope(真实glob)/severity/enforcement(如实标注)',
    '4. enforcement 标 deterministic 时必须有 verifier，否则标 advisory/review-required',
    '5. 完成后运行: npx harness standards validate && npx harness standards coverage',
    '6. 人确认后删除 draft 字段并提交',
    '',
  ];
  writes.push({ path: taskNotePath, content: notes.join('\n') });

  // 备份（非 dry-run 且有既有文件）
  const backups = [];
  if (!dryRun) {
    for (const w of writes) {
      if (existsSync(w.path)) {
        const backupPath = `${w.path}.bak-${Date.now()}`;
        copyFileSync(w.path, backupPath);
        backups.push(backupPath);
      }
      mkdirSync(dirname(w.path), { recursive: true });
      if (w.content !== readFileSafe(w.path)) writeFileSync(w.path, w.content, 'utf-8');
    }
  }

  if (json) {
    console.log(JSON.stringify({ dryRun, projectName, standardsFile, gapDomains, writes: writes.map(w => w.path.replace(rootDir + '/', '')), backups, existing: Boolean(existingStandards) }, null, 2));
  } else {
    console.log('📝 standards generate — 规范起草包\n');
    console.log(`  项目: ${projectName}`);
    console.log(`  缺口领域: ${gapDomains.length ? gapDomains.join(', ') : '（无，全部已覆盖）'}`);
    console.log(`  规范文件: ${standardsFile.replace(rootDir + '/', '')}${existingStandards ? '（已存在，跳过）' : '（新建骨架）'}`);
    console.log('\n  将生成/写入:');
    for (const w of writes) console.log(`    ${dryRun ? '○' : '✓'} ${w.path.replace(rootDir + '/', '')}`);
    if (backups.length) console.log(`\n  备份: ${backups.join(', ')}`);
    console.log(dryRun ? '\n  (dry-run — 加 --write 写入)' : '\n  ✅ 已写入');
    console.log('\n  下一步:');
    console.log('    1. AI 读 GENERATE-NOTES.md + standards-audit skill 补全规范');
    console.log('    2. npx harness standards validate');
    console.log('    3. npx harness standards coverage');
  }
  process.exitCode = EXIT_CODES.OK;
}

function readFileSafe(path) {
  try { return readFileSync(path, 'utf-8'); } catch { return null; }
}

export async function run({ rootDir = process.cwd(), args = [], config = {} } = {}) {
  const sub = args[1] || 'gap';
  if (sub === 'gap') return runGap({ rootDir, config, args });
  if (sub === 'validate') return runValidate({ rootDir, config, args });
  if (sub === 'generate') return runGenerate({ rootDir, config, args });
  console.error(`Unknown standards subcommand: ${sub}`);
  console.error('Usage: harness standards gap|validate|generate [--domains ...] [--write] [--format json]');
  process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
}
