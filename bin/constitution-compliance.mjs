/**
 * constitution-compliance.mjs — Architecture / Tech Stack 合规审查（Batch C / C13）
 *
 * 定位：**不新造 Checker 体系**——由 Constitution 机读制品（Batch B 的 schema 产出）
 * 派生确定性违规收集器，由现有 Supervisor（`domain-supervisors.mjs`）包装为 Finding：
 *   architecture.json → dependency_rules.deny 违规（blocking）
 *   tech-stack.json   → restricted / deprecated 技术使用（blocking）· 未登记依赖（warning）
 *
 * 无制品 → 返回空（不产生噪音）；不重写 Supervisor。
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { listArtifacts } from './project-artifacts.mjs';

/** 读取机读制品：制品 `x.md` 约定同目录同名 `.json` 为机读形态。 */
export function loadMachineArtifacts({ rootDir, config }) {
  const artifacts = listArtifacts({ rootDir, config });
  const byId = Object.fromEntries(artifacts.map(artifact => [artifact.id, artifact]));
  const load = id => {
    const artifact = byId[id];
    if (!artifact) return null;
    const machinePath = resolve(rootDir, String(artifact.path).replace(/\.md$/, '.json'));
    if (!existsSync(machinePath)) return null;
    try {
      return JSON.parse(readFileSync(machinePath, 'utf-8'));
    } catch {
      return null;
    }
  };
  return { architecture: load('architecture'), techStack: load('tech_stack') };
}

function importSpecifiers(text) {
  return [...String(text).matchAll(/(?:from\s+|import\s*\(?\s*|require\(\s*)['"]([^'"]+)['"]/g)].map(match => match[1]);
}

const SOURCE_FILE_RE = /\.(?:mjs|cjs|js|jsx|ts|tsx)$/i;

/** architecture.dependency_rules.deny 违规收集（纯函数）。 */
export function collectArchitectureViolations({ architecture, lines = [] }) {
  const violations = [];
  if (!architecture) return violations;
  for (const rule of architecture.dependency_rules || []) {
    const deny = Array.isArray(rule.deny) ? rule.deny : [];
    if (deny.length === 0) continue;
    for (const item of lines) {
      for (const specifier of importSpecifiers(item.text)) {
        if (!deny.some(pattern => specifier === pattern || specifier.includes(pattern))) continue;
        violations.push({
          standardId: 'STD-ARCH-001',
          file: item.file,
          line: item.line,
          message: `[${rule.id}] dependency "${specifier}" denied by architecture rule (${rule.rule})`,
          recommendation: rule.reason || 'Adjust dependency direction per architecture artifact, or open a Decision',
          blocking: true,
        });
      }
    }
  }
  return violations;
}

/**
 * tech-stack 限制/弃用技术 + 未登记依赖收集（纯函数）。
 * 检测口径（避免文档文本误报）：
 *   ① 受限/弃用技术：仅看**源码文件**的 import/require 说明符；
 *   ② 依赖清单：`package.json` 的 dependencies/devDependencies 名称（含受限名单命中）；
 *   ③ 未登记依赖：清单中存在、制品未声明的依赖 → warning。
 */
function restrictedEntries(techStack) {
  return [
    ...(techStack.restrictions || []),
    ...(techStack.deprecated_technologies || []).map(item => ({
      technology: item.technology, reason: 'deprecated', instead: item.migration_target,
    })),
  ].filter(entry => entry.technology);
}

function restrictedIndex(entries) {
  return new Map(entries.map(entry => [String(entry.technology).toLowerCase(), entry]));
}

function restrictedImportViolations({ lines, restrictedByName }) {
  const violations = [];
  for (const item of lines) {
    if (!SOURCE_FILE_RE.test(String(item.file))) continue;
    for (const specifier of importSpecifiers(item.text)) {
      const entry = restrictedByName.get(specifier.toLowerCase());
      if (!entry) continue;
      violations.push({
        standardId: 'STD-TECH-001',
        file: item.file,
        line: item.line,
        message: `restricted/deprecated technology "${entry.technology}" imported in changed code (${entry.reason || 'restricted'})`,
        recommendation: entry.instead ? `Use ${entry.instead}` : 'Remove the import or update the tech-stack artifact through a Decision',
        blocking: true,
      });
    }
  }
  return violations;
}

function dependencyViolations({ rootDir, files, techStack, restrictedByName }) {
  const normalizedFiles = (files || []).map(file => String(file).replaceAll('\\', '/'));
  if (!rootDir || !normalizedFiles.includes('package.json')) return [];
  let pkg = null;
  try {
    pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf-8'));
  } catch {
    return []; // package.json unreadable → skip
  }
  const declared = new Set([
    ...(techStack.current_technologies || []).map(item => item.technology),
    ...(techStack.approved_libraries || []).map(item => item.library),
  ].filter(Boolean).map(name => String(name).toLowerCase()));
  const violations = [];
  for (const name of [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})]) {
    const restrictedEntry = restrictedByName.get(name.toLowerCase());
    if (restrictedEntry) {
      violations.push({
        standardId: 'STD-TECH-001',
        file: 'package.json',
        line: 1,
        message: `restricted technology "${name}" declared as dependency (${restrictedEntry.reason || 'restricted'})`,
        recommendation: restrictedEntry.instead ? `Use ${restrictedEntry.instead}` : 'Remove the dependency or update the tech-stack artifact through a Decision',
        blocking: true,
      });
      continue;
    }
    if (declared.has(name.toLowerCase())) continue;
    violations.push({
      standardId: 'STD-TECH-001',
      file: 'package.json',
      line: 1,
      message: `dependency "${name}" is not declared in the tech_stack artifact`,
      recommendation: 'Register it in tech-stack.md/json (with a Decision when structural) or remove the dependency',
      blocking: false,
    });
  }
  return violations;
}

/** 编排：受限导入 + 依赖清单两类违规（各自独立可测）。 */
export function collectTechStackViolations({ techStack, lines = [], files = [], rootDir = null }) {
  if (!techStack) return [];
  const restrictedByName = restrictedIndex(restrictedEntries(techStack));
  return [
    ...restrictedImportViolations({ lines, restrictedByName }),
    ...dependencyViolations({ rootDir, files, techStack, restrictedByName }),
  ];
}
