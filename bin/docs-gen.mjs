#!/usr/bin/env node
/**
 * docs-gen.mjs — Auto-Docs（能力 C，通用化）
 *
 *   harness docs generate --asset <path> [--write]   知识文档起草（dry-run 优先）
 *   harness docs template --copy [--preset nextjs]   安装 PRD 模板到 docs/prd/_TEMPLATE.md
 *   harness docs check                               复用 doc-impact 的知识同步门（别名）
 *
 * 设计：AI 起草 → 人确认 → 写回。generate 输出"更新草案 + 指引"（dry-run 默认），
 * 不直接覆盖原文；模板通过 config.prd.template 或随包 templates/prd 提供（可插拔）。
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXIT_CODES, getArg, hasArg } from './cli-utils.mjs';
import { atomicWriteText } from './state-store.mjs';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES_DIR = resolve(PACKAGE_ROOT, 'templates', 'prd');
const DEFAULT_TEMPLATE = resolve(TEMPLATES_DIR, '_TEMPLATE.md');

// 通用 PRD 模板（引擎内置；项目可用 docs/prd/_TEMPLATE.md 覆盖；token 优化 6.5：精简说明块、保留骨架）
const BUILTIN_PRD_TEMPLATE = `# PRD-{YYYYMMDD}-{category}-{slug}

| 元数据 | 值 |
|---|---|
| 状态 | draft / reviewing / approved / implementing / verifying / done / rejected |
| 创建日期 | YYYY-MM-DD |
| 来源 | 一句话需求原文 |
| 分类 | （自动判定） |
| 需求类型 | 新功能 / 优化迭代 / Bug 修复 / 接口变更 / 样式 / 文档 |

> 查重回写：\`harness prd new\` 自动查重；命中相似 PRD 用 \`harness prd update\` 回写原档，不得新建重复 PRD。

## 1. 背景与目标
- 一句话需求原文 / 背景 / 目标 / 成功指标

## 2. 用户故事 / 场景
- 作为 <角色>，我希望 <能力>，以便 <价值>（正常流 + 边界 + 异常）

## 3. 功能需求（FR）
- FR-001：<可验收的功能描述>

## 4. 非功能需求（NFR）
- 性能 / 安全 / 兼容 / 可维护性

## 5. 验收标准（AC，与测试一一映射）
- AC-001 ← FR-001：<可验证的判定条件>

## 6. 技术影响
- 涉及组件 / 文件 / 依赖 / 数据库 / 接口

## 7. 测试计划
- 新增/更新测试文件（路径）+ 覆盖的 AC 映射

## 8. 文档同步清单
- 需同步的知识文档 / API 文档 / README
`;

/**
 * docs template --copy — 安装 PRD 模板到项目
 */
export async function runTemplate({ rootDir, args }) {
  const preset = getArg(args, '--preset');
  let templatePath = DEFAULT_TEMPLATE;
  if (preset && existsSync(resolve(TEMPLATES_DIR, `${preset}.md`))) {
    templatePath = resolve(TEMPLATES_DIR, `${preset}.md`);
  }
  const dstDir = resolve(rootDir, 'docs', 'prd');
  const dst = resolve(dstDir, '_TEMPLATE.md');
  mkdirSync(dstDir, { recursive: true });

  if (existsSync(dst)) {
    console.log(`⏭  ${dst.replace(rootDir + '/', '')} 已存在，跳过（如需覆盖先手动删除）`);
    process.exitCode = EXIT_CODES.OK;
    return;
  }
  const content = existsSync(templatePath) ? readFileSync(templatePath, 'utf-8') : BUILTIN_PRD_TEMPLATE;
  writeFileSync(dst, content, 'utf-8');
  console.log(`✅ 已安装 PRD 模板: docs/prd/_TEMPLATE.md`);
  console.log('   下一步: 一句话需求 → npx harness prd new --title "..."');
}

/**
 * createDocsDraft — 知识文档起草包（可复用数据函数，供 CLI/MCP）
 * 返回 { asset, draftPath, changed, wrote, targetExists }
 */
export async function createDocsDraft({ rootDir, config = {}, asset, base = 'origin/main', write = false }) {
  if (!asset) throw new TypeError('asset must be a non-empty value');
  const target = resolve(rootDir, asset);

  // 关联代码变更（doc-impact 的基础）
  let changed = [];
  try {
    const git = await import('./git-files.mjs');
    const changedResult = git.getChangedFiles(rootDir, base);
    changed = changedResult.files || [];
  } catch { /* 非 git 环境降级 */ }

  const draftDir = resolve(rootDir, 'artifacts', 'harness-docs-drafts');
  mkdirSync(draftDir, { recursive: true });
  const draftName = `${asset.replace(/[^a-zA-Z0-9_.-]/g, '_')}.draft.md`;
  const draftPath = resolve(draftDir, draftName);

  const existed = existsSync(target);
  const currentHead = existed ? readFileSync(target, 'utf-8').slice(0, 200) : '（目标文件不存在 → 新建）';
  const content = `# 文档更新草案（harness docs generate）

> 目标: \`${asset}\`${existed ? '' : '（将新建）'}
> 生成时间: ${new Date().toISOString()}
> 关联变更基准: ${base}（变更文件 ${changed.length} 个）

## 起草指引（AI）

1. 结合以下变更文件，判断 ${asset} 需要更新的章节：
\`\`\`
${changed.slice(0, 30).join('\n') || '（当前无已提交变更）'}
\`\`\`
2. 如涉及 API/接口变更，同步更新对应 API 文档章节
3. 保持与现有文档风格一致；只写变更相关部分
4. 人确认后，把内容合并进 ${asset}，并删除本草案

## 现有内容开头（供上下文）

\`\`\`
${currentHead}
\`\`\`

## 待更新章节（AI 填充）

- [ ] <章节 1>
- [ ] <章节 2>
`;

  let wrote = false;
  if (write) {
    writeFileSync(draftPath, content, 'utf-8');
    wrote = true;
  }
  return { asset, draftPath, draftName, changed, wrote, targetExists: existed, content };
}

/**
 * docs generate --asset <path> — 知识文档起草（AI 草案 + 人确认）
 */
export async function runGenerate({ rootDir, args, config }) {
  const asset = getArg(args, '--asset');
  const dryRun = hasArg(args, '--dry-run') || !hasArg(args, '--write');
  if (!asset) {
    console.error('Usage: harness docs generate --asset <README.md|docs/...> [--write]');
    process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
    return;
  }
  const base = getArg(args, '--base') || 'origin/main';
  const result = await createDocsDraft({ rootDir, config, asset, base, write: !dryRun });

  if (dryRun) {
    console.log(`📄 docs generate — ${asset} 起草包（dry-run）`);
    console.log(`  关联变更文件: ${result.changed.length}`);
    console.log(`  草案将写入: artifacts/harness-docs-drafts/${result.draftName}`);
    console.log('  加 --write 写入草案文件');
    process.exitCode = EXIT_CODES.OK;
    return;
  }

  console.log(`✅ 起草包已写入: artifacts/harness-docs-drafts/${result.draftName}`);
  console.log('  下一步: AI 按草案指引起草 → 人确认 → 合并进目标文档');
  process.exitCode = EXIT_CODES.OK;
}

export async function run({ rootDir = process.cwd(), args = [], config = {} } = {}) {
  const sub = args[1] || 'generate';
  if (sub === 'generate') return runGenerate({ rootDir, args, config });
  if (sub === 'template') return runTemplate({ rootDir, args });
  if (sub === 'check') {
    // 别名：复用 doc-impact
    await import('./doc-impact.mjs').then(m => m.run({ rootDir, args: ['--base', getArg(args, '--base') || 'origin/main'], config }));
    return;
  }
  console.error(`Unknown docs subcommand: ${sub}`);
  console.error('Usage: harness docs generate --asset <path> [--write] | template --copy [--preset x] | check');
  process.exitCode = EXIT_CODES.USAGE_OR_CONFIG;
}
