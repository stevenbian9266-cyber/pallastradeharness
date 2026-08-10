#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, statSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';
import { loadConfig, resolveProjectRoot, getGateChecks } from './config-loader.mjs';

// 项目根：从 cwd 向上查找 harness.config.*（找不到则回退脚本位置）
const ROOT = resolveProjectRoot();

const args = process.argv.slice(2);
const cmd = args[0];

// 加载项目配置（默认值 + harness.config.mjs 深合并；无配置文件则用引擎默认）
const { config } = await loadConfig({ rootDir: ROOT });

function getArg(args, flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
}

function hasArg(args, flag) {
  return args.includes(flag);
}

// ================================================================
// doctor
// ================================================================
if (cmd === 'doctor') {
  const fixSafe = hasArg(args, '--fix-safe');
  const format = getArg(args, '--format') || 'human';

  const checks = [
    {
      name: 'git-repo',
      run: () => { execSync('git rev-parse --git-dir', { cwd: ROOT, stdio: 'pipe' }); return { pass: true, detail: 'Git repo detected' }; },
      onError: () => ({ pass: false, detail: 'NOT a git repo', fix: 'Run `git init`' }),
    },
    {
      name: 'node-version',
      run: () => {
        const v = parseInt(process.version.slice(1));
        return v >= 22 ? { pass: true, detail: `Node ${process.version}` }
          : { pass: false, detail: `Node ${process.version} (need >=22)`, fix: 'Install Node.js 22+' };
      },
    },
    // 目录/文件检查项由 harness.config.mjs 的 doctor 段驱动（通用化）
    ...(config.doctor?.requiredDirs || []).map(d => ({
      name: `dir-${d}`,
      run: () => existsSync(resolve(ROOT, d)) ? { pass: true, detail: `${d}/ exists` } : { pass: false, detail: `${d}/ MISSING` },
    })),
    ...(config.doctor?.requiredFiles || []).map(f => ({
      name: `file-${f.replace(/[^\w-]+/g, '-')}`,
      run: () => existsSync(resolve(ROOT, f)) ? { pass: true, detail: `${f} exists` } : { pass: false, detail: `${f} missing`, fix: `Create ${f} at repository root` },
    })),
    {
      name: 'compose-file',
      run: () => {
        const candidates = config.doctor?.composeCandidates || [];
        const found = candidates.find(f => existsSync(resolve(ROOT, f)));
        return found ? { pass: true, detail: `Compose found: ${found}` }
          : { pass: false, detail: 'No docker-compose file found' };
      },
    },
    {
      name: 'vscode-tasks',
      run: () => {
        const p = resolve(ROOT, '.vscode', 'tasks.json');
        if (!existsSync(p)) return { pass: true, detail: 'No tasks.json' };
        const content = readFileSync(p, 'utf-8');
        return (content.includes('D:\\\\') || content.includes('D:/'))
          ? { pass: false, detail: 'tasks.json contains absolute paths', fix: 'Replace with harness CLI calls' }
          : { pass: true, detail: 'No absolute paths detected' };
      },
    },
    {
      name: 'lockfile-consistency',
      run: () => {
        const dirs = ['.', ...(config.doctor?.requiredDirs || [])];
        const conflicts = dirs.filter(d => existsSync(resolve(ROOT, d, 'package-lock.json')) && existsSync(resolve(ROOT, d, 'pnpm-lock.yaml')));
        if (conflicts.length > 0) return { pass: true, detail: `⚠️ Both package-lock.json and pnpm-lock.yaml tracked in: ${conflicts.join(', ')} — standardize on one package manager` };
        return { pass: true, detail: 'No lockfile conflicts detected' };
      },
    },
    {
      name: 'harness-dirs',
      run: () => {
        const dirs = ['harness/policies', 'harness/scenarios', 'scripts/harness'];
        const missing = dirs.filter(d => !existsSync(resolve(ROOT, d)));
        if (missing.length > 0) {
          if (fixSafe) {
            for (const d of missing) mkdirSync(resolve(ROOT, d), { recursive: true });
            return { pass: true, detail: `${missing.length} missing dirs created` };
          }
          return { pass: false, detail: `${missing.length} harness dirs missing: ${missing.join(', ')}`, fix: 'Run with --fix-safe' };
        }
        return { pass: true, detail: 'All harness directories present' };
      },
    },
  ];

  const results = [];
  for (const check of checks) {
    try {
      results.push({ name: check.name, ...check.run() });
    } catch (e) {
      results.push(check.onError ? check.onError() : { name: check.name, pass: false, detail: e.message });
    }
  }

  const failed = results.filter(r => !r.pass);
  if (format === 'json') {
    console.log(JSON.stringify({ status: failed.length === 0 ? 'healthy' : 'issues', results }, null, 2));
  } else {
    for (const r of results) {
      console.log(`${r.pass ? '✅' : '❌'} ${r.name}: ${r.detail}`);
      if (r.fix && fixSafe) console.log(`   ↳ fix: ${r.fix}`);
    }
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length > 0 && !fixSafe) {
      console.log('Run with --fix-safe to auto-fix safe issues.');
    }
  }
  process.exit(failed.length > 0 ? 1 : 0);
}

// ================================================================
// affected
// ================================================================
else if (cmd === 'affected') {
  const base = getArg(args, '--base') || 'origin/main';
  const { files, errors } = await import('./git-files.mjs').then(m => m.getChangedFiles(ROOT, base));
  const components = new Set();
  const topDirs = [...new Set((config.layers || []).map(l => l.path.split('/')[0]))];
  for (const f of files) {
    const top = f.split('/')[0];
    if (topDirs.includes(top)) components.add(top);
    else if (top === 'ai') components.add('ai');
    else if (['harness', 'scripts', '.github'].includes(top)) components.add('harness');
  }
  console.log(JSON.stringify({ filesChanged: files.length, affectedComponents: [...components], errors, estimatedTests: files.length * 3 }, null, 2));
}

// ================================================================
// check
// ================================================================
else if (cmd === 'check') {
  const profile = getArg(args, '--profile') || 'quick';
  // 变更感知：本地默认只扫变更文件（--full / CI 全量）
  const full = hasArg(args, '--full') || process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  let changedFiles = null;
  if (!full) {
    try {
      const { files } = await import('./git-files.mjs').then(m => m.getChangedFiles(ROOT, 'HEAD'));
      changedFiles = files;
    } catch { /* not a git repo — fallback to full scan */ }
  }
  console.log(`[harness] check --profile ${profile}${full ? ' (full)' : ` (changed-files: ${changedFiles?.length ?? 'full'})`}`);

  // Load profile from project config (harness.config.mjs / legacy harness/config.json)
  const profileChecks = config.profiles?.[profile]?.checks || ['degraded-loop'];

  console.log(`[harness] Running: ${profileChecks.join(', ')}`);
  let exitCode = 0;

  for (const checkName of profileChecks) {
    try {
      if (checkName === 'anti-patterns') {
        await import('./scan-anti-patterns.mjs').then(m => m.scan({ rootDir: ROOT, config, files: changedFiles }));
      } else if (checkName === 'degraded-loop') {
        const result = await import('./check-degraded-loop.mjs').then(m => m.scan({ rootDir: ROOT, config, files: changedFiles }));
        if (result.errors > 0) exitCode = 1;
      } else if (checkName === 'doc-impact') {
        await import('./doc-impact.mjs').then(m => m.run({ rootDir: ROOT, args: ['--base', 'origin/main'], config }));
      } else if (checkName === 'ai-freshness') {
        await import('./eval-ai.mjs').then(m => m.run({ rootDir: ROOT, args: ['--check-freshness'], config }));
      } else if (checkName === 'generated-check') {
        await import('./generated-check.mjs').then(m => m.check({ rootDir: ROOT, config }));
      } else if (checkName === 'coverage') {
        await import('./coverage.mjs').then(m => m.run({ rootDir: ROOT, args: [], config }));
      } else if (checkName === 'ai-scenarios') {
        await import('./eval-scenarios.mjs').then(m => m.run({ rootDir: ROOT, args: ['--readiness'], config }));
      } else {
        console.log(`[harness] ⏭  ${checkName}: delegated to CI / external runner`);
      }
    } catch (e) {
      console.error(`[harness] ❌ ${checkName} failed: ${e.message}`);
      exitCode = 1;
    }
  }

  if (exitCode !== 0) process.exitCode = exitCode;
}

// ================================================================
// eval-ai
// ================================================================
else if (cmd === 'eval-ai' || cmd === 'eval') {
  await import('./eval-ai.mjs').then(m => m.run({ rootDir: ROOT, args, config }));
}

// ================================================================
// eval-scenarios — GS scenario readiness + executor prompts
// ================================================================
else if (cmd === 'eval-scenarios') {
  await import('./eval-scenarios.mjs').then(m => m.run({ rootDir: ROOT, args, config }));
}

// ================================================================
// eval-llm — promptfoo LLM eval executor for GS scenarios
// ================================================================
else if (cmd === 'eval-llm') {
  await import('./eval-llm.mjs').then(m => m.run({ rootDir: ROOT, args, config }));
}

// ================================================================
// coverage — coverage gate (SimpleCov / vitest v8)
// ================================================================
else if (cmd === 'coverage') {
  await import('./coverage.mjs').then(m => m.run({ rootDir: ROOT, args, config }));
}

// ================================================================
// generated:check
// ================================================================
else if (cmd === 'generated:check') {
  await import('./generated-check.mjs').then(m => m.check({ rootDir: ROOT, config }));
}

// ================================================================
// doc-impact
// ================================================================
else if (cmd === 'doc-impact') {
  await import('./doc-impact.mjs').then(m => m.run({ rootDir: ROOT, args, config }));
}

// ================================================================
// e2e
// ================================================================
else if (cmd === 'e2e') {
  const target = args[1];
  console.log(`[harness] e2e ${target} — CI handles execution.`);
}

// ================================================================
// evidence / diagnostics
// ================================================================
else if (cmd === 'evidence') {
  await import('./evidence.mjs').then(m => m.collect({ rootDir: ROOT }));
}
else if (cmd === 'diagnostics') {
  console.log('[harness] diagnostics — CI handles collection.');
}

// ================================================================
// gate — MANDATORY pre-coding gate
// ================================================================
else if (cmd === 'gate') {
  const taskDesc = getArg(args, '--task') || args[1] || 'unspecified';
  let taskType = getArg(args, '--type');

  // Prefix → task type auto-detection
  const PREFIX_MAP = {
    '修复：': 'bugfix',   'fix:': 'bugfix',
    '优化：': 'feature',  '改进：': 'feature',
    '新增：': 'feature',  '添加：': 'feature',
    '样式：': 'style',    'style:': 'style',
    '需求：': 'feature',
    '审计：': 'audit',    'audit:': 'audit',
    '研究：': 'research', '调研：': 'research', 'research:': 'research',
    '文档：': 'docs',     'docs:': 'docs',
    '重构：': 'refactor', 'refactor:': 'refactor',
    '安全：': 'security', 'security:': 'security',
    '测试：': 'test',     'test:': 'test',
  };

  // Detect prefix if --type not explicitly set
  if (!taskType) {
    for (const [prefix, type] of Object.entries(PREFIX_MAP)) {
      if (taskDesc.startsWith(prefix)) {
        taskType = type;
        break;
      }
    }
  }

  // If no prefix match, try content-based keyword detection
  if (!taskType) {
    const CONTENT_KEYWORDS = {
      bugfix: ['修复', 'bug', 'fix', '错误', '报错', 'crash', '崩溃', '失败', '不行', '不能用', '缺失', '丢了'],
      feature: ['新增', '添加', '优化', '改进', '实现', '开发', '创建', 'add', 'new', 'create', 'feature', '增加', '支持'],
      style:  ['样式', 'UI', '颜色', '字体', '布局', '调整', '美化', 'style', 'color', 'font', 'layout', '对齐'],
      audit: ['审计', '审查', '盘点', 'audit', 'review', '体检'],
      research: ['研究', '调研', '评估', '分析', 'research', '探索', '方案'],
      docs: ['文档', '说明', 'docs', 'documentation', 'doc', '手册'],
      refactor: ['重构', '清理', '整理', 'refactor', 'rename', '删除'],
      security: ['安全', '漏洞', '注入', 'security', 'vuln', '密钥'],
      test: ['测试', 'test', 'spec', '用例', 'coverage'],
    };

    const lower = taskDesc.toLowerCase();
    for (const [type, keywords] of Object.entries(CONTENT_KEYWORDS)) {
      if (keywords.some(kw => lower.includes(kw))) {
        taskType = type;
        break;
      }
    }
  }

  // Still no type? Reject with guidance
  if (!taskType) {
    console.log(`\n❌ 无法识别任务类型。请在任务描述前添加前缀：\n`);
    console.log(`   修复：<描述>    → 修复 bug`);
    console.log(`   优化：<描述>    → 功能优化 / 改进`);
    console.log(`   新增：<描述>    → 新功能`);
    console.log(`   样式：<描述>    → 样式调整`);
    console.log(`   需求：<描述>    → 泛需求描述`);
    console.log(`   审计：<描述>    → 审计 / 盘点`);
    console.log(`   研究：<描述>    → 研究 / 调研 / 评估`);
    console.log(`   文档：<描述>    → 文档类`);
    console.log(`   重构：<描述>    → 重构 / 清理`);
    console.log(`   安全：<描述>    → 安全相关`);
    console.log(`   测试：<描述>    → 测试相关\n`);
    console.log(`   或手动指定：harness gate --task "<描述>" --type feature|bugfix|style|audit|research|docs|refactor|security|test`);
    process.exit(1);
  }

  const detectedVia = getArg(args, '--type') ? '--type flag' :
    PREFIX_MAP[Object.keys(PREFIX_MAP).find(p => taskDesc.startsWith(p))] ? '前缀' : '内容关键词';
  console.log(`\n   ↳ 识别方式: ${detectedVia} → 任务类型: ${taskType}`);
  const gateDir = resolve(ROOT, config.paths.gates);
  mkdirSync(gateDir, { recursive: true });

  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const gateId = `GATE-${ts}`;
  const gateFile = join(gateDir, `${gateId}.json`);

  // Gate check 集由配置驱动：layers 搜索 + 内置基础 + 配置追加 + verify-test
  const checks = getGateChecks(config, taskType);

  let branch = 'unknown';
  let head = 'unknown';
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT, encoding: 'utf-8' }).trim();
    head = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf-8' }).trim();
  } catch { /* not a git repo */ }

  const gateState = {
    id: gateId,
    taskType,
    taskDescription: taskDesc,
    createdAt: now.toISOString(),
    branch,
    head: head.slice(0, 8),
    checks: checks.map(c => ({ ...c, status: 'pending', completedAt: null })),
    cleared: false,
  };

  writeFileSync(gateFile, JSON.stringify(gateState, null, 2));

  console.log(`\n🔒 PRE-CODING GATE — ${gateId}`);
  console.log(`   Task: ${taskDesc}`);
  console.log(`   Type: ${taskType}`);
  console.log(`   Branch: ${branch} @ ${head.slice(0, 8)}`);
  console.log(`\n   You MUST clear all checks below before writing ANY code.\n`);
  for (const c of checks) {
    console.log(`   [ ] ${c.id}`);
    console.log(`       ${c.label}`);
  }
  console.log(`\n   To mark a check as done:`);
  console.log(`   harness gate:clear --gate ${gateId} --clear <check-id>`);
  console.log(`\n   Gate state saved to: harness/gates/${gateId}.json`);
  console.log(`\n❌ GATE NOT CLEARED — AI MUST NOT write or edit any files.`);

  process.exit(1);
}

// ================================================================
// gate:status — check active gate state (for continuation turns)
// ================================================================
else if (cmd === 'gate:status') {
  const { readdirSync } = await import('node:fs');
  const gateDir = resolve(ROOT, config.paths.gates);
  if (!existsSync(gateDir)) {
    console.log('No gates directory. Run `harness gate` to create one.');
    process.exit(1);
  }

  const files = readdirSync(gateDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.log('No active gates. Run `harness gate` to create one.');
    process.exit(1);
  }

  const latestFile = join(gateDir, files[0]);
  const gateState = JSON.parse(readFileSync(latestFile, 'utf-8'));
  const elapsed = Date.now() - new Date(gateState.createdAt).getTime();
  const hoursAgo = Math.round(elapsed / 3600000);

  // Differentiated expiry: from project config gates.expiryHours
  const maxAge = config.gates?.expiryHours?.[gateState.taskType] || 24;

  console.log(`\n📋 Active Gate: ${gateState.id}`);
  console.log(`   Task: ${gateState.taskDescription}`);
  console.log(`   Type: ${gateState.taskType}`);
  console.log(`   Branch: ${gateState.branch} @ ${gateState.head}`);
  console.log(`   Created: ${hoursAgo}h ago (expires after ${maxAge}h)`);

  if (gateState.cleared) {
    const implementedCount = gateState.implemented?.length || 0;
    console.log(`   Status: ✅ CLEARED (${implementedCount} previous implementation(s))`);

    if (hoursAgo > maxAge) {
      console.log(`\n   ⚠️ Gate is ${hoursAgo}h old (max ${maxAge}h) — create a fresh gate.`);
      process.exit(1);
    }

    if (gateState.implemented && gateState.implemented.length > 0) {
      console.log(`\n   Previously implemented:`);
      gateState.implemented.forEach((impl, i) => {
        console.log(`     ${i + 1}. ${impl.what} (${impl.when})`);
      });
    }

    console.log(`\n   ✅ Gate valid. Continue implementation.`);
    process.exit(0);
  } else {
    const remaining = gateState.checks.filter(c => c.status !== 'done');
    console.log(`   Status: ❌ NOT CLEARED (${remaining.length} checks remaining)`);
    console.log(`   Remaining: ${remaining.map(c => c.id).join(', ')}`);
    process.exit(1);
  }
}

// ================================================================
// gate:clear — mark a gate check as done
// ================================================================
else if (cmd === 'gate:clear') {
  const gateId = getArg(args, '--gate');
  const checkId = getArg(args, '--clear');
  if (!gateId || !checkId) {
    console.log('Usage: harness gate:clear --gate <GATE-ID> --clear <check-id>');
    process.exit(1);
  }

  const gateFile = resolve(ROOT, config.paths.gates, `${gateId}.json`);
  if (!existsSync(gateFile)) {
    console.log(`Gate file not found: harness/gates/${gateId}.json`);
    process.exit(1);
  }

  const gateState = JSON.parse(readFileSync(gateFile, 'utf-8'));
  const check = gateState.checks.find(c => c.id === checkId);
  if (!check) {
    console.log(`Unknown check: ${checkId}`);
    console.log(`Available: ${gateState.checks.map(c => c.id).join(', ')}`);
    process.exit(1);
  }

  check.status = 'done';
  check.completedAt = new Date().toISOString();
  const note = getArg(args, '--note');
  if (note) check.note = note;

  const remaining = gateState.checks.filter(c => c.status !== 'done');
  gateState.cleared = remaining.length === 0;

  writeFileSync(gateFile, JSON.stringify(gateState, null, 2));

  console.log(`✅ ${checkId}: ${check.label}`);
  console.log(`   ${gateState.checks.filter(c => c.status === 'done').length}/${gateState.checks.length} checks cleared`);

  if (gateState.cleared) {
    console.log(`\n✅ GATE CLEARED — AI may now proceed with implementation.`);
    process.exit(0);
  } else {
    console.log(`\n❌ ${remaining.length} checks remaining. AI MUST NOT write or edit any files.`);
    console.log(`   Remaining: ${remaining.map(c => c.id).join(', ')}`);
    process.exit(1);
  }
}

// ================================================================
// gate:clean — remove expired/cleared gates older than N days
// ================================================================
else if (cmd === 'gate:clean') {
  const days = parseInt(getArg(args, '--days') || '7', 10);
  const gateDir = resolve(ROOT, config.paths.gates);
  if (!existsSync(gateDir)) { console.log('No gates directory.'); process.exit(0); }

  const files = readdirSync(gateDir).filter(f => f.endsWith('.json'));
  const cutoff = Date.now() - days * 86400000;
  let removed = 0;

  for (const file of files) {
    const filePath = join(gateDir, file);
    const gate = JSON.parse(readFileSync(filePath, 'utf-8'));
    const age = Date.now() - new Date(gate.createdAt).getTime();
    if (gate.cleared && age > cutoff) {
      unlinkSync(filePath);
      removed++;
      console.log(`🗑  Removed: ${file} (${Math.round(age / 3600000)}h old, cleared)`);
    }
  }

  console.log(`\n✅ gate:clean — removed ${removed} gate(s) older than ${days} day(s).`);
  console.log(`   ${files.length - removed} gate(s) retained.`);
}

// ================================================================
// gate:required — git-level enforcement (wired into lefthook pre-commit).
// Blocks commits that have no cleared, non-expired gate on the current
// branch. This is the hard-enforcement companion to the soft prompt-level
// R1 gate: the CLI's exit code is what lefthook turns into a blocked commit.
// ================================================================
else if (cmd === 'gate:required') {
  if (process.env.HARNESS_GATE_SKIP === '1') {
    console.log('🔓 gate:required — skipped (HARNESS_GATE_SKIP=1).');
    process.exit(0);
  }

  const gateDir = resolve(ROOT, config.paths.gates);
  if (!existsSync(gateDir)) {
    console.log('❌ gate:required — no gates directory. Run: node scripts/harness/cli.mjs gate --task "修复：<描述>"');
    process.exit(1);
  }

  let branch = 'unknown';
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT, encoding: 'utf-8' }).trim();
  } catch { /* not a git repo */ }

  const files = readdirSync(gateDir).filter(f => f.endsWith('.json'));
  const now = Date.now();
  let valid = null;

  for (const file of files) {
    let gate;
    try {
      gate = JSON.parse(readFileSync(join(gateDir, file), 'utf-8'));
    } catch { continue; }
    if (!gate.cleared) continue;
    if (gate.branch && gate.branch !== branch) continue;
    const maxAge = (config.gates?.expiryHours?.[gate.taskType] || 24) * 3600000;
    const age = now - new Date(gate.createdAt).getTime();
    if (age <= maxAge) { valid = gate; break; }
  }

  if (valid) {
    const hours = Math.round((now - new Date(valid.createdAt).getTime()) / 3600000);
    console.log(`✅ gate:required — cleared gate ${valid.id} (${valid.taskType}) on "${branch}", ${hours}h old.`);
    process.exit(0);
  }

  console.log(`❌ gate:required — no cleared, non-expired gate for branch "${branch}".`);
  console.log('   Every commit needs a gate. Run:');
  console.log('     node scripts/harness/cli.mjs gate --task "修复：<描述>"   (or 优化:/新增:/样式:/审计:...)');
  console.log('   then clear all checks with:');
  console.log('     node scripts/harness/cli.mjs gate:clear --gate <GATE-ID> --clear <check-id>');
  console.log('   Emergency bypass (not recommended): HARNESS_GATE_SKIP=1');
  process.exit(1);
}

// ================================================================
// prd — PRD-driven workflow helpers (prd new / list / verify)
// ================================================================
else if (cmd === 'prd') {
  const sub = args[1] || 'list';

  // ── PRD 相似度查重工具（避免重复新建，相似则提示回写）──
  function textTokens(text) {
    const lower = String(text).toLowerCase();
    const words = lower.match(/[a-z0-9]+/g) || [];
    const han = lower.match(/[\u4e00-\u9fa5]+/g) || [];
    const grams = [];
    for (const h of han) {
      if (h.length >= 2) { for (let i = 0; i <= h.length - 2; i++) grams.push(h.slice(i, i + 2)); }
      else grams.push(h);
    }
    return new Set([...words, ...grams]);
  }
  function similarity(a, b) {
    const ta = textTokens(a), tb = textTokens(b);
    if (!ta.size) return 0;
    let inter = 0;
    for (const x of ta) if (tb.has(x)) inter++;
    return { ratio: inter / ta.size, inter };
  }
  function listExistingPrds() {
    const out = [];
    const prdDir = resolve(ROOT, config.paths.prd);
    if (!existsSync(prdDir)) return out;
    for (const cat of readdirSync(prdDir)) {
      if (cat === 'README.md' || cat === '_TEMPLATE.md' || cat.startsWith('.')) continue;
      const catDir = join(prdDir, cat);
      if (!statSync(catDir).isDirectory()) continue;
      for (const f of readdirSync(catDir).filter(x => x.endsWith('.md'))) {
        try {
          const content = readFileSync(join(catDir, f), 'utf-8');
          const titleMatch = content.match(/^#\s+(.+)$/m);
          const srcMatch = content.match(/\| 来源 \| ([^|]+) \|/);
          const title = titleMatch ? titleMatch[1].trim() : f;
          const source = srcMatch ? srcMatch[1].trim() : '';
          out.push({ path: join(catDir, f), relative: `docs/prd/${cat}/${f}`, title, source, clean: f.replace(/\.md$/, '') });
        } catch { /* skip unreadable */ }
      }
    }
    return out;
  }

  // prd new — create a PRD skeleton with auto-category detection
  if (sub === 'new') {
    const title = getArg(args, '--title') || args[2];
    if (!title) { console.log('Usage: harness prd new --title "<一句话需求>"'); process.exit(1); }

    const categoriesFile = resolve(ROOT, 'harness', 'policies', 'prd-categories.json');
    let categories = {};
    try { categories = JSON.parse(readFileSync(categoriesFile, 'utf-8')).categories || {}; } catch { /* fallback to other */ }

    // Auto-category: keyword score
    const lower = title.toLowerCase();
    let bestCat = 'other', bestScore = 0;
    for (const [cat, cfg] of Object.entries(categories)) {
      const score = (cfg.keywords || []).filter(kw => lower.includes(kw.toLowerCase())).length;
      if (score > bestScore) { bestScore = score; bestCat = cat; }
    }

    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const cleaned = title.replace(/^(需求|新增|添加|优化|改进|修复|样式|审计|研究|文档|重构|安全|测试)[：:]\s*/, '');
    const slug = cleaned.toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'untitled';
    const fileName = `PRD-${date}-${bestCat}-${slug}.md`;
    const dir = resolve(ROOT, config.paths.prd, bestCat);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, fileName);
    if (existsSync(filePath)) {
      console.log(`❌ PRD 已存在（幂等保护）: docs/prd/${bestCat}/${fileName}`);
      process.exit(1);
    }

    // ── 相似 PRD 查重：相似度 > 0.3 时提示回写原 PRD，除非 --force ──
    if (!hasArg(args, '--force')) {
      const matches = listExistingPrds()
        .map(p => { const { ratio, inter } = similarity(cleaned, `${p.title} ${p.source} ${p.clean}`); return { ...p, sim: ratio, inter }; })
        .filter(p => p.sim > 0.3 && p.inter >= 2)
        .sort((a, b) => b.sim - a.sim);
      if (matches.length > 0) {
        console.log(`⚠️ 检测到 ${matches.length} 个相似 PRD（相似度 > 0.3），为避免重复新建，建议回写更新原 PRD：`);
        for (const m of matches.slice(0, 5)) {
          console.log(`   [${(m.sim * 100).toFixed(0)}%] ${m.relative}`);
          console.log(`        «${m.title}»`);
        }
        console.log(`\n回写方式: node scripts/harness/cli.mjs prd update --path ${matches[0].relative} --title "${title}"`);
        console.log(`若确属全新需求，可加 --force 强制新建。`);
        process.exit(1);
      }
    }

    let content = `# PRD-${date}-${bestCat}-${slug}\n\n`
      + `| 元数据 | 值 |\n|---|---|\n`
      + `| 状态 | draft |\n`
      + `| 创建日期 | ${now.toISOString().slice(0, 10)} |\n`
      + `| 来源 | ${title} |\n`
      + `| 分类 | ${bestCat}（自动判定） |\n\n`
      + `> ⚠️ AI：请按 docs/prd/_TEMPLATE.md 完整扩充本文档（背景/FR/AC/跨层搜索/测试计划/文档同步清单），再进入用户确认。\n`;
    const tmpl = resolve(ROOT, config.paths.prd, '_TEMPLATE.md');
    if (existsSync(tmpl)) content += `\n---\n\n${readFileSync(tmpl, 'utf-8')}`;

    writeFileSync(filePath, content);
    console.log(`✅ PRD 骨架已创建: docs/prd/${bestCat}/${fileName}`);
    console.log(`   分类: ${bestCat}（关键词命中 ${bestScore}）`);
    console.log(`   下一步: AI 按 _TEMPLATE.md 完整扩充 → 用户确认 → harness gate`);
    process.exit(0);
  }

  // prd update — 回写：把新需求追加到已有 PRD（来源/变更记录），避免重复新建
  if (sub === 'update') {
    const path = getArg(args, '--path');
    const title = getArg(args, '--title') || args[3];
    if (!path || !title) { console.log('Usage: harness prd update --path <PRD文件> --title "<新需求>"'); process.exit(1); }
    const abs = resolve(ROOT, path);
    if (!existsSync(abs)) { console.log(`❌ PRD 不存在: ${path}`); process.exit(1); }
    let content = readFileSync(abs, 'utf-8');
    const date = new Date().toISOString().slice(0, 10);
    if (content.includes('## 回写记录')) {
      const row = `| ${date} | ${title} | AI |`;
      const idx = content.indexOf('## 回写记录');
      const tableEnd = content.indexOf('\n\n', idx);
      if (tableEnd === -1) { content += `\n${row}\n`; }
      else { content = content.slice(0, tableEnd) + `\n${row}` + content.slice(tableEnd); }
    } else {
      content = content.replace(/\s*$/, '') + `\n\n## 回写记录（harness prd update）\n\n| 日期 | 来源 | 操作者 |\n|---|---|---|\n| ${date} | ${title} | AI |\n`;
    }
    writeFileSync(abs, content);
    console.log(`✅ 已回写 ${path}`);
    console.log(`   新增需求: ${title}`);
    console.log(`   请按 _TEMPLATE.md 在原 PRD 内完成完整更新（背景/FR/AC/变更记录）。`);
    process.exit(0);
  }

  // prd list — list all PRDs (optional --category / --status filter)
  if (sub === 'list') {
    const prdDir = resolve(ROOT, config.paths.prd);
    if (!existsSync(prdDir)) { console.log('No docs/prd directory.'); process.exit(0); }
    const categoryFilter = getArg(args, '--category');
    const statusFilter = getArg(args, '--status');
    const rows = [];
    for (const cat of readdirSync(prdDir)) {
      if (cat === 'README.md' || cat === '_TEMPLATE.md' || cat.startsWith('.')) continue;
      const catDir = join(prdDir, cat);
      if (!statSync(catDir).isDirectory()) continue;
      for (const f of readdirSync(catDir).filter(x => x.endsWith('.md'))) {
        let status = '?';
        try {
          const m = readFileSync(join(catDir, f), 'utf-8').match(/\| 状态 \| ([^|]+) \|/);
          if (m) status = m[1].trim();
        } catch { /* keep ? */ }
        rows.push({ cat, file: f, status });
      }
    }
    const filtered = rows.filter(r =>
      (!categoryFilter || r.cat === categoryFilter) &&
      (!statusFilter || r.status === statusFilter)
    );
    if (filtered.length === 0) { console.log('（无匹配 PRD）'); process.exit(0); }
    console.log(`${'分类'.padEnd(12)} ${'状态'.padEnd(14)} PRD 文件`);
    console.log('-'.repeat(72));
    for (const r of filtered.sort((a, b) => a.file.localeCompare(b.file))) {
      console.log(`${r.cat.padEnd(12)} ${r.status.padEnd(14)} ${r.file}`);
    }
    process.exit(0);
  }

  // prd verify — ensure every AC in the PRD has a test tagged with "<PRD> AC-x"
  if (sub === 'verify') {
    const id = getArg(args, '--id') || args[2];
    const allowMissing = hasArg(args, '--allow-missing-tests');
    if (!id) { console.log('Usage: harness prd verify --id PRD-xxx [--allow-missing-tests]'); process.exit(1); }
    const prdDir = resolve(ROOT, config.paths.prd);
    if (!existsSync(prdDir)) { console.log('No docs/prd directory.'); process.exit(1); }
    let prdPath = null;
    for (const cat of readdirSync(prdDir)) {
      if (cat === 'README.md' || cat === '_TEMPLATE.md' || cat.startsWith('.')) continue;
      const f = join(prdDir, cat, `${id}.md`);
      if (existsSync(f)) { prdPath = f; break; }
    }
    if (!prdPath) { console.log(`❌ PRD 未找到: ${id}`); process.exit(1); }
    const content = readFileSync(prdPath, 'utf-8');
    // Ignore HTML comments (template examples live in comments) so only real ACs count.
    const stripped = content.replace(/<!--[\s\S]*?-->/g, '');
    const acs = [...stripped.matchAll(/AC-(\d+)/g)].map(m => m[1]);
    if (acs.length === 0) {
      if (allowMissing) { console.log(`⚠️ PRD ${id} 无 AC 标注（--allow-missing-tests：删除/重构类任务允许）。`); process.exit(0); }
      console.log(`⚠️ PRD ${id} 中未找到 AC（验收标准）标注。`); process.exit(1);
    }
    console.log(`PRD ${id}: ${acs.length} 个 AC`);
    const missing = [];
    for (const ac of acs) {
      const tag = `AC-${ac}`;
      let files = [];
      try {
        // --untracked includes new (not-yet-committed) test files
        const out = execSync(`git grep -l --untracked "${id}.*${tag}" -- "*.rb" "*.ts" "*.tsx" "*.mjs"`, { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
        files = out.split('\n').filter(Boolean);
      } catch { /* git grep error → no matches */ }
      if (files.length === 0) missing.push(`AC-${ac}`);
      else console.log(`  ✅ AC-${ac} → ${files.length} 个测试文件`);
    }
    if (missing.length > 0) {
      if (allowMissing) {
        console.log(`\n⚠️ ${missing.length} 个 AC 无测试覆盖（--allow-missing-tests：删除/重构类任务允许）。`);
        process.exit(0);
      }
      console.log(`\n❌ 以下 AC 无测试覆盖（测试文件需标注 "${id} AC-x"）:`);
      missing.forEach(m => console.log(`   - ${m}`));
      process.exit(1);
    }
    console.log('\n✅ 全部 AC 已有测试覆盖。');
    process.exit(0);
  }

  console.log('Usage: harness prd new|list|verify');
  console.log('  prd new --title "<一句话需求>"    创建 PRD 骨架（自动分类 + 幂等）');
  console.log('  prd list [--category xxx] [--status x]  列出 PRD');
  console.log('  prd verify --id PRD-xxx           校验 AC 测试覆盖（AC↔测试追溯）');
  process.exit(1);
}

// ================================================================
// sync-check — knowledge sync gate (assets needing review)
//   Compares changed files against the knowledge-sync matrix and
//   lists the knowledge assets (Skill/README/Agent/standards/API
//   docs/scenarios) that must be evaluated. Exit 1 when matches
//   exist (blocks verify-test) unless --ack confirms evaluation.
// ================================================================
else if (cmd === 'sync-check') {
  const prdId = getArg(args, '--id');
  const ack = hasArg(args, '--ack');
  let changed = [];
  try {
    const status = execSync('git status --short', { cwd: ROOT, encoding: 'utf-8' });
    const diff = execSync('git diff --name-only origin/main...HEAD 2>/dev/null || git diff --name-only HEAD', { cwd: ROOT, encoding: 'utf-8' });
    changed = [...status.split('\n'), ...diff.split('\n')]
      .map(l => l.replace(/^[ MADRCU?!]{1,2}\s+/, '').trim())
      .filter(Boolean);
  } catch { /* not a repo */ }

  // 知识同步矩阵由 harness.config.mjs 的 syncCheck.rules 驱动（通用化）
  const RULES = config.syncCheck?.rules || [];

  const matched = RULES.filter(r => changed.some(f => r.re.test(f)));
  if (matched.length === 0) {
    console.log('✅ sync-check — 无命中知识同步矩阵的变更。');
    process.exit(0);
  }
  if (ack) {
    console.log('🔎 sync-check — 命中知识同步矩阵，已确认评估完成（--ack）。');
    console.log('   请确保评估结论已记录在 PRD §9/§10（更新 或 已评估无需更新）。');
    process.exit(0);
  }
  console.log('🔎 sync-check — 以下变更触发知识资产同步评估：\n');
  for (const m of matched) {
    const files = changed.filter(f => m.re.test(f)).slice(0, 5);
    const total = changed.filter(f => m.re.test(f)).length;
    console.log(`▪ ${m.label}`);
    console.log(`    变更: ${files.join(', ')}${total > 5 ? ` ...(+${total - 5})` : ''}`);
    console.log(`    需评估: ${m.assets.join(' / ')}`);
  }
  if (prdId) console.log(`\n请在 PRD ${prdId} §9/§10 记录每项结论。`);
  console.log('\n⚠️ 存在需评估的知识资产 — 完成评估并更新后再关闭 verify-test。');
  console.log('   评估完成后运行: harness sync-check --ack --id PRD-xxx');
  process.exit(1);
}

// ================================================================
// nav:check — validate the §0 navigation map in AGENTS.md
//   Verifies every referenced file/path exists and that pointer
//   files (copilot-instructions) no longer duplicate full content.
// ================================================================
else if (cmd === 'nav:check') {
  const agentsPath = resolve(ROOT, 'AGENTS.md');
  if (!existsSync(agentsPath)) { console.log('❌ nav:check — AGENTS.md not found.'); process.exit(1); }
  const agents = readFileSync(agentsPath, 'utf-8');
  const s0Start = agents.indexOf('### 0.1');
  const s0End = agents.indexOf('### 0.2');
  if (s0Start < 0 || s0End < 0) { console.log('❌ nav:check — AGENTS.md §0.1 navigation map missing.'); process.exit(1); }
  const section = agents.slice(s0Start, s0End);
  const paths = [...section.matchAll(/`([^`]+\.(?:md|json))`/g)].map(m => m[1]);

  // globExists: pattern like 'ai/skills/*/SKILL.md' (dir wildcard) or
  // 'ai/memories/*.md' (filename wildcard).
  function globExists(pattern) {
    const star = pattern.indexOf('*');
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    const dir = resolve(ROOT, prefix);
    if (!existsSync(dir)) return false;
    for (const name of readdirSync(dir)) {
      if (suffix.startsWith('/')) {
        if (existsSync(resolve(dir, name + suffix))) return true;
      } else if (name.endsWith(suffix)) {
        return true;
      }
    }
    return false;
  }

  const missing = [];
  for (const p of paths) {
    if (p.startsWith('AGENTS.md')) continue; // self-reference
    const ok = p.includes('*') ? globExists(p) : existsSync(resolve(ROOT, p));
    if (!ok) missing.push(p);
  }

  // Duplicate check: pointer file must not re-define AP-003/AP-005 etc.
  const copilotPath = resolve(ROOT, '.github', 'copilot-instructions.md');
  const copilot = existsSync(copilotPath) ? readFileSync(copilotPath, 'utf-8') : '';
  const duplicated = ['AP-003:', 'AP-005:', 'AP-008:'].filter(ap => copilot.includes(ap));

  if (missing.length > 0) {
    console.log(`❌ nav:check — 导航地图引用的文件缺失: ${missing.join(', ')}`);
    console.log('   修复: 更新 AGENTS.md §0.1 的路径，或创建缺失文件。');
    process.exit(1);
  }
  if (duplicated.length > 0) {
    console.log(`⚠️ nav:check — 指针文件 copilot-instructions.md 仍重复定义 ${duplicated.join(' ')}`);
    console.log('   修复: 精简为指向 AGENTS.md §5 / anti-patterns.json。');
    process.exit(1);
  }

  // Layer AGENTS.md → CLAUDE.md reference check (each layer's AGENTS.md must
  // point at a CLAUDE.md that actually exists).
  const layerAgents = ['backend/AGENTS.md', 'platform/AGENTS.md', 'storefront/AGENTS.md'];
  const layerBroken = [];
  for (const la of layerAgents) {
    const laPath = resolve(ROOT, la);
    if (!existsSync(laPath)) { layerBroken.push(`${la} (missing)`); continue; }
    const laContent = readFileSync(laPath, 'utf-8');
    const refs = [...laContent.matchAll(/\[([^\]]+\.md)\]\(\.\/([^)]+\.md)\)/g)].map(m => m[2]);
    for (const ref of refs) {
      const dir = la.slice(0, la.lastIndexOf('/'));
      if (!existsSync(resolve(ROOT, dir, ref))) {
        layerBroken.push(`${la} → ${dir}/${ref}`);
      }
    }
  }
  if (layerBroken.length > 0) {
    console.log(`❌ nav:check — 各层 AGENTS.md 引用的文档缺失: ${layerBroken.join('; ')}`);
    process.exit(1);
  }

  console.log(`✅ nav:check — 导航地图 ${paths.length} 个引用全部有效，各层 AGENTS.md→CLAUDE.md 引用完整，无重复定义。`);
  process.exit(0);
}

// ================================================================
// init — scaffold a harness.config.mjs (v1: skeleton; wizard in Phase 2)
// ================================================================
else if (cmd === 'init') {
  // init 在用户当前目录创建配置（不向上解析 ROOT — 这是"新建项目"场景）
  const target = resolve(process.cwd(), 'harness.config.mjs');
  if (existsSync(target)) {
    console.log(`❌ harness.config.mjs already exists at ${target}.`);
    console.log('   Edit it directly, or delete it and re-run `harness init`.');
    process.exit(1);
  }
  const skeleton = `// harness.config.mjs — 项目配置（引擎通用机制，本文件声明项目自身结构）
// Schema 说明见 docs/standards/harness-standalone-roadmap.md §6（或引擎文档）。
export default {
  name: 'my-project',

  // ① 层定义：gate 跨层搜索来源。单层项目配 [{ id: 'app', path: 'src' }]
  layers: [
    { id: 'app', path: 'app', label: 'App' },
    { id: 'src', path: 'src', label: 'Source' },
  ],

  // ② gate：可追加项目特定 check（可选）
  gates: {
    // checkDefs: { feature: [{ id: 'my-check', label: 'My project check' }] },
  },

  // ③ 知识同步规则（doc-impact）— 默认空数组不阻塞
  docImpact: {
    base: 'origin/main',
    rules: [
      // { codeGlob: /^src\/.*\.ts$/, docs: ['docs/README.md'], label: 'Source change' },
    ],
  },

  // ④ 覆盖率（可选）
  coverage: { thresholds: {}, targets: [] },

  // ⑤ 扫描器规则文件
  scanners: { antiPatterns: 'harness/policies/anti-patterns.json' },

  // ⑥ scenarios（可选）
  scenarios: 'harness/scenarios/scenarios.json',

  // ⑦ check profiles（可选）
  profiles: {},

  // ⑧ doctor 检查项（可选）
  doctor: { requiredDirs: [], requiredFiles: [], composeCandidates: [] },

  // ⑨ 状态/产物路径（默认值即可）
  paths: { gates: 'harness/gates', requirements: 'harness/requirements', evidence: 'artifacts/harness-evidence', prd: 'docs/prd' },
};
`;
  writeFileSync(target, skeleton);
  console.log(`✅ Created ${target}`);
  console.log('   Next: run `harness config:check` to validate, then `harness doctor`.');
  process.exit(0);
}

// ================================================================
// config:check — validate project config + report engine defaults in use
// ================================================================
else if (cmd === 'config:check') {
  const { config: cfg, sourcePath, usedDefaults } = await loadConfig({ rootDir: ROOT });
  console.log(`✅ Config valid: ${sourcePath || '(no config file — engine defaults in use)'}`);
  console.log(`   Project: ${cfg.name}`);
  console.log(`   Layers (${cfg.layers.length}): ${cfg.layers.map(l => l.id).join(', ')}`);
  console.log(`   Gate dir: ${cfg.paths.gates}`);
  console.log(`   docImpact rules: ${cfg.docImpact?.rules?.length ?? 0}`);
  if (usedDefaults.length > 0) {
    console.log(`\nℹ️  Engine defaults in use: ${usedDefaults.join(', ')}`);
  } else {
    console.log('\n✅ No engine defaults in use — fully configured.');
  }
  process.exit(0);
}

// ================================================================
// cache:clean — remove harness cache directory (.harness-cache)
// ================================================================
else if (cmd === 'cache:clean') {
  const cacheDir = resolve(ROOT, '.harness-cache');
  if (existsSync(cacheDir)) {
    rmSync(cacheDir, { recursive: true, force: true });
    console.log('🗑  Removed .harness-cache');
  } else {
    console.log('No cache to clean.');
  }
  process.exit(0);
}

// ================================================================
// help
// ================================================================
else {
  console.log(`PallasTrade Harness CLI

Usage: node scripts/harness/cli.mjs <command> [options]

Gate (MANDATORY before coding):
  gate --task "description" [--type feature|bugfix|style]
                                      Create pre-coding gate. AI MUST clear
                                      all checks before writing any code.
  gate:status                         Check if an active gate exists (for
                                      continuation turns on same task).
  gate:clear --gate <ID> --clear <id> Mark a gate check as completed.
  gate:required                       Enforced by pre-commit: fail when no
                                      cleared gate exists on this branch.
  gate:clean [--days N]               Prune cleared gates older than N days.

Environment:
  doctor [--fix-safe] [--format json]   Diagnose local dev environment

Analysis:
  affected --base origin/main           Show affected components

Quality:
  check --profile quick|full|release    Run quality gates
  e2e dashboard|storefront              Run end-to-end tests
  eval-ai --check-freshness             Verify skill path validity
  eval-ai --scenarios                   Validate GS scenario library
  eval-scenarios [--readiness|--prompts] GS readiness check / executor prompts
  coverage [--component X] [--enforce]  Coverage gate vs thresholds
  generated:check                       Check generated files for drift
  doc-impact --base origin/main         Check knowledge docs are synced
  sync-check [--id PRD-xxx]             Knowledge sync gate: assets needing review
  nav:check                             Validate AGENTS.md §0 navigation map

PRD (PRD-driven workflow):
  prd new --title "<一句话需求>"         Create PRD skeleton (auto-category)
  prd list [--category x] [--status s]  List PRDs
  prd verify --id PRD-xxx               Check AC -> test coverage

Evidence:
  evidence collect                      Collect structured delivery evidence
  diagnostics collect                   Collect failure diagnostics
`);
}
