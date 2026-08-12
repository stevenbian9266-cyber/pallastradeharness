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

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLED_SKILLS = resolve(PACKAGE_ROOT, 'skills');
const BUNDLED_TEMPLATES = resolve(PACKAGE_ROOT, 'templates', 'prd');

const BUILTIN_SKILLS = ['harness-standards-audit', 'harness-skill-author', 'harness-prd', 'harness-docs'];
const BUILTIN_ANTI_PATTERNS = {
  rules: [
    { id: 'AP-001', pattern: 'color:\\s*#[0-9a-fA-F]{3,6}', message: '硬编码颜色值', severity: 'warning' },
    { id: 'AP-002', pattern: 'fetch\\(', message: '裸 fetch 未封装', severity: 'warning' },
    { id: 'AP-003', pattern: 'style=\\s*\\{[^}]*\\}', message: '内联样式', severity: 'warning' },
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

  // ⑥ 状态/产物路径
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

  // 6. 规范骨架
  const standardsFile = resolve(rootDir, 'harness', 'standards', `${name}.json`);
  const standardsExists = existsSync(standardsFile);
  pushStep('standards', '规范骨架', true, standardsExists ? '已存在' : '将生成（draft）', null);
  if (!standardsExists) {
    writes.push({ path: standardsFile, content: JSON.stringify({ schemaVersion: '1.0', draft: true, generatedAt: new Date().toISOString(), project: name, standards: [] }, null, 2) });
  }

  // 7. Gate 激活检查
  const lefthookExists = existsSync(resolve(rootDir, 'lefthook.yml'));
  const gateReady = gaps.every(g => g.severity !== 'must' || g.item === 'harness.config.mjs' || g.item === 'AGENTS.md');
  pushStep('gate', 'Gate 激活', !lefthookExists ? false : true, lefthookExists ? 'lefthook.yml 已存在' : '缺少 lefthook.yml（提交拦截）', 'npx harness init 生成 lefthook.yml + npm i -D lefthook');

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
  console.log('\n✅ 接入文件已写入');
  console.log('\n  剩余步骤（人/AI）:');
  console.log('    1. npx harness standards generate --write   → AI 补全规范');
  console.log('    2. npx harness skill new --domain <领域>    → 生成领域 Skill');
  console.log('    3. 安装 lefthook: npm i -D lefthook && npx lefthook install');
  console.log('    4. npx harness doctor 确认就绪');
  process.exitCode = EXIT_CODES.OK;
}
