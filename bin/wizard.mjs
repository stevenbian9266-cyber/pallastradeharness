/**
 * wizard.mjs — 从零项目 10 步向导（设计文档 §17.7）
 *
 * 用户不需要一次回答所有问题：每步答案落盘（.harness-state/wizard/answers.json），
 * 可保存、退出、恢复。全部完成后生成项目画像（harness/project.yaml）并锁定治理版本。
 *
 * 步骤：①项目卡片 ②业务 ③产品 ④技术 ⑤数据 ⑥权限 ⑦安全风控 ⑧代码 ⑨Skills ⑩确认生成底座。
 * 步骤 7（risk_domains）/ 9（skills）为多选。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getArg, hasArg } from './cli-utils.mjs';
import { statePaths } from './state-store.mjs';
import { writeProfile, lockVersion, readProfile, validateProfile } from './governance.mjs';

export const WIZARD_STEPS = Object.freeze([
  { step: 1, id: 'purpose', title: '第一步：项目卡片', question: '你想做什么，主要给谁用？', multi: false },
  { step: 2, id: 'business', title: '第二步：业务架构', question: '谁参与、核心价值、关键业务流程？', multi: false },
  { step: 3, id: 'product', title: '第三步：产品架构', question: '用户角色、功能模块、关键旅程？', multi: false },
  { step: 4, id: 'tech', title: '第四步：技术架构', question: '技术方案选型（先约束后选型）？', multi: false },
  { step: 5, id: 'data', title: '第五步：数据与数据库', question: '核心数据对象、关系、敏感级别？', multi: false },
  { step: 6, id: 'auth', title: '第六步：权限架构', question: '身份来源、角色、资源动作矩阵？', multi: false },
  {
    step: 7, id: 'risk_domains', title: '第七步：安全与风控', multi: true,
    question: '涉及哪些风险域（逗号分隔多选）？',
    options: ['authentication', 'payments', 'business_data', 'user_data', 'deployment', 'compliance', 'none'],
  },
  { step: 8, id: 'code', title: '第八步：代码项目架构', question: '模块边界与目录计划？', multi: false },
  {
    step: 9, id: 'skills', title: '第九步：Skills 与质量底线', multi: true,
    question: '启用哪些 Skills（逗号分隔多选）？',
    options: ['requirements-discovery', 'api-development', 'database-migration', 'authentication', 'authorization', 'frontend-page', 'testing-quality', 'documentation-sync', 'security-review', 'deployment'],
  },
  { step: 10, id: 'confirm', title: '第十步：确认并生成项目底座', question: '确认以上决定？确认后锁定治理版本。', multi: false, confirmOnly: true },
]);

const FREE_TEXT_FIELDS = Object.freeze(['purpose', 'business', 'product', 'tech', 'data', 'auth', 'code']);
const MULTI_FIELDS = Object.freeze(['risk_domains', 'skills']);

/** 由 product 答案派生 PRD 主分类（关键词评分，与 prd new 一致的精神） */
export function derivePrdCategory(product) {
  const text = String(product || '').toLowerCase();
  const rules = [
    ['marketplace', ['marketplace', '交易平台', '买卖', '结算', '争议']],
    ['workflow_system', ['审批', '工单', '订单', '流程', '状态', 'workflow', '任务']],
    ['consumer_product', ['注册', '登录', '用户', '留存', 'consumer', 'app']],
    ['data_application', ['报表', '分析', '数据平台', 'dashboard', '报告']],
    ['integration_service', ['集成', '第三方', 'webhook', 'api 对接', 'integration']],
    ['internal_tool', ['内部', '运营', '管理后台', 'admin', '团队成员']],
    ['crud_application', ['客户', '库存', '增删改查', 'crud', '记录']],
    ['content_site', ['官网', '博客', '内容', '知识库', 'seo']],
    ['high_risk_system', ['支付', '医疗', '金融', '合规', '审计']],
  ];
  let best = 'other';
  let bestScore = 0;
  for (const [cat, kws] of rules) {
    const score = kws.filter(kw => text.includes(kw)).length;
    if (score > bestScore) { bestScore = score; best = cat; }
  }
  return best;
}

/** 答案 → 完整项目画像（status=governance_ready） */
export function wizardAnswersToProfile({ answers, name }) {
  const a = answers || {};
  const profile = {
    name,
    mode: 'greenfield',
    status: 'governance_ready',
    purpose: a.purpose || null,
    business: a.business || null,
    product: a.product || null,
    tech: a.tech || null,
    data: a.data || null,
    auth: a.auth || null,
    risk_domains: Array.isArray(a.risk_domains) ? a.risk_domains.filter(x => x !== 'none') : [],
    code: a.code || null,
    skills: Array.isArray(a.skills) ? a.skills : [],
    prd_category: derivePrdCategory(a.product),
    coding_policy: a.coding_policy || 'coding-policy@1.0.0',
    style_policy: a.style_policy || 'style-policy@1.0.0',
    blocking_conflicts: 0,
  };
  const errors = validateProfile(profile);
  if (errors.length > 0) throw new TypeError(`Wizard answers produced invalid profile: ${errors.join('; ')}`);
  return profile;
}

/** 校验答案完整性：缺失步骤清单 */
export function validateAnswers(answers) {
  const missing = [];
  for (const step of WIZARD_STEPS) {
    if (step.confirmOnly) continue;
    const value = answers?.[step.id];
    const empty = value == null || value === '' || (Array.isArray(value) && value.length === 0);
    if (empty) missing.push(`${step.step}.${step.id}`);
  }
  return missing;
}

export function answersPath(rootDir, config) {
  const dir = join(statePaths(rootDir, config).state, 'wizard');
  mkdirSync(dir, { recursive: true });
  return join(dir, 'answers.json');
}

export function loadAnswers({ rootDir, config }) {
  const path = answersPath(rootDir, config);
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return {}; }
}

export function saveAnswers({ rootDir, config, answers }) {
  writeFileSync(answersPath(rootDir, config), `${JSON.stringify(answers, null, 2)}\n`);
  return answers;
}

export function clearAnswers({ rootDir, config }) {
  const path = answersPath(rootDir, config);
  if (existsSync(path)) rmSync(path);
  return {};
}

/** 应用答案：生成 ready 画像并写入 project.yaml */
export function applyAnswers({ rootDir, config, answers, name }) {
  const profile = wizardAnswersToProfile({ answers, name });
  writeProfile({ rootDir, config, profile });
  return profile;
}

// ── CLI ──────────────────────────────────────────────────────────
export function runWizard({ rootDir, args, config }) {
  const subcommand = args[0] || 'status';
  const json = hasArg(args, '--json') || getArg(args, '--format') === 'json';

  if (subcommand === 'init') {
    const name = getArg(args, '--name');
    if (!name) { console.error('wizard init requires --name <项目名>'); process.exitCode = 2; return; }
    const answers = loadAnswers({ rootDir, config });
    answers.name = name;
    saveAnswers({ rootDir, config, answers });
    if (json) console.log(JSON.stringify({ name, next: 1 }, null, 2));
    else console.log(`✅ 从零项目向导开始（项目：${name}）\n   ${WIZARD_STEPS[0].title}: ${WIZARD_STEPS[0].question}\n   回答: harness wizard step --n 1 --answer "<你的回答>"`);
    return;
  }

  if (subcommand === 'step') {
    const n = Number(getArg(args, '--n') || getArg(args, '--step') || 0);
    const answer = getArg(args, '--answer');
    const step = WIZARD_STEPS.find(s => s.step === n);
    if (!step) { console.error(`wizard step: 未知步骤 ${n}（1-10）`); process.exitCode = 2; return; }
    if (step.confirmOnly) { console.error('第 10 步为确认步，请运行 `harness wizard finish`'); process.exitCode = 2; return; }
    if (answer == null) {
      console.log(`${step.title}: ${step.question}`);
      if (step.multi && step.options?.length) console.log(`   可选: ${step.options.join(', ')}`);
      return;
    }
    const answers = loadAnswers({ rootDir, config });
    answers[step.id] = step.multi
      ? answer.split(',').map(s => s.trim()).filter(Boolean)
      : answer;
    saveAnswers({ rootDir, config, answers });
    const next = WIZARD_STEPS.find(s => s.step === n + 1);
    if (json) console.log(JSON.stringify({ answered: step.id, next: next ? next.step : null }, null, 2));
    else if (next) console.log(`✅ 已记录第 ${n} 步。下一步:\n   ${next.title}: ${next.question}`);
    else console.log('✅ 全部 10 步已答。运行 `harness wizard finish` 生成项目底座并锁定治理版本。');
    return;
  }

  if (subcommand === 'status') {
    const answers = loadAnswers({ rootDir, config });
    const total = WIZARD_STEPS.filter(s => !s.confirmOnly).length;
    const done = WIZARD_STEPS.filter(s => !s.confirmOnly && answers[s.id] != null && answers[s.id] !== '' && (!Array.isArray(answers[s.id]) || answers[s.id].length > 0)).length;
    const missing = validateAnswers(answers);
    if (json) console.log(JSON.stringify({ name: answers.name || null, done, total, missing }, null, 2));
    else console.log(`项目：${answers.name || '(未设置)'} — 向导进度 ${done}/${total}${missing.length ? `\n   待完成: ${missing.join(', ')}` : '\n   全部完成，可运行 harness wizard finish'}`);
    return;
  }

  if (subcommand === 'from') {
    const file = getArg(args, '--file') || getArg(args, '--from');
    const name = getArg(args, '--name');
    if (!file) { console.error('wizard from requires --file <answers.json> [--name <项目名>]'); process.exitCode = 2; return; }
    let answers;
    try { answers = JSON.parse(readFileSync(resolve(rootDir, file), 'utf-8')); } catch (e) { console.error(`❌ wizard from: ${e.message}`); process.exitCode = 2; return; }
    const finalName = name || answers.name || 'unnamed';
    answers.name = finalName;
    saveAnswers({ rootDir, config, answers });
    if (json) console.log(JSON.stringify({ loaded: Object.keys(answers).filter(k => k !== 'name'), name: finalName }, null, 2));
    else console.log(`✅ 已载入答案（项目：${finalName}）。运行 harness wizard finish 生成底座并锁定治理版本。`);
    return;
  }

  if (subcommand === 'finish') {
    const answers = loadAnswers({ rootDir, config });
    const name = getArg(args, '--name') || answers.name;
    if (!name) { console.error('❌ wizard finish: 缺少项目名——先运行 `harness wizard init --name <项目名>`'); process.exitCode = 2; return; }
    const missing = validateAnswers(answers);
    if (missing.length > 0) {
      console.error(`❌ wizard finish: 还有 ${missing.length} 步未完成（${missing.join(', ')}）。\n   未确认的业务决定不会被写成正式规则（设计文档 §14.1）。`);
      process.exitCode = 2;
      return;
    }
    try {
      const profile = applyAnswers({ rootDir, config, answers, name });
      const locked = lockVersion({ rootDir, config, profile, version: getArg(args, '--version') });
      if (json) console.log(JSON.stringify({ profile, version: locked.version }, null, 2));
      else console.log(`✅ 项目底座已生成: harness/project.yaml\n✅ 治理版本已锁定: ${locked.version}\n   ${WIZARD_STEPS.length} 步全部确认，项目进入 governance_ready，可创建 PRD 与任务。`);
    } catch (e) {
      console.error(`❌ wizard finish: ${e.message}`);
      process.exitCode = 2;
    }
    return;
  }

  if (subcommand === 'reset') {
    clearAnswers({ rootDir, config });
    console.log('✅ 向导答案已清空。');
    return;
  }

  console.error('Usage: harness wizard init|step|status|from|finish|reset');
  console.error('  init --name <n>                   开始向导');
  console.error('  step --n <1-10> --answer <v>      记录某步答案（多选逗号分隔）');
  console.error('  status [--json]                   查看进度');
  console.error('  from --file <answers.json>        批量载入答案（非交互）');
  console.error('  finish [--version <v>]            生成项目底座并锁定治理版本');
  console.error('  reset                             清空答案');
  process.exitCode = 2;
}
