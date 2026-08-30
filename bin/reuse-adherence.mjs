/**
 * reuse-adherence.mjs — 技术方案复用决策落地校验（设计阶段治理）
 *
 * 解析 docs/designs 目录下各任务 tech-design.md 的 Part B 复用决策矩阵，
 * 对每行决策做静态可判校验（与 ac-semantic 同思路——不是人审，是可测试的确定性逻辑）：
 *   - 调用已有  ：实现源码中确实引用了目标符号（防"声明复用却自己新写"）
 *   - 扩展已有  ：依据位置的文件仍存在 / 目标符号在源码中存在（防改错归属）
 *   - 新封装公用：目标被导出 且 被 ≥1 处引用（防封装了没人用）
 *   - 新建局部  ：目标仅出现在 ≤1 个文件（防"局部却跨模块被引用"）
 * 判定不可得 → warning（不阻断，与 no_regression"历史失败不阻断"同思路）。
 *
 * CLI：harness reuse-adherence [--json]   （fail>0 → exit 1）
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { collectGlob } from './glob-utils.mjs';
import { hasArg } from './cli-utils.mjs';

export const DECISION_KINDS = ['调用已有', '扩展已有', '新封装公用', '新建局部'];

const SOURCE_PATTERNS = [
  'src/**/*.{js,ts,mjs,jsx,tsx}',
  'app/**/*.{js,ts,mjs,jsx,tsx}',
  'lib/**/*.{js,ts,mjs}',
  'utils/**/*.{js,ts,mjs}',
  'bin/*.mjs',
  'templates/**/*.{js,ts,mjs}',
  'pages/**/*.{js,ts,jsx,tsx}',
  'components/**/*.{js,ts,jsx,tsx}',
];

/** 从 tech-design.md 正文解析 Part B 复用决策矩阵（表格行） */
export function parseReuseMatrix(content) {
  const rows = [];
  const lines = String(content || '').split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const parts = t.split('|').map(c => c.trim()).slice(1, -1);
    if (parts.length < 3) continue;
    const decision = parts.find(p => DECISION_KINDS.includes(p));
    if (!decision) continue; // 表头 / 分隔行 / 无决策关键词的行
    const di = parts.indexOf(decision);
    rows.push({
      need: parts[0],
      decision,
      target: parts[di + 1] || '',
      basis: parts[di + 2] || '',
    });
  }
  return rows;
}

function collectSourceFiles(rootDir) {
  const seen = new Set();
  const files = [];
  for (const pattern of SOURCE_PATTERNS) {
    for (const abs of collectGlob(rootDir, pattern)) {
      if (seen.has(abs)) continue;
      seen.add(abs);
      files.push(abs);
    }
  }
  return files;
}

function symbolOccurrences(files, symbol, exclude) {
  let count = 0;
  for (const f of files) {
    if (exclude.has(f)) continue;
    try {
      if (readFileSync(f, 'utf-8').includes(symbol)) count++;
    } catch { /* ignore */ }
  }
  return count;
}

function filesExporting(files, symbol, exclude) {
  const out = [];
  for (const f of files) {
    if (exclude.has(f)) continue;
    try {
      const content = readFileSync(f, 'utf-8');
      const re = /\bexport\s+(?:async\s+)?(?:function|const|class|let|var)\s+([A-Za-z_$][\w$]*)/g;
      let m;
      while ((m = re.exec(content)) !== null) {
        if (m[1] === symbol) { out.push(f); break; }
      }
    } catch { /* ignore */ }
  }
  return out;
}

/** 在"非定义文件"中引用目标符号的文件数（排除导出定义文件自身） */
function symbolUsers(files, symbol, exclude, exporters) {
  const exporterSet = new Set(exporters);
  let count = 0;
  for (const f of files) {
    if (exclude.has(f) || exporterSet.has(f)) continue;
    try {
      if (readFileSync(f, 'utf-8').includes(symbol)) count++;
    } catch { /* ignore */ }
  }
  return count;
}

/** 校验单行决策 */
export function checkReuseRow({ row, files, exclude }) {
  const { decision, target, basis } = row;
  if (!target) return { ...row, verdict: 'warning', reason: 'missing target symbol' };

  if (decision === '调用已有') {
    const exporters = filesExporting(files, target, exclude);
    const users = symbolUsers(files, target, exclude, exporters);
    if (users >= 1) return { ...row, verdict: 'pass', reason: `${target} referenced in ${users} non-defining file(s)` };
    return { ...row, verdict: 'fail', reason: `declared 调用已有 ${target} but not referenced outside its definition` };
  }

  if (decision === '扩展已有') {
    if (basis) {
      const baseFile = basis.split(':')[0].trim();
      if (baseFile && existsSync(join(process.cwd(), baseFile))) {
        return { ...row, verdict: 'pass', reason: `basis file exists (${baseFile})` };
      }
    }
    if (symbolOccurrences(files, target, exclude) >= 1) {
      return { ...row, verdict: 'pass', reason: `${target} exists in source` };
    }
    return { ...row, verdict: 'warning', reason: `cannot verify extension target (${target || basis || 'no info'})` };
  }

  if (decision === '新封装公用') {
    const exporters = filesExporting(files, target, exclude);
    const occ = symbolOccurrences(files, target, exclude);
    if (exporters.length === 0) return { ...row, verdict: 'fail', reason: `declared 新封装公用 ${target} but not exported anywhere` };
    if (occ < 2) return { ...row, verdict: 'fail', reason: `${target} exported but not referenced (封装了没人用, occ=${occ})` };
    return { ...row, verdict: 'pass', reason: `${target} exported in ${exporters.length} file(s) and referenced` };
  }

  if (decision === '新建局部') {
    const occ = symbolOccurrences(files, target, exclude);
    if (occ <= 1) return { ...row, verdict: 'pass', reason: `${target} is local (${occ} file)` };
    return { ...row, verdict: 'fail', reason: `${target} referenced in ${occ} files but declared 新建局部 (should be 公用)` };
  }

  return { ...row, verdict: 'warning', reason: `unknown decision: ${decision}` };
}

/** 校验 docs/designs 下各任务 tech-design.md 的全部复用决策 */
export function checkReuseAdherence({ rootDir, designsDir = 'docs/designs' }) {
  const designAbs = new Set();
  const files = collectSourceFiles(rootDir);
  const techDesigns = [];
  for (const pattern of [`${designsDir.replace(/^\.\//, '')}/**/tech-design.md`]) {
    for (const abs of collectGlob(rootDir, pattern)) {
      designAbs.add(abs);
      techDesigns.push(abs);
    }
  }
  const checks = [];
  for (const td of techDesigns) {
    let content = '';
    try { content = readFileSync(td, 'utf-8'); } catch { continue; }
    const relPath = relative(rootDir, td).replaceAll('\\', '/');
    for (const row of parseReuseMatrix(content)) {
      const result = checkReuseRow({ row, files, exclude: designAbs });
      checks.push({ file: relPath, ...result });
    }
  }
  const verdicts = { pass: 0, fail: 0, warning: 0 };
  for (const c of checks) verdicts[c.verdict] = (verdicts[c.verdict] || 0) + 1;
  return { techDesigns: techDesigns.length, checks, verdicts };
}

/** CLI：harness reuse-adherence [--json]（fail>0 → exit 1） */
export function runReuseAdherence({ rootDir, args, config }) {
  const json = hasArg(args, '--json') || hasArg(args, '--format');
  const designsDir = config.designStage?.designsDir || 'docs/designs';
  const result = checkReuseAdherence({ rootDir, designsDir });
  if (result.techDesigns === 0) {
    if (json) console.log(JSON.stringify({ status: 'no_tech_design', ...result }, null, 2));
    else console.log('🟡 no tech-design.md found — reuse-adherence skipped (create docs/designs/<task>/tech-design.md for feature tasks)');
    return;
  }
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`🔎 复用决策落地校验: ${result.techDesigns} 份 tech-design，${result.verdicts.pass} pass / ${result.verdicts.fail} fail / ${result.verdicts.warning} warning`);
    for (const c of result.checks) {
      if (c.verdict === 'fail') console.log(`   ❌ FAIL ${c.need} (${c.decision} ${c.target}) — ${c.reason} @ ${c.file}`);
    }
    for (const c of result.checks) {
      if (c.verdict === 'warning') console.log(`   🟡 WARN ${c.need} (${c.decision}) — ${c.reason} @ ${c.file}`);
    }
  }
  if (result.verdicts.fail > 0) process.exitCode = 1;
}
