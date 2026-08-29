/**
 * scan-ui-anti-patterns.mjs — UI 反模式扫描（设计文档 §18.1）
 *
 * 机器可执行 UI 约束：禁止 inline style（UI-001）、禁止硬编码十六进制颜色（UI-002）、
 * 禁止绕过服务层裸网络调用（UI-003）、<img> 必须带 alt（UI-005）。
 *
 * 规则来源：`harness/policies/ui-anti-patterns.json`（config.scanners.uiAntiPatterns）；
 * 无规则文件时使用内置 DEFAULT_UI_RULES（开箱即用）。
 */
import { readFileSync, existsSync, statSync, globSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig, resolveProjectRoot } from './config-loader.mjs';
import { recordScan } from './stats.mjs';

// 内置默认 UI 规则（无规则文件时的兜底；项目可用 ui-anti-patterns.json 覆盖）
export const DEFAULT_UI_RULES = Object.freeze([
  {
    id: 'UI-001', severity: 'error',
    pattern: 'style\\s*=\\{\\{',
    fileGlob: '**/*.{tsx,jsx,html,vue}',
    excludeGlob: '**/node_modules/**|**/dist/**|**/.next/**|**/build/**',
    message: '禁止 inline style（设计文档 §18.1 UI-001）',
    fix: '使用 design token 生成的 className / 组件库属性',
  },
  {
    id: 'UI-002', severity: 'error',
    pattern: '#[0-9a-fA-F]{3,8}\\b',
    fileGlob: '**/*.{ts,tsx,js,jsx,css,scss,html,vue}',
    excludeGlob: '**/node_modules/**|**/dist/**|**/.next/**|**/build/**|**/*design-token*|**/*.tokens.*|**/tokens/**|**/design-tokens/**',
    message: '禁止硬编码十六进制颜色（设计文档 §18.1 UI-002）',
    fix: '引用 .harness/design-tokens.json 的语义色 token',
  },
  {
    id: 'UI-003', severity: 'error',
    pattern: '\\bfetch\\s*\\(',
    fileGlob: '**/*.{ts,tsx,js,jsx}',
    excludeGlob: '**/node_modules/**|**/dist/**|**/.next/**|**/build/**|**/*.test.*|**/test/**',
    message: '禁止组件内裸网络调用（设计文档 §18.1 UI-003）',
    fix: '通过服务层 / SDK 访问数据，禁止组件直接 fetch',
  },
  {
    id: 'UI-005', severity: 'error',
    pattern: '<img\\b(?![^>]*\\balt\\s*=)',
    fileGlob: '**/*.{tsx,jsx,html,vue}',
    excludeGlob: '**/node_modules/**|**/dist/**|**/.next/**|**/build/**',
    message: '<img> 必须带 alt（可访问性，设计文档 §18.1）',
    fix: '补充描述性 alt，或装饰性图片加 alt="" / role="presentation"',
  },
]);

export function loadUiRules(rootDir, config) {
  const rulesPath = resolve(rootDir, config?.scanners?.uiAntiPatterns || 'harness/policies/ui-anti-patterns.json');
  if (!existsSync(rulesPath)) return DEFAULT_UI_RULES;
  try {
    const parsed = JSON.parse(readFileSync(rulesPath, 'utf-8'));
    return Array.isArray(parsed?.rules) && parsed.rules.length > 0 ? parsed.rules : DEFAULT_UI_RULES;
  } catch {
    return DEFAULT_UI_RULES;
  }
}

export function scan({ rootDir, files: fileFilter = null, config }) {
  const rules = loadUiRules(rootDir, config);
  let totalViolations = 0;
  let errors = 0;
  let warnings = 0;
  let scanErrors = 0;
  const byRule = {};

  for (const rule of rules) {
    try {
      const excludes = rule.excludeGlob ? rule.excludeGlob.split('|').map(s => s.trim()).filter(Boolean) : [];
      const fileGlob = rule.fileGlob && typeof rule.fileGlob === 'string' ? rule.fileGlob : '**/*';
      const globbed = globSync(fileGlob, { cwd: rootDir, exclude: excludes });
      const norm = p => p.split('\\').join('/');
      const files = fileFilter
        ? fileFilter.map(norm).filter(f => globbed.map(norm).includes(f))
        : globbed;

      for (const file of files) {
        const filePath = resolve(rootDir, file);
        if (!existsSync(filePath)) continue;
        if (statSync(filePath).isDirectory()) continue;

        const content = readFileSync(filePath, 'utf-8');
        const regex = new RegExp(rule.pattern, 'gm');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          regex.lastIndex = 0;
          if (regex.test(lines[i])) {
            const lineNum = i + 1;
            const icon = rule.severity === 'error' ? '❌' : '⚠️';
            console.log(`${icon} ${rule.id} [${rule.severity}] ${file}:${lineNum}`);
            console.log(`   ${rule.message}`);
            console.log(`   Fix: ${rule.fix}`);
            console.log(`   Code: ${lines[i].trim().slice(0, 120)}`);
            console.log('');
            totalViolations++;
            if (rule.severity === 'error') errors++;
            else warnings++;
            byRule[rule.id] = (byRule[rule.id] || 0) + 1;
          }
        }
      }
    } catch (e) {
      scanErrors++;
      console.log(`❌ Rule ${rule.id}: error scanning: ${e.message}`);
    }
  }

  try { recordScan(rootDir, { type: 'ui-anti-patterns', total: totalViolations, errors, warnings, byRule }); } catch { /* stats 可选 */ }

  if (scanErrors > 0) {
    console.log(`\n❌ ${scanErrors} rule(s) failed to scan — failing the check.`);
    process.exit(1);
  }

  if (totalViolations === 0) {
    console.log('✅ No UI anti-patterns detected.');
  } else {
    console.log(`${totalViolations} violation(s): ${errors} error(s), ${warnings} warning(s).`);
    if (errors > 0) {
      console.log('❌ UI anti-pattern scan failed with errors.');
      process.exit(1);
    }
  }
}

// CLI entry
const args = process.argv.slice(2);
if (args.length > 0 && args[0] === 'scan') {
  const rootDir = resolveProjectRoot();
  const filesIdx = args.indexOf('--files');
  const files = filesIdx >= 0 && args[filesIdx + 1]
    ? args[filesIdx + 1].split(',').map(s => s.trim()).filter(Boolean)
    : null;
  const { config } = await loadConfig({ rootDir });
  scan({ rootDir, files, config });
}
