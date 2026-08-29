/**
 * ac-trace.mjs — AC 追溯（设计文档 §19.4 / §十）
 *
 * PRD AC 解析、AC↔测试文件追溯（git grep，含未提交文件）、
 * PRD 未认领 AC 检查（跨任务）。与 ./ac-semantic.mjs（语义评估）配合。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { listTasks } from './state-store.mjs';

const TEST_GLOBS = ['*.rb', '*.ts', '*.tsx', '*.mjs', '*.js', '*.jsx'];

/**
 * 从 PRD 正文解析 AC 编号（忽略 HTML 注释中的示例）。
 * @param {string} content
 * @returns {string[]} 如 ['AC-001','AC-002',...]
 */
export function parseAcsFromPrd(content) {
  const stripped = String(content || '').replace(/<!--[\s\S]*?-->/g, '');
  return [...new Set([...stripped.matchAll(/AC-(\d+)/g)].map(m => `AC-${m[1]}`))];
}

/**
 * 查找 PRD 目录下的 PRD 文件（跨分类）。
 * @param {string} prdDir
 * @param {string} prdId 例如 PRD-20260828-other-xxx
 * @returns {string|null} 绝对路径
 */
export function findPrdFile(prdDir, prdId) {
  if (!prdId || !existsSync(prdDir)) return null;
  for (const cat of readdirSync(prdDir)) {
    if (cat === 'README.md' || cat === '_TEMPLATE.md' || cat.startsWith('.')) continue;
    const catDir = join(prdDir, cat);
    if (!statSync(catDir).isDirectory()) continue;
    const candidate = join(catDir, `${prdId}.md`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * 读取 PRD 的 AC 列表；PRD 不存在返回 null。
 * @param {{ rootDir:string, config:object, prdId:string }} input
 * @returns {string[]|null}
 */
export function findPrdAcs({ rootDir, config, prdId }) {
  const prdFile = findPrdFile(resolve(rootDir, config.paths?.prd || 'docs/prd'), prdId);
  if (!prdFile) return null;
  return parseAcsFromPrd(readFileSync(prdFile, 'utf-8'));
}

/**
 * 查找覆盖某 AC 的测试文件（git grep，含未跟踪文件）。
 * @param {{ rootDir:string, prdId:string, ac:string }} input
 * @returns {string[]} 相对路径列表
 */
export function findAcTestFiles({ rootDir, prdId, ac }) {
  if (!prdId || !ac) return [];
  try {
    const out = execFileSync('git', ['grep', '-l', '--untracked', `${prdId}.*${ac}`, '--', ...TEST_GLOBS], {
      cwd: rootDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * 校验 PRD 中声明 AC 的测试覆盖。
 * @param {{ rootDir:string, prdId:string, acs:string[] }} input
 * @returns {{ checked:string[], missing:string[], covered:Record<string,string[]> }}
 */
export function checkAcCoverage({ rootDir, prdId, acs = [] }) {
  const checked = [];
  const missing = [];
  const covered = {};
  for (const ac of acs) {
    const files = findAcTestFiles({ rootDir, prdId, ac });
    if (files.length === 0) missing.push(ac);
    else covered[ac] = files;
    checked.push(ac);
  }
  return { checked, missing, covered };
}

/**
 * 找出 PRD 中未被任何任务认领的 AC（跨所有任务）。
 * @param {{ rootDir:string, config:object, prdId:string }} input
 * @returns {string[]} 未认领 AC 列表
 */
export function checkUnclaimedAcs({ rootDir, config, prdId }) {
  const prdFile = findPrdFile(resolve(rootDir, config.paths?.prd || 'docs/prd'), prdId);
  if (!prdFile) return [];
  const prdAcs = new Set(parseAcsFromPrd(readFileSync(prdFile, 'utf-8')));
  const claimed = new Set();
  for (const task of listTasks(rootDir, config)) {
    if (task.linkedPrd !== prdId) continue;
    for (const ac of task.acceptanceCriteria || []) {
      const norm = /^AC-\d+$/i.test(ac) ? ac.toUpperCase() : ac;
      claimed.add(norm);
    }
  }
  return [...prdAcs].filter(ac => !claimed.has(ac));
}
