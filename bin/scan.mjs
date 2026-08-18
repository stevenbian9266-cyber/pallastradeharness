#!/usr/bin/env node
/**
 * scan.mjs — Asset Governance（资产治理：扫描 + 自愈）
 *
 *   harness scan [--fix] [--check] [--json] [--category <id>]
 *
 * 安装后自动触发（init / onboard 输出会提示）或手动运行的"资产体检 + 自愈"层：
 *   1. 扫描项目内 skills / standards / agent 文件 / PRD / scenarios / 索引 / gate 引用
 *   2. 缺失 → MUST/SHOULD/NICE 三级分级；L0 确定性项可用 --fix 自动创建
 *   3. 存在 → 结构 / 注册 / 新鲜度 检查，报告需升级或修复的项
 *
 * 分级语义：
 *   must   — 缺了机制跑不动（CI 用 --check 硬卡）
 *   should — 缺了质量受损（建议补齐）
 *   nice   — 锦上添花（仅提示）
 *
 * 自愈分级：
 *   L0 确定性 — 引擎可自动创建（--fix）；L1/L2 — 输出建议命令交 AI/人确认。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

// ── L0 确定性模板（--fix 可直接写入）─────────────────────────
// key: 资产 id → 相对路径 + 内容生成函数
const L0_FIXES = {
  'skills-dir': { path: 'ai/skills', type: 'mkdir' },
  'agent-readme': { path: 'ai/README.md', type: 'write', content: () => `# AI Skills 索引\n\n> 由 \`harness skill new\` / \`harness scan --fix\` 自动维护。\n` },
  'standards-dir': { path: 'harness/standards', type: 'mkdir' },
  'scenarios-json': { path: 'harness/scenarios/scenarios.json', type: 'write', content: () => JSON.stringify(
    { schemaVersion: '1.0', scenarios: [], generatedAt: new Date().toISOString(), note: 'strict 档位场景库 — 由 AI 按项目业务填充' },
    null, 2) + '\n' },
};

// ── Skill 权威路径引用检查（轻量 freshness，复用 eval-ai 启发式）──
const SKILL_FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const NAME_RE = /^name:\s*([^\r\n]+)$/m;
// 说明性行（告诉读者"去哪里创建"）不是规范性引用，跳过（含中文关键词）。
// 注意：故意不含 `^[-*]\s*` + 反引号 / 表格行规则——"权威文件"列表正是
// `- \`path\` — 描述` 形态，属于必须检查的规范性引用（区别于 eval-ai 的 Rails 场景启发式）。
const ILLUSTRATIVE_LINE = /\b(create|generate|install|rename|mkdir|touch)\b|创建|生成|安装|输出到|输出至|示例|example|your |output at|outputs to|generated at|→|add .{0,60}in `/i;

export function skillRefsExist(rootDir, skillDir) {
  const skillFile = join(skillDir, 'SKILL.md');
  if (!existsSync(skillFile)) return { ok: true, missing: [] };
  const content = readFileSync(skillFile, 'utf-8').replace(/```[\s\S]*?```/g, '');
  const missing = [];
  for (const line of content.split('\n')) {
    if (ILLUSTRATIVE_LINE.test(line)) continue;
    for (const m of line.matchAll(/`([a-z0-9_.-]+\/[a-z0-9_\/.\-\[\]\*]+)`/gi)) {
      const ref = m[1];
      if (!ref.includes('/') || ref.startsWith('http') || ref.includes(' ')) continue;
      if (ref.startsWith('dist/') || ref.includes('node_modules/')) continue;
      if (!/\.(java|rb|ts|tsx|js|jsx|json|yml|yaml|md|mjs|css|vue|xml|sql|properties)$/i.test(ref)) continue;
      if (!existsSync(resolve(rootDir, ref)) && !missing.includes(ref)) missing.push(ref);
    }
  }
  return { ok: missing.length === 0, missing };
}

// ── gate 引用的 skill 名称（read-skill-* 检查）───────────────
// 真实 gate label 为纯文本（如 "Read Skill: <project>-customization/SKILL.md (always)"），
// 用词边界匹配 .md 路径 token，并把 `<project>` 占位符解析为实际项目名。
export function gateSkillRefs(config) {
  const refs = new Set();
  const project = config?.name || 'project';
  const defs = config?.gates?.checkDefs || {};
  for (const checks of Object.values(defs)) {
    for (const c of checks || []) {
      const label = c.label || '';
      // 捕获 label 中的 .md 路径 token（`<project>` 是占位符，`\b` 对 `<`/`>` 不成立，故不用词边界）
      const m = label.match(/([A-Za-z0-9_<>\-./]+\.md)/);
      // `<project>-customization/SKILL.md` → `<项目名>-customization/SKILL.md`
      if (m) refs.add(m[1].replace('<project>', project));
      if (/domain-specific/i.test(label)) refs.add('<domain>');
    }
  }
  return [...refs];
}

// ── 资产清单构建（纯函数，便于测试）──────────────────────────
export function buildScanItems({ rootDir, config = {} }) {
  const name = config.name || rootDir.split(/[\\/]/).pop() || 'project';
  const items = [];

  const ok = (category, id, label, tier, detail = '') => ({ category, id, label, tier, status: 'ok', detail });
  const missing = (category, id, label, tier, fix, auto = false) => ({ category, id, label, tier, status: 'missing', detail: '', fix, auto });
  const stale = (category, id, label, tier, detail, fix = '') => ({ category, id, label, tier, status: 'stale', detail, fix });

  // ── skills ──────────────────────────────────────────────
  const skillsDir = resolve(rootDir, 'ai', 'skills');
  if (existsSync(skillsDir)) {
    items.push(ok('skills', 'skills-dir', 'ai/skills/ 目录', 'must'));
    const entries = readdirSync(skillsDir, { withFileTypes: true }).filter(e => e.isDirectory());
    if (entries.length === 0) {
      items.push(stale('skills', 'skills-empty', 'ai/skills/ 下无领域 Skill', 'should', '可运行 harness skill new --domain <领域>', ''));
    }
    for (const e of entries) {
      const skillFile = join(skillsDir, e.name, 'SKILL.md');
      if (!existsSync(skillFile)) {
        items.push(missing('skills', `skill-${e.name}`, `skill ${e.name} 缺 SKILL.md`, 'must', `npx harness skill new --domain ${e.name}`));
        continue;
      }
      const content = readFileSync(skillFile, 'utf-8');
      const fm = content.match(SKILL_FRONTMATTER_RE);
      const nameMatch = content.match(NAME_RE);
      if (!fm || !nameMatch) {
        items.push(stale('skills', `skill-${e.name}-fm`, `skill ${e.name} 缺 frontmatter`, 'must', '补齐 --- name/description ---', `编辑 ai/skills/${e.name}/SKILL.md`));
      } else if (nameMatch[1].trim() !== e.name) {
        items.push(stale('skills', `skill-${e.name}-name`, `skill ${e.name} frontmatter name 与目录名不一致`, 'should', `frontmatter name=${nameMatch[1].trim()} ≠ 目录 ${e.name}`, `编辑 ai/skills/${e.name}/SKILL.md`));
      } else {
        const fr = skillRefsExist(rootDir, join(skillsDir, e.name));
        items.push(fr.ok
          ? ok('skills', `skill-${e.name}`, `skill ${e.name} 结构合规`, 'must')
          : stale('skills', `skill-${e.name}-fresh`, `skill ${e.name} 权威路径失效（${fr.missing.length} 个）`, 'should', fr.missing.slice(0, 3).join(', '), `更新 ai/skills/${e.name}/SKILL.md 中失效路径`));
      }
    }
  } else {
    items.push(missing('skills', 'skills-dir', 'ai/skills/ 目录', 'must', 'npx harness scan --fix 或 npx harness skill new --domain <领域>', true));
  }

  // 内置通用 skills（onboard 安装）
  const bundled = ['harness-standards-audit', 'harness-skill-author', 'harness-prd', 'harness-docs'];
  const missingBundled = bundled.filter(b => !existsSync(join(skillsDir, b, 'SKILL.md')));
  if (missingBundled.length > 0) {
    items.push(stale('skills', 'skills-bundled', `内置通用 skills 缺失（${missingBundled.join(', ')}）`, 'should', '提供 skill 方法论层', 'npx harness onboard --write'));
  }

  // ── standards ──────────────────────────────────────────
  const stdDir = resolve(rootDir, 'harness', 'standards');
  if (existsSync(stdDir)) {
    const files = readdirSync(stdDir).filter(f => f.endsWith('.json'));
    if (files.length === 0) {
      items.push(stale('standards', 'standards-empty', 'harness/standards/ 无规范文件', 'should', '可运行 harness standards generate --write', ''));
    } else {
      let invalid = 0;
      for (const f of files) {
        try { JSON.parse(readFileSync(join(stdDir, f), 'utf-8')); }
        catch { invalid++; }
      }
      items.push(invalid === 0
        ? ok('standards', 'standards-json', `规范文件 ${files.length} 个 schema 可解析`, 'must')
        : stale('standards', 'standards-invalid', `${invalid} 个规范文件 JSON 解析失败`, 'must', '', 'npx harness standards validate'));
    }
  } else {
    items.push(missing('standards', 'standards-dir', 'harness/standards/ 目录', 'should', 'npx harness standards generate --write', true));
  }

  // ── agent 文件 ─────────────────────────────────────────
  items.push(existsSync(resolve(rootDir, 'AGENTS.md'))
    ? ok('agent', 'agent-agents', 'AGENTS.md 存在', 'must')
    : missing('agent', 'agent-agents', 'AGENTS.md', 'must', 'npx harness init'));
  items.push(existsSync(resolve(rootDir, '.github', 'copilot-instructions.md'))
    ? ok('agent', 'agent-copilot', '.github/copilot-instructions.md 存在', 'should')
    : missing('agent', 'agent-copilot', '.github/copilot-instructions.md', 'should', 'npx harness init'));
  items.push(existsSync(resolve(rootDir, 'ai', 'README.md'))
    ? ok('agent', 'agent-readme', 'ai/README.md skill 索引', 'must')
    : missing('agent', 'agent-readme', 'ai/README.md skill 索引', 'must', 'npx harness scan --fix', true));

  const agentsContent = existsSync(resolve(rootDir, 'AGENTS.md')) ? readFileSync(resolve(rootDir, 'AGENTS.md'), 'utf-8') : '';
  const hasIndex = /§0\.1|### 0\.1|规范文件总表|文件总表/.test(agentsContent);
  items.push(hasIndex
    ? ok('agent', 'agent-index', 'AGENTS.md §0.1 文件索引', 'should')
    : stale('agent', 'agent-index', 'AGENTS.md 无 §0.1 文件索引段', 'should', 'skill new/scan 自动注册索引需要该段', 'npx harness skill new --domain <首个领域>'));

  // 各 Agent 目录（.agents/.claude）中的 skill 与 ai/skills 同步情况
  const agentDirs = ['.agents', '.claude'];
  for (const ad of agentDirs) {
    const agentSkills = resolve(rootDir, ad, 'skills');
    if (!existsSync(agentSkills)) continue;
    const present = readdirSync(agentSkills, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
    const unsynced = present.filter(s => !existsSync(join(skillsDir, s, 'SKILL.md')));
    if (unsynced.length > 0) {
      items.push(stale('agent', `agent-sync-${ad.replace('.', '')}`, `${ad}/skills 有 ${unsynced.length} 个 skill 未注册进 ai/skills（${unsynced.join(', ')}）`, 'nice', '建议同步到 ai/skills 或登记索引', 'npx harness skill new --domain <领域> 或手动复制'));
    }
  }

  // ── PRD ────────────────────────────────────────────────
  const prdDir = resolve(rootDir, 'docs', 'prd');
  items.push(existsSync(prdDir)
    ? ok('prd', 'prd-dir', 'docs/prd/ 目录', 'should')
    : missing('prd', 'prd-dir', 'docs/prd/ 目录', 'should', 'npx harness docs template --copy'));
  items.push(existsSync(join(prdDir, '_TEMPLATE.md'))
    ? ok('prd', 'prd-template', 'docs/prd/_TEMPLATE.md', 'must')
    : missing('prd', 'prd-template', 'docs/prd/_TEMPLATE.md（PRD 模板）', 'must', 'npx harness docs template --copy'));

  // ── scenarios（strict 档位）────────────────────────────
  const scenariosFile = join(rootDir, 'harness', 'scenarios', 'scenarios.json');
  items.push(existsSync(scenariosFile)
    ? ok('scenarios', 'scenarios-json', 'harness/scenarios/scenarios.json', 'should')
    : missing('scenarios', 'scenarios-json', 'harness/scenarios/scenarios.json', 'should', 'npx harness scan --fix', true));

  // ── gate 引用的 skill 是否存在（幽灵引用检测）────────────
  for (const ref of gateSkillRefs(config)) {
    if (ref === '<domain>') {
      const anyDomain = existsSync(skillsDir) && readdirSync(skillsDir, { withFileTypes: true }).some(e => e.isDirectory() && existsSync(join(skillsDir, e.name, 'SKILL.md')));
      items.push(anyDomain
        ? ok('gate-refs', 'gate-ref-domain', '领域 Skill 存在（read-skill-domain）', 'should')
        : stale('gate-refs', 'gate-ref-domain', 'gate 引用 read-skill-domain 但无领域 Skill', 'should', 'read-skill-domain 将空转', 'npx harness skill new --domain <领域>'));
      continue;
    }
    // `<project>-customization/SKILL.md` → `<project>-customization`
    const skillName = ref.replace(/\.md$/i, '').replace(/\/SKILL$/i, '');
    const exists = existsSync(join(skillsDir, skillName, 'SKILL.md'));
    items.push(exists
      ? ok('gate-refs', `gate-ref-${skillName}`, `gate 引用 ${ref} 已存在`, 'should')
      : stale('gate-refs', `gate-ref-${skillName}`, `gate 引用 ${ref} 但 skill 缺失（幽灵引用）`, 'should', 'read-skill 检查将空转', `npx harness skill new --domain ${skillName}`));
  }

  // ── 项目规范机器化提示（工程宪法 → standards）────────────
  const stdJson = join(stdDir, `${name}.json`);
  if (existsSync(stdDir)) {
    const projectSpecific = readdirSync(stdDir).some(f => f !== 'base-standards.json' && f.endsWith('.json'));
    if (!projectSpecific) {
      items.push(stale('standards', 'standards-project', `无项目特定规范（只有 base-standards.json）`, 'nice', 'AGENTS.md 硬规则未机器化', 'npx harness standards generate --write'));
    }
  }

  return items;
}

// ── 汇总与分级 ────────────────────────────────────────────
export function summarize(items) {
  const summary = { total: items.length, ok: 0, missing: 0, stale: 0, byTier: { must: 0, should: 0, nice: 0 }, byStatus: { missing: 0, stale: 0 } };
  for (const it of items) {
    if (it.status === 'ok') summary.ok++;
    else {
      summary.byStatus[it.status] = (summary.byStatus[it.status] || 0) + 1;
      summary.byTier[it.tier] = (summary.byTier[it.tier] || 0) + 1;
      if (it.status === 'missing') summary.missing++;
      if (it.status === 'stale') summary.stale++;
    }
  }
  return summary;
}

// ── L0 确定性自愈 ─────────────────────────────────────────
export function applyAutoFixes(rootDir, items) {
  const applied = [];
  for (const it of items) {
    if (!it.auto || it.status !== 'missing') continue;
    const fix = L0_FIXES[it.id];
    if (!fix) continue;
    const abs = resolve(rootDir, fix.path);
    if (existsSync(abs)) continue;
    if (fix.type === 'mkdir') {
      mkdirSync(abs, { recursive: true });
    } else {
      mkdirSync(resolve(abs, '..'), { recursive: true });
      writeFileSync(abs, fix.content(), 'utf-8');
    }
    applied.push(fix.path);
  }
  return applied;
}

// ── CLI ───────────────────────────────────────────────────
export async function run({ rootDir = process.cwd(), args = [], config = {} } = {}) {
  const fix = args.includes('--fix');
  const checkOnly = args.includes('--check');
  const json = args.includes('--json');
  const category = args.includes('--category') ? args[args.indexOf('--category') + 1] : null;

  const items = buildScanItems({ rootDir, config });
  const filtered = category ? items.filter(i => i.category === category) : items;
  const applied = fix ? applyAutoFixes(rootDir, items) : [];

  const summary = summarize(items);

  if (json) {
    console.log(JSON.stringify({ applied, summary, items: filtered.map(i => ({ ...i, fix: i.fix || '' })) }, null, 2));
  } else {
    console.log('🔍 harness scan — 资产治理（扫描 + 自愈）\n');
    if (applied.length > 0) {
      console.log(`✅ --fix 自动创建: ${applied.join(', ')}\n`);
    }
    const byCategory = {};
    for (const it of filtered) (byCategory[it.category] ||= []).push(it);
    for (const [cat, catItems] of Object.entries(byCategory)) {
      console.log(`── ${cat} ──────────────────────────────`);
      for (const it of catItems) {
        const mark = it.status === 'ok' ? '✅' : it.tier === 'must' ? '❌' : it.tier === 'should' ? '⚠️' : '💡';
        console.log(`  ${mark} [${it.tier}] ${it.label}`);
        if (it.status !== 'ok' && it.detail) console.log(`       ↳ ${it.detail}`);
        if (it.status !== 'ok' && it.fix) console.log(`       → ${it.fix}`);
      }
    }
    console.log(`\n  汇总: ${summary.total} 项 — ${summary.ok} ok / ${summary.missing} 缺失 / ${summary.stale} 待升级`);
    if (summary.missing > 0 || summary.stale > 0) {
      console.log(`  下一步: ${fix ? '' : 'npx harness scan --fix 自动补齐 L0 项；'}npx harness onboard --write 安装内置 skills；npx harness skill new --domain <领域>`);
    }
  }

  // --check（CI 硬卡）：must 级缺失/失效 → exit 1
  if (checkOnly) {
    const mustFail = items.filter(i => i.tier === 'must' && i.status !== 'ok');
    if (mustFail.length > 0) {
      process.exitCode = 1;
    }
  }
  return { applied, summary, items };
}
