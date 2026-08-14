// bin/review.mjs — 复盘驱动的规则自升级（AI 复盘 → 规则提案 → 写回通用规则库）
//
// 命令：
//   harness review new                       → 生成复盘文档骨架（harness/reviews/REVIEW-YYYYMMDD.md）
//   harness review propose [--path <md>]     → 解析复盘 → 对比规则库 → 输出提案（新增/更新/跳过）
//   harness review apply   [--path <md>] [--only H1,H2] [--dry-run] → 把提案写回 rules/base-*.json
//   harness review status                    → 列出已有复盘文档
//
// 复盘文档约定（机器可解析）：
//   ## 可沉淀规则
//   ### H1: <标题>
//   - kind: anti-pattern | standard | engine | docs
//   - target: rules/base-anti-patterns.json | rules/base-standards.json | docs/<file>
//   - priority: P0 | P1 | P2
//   - id: <可选，缺省自动生成>
//   - pattern: <anti-pattern 匹配串>
//   - fileGlob: <anti-pattern 适用文件>
//   - message: <anti-pattern 提示>
//   - fix: <修复建议>
//   - title: <standard 标题>
//   - category: <standard 分类>
//   - rule: <通用规则正文（写入 standard.fix 或 docs 内容）>
//
// 引擎改进（kind=engine）与文档（kind=docs）不自动改包，输出到"待人工/发版"清单。

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getArg, hasArg } from './cli-utils.mjs'

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REVIEWS_DIR = (rootDir) => resolve(rootDir, 'harness', 'reviews')

// ---------------------------------------------------------------------------
// 复盘文档解析
// ---------------------------------------------------------------------------
function parseReview(rawContent) {
  const content = rawContent.replace(/\r\n?/g, '\n')
  const proposals = []
  let current = null
  for (const line of content.split('\n')) {
    const header = line.match(/^###\s+(H\d+)[.:]\s*(.+)$/)
    if (header) {
      current = { id: header[1], title: header[2].trim(), fields: {} }
      proposals.push(current)
      continue
    }
    if (!current) continue
    const field = line.match(/^-\s*([a-z][a-z-]*):\s*(.*)$/i)
    if (field) current.fields[field[1].toLowerCase()] = field[2].trim()
  }
  return proposals
}

function now() {
  return new Date().toISOString()
}

// ---------------------------------------------------------------------------
// 规则库读写
// ---------------------------------------------------------------------------
function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function writeJson(file, data) {
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function ruleTargetPath(target) {
  if (target === 'rules/base-anti-patterns.json') return join(PKG_ROOT, 'rules', 'base-anti-patterns.json')
  if (target === 'rules/base-standards.json') return join(PKG_ROOT, 'rules', 'base-standards.json')
  return null
}

function nextRuleId(existing, prefix) {
  const nums = (existing || []).map((r) => {
    const m = (r.id || '').match(new RegExp(`${prefix}-(\\d+)`))
    return m ? parseInt(m[1], 10) : 0
  })
  const max = nums.length ? Math.max(...nums) : 0
  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

// ---------------------------------------------------------------------------
// 提案生成（propose）
// ---------------------------------------------------------------------------
function proposeReview(proposals) {
  const anti = readJson(join(PKG_ROOT, 'rules', 'base-anti-patterns.json')) || { rules: [] }
  const std = readJson(join(PKG_ROOT, 'rules', 'base-standards.json')) || { standards: [] }
  const existingAnti = anti.rules || []
  const existingStd = std.standards || []

  return proposals.map((p) => {
    const f = p.fields
    const kind = (f.kind || 'docs').toLowerCase()
    const target = f.target || ''
    const priority = (f.priority || 'P2').toUpperCase()

    // 查重：同 target + 标题/内容近似
    let duplicate = null
    if (target.includes('base-anti-patterns')) {
      duplicate = existingAnti.find((r) =>
        (r.message || '').toLowerCase().includes(p.title.toLowerCase()) ||
        (f.pattern && r.pattern === f.pattern))
    } else if (target.includes('base-standards')) {
      duplicate = existingStd.find((s) =>
        (s.title || '').toLowerCase().includes(p.title.toLowerCase()))
    }

    const action = duplicate ? 'update' : 'add'
    return {
      id: p.id,
      title: p.title,
      kind,
      target,
      priority,
      action: duplicate ? 'update' : 'add',
      duplicateId: duplicate ? (duplicate.id || duplicate.title) : null,
      fields: f,
    }
  })
}

// ---------------------------------------------------------------------------
// 提案应用（apply）
// ---------------------------------------------------------------------------
function buildAntiPatternRule(proposal) {
  const f = proposal.fields
  const target = ruleTargetPath('rules/base-anti-patterns.json')
  const existing = readJson(target) || { rules: [] }
  const id = f.id || nextRuleId(existing.rules, 'REVIEW-AP')
  return {
    id,
    severity: (f.severity || 'warning').toLowerCase(),
    pattern: f.pattern || '',
    fileGlob: f.fileglob || '**/*',
    excludeGlob: f.excludeglob || '**/node_modules/**|**/dist/**|**/.next/**|**/*.test.*|**/*.spec.*',
    message: f.message || proposal.title,
    fix: f.fix || proposal.title,
  }
}

function buildStandard(proposal) {
  const f = proposal.fields
  const target = ruleTargetPath('rules/base-standards.json')
  const existing = readJson(target) || { standards: [] }
  const id = f.id || nextRuleId(existing.standards, 'STD-REVIEW')
  return {
    schemaVersion: '1.0',
    type: 'Standard',
    id,
    category: (f.category || 'knowledge').toLowerCase(),
    title: f.title || proposal.title,
    authority: { file: 'harness review', section: proposal.id },
    scope: ['**/*'],
    severity: (f.severity || 'error').toLowerCase(),
    enforcement: { level: (f.enforcement || 'blocking').toLowerCase(), type: 'deterministic', verifier: 'review-derived' },
    evidence: ['review-doc'],
    fix: f.rule || f.fix || proposal.title,
    exception: { allowed: true, requiresReason: true },
    knowledgeImpact: [],
  }
}

function applyProposals(proposals, only, dryRun) {
  const applied = []
  const engineDocs = []

  for (const p of proposals) {
    if (only.length > 0 && !only.includes(p.id)) continue
    const kind = (p.fields.kind || 'docs').toLowerCase()
    const priority = (p.fields.priority || 'P2').toUpperCase()
    const target = p.fields.target || ''

    if (kind === 'anti-pattern') {
      const path = ruleTargetPath('rules/base-anti-patterns.json')
      const data = readJson(path) || { rules: [] }
      const rule = buildAntiPatternRule(p)
      const existed = data.rules.some((r) => r.id === rule.id)
      const idx = data.rules.findIndex((r) => r.id === rule.id)
      if (idx >= 0) data.rules[idx] = rule
      else data.rules.push(rule)
      if (!dryRun) writeJson(path, data)
      applied.push({ id: p.id, action: existed ? 'update' : 'add', target: 'rules/base-anti-patterns.json', ruleId: rule.id })
    } else if (kind === 'standard') {
      const path = ruleTargetPath('rules/base-standards.json')
      const data = readJson(path) || { standards: [] }
      const std = buildStandard(p)
      const existed = data.standards.some((s) => s.id === std.id)
      const idx = data.standards.findIndex((s) => s.id === std.id)
      if (idx >= 0) data.standards[idx] = std
      else data.standards.push(std)
      if (!dryRun) writeJson(path, data)
      applied.push({ id: p.id, action: existed ? 'update' : 'add', target: 'rules/base-standards.json', ruleId: std.id })
    } else {
      // engine / docs：不自动改包，输出待办
      engineDocs.push({ id: p.id, title: p.title, kind, target, priority })
    }
  }

  return { applied, engineDocs }
}

// ---------------------------------------------------------------------------
// 骨架生成（new）
// ---------------------------------------------------------------------------
function reviewTemplate(dateStr) {
  return `# REVIEW-${dateStr} — <标题>

> 场景：<本次任务的一句话概述>
> 生成：harness review new（AI 复盘驱动）

---

## 一、任务清单与结果

| # | 任务 | 结果 | 关键教训 |
|---|---|---|---|
| 1 | <任务> | ✅/❌ | <一句话> |

---

## 二、可沉淀规则（供 harness review propose/apply）

> 按价值排序。kind：anti-pattern | standard | engine | docs；
> target：rules/base-anti-patterns.json | rules/base-standards.json | docs/<file>。

### H1: <规则标题>

- kind: standard
- target: rules/base-standards.json
- priority: P1
- title: <规则标题>
- category: process
- rule: <通用规则正文>

### H2: <规则标题>

- kind: anti-pattern
- target: rules/base-anti-patterns.json
- priority: P2
- pattern: <正则>
- fileGlob: **/*
- message: <提示>
- fix: <修复建议>
`
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------
export function runReview({ rootDir, args }) {
  const sub = args[1] || 'status'
  const reviewsDir = REVIEWS_DIR(rootDir)

  if (sub === 'new') {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    mkdirSync(reviewsDir, { recursive: true })
    const file = join(reviewsDir, `REVIEW-${dateStr}.md`)
    if (existsSync(file)) {
      console.log(`⚠️  复盘已存在: ${file}`)
    } else {
      writeFileSync(file, reviewTemplate(dateStr), 'utf8')
      console.log(`✅ 复盘骨架已创建: ${file}`)
    }
    return
  }

  if (sub === 'status') {
    if (!existsSync(reviewsDir)) {
      console.log('无复盘文档（harness/reviews/ 不存在）。运行 `harness review new` 创建。')
      return
    }
    const files = readdirSync(reviewsDir).filter((f) => f.endsWith('.md'))
    if (!files.length) console.log('无复盘文档。')
    for (const f of files) {
      const content = readFileSync(join(reviewsDir, f), 'utf8')
      const first = content.split('\n').find((l) => l.startsWith('# ')) || f
      console.log(`- ${f}: ${first.replace(/^#\s*/, '')}`)
    }
    return
  }

  const path = getArg(args, '--path') || (existsSync(reviewsDir)
    ? join(reviewsDir, readdirSync(reviewsDir).filter((f) => f.endsWith('.md')).sort().pop() || '')
    : '')
  if (!path || !existsSync(path)) {
    console.error('❌ 未找到复盘文档。用 --path 指定，或先运行 `harness review new`。')
    process.exitCode = 1
    return
  }

  const content = readFileSync(path, 'utf8')
  const proposals = parseReview(content)
  if (!proposals.length) {
    console.error('❌ 复盘文档中未解析到 "### H<数字>:" 可沉淀规则段。')
    process.exitCode = 1
    return
  }

  if (sub === 'propose') {
    const result = proposeReview(proposals)
    for (const r of result) {
      console.log(`[${r.action}] ${r.id} (${r.kind}/${r.priority}) ${r.title} → ${r.target}${r.duplicateId ? ` (更新 ${r.duplicateId})` : ''}`)
    }
    console.log(`\n共 ${result.length} 条提案。运行 \`harness review apply --path ${path}\` 写回规则库。`)
    return
  }

  if (sub === 'apply') {
    const only = (getArg(args, '--only') || '').split(',').map((s) => s.trim()).filter(Boolean)
    const dryRun = hasArg(args, '--dry-run')
    const result = applyProposals(proposals, only, dryRun)
    for (const a of result.applied) {
      console.log(`${dryRun ? '[dry-run] ' : ''}✅ ${a.id}: ${a.action} → ${a.target} (${a.ruleId})`)
    }
    if (result.engineDocs.length) {
      console.log('\n以下为 engine/docs 类提案（不自动改包，需人工/发版处理）：')
      for (const e of result.engineDocs) {
        console.log(`  - ${e.id} [${e.kind}/${e.priority}] ${e.title} → ${e.target}`)
      }
    }
    console.log(dryRun ? '\n(dry-run，未写入)' : '\n完成。')
    return
  }

  console.error('Usage: harness review new|status|propose|apply [--path <md>] [--only H1,H2] [--dry-run]')
  process.exitCode = 1
}
