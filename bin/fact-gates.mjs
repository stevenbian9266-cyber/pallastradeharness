/**
 * fact-gates.mjs — 事实驱动 Gate + Strict finish（Batch C / C12 + C14）
 *
 * 事实驱动（C12）：不改变 Local `gate:clear`，而是把"真实事实"显式化：
 *   valid requirement approval → REQUIREMENT_APPROVED
 *   valid UI approval          → UI_APPROVED
 *   valid plan artifact        → PLAN_READY
 *   verified evidence          → TESTS_PASS
 *
 * 严格收尾（C14）：`strictGovernance=true` 时 `finish_task` 不得补造事实；
 * 缺失项以 `REQUIRED_ACTIONS` 输出（每项附可执行命令）。Local 兼容路径不受影响。
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ARCHITECTURE_IMPACTS, TECH_STACK_IMPACTS } from './contracts.mjs';
import { statePaths } from './state-store.mjs';
import { verifyTaskEvidence } from './evidence.mjs';
import { designApprovalFiles, validApprovals } from './approvals.mjs';
import { pendingSkillDispositions } from './constitution-change.mjs';
import { checkAcCoverage } from './ac-trace.mjs';

/** strictGovernance 开关（config 或 config.governance）。 */
export function strictGovernanceEnabled(config) {
  return config?.strictGovernance === true || config?.governance?.strictGovernance === true;
}

function featureLike(title) {
  return /^(新增|优化)：/.test(String(title || ''));
}

function describe(records) {
  return records.length > 0 ? `valid approval(s): ${records.map(record => record.id).join(', ')}` : 'no valid approval bound';
}

/** C12：4 个事实门（全部来自真实事实，不做假设）。 */
export function deriveGateFacts({ rootDir, config, task }) {
  const requirementApprovals = validApprovals({ rootDir, config, taskId: task.id, type: 'requirement' });
  const uiApprovals = validApprovals({ rootDir, config, taskId: task.id, type: 'ui' });
  const requirementRequired = Boolean(task.linkedPrd) || featureLike(task.title);
  const uiRequired = designApprovalFiles({ rootDir, config, task }).length > 0;
  const planReady = Boolean(
    task.changePlan
    && Array.isArray(task.changePlan.allow)
    && task.changePlan.allow.length > 0
    && task.risk,
  );
  let testsPass;
  try {
    const verification = verifyTaskEvidence({ rootDir, config, task });
    testsPass = {
      ok: verification.ok === true,
      detail: verification.ok
        ? `fresh typed evidence satisfies policy (${(verification.satisfied || []).join(', ')})`
        : (verification.reasons || ['evidence not verified']).join('; '),
    };
  } catch (error) {
    testsPass = { ok: false, detail: error.message };
  }
  return {
    REQUIREMENT_APPROVED: {
      ok: !requirementRequired || requirementApprovals.length > 0,
      required: requirementRequired,
      detail: requirementRequired ? describe(requirementApprovals) : 'not required for this task',
    },
    UI_APPROVED: {
      ok: !uiRequired || uiApprovals.length > 0,
      required: uiRequired,
      detail: uiRequired ? describe(uiApprovals) : 'not required (no design artifacts)',
    },
    PLAN_READY: {
      ok: planReady,
      detail: planReady ? `change plan allow=${task.changePlan.allow.length} entries` : 'changePlan.allow or risk missing',
    },
    TESTS_PASS: testsPass,
  };
}

/**
 * C14：Strict Finish 评估。
 * @returns {{ok: boolean, missing: Array<{id: string, label: string, action: string}>, facts: object, verification: object}}
 */
export function evaluateStrictFinish({ rootDir, config, task, verification = null }) {
  const facts = deriveGateFacts({ rootDir, config, task });
  let proof = verification;
  if (!proof) {
    try {
      proof = verifyTaskEvidence({ rootDir, config, task });
    } catch (error) {
      proof = { ok: false, reasons: [error.message], satisfied: [] };
    }
  }
  const satisfied = new Set(Array.isArray(proof?.satisfied) ? proof.satisfied : []);
  // 严格收尾的 review/knowledge/test 事实门按【新鲜有效证据记录】判定，而不是按任务自己声明的
  // required 集合（`satisfied ⊆ requiredTypes(task)`）：否则 quick 风险任务永远无法满足
  // review/knowledge（strict 强制要求它们），导致收尾死锁。validTypes 缺失时回退 satisfied。
  const recorded = new Set(
    Array.isArray(proof?.validTypes) ? proof.validTypes : [...satisfied],
  );
  const impacts = task.impact || {};
  const paths = statePaths(rootDir, config);
  const hasContextPack = Boolean(task.contextPack) || existsSync(resolve(paths.brain, `context-${task.id}.json`));
  const acCoverage = task.linkedPrd
    ? checkAcCoverage({ rootDir, prdId: task.linkedPrd, acs: task.acceptanceCriteria || [] })
    : { missing: [] };
  const pendingSkills = pendingSkillDispositions({ rootDir, config });

  const checks = [
    { id: 'context_audit', failed: !hasContextPack, label: 'Context Audit 缺失（无 Context Pack 记录）', action: `harness brain context --task ${task.id}` },
    { id: 'requirement_approval', failed: facts.REQUIREMENT_APPROVED.required && !facts.REQUIREMENT_APPROVED.ok, label: `Requirement Approval 无效：${facts.REQUIREMENT_APPROVED.detail}`, action: 'harness gate:clear --gate <gate-id> --clear user-confirmed（清理时自动记录 Approval 绑定）' },
    { id: 'implementation_plan', failed: !facts.PLAN_READY.ok, label: `Implementation Plan 无效：${facts.PLAN_READY.detail}`, action: '确认 task.changePlan.allow 非空（重建任务或补充 Change Plan）' },
    { id: 'architecture_impact', failed: !ARCHITECTURE_IMPACTS.includes(impacts.architecture), label: 'Architecture Impact 未记录', action: `harness task impact --task ${task.id} --architecture <NONE|LOCAL|CROSS_MODULE|ARCHITECTURE_CHANGE> --tech-stack <NONE|DEPENDENCY_CHANGE|TECH_STACK_CHANGE>` },
    { id: 'tech_stack_impact', failed: !TECH_STACK_IMPACTS.includes(impacts.techStack), label: 'Tech Stack Impact 未记录', action: `harness task impact --task ${task.id} --architecture <…> --tech-stack <NONE|DEPENDENCY_CHANGE|TECH_STACK_CHANGE>` },
    { id: 'ui_approval', failed: facts.UI_APPROVED.required && !facts.UI_APPROVED.ok, label: `UI Approval 无效：${facts.UI_APPROVED.detail}`, action: 'harness gate:clear --gate <gate-id> --clear design-confirmed（清理时自动记录 Approval 绑定）' },
    { id: 'review', failed: !recorded.has('review'), label: 'Review 证据未满足', action: `harness evidence record --task ${task.id} --type review --summary "…" --approve` },
    { id: 'required_tests', failed: !recorded.has('test'), label: 'Required Tests 证据未满足', action: `harness verify unit --task ${task.id}` },
    { id: 'fresh_evidence', failed: !proof?.ok, label: `Required Evidence 未通过/不新鲜：${(proof?.reasons || []).join('; ')}`, action: `harness evidence verify --task ${task.id}` },
    { id: 'ac_coverage', failed: acCoverage.missing.length > 0, label: `AC 无测试覆盖: ${acCoverage.missing.join(', ')}`, action: '为缺失 AC 补测试或调整任务绑定的 AC' },
    { id: 'knowledge', failed: !recorded.has('knowledge'), label: 'Knowledge Assessment 未满足', action: `harness evidence record --task ${task.id} --type knowledge --summary "…" --approve` },
    { id: 'affected_skills', failed: pendingSkills.length > 0, label: `Constitution 变更影响的 Skill 未处置: ${pendingSkills.join(', ')}`, action: 'harness constitution:skills --record <skill> --status=UPDATE|REVIEWED_NO_CHANGE --reason="…"' },
  ];
  const missing = checks
    .filter(check => check.failed)
    .map(({ id, label, action }) => ({ id, label, action }));
  return { ok: missing.length === 0, missing, facts, verification: proof };
}
