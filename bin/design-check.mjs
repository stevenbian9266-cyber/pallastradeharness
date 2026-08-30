/**
 * design-check.mjs — 设计产物机器校验（设计阶段治理 §十九·补 19A.4）
 *
 * 把 feature gate 中 6 个设计检查项从"人工 clear"升级为"机器可校验"：
 *   - create-ui-doc / create-interaction-spec / create-visual-spec / create-tech-design
 *     → docs/designs/<taskId>/ 下 4 个设计文档存在性
 *   - tech-design-has-baseline → tech-design.md 含 Part A 四节（A1 业务系统盘点/A2 数据模型识别/A3 字段盘点/A4 代码结构）
 *   - tech-design-has-reuse-matrix → tech-design.md 含 Part B 复用决策矩阵（≥1 有效行）
 *
 * CLI：harness design:check [--task <id>] [--json]（fail>0 → exit 1）
 * 被 gate:clear 拦截复用：gate:clear --clear <6 项之一> 必须先通过对应机器校验。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseReuseMatrix } from './reuse-adherence.mjs';
import { getArg, hasArg } from './cli-utils.mjs';

// 机器可校验的设计检查项（design-confirmed 保持人工 WAIT，不在此列）
export const MACHINE_DESIGN_CHECKS = [
  'create-ui-doc',
  'create-interaction-spec',
  'create-visual-spec',
  'create-tech-design',
  'tech-design-has-baseline',
  'tech-design-has-reuse-matrix',
];

export const DESIGN_FILE_MAP = {
  'create-ui-doc': 'ui.md',
  'create-interaction-spec': 'interaction.md',
  'create-visual-spec': 'visual.md',
  'create-tech-design': 'tech-design.md',
};

/** 校验 tech-design.md 的 Part A 现状识别四节是否齐全 */
export function checkBaselineSections(content) {
  const missing = [];
  if (!content.includes('A1')) missing.push('A1 业务系统盘点');
  if (!content.includes('A2')) missing.push('A2 数据模型识别');
  if (!content.includes('A3')) missing.push('A3 字段盘点');
  if (!content.includes('A4')) missing.push('A4 代码结构');
  const pass = missing.length === 0;
  return { pass, reason: pass ? 'Part A 现状识别四节齐全' : `Part A 缺: ${missing.join(', ')}` };
}

/** 校验 tech-design.md 的 Part B 复用决策矩阵是否有有效决策行 */
export function checkReuseMatrix(content) {
  const rows = parseReuseMatrix(content);
  const pass = rows.length >= 1;
  return { pass, reason: pass ? `Part B 复用决策矩阵 ${rows.length} 个有效决策行` : 'Part B 无有效复用决策行（决策列限: 调用已有/扩展已有/新封装公用/新建局部）' };
}

/**
 * 校验指定任务的设计产物（6 项）。
 * @param {object} opts { rootDir, designsDir='docs/designs', taskId=null, only=null }
 *   taskId 为空时扫描 designsDir 下全部任务子目录；only 指定时只返回该项（gate:clear 用）。
 */
export function checkDesignArtifacts({ rootDir, designsDir = 'docs/designs', taskId = null, only = null }) {
  const base = join(rootDir, designsDir);
  const taskIds = taskId ? [taskId] : collectTaskIds(base);
  const results = {};
  for (const tid of taskIds) {
    const taskDir = join(base, tid);
    // 4 个文档存在性
    for (const [id, file] of Object.entries(DESIGN_FILE_MAP)) {
      const p = join(taskDir, file);
      const rp = relative(rootDir, p).replaceAll('\\', '/');
      results[id] = { pass: existsSync(p), reason: existsSync(p) ? `${rp} present` : `missing ${rp}` };
    }
    // tech-design 内容校验
    const techPath = join(taskDir, 'tech-design.md');
    let tech = '';
    if (existsSync(techPath)) {
      try { tech = readFileSync(techPath, 'utf-8'); } catch { /* keep empty */ }
    }
    results['tech-design-has-baseline'] = checkBaselineSections(tech);
    results['tech-design-has-reuse-matrix'] = checkReuseMatrix(tech);
  }
  if (only) return { [only]: results[only] || { pass: false, reason: `unknown check: ${only}` } };
  return results;
}

function collectTaskIds(base) {
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort();
}

/** CLI：harness design:check [--task <id>] [--json] */
export function runDesignCheck({ rootDir, args, config }) {
  const taskId = getArg(args, '--task') || null;
  const json = hasArg(args, '--json') || hasArg(args, '--format');
  const designsDir = config.designStage?.designsDir || 'docs/designs';
  const results = checkDesignArtifacts({ rootDir, designsDir, taskId });
  const fails = Object.values(results).filter(r => !r.pass).length;
  if (json) {
    console.log(JSON.stringify({ taskId, designsDir, results }, null, 2));
  } else {
    console.log(`🔎 设计产物校验（${designsDir}${taskId ? `/${taskId}` : ''}）`);
    for (const [id, r] of Object.entries(results)) {
      console.log(`   ${r.pass ? '✅' : '❌'} ${id}: ${r.reason}`);
    }
    if (fails > 0) console.log(`\n❌ ${fails} 项未通过 — 补齐设计产物后重试（模板: templates/designs/）`);
    else console.log(`\n✅ 设计产物齐全，可 clear 设计检查项。`);
  }
  if (fails > 0) process.exitCode = 1;
}
