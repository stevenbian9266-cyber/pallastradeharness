import { minimatch } from 'minimatch';
import { createContract } from './contracts.mjs';

const RANK = Object.freeze({ quick: 0, standard: 1, critical: 2 });

const CRITICAL_TOKENS = [
  'payment', '支付', 'auth', '权限', 'security', '安全', 'migration', 'database', '数据库',
  'deploy', 'deployment', '发布', 'secret', 'credential', 'delete data', 'drop table',
];
const STANDARD_TOKENS = [
  'api', 'dependency', '依赖', 'refactor', '重构', 'architecture', '架构', 'config',
  'component', '交互', 'style', '样式', 'documentation', '文档',
];
const CRITICAL_SEMANTICS = [
  /\bDROP\s+(?:TABLE|DATABASE)\b/i,
  /\b(?:delete_all|destroy_all|truncate)\b/i,
  /\b(?:chmod\s+777|push\s+--force)\b/i,
  /\b(?:eval|new\s+Function)\s*\(/,
  /(?:sk_live_|AKIA[0-9A-Z]{12,}|ghp_[A-Za-z0-9]{20,})/,
];

function normalize(path) {
  return String(path || '').replaceAll('\\', '/');
}

function levelFromText(text) {
  const lower = String(text || '').toLowerCase();
  if (CRITICAL_TOKENS.some(token => lower.includes(token))) return 'critical';
  if (STANDARD_TOKENS.some(token => lower.includes(token))) return 'standard';
  return 'quick';
}

function levelFromPaths(files, config) {
  const critical = config.risk?.criticalPaths || [];
  const standard = config.risk?.standardPaths || [];
  if (files.some(file => critical.some(pattern => minimatch(normalize(file), pattern, { dot: true, nocase: true })))) return 'critical';
  if (files.some(file => standard.some(pattern => minimatch(normalize(file), pattern, { dot: true, nocase: true })))) return 'standard';
  return 'quick';
}

function levelFromSemantics(diff) {
  if (CRITICAL_SEMANTICS.some(pattern => pattern.test(String(diff || '')))) return 'critical';
  return 'quick';
}

export function highestRisk(...levels) {
  return levels.filter(Boolean).sort((a, b) => RANK[b] - RANK[a])[0] || 'quick';
}

export function riskProfile(level) {
  const profiles = {
    quick: {
      stages: ['context', 'implementation', 'verification'],
      requiredEvidence: ['test'],
      recoveryRequired: false,
    },
    standard: {
      stages: ['context', 'risk', 'standards', 'plan', 'implementation', 'review', 'verification', 'knowledge'],
      requiredEvidence: ['test', 'review', 'knowledge'],
      recoveryRequired: false,
    },
    critical: {
      stages: ['context', 'risk', 'standards', 'design', 'approval', 'plan', 'implementation', 'review', 'verification', 'knowledge', 'recovery'],
      requiredEvidence: ['test', 'review', 'approval', 'knowledge'],
      recoveryRequired: true,
    },
  };
  return profiles[level] || profiles.standard;
}

export function assessRisk({ task = '', files = [], diff = '', declared = null, config = {} }) {
  const textLevel = levelFromText(task);
  const pathLevel = levelFromPaths(files, config);
  const semanticLevel = levelFromSemantics(diff);
  const declaredLevel = RANK[declared] === undefined ? 'quick' : declared;
  const level = highestRisk(declaredLevel, pathLevel, semanticLevel, textLevel);
  const reasons = [];
  if (declared && declared !== 'quick') reasons.push(`User declared ${declared} risk`);
  if (textLevel !== 'quick') reasons.push(`Task description triggered ${textLevel} governance`);
  if (pathLevel !== 'quick') reasons.push(`Changed path scope triggered ${pathLevel} governance`);
  if (semanticLevel !== 'quick') reasons.push('Changed code contains critical-risk semantics');
  if (reasons.length === 0) reasons.push('No standard or critical risk trigger detected');
  const profile = riskProfile(level);
  return createContract('Risk', {
    id: `RISK-${Date.now().toString(36)}`,
    level,
    reasons,
    factors: { declared: declaredLevel, task: textLevel, paths: pathLevel, semantics: semanticLevel },
    requiredEvidence: profile.requiredEvidence,
    recoveryRequired: profile.recoveryRequired,
    stages: profile.stages,
  });
}

export function mergeRisk(current, reassessed, { override = null, reason = null } = {}) {
  if (override) {
    if (RANK[override] === undefined) throw new TypeError(`Unknown risk override: ${override}`);
    if (!reason) throw new TypeError('Risk override requires a reason');
    return { ...reassessed, level: override, reasons: [...reassessed.reasons, `Explicit override: ${reason}`], override: { level: override, reason } };
  }
  if (!current || RANK[reassessed.level] >= RANK[current.level]) return reassessed;
  return { ...current, reasons: [...new Set([...(current.reasons || []), ...(reassessed.reasons || []), 'Risk cannot be lowered implicitly'])] };
}
