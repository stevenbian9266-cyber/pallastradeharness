#!/usr/bin/env node
/**
 * init.mjs — 项目初始化向导（冷启动）
 *
 * 从 0 开始的使用者：生成 harness.config.mjs + lefthook.yml + AGENTS.md +
 * copilot-instructions.md + .gitignore 追加，按「渐进档位」落地。
 *
 * 用法：
 *   harness init                          # 交互式问答（推荐）
 *   harness init --preset nextjs|rails|monorepo|single --tier lite|standard|strict \
 *              [--ai] [--team] [--name my-project]   # 非交互（CI/脚本）
 */
import { createInterface } from 'node:readline';
import { promises as fs } from 'node:fs';
import { resolve, basename } from 'node:path';

// ── 预设：不同技术栈的 layers ──────────────────────────────────
const PRESETS = {
  single: {
    label: 'Single app (src/)',
    layers: [
      { id: 'app', path: 'src', label: 'App source' },
      { id: 'test', path: 'test', label: 'Tests' },
    ],
  },
  nextjs: {
    label: 'Next.js / frontend (src/)',
    layers: [
      { id: 'app', path: 'src', label: 'App router / components' },
      { id: 'lib', path: 'lib', label: 'Shared logic' },
    ],
  },
  rails: {
    label: 'Rails backend (app/)',
    layers: [
      { id: 'app', path: 'app', label: 'Application code' },
      { id: 'lib', path: 'lib', label: 'Library code' },
    ],
  },
  monorepo: {
    label: 'Monorepo (packages/*)',
    layers: [
      { id: 'apps', path: 'apps', label: 'Applications' },
      { id: 'packages', path: 'packages', label: 'Shared packages' },
    ],
  },
};

// ── 档位：渐进式落地 ───────────────────────────────────────────
// Lite:     gate + 反模式 + 密钥（pre-commit 硬卡）——第 1 天
// Standard: + PRD 工作流 + doc-impact + profiles——1~2 周后
// Strict:   + AI eval + scenarios + coverage——团队成熟后
const TIERS = {
  lite: {
    label: 'Lite — gate + scanners (start day 1)',
    gates: {},
    docs: ['gate', 'scanners'],
  },
  standard: {
    label: 'Standard — + PRD + doc-impact',
    gates: {
      feature: [
        { id: 'create-req-doc', label: 'Create requirements doc' },
        { id: 'user-confirmed', label: 'User confirmed requirements doc (WAIT)' },
      ],
    },
    docs: ['gate', 'scanners', 'prd', 'docImpact'],
  },
  strict: {
    label: 'Strict — + eval + scenarios + coverage',
    gates: {
      feature: [
        { id: 'create-req-doc', label: 'Create requirements doc' },
        { id: 'user-confirmed', label: 'User confirmed requirements doc (WAIT)' },
      ],
    },
    docs: ['gate', 'scanners', 'prd', 'docImpact', 'eval', 'coverage'],
  },
};

function getArg(args, flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
}
function hasArg(args, flag) {
  return args.includes(flag);
}

// ── 交互问答 ───────────────────────────────────────────────────
async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolveFn) => {
    rl.question(question, (answer) => {
      rl.close();
      resolveFn(answer.trim());
    });
  });
}

async function interactive() {
  console.log('\n⚙️  pallastrade-harness init — 交互向导\n');
  const presetKey = await ask('技术栈？[single/nextjs/rails/monorepo] (默认 single): ') || 'single';
  const preset = PRESETS[presetKey] ? presetKey : 'single';
  const ai = (await ask('使用 AI 编码工具吗？[y/N]: ').then(a => a.toLowerCase())) === 'y';
  const team = (await ask('团队协作吗？(单人=宽松门禁) [y/N]: ').then(a => a.toLowerCase())) === 'y';
  const tierKey = await ask(`严格档位？[lite/standard/strict] (默认 ${team ? 'standard' : 'lite'}): `) || (team ? 'standard' : 'lite');
  const tier = TIERS[tierKey] ? tierKey : (team ? 'standard' : 'lite');
  const name = await ask('项目名？(默认当前目录名): ') || basename(process.cwd());
  return { preset, tier, ai, team, name };
}

// ── 生成 harness.config.mjs ────────────────────────────────────
function buildConfig({ name, preset, tier, ai }) {
  const p = PRESETS[preset];
  const t = TIERS[tier];
  const docImpactRules = t.docs.includes('docImpact') ? [
    { codeGlob: /^src\/.*\.(ts|tsx|js|jsx|vue)$/, docs: ['docs/README.md'], label: 'Source change' },
  ] : [];
  const lines = [
    '// harness.config.mjs — 项目配置（引擎通用机制，本文件声明项目自身结构）',
    '// 由 `harness init` 生成。Schema 见 https://github.com/stevenbian9266-cyber/pallastradeharness',
    `export default {\n  name: ${JSON.stringify(name)},`,
    '',
    '  // ① 层定义：gate 跨层搜索来源',
    `  layers: ${JSON.stringify(p.layers, null, 2).split('\n').join('\n  ').trim()},`,
    '',
    `  // ② gate：档位 ${tier}（${t.label}）`,
    `  gates: ${JSON.stringify(t.gates, null, 2).split('\n').join('\n  ').trim()},`,
    '',
    `  // ③ 知识同步规则（doc-impact）`,
    `  docImpact: { base: 'origin/main', rules: ${JSON.stringify(docImpactRules).replaceAll('\\\\', '\\')} },`,
    '',
    '  // ④ 扫描器规则文件',
    "  scanners: { antiPatterns: 'harness/policies/anti-patterns.json' },",
    '',
    '  // ⑤ scenarios（可选，AI 行为评估场景库）',
    "  scenarios: 'harness/scenarios/scenarios.json',",
    '',
    '  // ⑥ 状态/产物路径（默认值即可）',
    "  paths: { gates: 'harness/gates', requirements: 'harness/requirements', evidence: 'artifacts/harness-evidence', prd: 'docs/prd' },",
    '};\n',
  ];
  return lines.join('\n');
}

// ── 生成 lefthook.yml ──────────────────────────────────────────
function buildLefthook() {
  return `# Generated by \`harness init\` — agent-agnostic physical enforcement.
# Install once:  npm i && npx lefthook install

pre-commit:
  commands:
    harness-gate:
      run: npx harness gate:required
    harness-anti-patterns:
      glob: "**/*.{ts,tsx,js,jsx,vue,rb,py,css}"
      exclude: "**/node_modules/**|**/dist/**|**/.next/**|**/build/**"
      run: npx harness scan-anti-patterns --files {staged_files}
    harness-secrets:
      glob: "**/*.{ts,tsx,js,jsx,vue,rb,py,yml,yaml,env,sh}"
      exclude: "**/node_modules/**|**/dist/**|**/.next/**|**/build/**"
      run: npx harness scan-secrets --files {staged_files}

pre-push:
  commands:
    harness-doc-impact:
      run: npx harness doc-impact --base origin/main
`;
}

// ── 生成 AGENTS.md 模板 ────────────────────────────────────────
function buildAgents({ ai }) {
  const aiSection = ai ? `
## AI Agent Rules

- 每次代码修改前必须运行 \`npx harness gate --task "前缀：描述"\` 并清空所有 check
- 前缀约定：\`修复：\`(bugfix) \`优化：\`/ \`新增：\`(feature) \`文档：\`(docs) \`重构：\`(refactor) \`安全：\`(security) \`测试：\`(test) \`样式：\`(style)
- 未清 gate 前禁止修改任何文件；\`gate:status\` 退出码非 0 即未放行
- 实现后提供验证证据（日志/截图/测试输出）再清 \`verify-test\`` : '';
  return `# ${basename(process.cwd())} — Agent Instructions

## Engineering Harness（强制）

本仓库接入 [pallastrade-harness](https://github.com/stevenbian9266-cyber/pallastradeharness)：

- **Gate（改代码前必过）**：\`npx harness gate --task "前缀：描述"\`，逐条清空 check 后才能写代码
- **跨层搜索**：实现前搜索所有 layers（见 harness.config.mjs），禁止重复造轮子
- **验证**：逻辑/UI 变更必须提供证据（测试输出/日志/截图），"无测试"仅限纯文档
- **pre-commit 硬卡**：无 cleared gate / 反模式违规 / 密钥泄漏 → 提交被物理拦截
${aiSection}

## 命令速查

\`\`\`bash
npx harness gate --task "新增：<功能>"   # 开 gate
npx harness gate:status                  # 查 gate
npx harness gate:clear --gate <ID> --clear <check-id>   # 清 check
npx harness check --profile quick        # 快速检查（变更感知）
npx harness doctor                       # 项目体检
\`\`\`
`;
}

// ── 生成 copilot-instructions.md 模板 ─────────────────────────
function buildCopilot() {
  return `# Copilot Instructions（自动注入）

> 由 \`harness init\` 生成 — 与 [pallastrade-harness](https://github.com/stevenbian9266-cyber/pallastradeharness) 配合。

## ⛔ 改代码前必须先过 gate（无例外）

**在调用任何文件创建/编辑工具前，必须先运行：**

\`\`\`bash
npx harness gate --task "<前缀：描述>"
\`\`\`

前缀 → 任务类型：\`修复：\` bugfix / \`优化：\`、\`新增：\` feature / \`样式：\` style / \`文档：\` docs / \`重构：\` refactor / \`安全：\` security / \`测试：\` test

**如果未运行 gate 就改了文件 → 流程违规：停止、告知用户、回滚、重新开 gate。**

### 清 check

\`\`\`bash
npx harness gate:clear --gate <GATE-ID> --clear <check-id>
\`\`\`

所有 check 清空（exit 0）后才能实现。\`verify-test\` 需要真实证据（测试/日志/截图）。

### 后续回合

\`\`\`bash
npx harness gate:status   # exit 0 → 有效 gate 可继续；exit 1 → 需处理
\`\`\`
`;
}

// ── 生成 .gitignore 追加 ───────────────────────────────────────
function gitignoreAppend() {
  return '\n# harness 运行时状态（每个项目各自维护）\n/harness/gates/\n.harness-cache/\n';
}

/**
 * init 入口
 */
export async function run({ args = [] } = {}) {
  const hasFlags = args.some(a => a.startsWith('--'));
  let opts;
  if (hasFlags) {
    const preset = getArg(args, '--preset') || 'single';
    const tier = getArg(args, '--tier') || 'lite';
    if (!PRESETS[preset]) { console.error(`❌ Unknown preset "${preset}". Valid: ${Object.keys(PRESETS).join(', ')}`); process.exit(1); }
    if (!TIERS[tier]) { console.error(`❌ Unknown tier "${tier}". Valid: ${Object.keys(TIERS).join(', ')}`); process.exit(1); }
    opts = {
      preset,
      tier,
      ai: hasArg(args, '--ai'),
      team: hasArg(args, '--team'),
      name: getArg(args, '--name') || basename(process.cwd()),
    };
  } else {
    opts = await interactive();
  }

  const cwd = process.cwd();
  const configPath = resolve(cwd, 'harness.config.mjs');
  if (await fs.access(configPath).then(() => true).catch(() => false)) {
    console.error(`❌ harness.config.mjs already exists at ${configPath}.`);
    console.error('   Edit it directly, or delete and re-run `harness init`.');
    process.exit(1);
  }

  console.log(`\n📦 Generating harness scaffolding for "${opts.name}" (preset=${opts.preset}, tier=${opts.tier}, ai=${opts.ai}, team=${opts.team})\n`);

  // 1. harness.config.mjs
  await fs.writeFile(configPath, buildConfig(opts), 'utf-8');
  console.log(`  ✅ ${configPath}`);

  // 2. lefthook.yml（若不存在）
  const lh = resolve(cwd, 'lefthook.yml');
  if (await fs.access(lh).then(() => true).catch(() => false)) {
    console.log(`  ⏭  lefthook.yml exists — skip (merge manually)`);
  } else {
    await fs.writeFile(lh, buildLefthook(), 'utf-8');
    console.log(`  ✅ ${lh}  (run \`npm i -D lefthook && npx lefthook install\`)`);
  }

  // 3. AGENTS.md（若不存在）
  const agents = resolve(cwd, 'AGENTS.md');
  if (await fs.access(agents).then(() => true).catch(() => false)) {
    console.log('  ⏭  AGENTS.md exists — skip');
  } else {
    await fs.writeFile(agents, buildAgents(opts), 'utf-8');
    console.log(`  ✅ ${agents}`);
  }

  // 4. .github/copilot-instructions.md（若不存在）
  const copilot = resolve(cwd, '.github', 'copilot-instructions.md');
  if (await fs.access(copilot).then(() => true).catch(() => false)) {
    console.log('  ⏭  copilot-instructions.md exists — skip');
  } else {
    await fs.mkdir(resolve(cwd, '.github'), { recursive: true });
    await fs.writeFile(copilot, buildCopilot(), 'utf-8');
    console.log(`  ✅ ${copilot}`);
  }

  // 5. .gitignore 追加
  const gi = resolve(cwd, '.gitignore');
  const existing = await fs.access(gi).then(() => fs.readFile(gi, 'utf-8')).catch(() => '');
  if (!existing.includes('harness/gates')) {
    await fs.writeFile(gi, existing + gitignoreAppend(), 'utf-8');
    console.log(`  ✅ ${gi} (appended harness gates ignore)`);
  }

  console.log('\n✅ init 完成！接下来：');
  console.log('   1. npx harness doctor                 — 项目体检');
  console.log('   2. npx harness config:check           — 校验配置');
  console.log('   3. npm i -D lefthook && npx lefthook install  — 安装 pre-commit 强制');
  console.log('   4. npx harness gate --task "新增：第一个功能"   — 开始第一次任务');
  console.log(`\n   🔒 当前档位：${TIERS[opts.tier].label}`);
  console.log(`      升级档位：npx harness init 会拒绝覆盖 — 手动编辑 harness.config.mjs 的 gates/checkDefs 即可。`);
}
