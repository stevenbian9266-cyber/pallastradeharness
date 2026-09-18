/**
 * skill-index.mjs — Skill 索引注册（低层模块）
 *
 * 从 bin/skill.mjs 提取（修复 skill.mjs ⇄ skill-audit.mjs 循环依赖）：
 * registerInIndexes 只依赖 fs/path，供 skill / skill-audit / onboard 共用。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── 索引注册：AGENTS.md §0.1 表格 + ai/README.md ──────────
export function registerInIndexes(rootDir, domain) {
  const results = [];
  const agentsPath = resolve(rootDir, 'AGENTS.md');
  if (existsSync(agentsPath)) {
    let agents = readFileSync(agentsPath, 'utf-8');
    if (!agents.includes(`ai/skills/${domain}/SKILL.md`)) {
      // 在 §0.1 表格（第一个 "| `" 开始的表行前）之后插入一行
      const line = `| \`ai/skills/${domain}/SKILL.md\` | Skill | 领域知识权威 | 涉及 ${domain} 代码 | AI 维护 |`;
      // 找到表格头分隔行（|---|），在其后第一行数据前插入
      const sepIndex = agents.indexOf('|---|---|');
      if (sepIndex >= 0) {
        const insertAt = agents.indexOf('\n', sepIndex) + 1;
        agents = agents.slice(0, insertAt) + line + '\n' + agents.slice(insertAt);
      } else {
        agents = agents.replace(/\s*$/, '') + '\n\n### 0.1 规范文件总表（追加）\n\n' + line + '\n';
      }
      writeFileSync(agentsPath, agents, 'utf-8');
      results.push({ where: 'AGENTS.md §0.1', done: true });
    } else {
      results.push({ where: 'AGENTS.md §0.1', done: false, skip: 'already listed' });
    }
  } else {
    results.push({ where: 'AGENTS.md（不存在，跳过）', done: false });
  }

  const readmePath = resolve(rootDir, 'ai', 'README.md');
  if (existsSync(readmePath)) {
    let readme = readFileSync(readmePath, 'utf-8');
    if (!readme.includes(`${domain}`)) {
      readme = readme.replace(/\s*$/, '') + `\n- \`${domain}\` — ${domain} 领域（自动注册 ${new Date().toISOString().slice(0, 10)}）\n`;
      writeFileSync(readmePath, readme, 'utf-8');
      results.push({ where: 'ai/README.md', done: true });
    } else {
      results.push({ where: 'ai/README.md', done: false, skip: 'already listed' });
    }
  } else {
    // 无 ai/README.md 则创建（含索引头）
    mkdirSync(resolve(rootDir, 'ai'), { recursive: true });
    const readme = `# AI Skills 索引\n\n> 由 harness skill new 自动维护。\n\n- \`${domain}\` — ${domain} 领域（自动注册 ${new Date().toISOString().slice(0, 10)}）\n`;
    writeFileSync(readmePath, readme, 'utf-8');
    results.push({ where: 'ai/README.md（新建）', done: true });
  }
  return results;
}
