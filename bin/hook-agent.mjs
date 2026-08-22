#!/usr/bin/env node
/**
 * hook-agent.mjs — Node 化 Agent Hook 处理器（HTH-009 / F-04）
 *
 * 从 stdin 读取 Agent hook 输入（JSON），用结构化危险规则判断工具调用，
 * 输出 { decision, reason, ruleId, severity }。
 * 不使用 sed / 脆弱 grep / 不兼容的正则特性；输入含换行、Unicode、
 * 嵌套引号、超长参数均能正确处理。
 */
import { readFileSync } from 'node:fs';

// ────────────────────────────────────────────────────────────────
// 结构化危险操作规则（机器可执行，非字符串黑名单）
// ────────────────────────────────────────────────────────────────
export const DEFAULT_SAFETY_RULES = Object.freeze([
  { id: 'SR-001', pattern: /(^|[;&|\s])(rake|rails)\s+db:(drop|reset)\b/i, severity: 'critical', description: 'Destructive database command (rake/rails db:drop|reset)' },
  { id: 'SR-002', pattern: /\bDROP\s+(TABLE|DATABASE)\b/i, severity: 'critical', description: 'DROP TABLE / DROP DATABASE' },
  { id: 'SR-003', pattern: /\bDELETE\s+FROM\s+(pallastrade_)?(orders|products|variants|customers|taxons)\b/i, severity: 'critical', description: 'Mass delete on core commerce table' },
  { id: 'SR-004', pattern: /git\s+push\s+--force(\s+origin)?\s+(main|master)\b/i, severity: 'critical', description: 'Force push to production branch (main/master)' },
  { id: 'SR-005', pattern: /\b(sk_live_[A-Za-z0-9]+|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,})\b/, severity: 'critical', description: 'Writing live secret into source' },
]);

/** 把不同 Agent 的 tool_input 摊平成单一字符串（数组/对象/字符串容错） */
export function flattenToolInput(toolInput) {
  if (toolInput == null) return '';
  if (typeof toolInput === 'string') return toolInput;
  if (Array.isArray(toolInput)) return toolInput.map(String).join(' ');
  if (typeof toolInput === 'object') {
    return Object.values(toolInput)
      .map(value => (typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value)))
      .join(' ');
  }
  return String(toolInput);
}

/** 对 hook 输入做安全判定（返回决策对象） */
export function assessHookInput(input) {
  const toolName = (input?.tool_name || input?.tool) ?? '';
  const toolInput = input?.tool_input ?? input?.arguments ?? input?.input ?? '';
  const text = `${toolName} ${flattenToolInput(toolInput)}`;
  for (const rule of DEFAULT_SAFETY_RULES) {
    if (rule.pattern.test(text)) {
      return { decision: 'block', reason: rule.description, ruleId: rule.id, severity: rule.severity };
    }
  }
  return { decision: 'allow', reason: 'No safety rule matched', ruleId: null, severity: null };
}

/** CLI 入口：读 stdin JSON → 输出决策 JSON；block 时 exit 1 */
export function runHookCli() {
  let raw = '';
  try { raw = readFileSync(0, 'utf-8'); } catch { /* stdin 不可用时按 allow 处理 */ }
  let input;
  try {
    input = JSON.parse(raw || '{}');
  } catch {
    process.stdout.write(JSON.stringify({ decision: 'allow', reason: 'Unparseable hook input — not blocking on malformed JSON', ruleId: null, severity: null }));
    process.exit(0);
  }
  const result = assessHookInput(input);
  process.stdout.write(JSON.stringify(result));
  process.exit(result.decision === 'block' ? 1 : 0);
}

if (process.argv[1] && process.argv[1].replaceAll('\\', '/').endsWith('hook-agent.mjs')) {
  runHookCli();
}
