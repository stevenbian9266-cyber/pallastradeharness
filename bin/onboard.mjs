#!/usr/bin/env node
/**
 * onboard.mjs — 冷启动（P4）：让"从 0 / 存量项目"一键接入 harness
 *
 *   harness onboard [--write] [--preset auto|nextjs|rails|single|monorepo] [--tier lite|standard|strict]
 *
 * 流程（确定性部分，AI 内容起草为 dry-run 指引）：
 *   1. 识别项目（stack / layers / commands）
 *   2. 生成 harness.config.mjs（若缺）
 *   3. 生成 harness/policies/anti-patterns.json（若缺）
 *   4. 安装通用 skills（standards-audit / skill-author / prd / docs）
 *   5. 安装 PRD 模板 docs/prd/_TEMPLATE.md
 *   6. 生成规范骨架 harness/standards/<name>.json
 *   7. 输出接入仪表盘（剩余人工/AI 步骤）
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXIT_CODES, getArg, hasArg } from './cli-utils.mjs';
import { detectStack, detectLayers, detectGaps } from './analyze.mjs';
import { atomicWriteText } from './state-store.mjs';
import { registerInIndexes } from './skill.mjs';
import { loadCatalog, detectFingerprint, buildExpected, createMissingSkills } from './skill-audit.mjs';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLED_SKILLS = resolve(PACKAGE_ROOT, 'skills');
const BUNDLED_TEMPLATES = resolve(PACKAGE_ROOT, 'templates', 'prd');

const BUILTIN_SKILLS = ['harness-standards-audit', 'harness-skill-author', 'harness-prd', 'harness-docs'];
// 注意：每条规则必须带 fileGlob/excludeGlob——扫描器以 fileGlob 做 globSync，
// 缺失会导致 "The 'patterns' argument must be of type string" 报错、pre-commit 必失败。
const BUILTIN_ANTI_PATTERNS = {
  rules: [
    { id: 'AP-001', severity: 'warning', pattern: 'color:\\s*#[0-9a-fA-F]{3,6}', fileGlob: '**/*.{tsx,jsx,css}', excludeGlob: '**/node_modules/**|**/dist/**|**/.next/**|**/*.test.*|**/*.spec.*', message: '硬编码颜色值 — 使用设计 token', fix: '改用 CSS 变量 / 设计系统 token' },
    { id: 'AP-002', severity: 'warning', pattern: 'fetch\\(', fileGlob: '**/*.{ts,tsx,js,jsx}', excludeGlob: '**/node_modules/**|**/dist/**|**/.next/**', message: '裸 fetch 未封装 — 走统一请求层', fix: '封装为 API client / SDK' },
    { id: 'AP-003', severity: 'warning', pattern: 'style=\\s*\\{[^}]*\\}', fileGlob: '**/*.{tsx,jsx}', excludeGlob: '**/node_modules/**|**/dist/**|**/.next/**|**/*.test.*|**/*.spec.*', message: '内联样式 — 使用 CSS 类', fix: '用 className / 样式系统' },
  ],
  severity: 'warning',
};

function projectName(rootDir) {
  // 优先取 package.json 的 name（更稳定），否则回退目录名
  try {
    const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf-8'));
    if (pkg && pkg.name) return String(pkg.name).replace(/[^a-zA-Z0-9._-]/g, '-');
  } catch { /* 非 node 项目 */ }
  return rootDir.split(/[\\/]/).pop() || 'my-project';
}

function buildConfigDraft(name, stack, layers, preset, tier) {
  const docImpactBlock = stack.frameworks.includes('Rails')
    ? "    { codeGlob: /^app\\/models\\/.*\\.rb$/, docs: ['docs/README.md'], label: 'Model change' },\n"
    : '';
  const prdChecks = tier !== 'lite'
    ? `    checkDefs: {
      feature: [
        { id: 'create-req-doc', label: 'Create requirements doc' },
        { id: 'user-confirmed', label: 'User confirmed requirements doc (WAIT)' },
      ],
    },`
    : '';
  // v1.6.0：自动化深度配置段（tier=standard/strict 全量；lite 仅核心治理段）
  const riskBlock = `  // ⑦ 风险路径（critical/standard 档位判定）
  risk: {
    criticalPaths: ['**/db/migrate/**', '**/*payment*', '**/*auth*', '**/*permission*', '**/*secret*', '**/*deploy*', '.github/workflows/**', '**/Dockerfile*'],
    standardPaths: ['**/package.json', '**/Gemfile', '**/*config*', '**/*schema*', '**/api/**'],
  },`;
  const brainBlock = `  // ⑧ Project Brain 知识索引来源
  brain: {
    sources: ['AGENTS.md', 'README.md', 'docs/**/*.{md,mdx,json,yaml,yml}', 'ai/skills/**/SKILL.md', 'harness/**/*.{md,json,yaml,yml}'],
    exclude: ['**/node_modules/**', '**/.git/**', '**/.env*', '**/*secret*', 'harness/gates/**', '.harness-state/**', '.harness-cache/**'],
    maxAssetBytes: 524288,
    maxContextAssets: 24,
    maxAssets: 20000,
    shardSize: 500,
  },`;
  const supervisorBlock = `  // ⑨ 开发监督器（范围/复杂度/架构边界；generatedFiles/protectedFiles 按项目补）
  supervisor: {
    mode: 'guard',
    generatedFiles: [],
    protectedFiles: [],
    dependencyFiles: ['package.json', '**/Gemfile', '**/package.json'],
    complexity: { maxDecisionPoints: 12, duplicateBlockLines: 6 },
  },`;
  const evidenceBlock = `  // ⑩ 证据自动校验
  evidence: { autoVerify: true, maxOutputBytes: 262144 },`;
  const coreBlocks = [riskBlock, brainBlock, supervisorBlock, evidenceBlock];
  const deepBlocks = [
    `  // ⑪ 检查档位（quick/full/nightly/release；check --profile 消费）
  profiles: {
    quick: { timeout: 300, checks: ['lint', 'typecheck', 'affected-tests', 'anti-patterns', 'degraded-loop'] },
    full: { timeout: 2700, checks: ['quick', 'security', 'coverage', 'generated-check', 'doc-impact', 'ai-freshness'] },
    nightly: { checks: ['full', 'flaky-rerun', 'performance'] },
    release: { checks: ['full', 'sbom', 'provenance'] },
  },`,
    `  // ⑫ 覆盖率门禁（coverage --enforce 消费；targets 按项目补）
  coverage: { thresholds: {}, targets: [] },`,
    `  // ⑬ 知识同步矩阵（sync-check 消费）
  syncCheck: {
    rules: [
      { label: 'API / 接口变更', re: /(controllers\\/.*\\/api|config\\/routes)/, assets: ['API 文档', 'API Skill'] },
      { label: '数据模型变更', re: /(models|db\\/migrate)/, assets: ['数据模型 Skill', '迁移测试'] },
      { label: '样式 / 设计 token', re: /\\.(css|scss)$|tailwind\\.config/, assets: ['样式规范', '反模式检查'] },
      { label: 'Skill / 机制变更', re: /(ai\\/skills|harness\\/requirements|docs\\/prd)/, assets: ['AGENTS.md', 'scenarios.json'] },
    ],
  },`,
    `  // ⑭ 生成物漂移检查（generated:check 消费；checks 按项目补）
  generatedCheck: { checks: [] },`,
  ];
  const deepBlock = tier === 'lite' ? '' : `\n${deepBlocks.join('\n')}\n`;
  return `// harness.config.mjs — 由 \`harness onboard\` 生成（草案，请 review）
export default {
  schemaVersion: '1.0',
  name: ${JSON.stringify(name)},

  // ① 层定义（代码库分析推断；gate 跨层搜索用）
  layers: ${JSON.stringify(layers, null, 2).split('\n').join('\n  ').trim()},

  // ② gate 配置
  gates: {
${prdChecks}
  },

  // ③ doc-impact 知识同步规则（改代码 → 必须同步的文档）
  docImpact: {
    base: 'origin/main',
    rules: [
${docImpactBlock}    ],
  },

  // ④ 扫描器规则文件
  scanners: { antiPatterns: 'harness/policies/anti-patterns.json' },

  // ⑤ 规范注册表（通用规则由内置包提供）
  standards: {
    includeBundled: true,
    sources: ['harness/standards/**/*.json'],
  },

${coreBlocks.join('\n')}
${deepBlock}  // ⑮ 状态/产物路径
  paths: {
    gates: 'harness/gates',
    requirements: 'harness/requirements',
    evidence: 'artifacts/harness-evidence',
    prd: 'docs/prd',
  },
};
`;
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

export async function run({ rootDir = process.cwd(), args = [] } = {}) {
  const write = hasArg(args, '--write');
  const preset = getArg(args, '--preset') || 'auto';
  const tier = getArg(args, '--tier') || 'standard';
  const json = getArg(args, '--format') === 'json';

  const name = projectName(rootDir);
  const stack = await detectStack(rootDir);
  const layers = await detectLayers(rootDir);
  const gaps = await detectGaps(rootDir);
  const effectivePreset = preset === 'auto'
    ? (stack.frameworks.includes('Next.js') ? 'nextjs' : stack.frameworks.includes('Rails') ? 'rails' : layers.length > 2 ? 'monorepo' : 'single')
    : preset;

  const steps = [];
  const writes = [];
  const pushStep = (id, label, ok, detail, fix) => steps.push({ id, label, ok, detail, fix });

  // 1. 项目识别
  pushStep('identify', '项目识别', true, `${stack.languages.join(', ') || '未知'} · ${stack.frameworks.join(', ') || '—'} · ${layers.length} 层 · preset=${effectivePreset}`, null);

  // 2. harness.config.mjs
  const cfgPath = resolve(rootDir, 'harness.config.mjs');
  const cfgExists = existsSync(cfgPath);
  pushStep('config', '配置生成', true, cfgExists ? '已存在' : '将生成', cfgExists ? null : 'harness onboard --write');
  if (!cfgExists) writes.push({ path: cfgPath, content: buildConfigDraft(name, stack, layers, effectivePreset, tier) });

  // 3. policies / anti-patterns
  const apPath = resolve(rootDir, 'harness', 'policies', 'anti-patterns.json');
  const apExists = existsSync(apPath);
  pushStep('policies', '反模式规则', true, apExists ? '已存在' : '将生成', apExists ? null : '（含 AP-001~003 基线）');
  if (!apExists) writes.push({ path: apPath, content: JSON.stringify(BUILTIN_ANTI_PATTERNS, null, 2) });

  // 4. 通用 skills（随包分发 → 项目 ai/skills/）
  const installedSkills = [];
  for (const skillId of BUILTIN_SKILLS) {
    const src = resolve(BUNDLED_SKILLS, skillId, 'SKILL.md');
    const dst = resolve(rootDir, 'ai', 'skills', skillId, 'SKILL.md');
    if (existsSync(src) && !existsSync(dst)) {
      writes.push({ path: dst, content: readFileSync(src, 'utf-8') });
      installedSkills.push(skillId);
    }
  }
  pushStep('skills', '通用 Skills 安装', true, installedSkills.length ? `将安装 ${installedSkills.join(', ')}` : '已就绪', null);

  // 5. PRD 模板
  const prdTemplate = resolve(rootDir, 'docs', 'prd', '_TEMPLATE.md');
  const prdExists = existsSync(prdTemplate);
  pushStep('prd-template', 'PRD 模板', true, prdExists ? '已存在' : '将安装', null);
  if (!prdExists) {
    const src = resolve(BUNDLED_TEMPLATES, '_TEMPLATE.md');
    writes.push({ path: prdTemplate, content: existsSync(src) ? readFileSync(src, 'utf-8') : '# PRD 模板\n' });
  }

  // 5.5 v1.6.0：lefthook.yml 提交物理拦截（若缺则生成模板）
  const lefthookPath = resolve(rootDir, 'lefthook.yml');
  const lefthookExists = existsSync(lefthookPath);
  pushStep('lefthook', 'lefthook 拦截', true, lefthookExists ? '已存在' : '将生成', lefthookExists ? null : '生成后需: npm i -D lefthook && npx lefthook install');
  if (!lefthookExists) {
    const src = resolve(PACKAGE_ROOT, 'templates', 'lefthook.yml');
    writes.push({ path: lefthookPath, content: existsSync(src) ? readFileSync(src, 'utf-8') : '' });
  }

  // 5.6 v1.6.0：AI 行为级安全钩子（ai/hooks — 拦截破坏性命令 / 警告硬编码密钥）
  const hooksDir = resolve(rootDir, 'ai', 'hooks');
  const hooksFile = resolve(hooksDir, 'hooks.json');
  const hooksExists = existsSync(hooksFile);
  pushStep('ai-hooks', 'AI 安全钩子', true, hooksExists ? '已存在' : '将生成', hooksExists ? null : '（Claude Code 钩子：拦截破坏性 DB/force-push、警告密钥）');
  if (!hooksExists) {
    const tplDir = resolve(PACKAGE_ROOT, 'templates', 'ai-hooks');
    for (const name of ['hooks.json', 'block_destructive_db.sh', 'warn_on_secrets.sh']) {
      const src = resolve(tplDir, name);
      if (existsSync(src)) writes.push({ path: resolve(hooksDir, name), content: readFileSync(src, 'utf-8') });
    }
  }

  // 6. 规范骨架
  const standardsFile = resolve(rootDir, 'harness', 'standards', `${name}.json`);
  const standardsExists = existsSync(standardsFile);
  pushStep('standards', '规范骨架', true, standardsExists ? '已存在' : '将生成（draft）', null);
  if (!standardsExists) {
    writes.push({ path: standardsFile, content: JSON.stringify({ schemaVersion: '1.0', draft: true, generatedAt: new Date().toISOString(), project: name, standards: [] }, null, 2) });
  }

  // 7. Gate 激活检查（lefthook.yml 已由 5.5 自动生成）
  const gateReady = gaps.every(g => g.severity !== 'must' || g.item === 'harness.config.mjs' || g.item === 'AGENTS.md');
  pushStep('gate', 'Gate 激活', true, lefthookExists ? 'lefthook.yml 已存在' : '将生成 lefthook.yml（提交拦截）', lefthookExists ? null : '生成后运行: npm i -D lefthook && npx lefthook install');

  if (json) {
    console.log(JSON.stringify({ project: name, preset: effectivePreset, tier, steps, writes: write ? writes.map(w => w.path.replace(rootDir + '/', '')) : writes.map(w => w.path.replace(rootDir + '/', '')), dryRun: !write }, null, 2));
    return;
  }

  // 仪表盘
  console.log(`\n🚀 harness onboard — ${name}（preset=${effectivePreset} tier=${tier}）\n`);
  for (const s of steps) {
    console.log(`  ${s.ok ? '✅' : '⬜'} ${s.label.padEnd(16)} ${s.detail}`);
    if (s.fix) console.log(`       ↳ ${s.fix}`);
  }

  console.log('\n  将写入' + (write ? '' : '（dry-run，加 --write 实际写入）') + ':');
  for (const w of writes) console.log(`    ${write ? '✓' : '○'} ${w.path.replace(rootDir + '/', '')}`);

  if (!write) {
    console.log('\n  下一步: npx harness onboard --write');
    return;
  }

  // 实际写入
  for (const w of writes) {
    ensureDir(resolve(w.path, '..'));
    writeFileSync(w.path, w.content, 'utf-8');
  }
  // 通用 skills 自动注册索引（AGENTS.md §0.1 / ai/README.md）
  for (const skillId of installedSkills) {
    const reg = registerInIndexes(rootDir, skillId);
    for (const r of reg) if (r.done) console.log(`   ✓ 已注册: ${r.where}`);
  }

  // v1.5.0：安装后自动触发「领域 Skill 内容生成」——检测项目技术栈/架构/关键词，
  // 匹配元领域目录，用 presets/skills/<id>.md 内容模板渲染生成有实质内容的 SKILL.md
  // （不再是空骨架），并自动注册索引。
  const autoCreated = [];
  try {
    const { catalog } = loadCatalog({ rootDir, config: {} });
    const fingerprint = detectFingerprint({ rootDir, config: {}, catalog });
    const expected = buildExpected({ catalog, fingerprint });
    const missing = expected.filter(item => !existsSync(resolve(rootDir, 'ai', 'skills', item.id, 'SKILL.md')));
    if (missing.length > 0) {
      const created = createMissingSkills({ rootDir, config: {}, missing });
      autoCreated.push(...created.filter(c => c.created));
    }
  } catch (error) {
    console.log(`   ⚠️ 领域 Skill 自动生成跳过：${String(error.message).split('\n')[0]}`);
  }
  if (autoCreated.length > 0) {
    console.log('\n  ✅ 自动生成领域 Skill（内容模板渲染，含项目权威文件）:');
    for (const c of autoCreated) {
      console.log(`    ✓ ai/skills/${c.id}/SKILL.md` + (c.authority > 0 ? `（权威文件 ${c.authority} 个）` : ''));
    }
  }
  console.log('\n✅ 接入文件已写入');
  console.log('\n  剩余步骤（人/AI）:');
  console.log('    1. 安装 lefthook: npm i -D lefthook && npx lefthook install  （提交物理拦截）');
  console.log('    2. npx harness standards generate --write   → AI 补全规范');
  console.log('    3. npx harness skill new --domain <领域>    → 生成领域 Skill');
  console.log('    4. npx harness ci github --write            → 生成多档位 CI（PR 门禁/nightly/release）');
  console.log('    5. npx harness doctor 确认就绪');
  console.log('  备注: ai/hooks/ 已生成 AI 行为级安全钩子（Claude Code 插件引用 ${CLAUDE_PLUGIN_ROOT}/hooks 时启用）');
  process.exitCode = EXIT_CODES.OK;
}
