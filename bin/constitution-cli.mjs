/**
 * constitution-cli.mjs — `harness constitution:*` CLI（Batch C / FR-013）
 *
 * 独立于 `bin/constitution.mjs`（数据层）的 CLI 叶子模块：
 * 数据层保持无环依赖（constitution ← constitution-change），CLI 层可自由组合两者与 approvals。
 */
import { approvalStatuses } from './approvals.mjs';
import { upsertArtifact, refreshArtifacts } from './project-artifacts.mjs';
import { getTemplate } from './template-registry.mjs';
import {
  diffConstitutionVersions, getCurrentConstitutionVersion, lockConstitutionVersion,
} from './constitution.mjs';
import {
  applyChangeProposal, listSkillDispositions, openChangeProposal,
  pendingSkillDispositions, recordSkillDisposition,
} from './constitution-change.mjs';

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function optionValue(args, name) {
  const inline = args.find(value => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] ?? null : null;
}

function constitutionRegister({ rootDir, config, args, json }) {
  const id = optionValue(args, 'id');
  const artifactPath = optionValue(args, 'path');
  if (!id || !artifactPath) {
    console.error('Usage: harness constitution:register --id <artifact-id> --path <file> [--type constitution] [--template <template-id>]');
    process.exitCode = 1;
    return;
  }
  const templateId = optionValue(args, 'template');
  const template = templateId ? getTemplate(templateId) : null;
  const artifact = upsertArtifact({
    rootDir, config, id, path: artifactPath,
    type: optionValue(args, 'type') || 'constitution',
    templateId: template?.template_id || templateId,
    templateVersion: template?.version || '1.0.0',
  });
  if (json) return printJson(artifact);
  console.log(`✅ Artifact registered: ${artifact.id} (${artifact.content_hash.slice(0, 19)}…)`);
}

function constitutionStatus({ rootDir, config, json }) {
  const current = getCurrentConstitutionVersion({ rootDir, config });
  const { artifacts, drift } = refreshArtifacts({ rootDir, config });
  const staleApprovals = approvalStatuses({ rootDir, config }).filter(record => record.status === 'STALE');
  const pendingSkills = pendingSkillDispositions({ rootDir, config });
  const report = {
    current,
    artifacts: artifacts.map(artifact => ({ id: artifact.id, status: artifact.status })),
    drift,
    staleApprovals: staleApprovals.map(record => record.id),
    pendingSkills,
  };
  if (json) return printJson(report);
  console.log(`${current ? '✅' : '⚠️'} Constitution: ${current?.version || '(未锁定)'} · ${artifacts.length} artifact(s) · drift ${drift.length} · stale approvals ${staleApprovals.length} · pending skills ${pendingSkills.length}`);
  for (const item of drift) console.log(`   ⚠️ drift ${item.kind}: ${item.id} (${item.path})`);
  for (const skill of pendingSkills) console.log(`   ⏳ skill pending: ${skill}`);
}

function constitutionLock({ rootDir, config, json }) {
  const result = lockConstitutionVersion({ rootDir, config });
  if (json) return printJson(result);
  if (!result.ok) {
    console.error(`❌ ${result.code}: ${result.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✅ Constitution version locked: ${result.version} → ${result.path}`);
}

function constitutionDiff({ rootDir, config, args, json }) {
  const [, from, to] = args;
  if (!from || !to) {
    console.error('Usage: harness constitution:diff <from-version> <to-version>');
    process.exitCode = 1;
    return;
  }
  const result = diffConstitutionVersions({ rootDir, config, from, to });
  if (json) return printJson(result);
  console.log(`🔍 ${from} → ${to}: +${result.added.length} / -${result.removed.length} / ~${result.changed.length}`);
  for (const item of result.changed) console.log(`   ~ ${item.id}`);
}

function constitutionChange({ rootDir, config, args, json }) {
  const reason = args.find(value => !value.startsWith('--') && value !== 'change') || null;
  const result = openChangeProposal({ rootDir, config, reason });
  if (json) return printJson(result);
  console.log(`📝 Change proposal ${result.id} opened — drift ${result.drift.length} item(s); reason: ${result.reason}`);
}

function constitutionApply({ rootDir, config, args, json }) {
  const result = applyChangeProposal({
    rootDir, config,
    proposalId: args.find(value => /^CHG-/.test(value)),
    decision: optionValue(args, 'decision'),
    approve: args.includes('--approve'),
  });
  if (json) return printJson(result);
  if (!result.ok) {
    console.error(`❌ ${result.code}: ${result.message || ''}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✅ Change applied → ${result.version}; skill impact: ${result.skillImpact.map(item => item.skill).join(', ') || '(none)'}`);
}

function constitutionSkills({ rootDir, config, args, json }) {
  const recordIndex = args.indexOf('--record');
  if (recordIndex >= 0) {
    const skill = args[recordIndex + 1];
    const record = recordSkillDisposition({
      rootDir, config, skill,
      status: optionValue(args, 'status'),
      reason: optionValue(args, 'reason') || '',
    });
    if (json) return printJson(record);
    console.log(`✅ Skill disposition recorded: ${skill} = ${record.status}`);
    return;
  }
  const report = { pending: pendingSkillDispositions({ rootDir, config }), dispositions: listSkillDispositions({ rootDir, config }) };
  if (json) return printJson(report);
  console.log(`🧩 pending skills: ${report.pending.join(', ') || '(none)'} · dispositions: ${report.dispositions.length}`);
}

function constitutionApprovals({ rootDir, config, json }) {
  const report = approvalStatuses({ rootDir, config });
  if (json) return printJson(report);
  for (const record of report) console.log(`${record.status === 'VALID' ? '✅' : '⚠️'} ${record.id} ${record.type} task=${record.taskId || '-'} status=${record.status}`);
  if (report.length === 0) console.log('(no approvals recorded)');
}

const CONSTITUTION_USAGE = 'Usage: harness constitution:status|register|lock|diff <a> <b>|change [reason]|apply <CHG-id> [--approve]|skills [--record <skill> --status=UPDATE|REVIEWED_NO_CHANGE --reason=…]|approvals';

const CONSTITUTION_SUBCOMMANDS = Object.freeze({
  register: constitutionRegister,
  status: constitutionStatus,
  lock: constitutionLock,
  diff: constitutionDiff,
  change: constitutionChange,
  apply: constitutionApply,
  skills: constitutionSkills,
  approvals: constitutionApprovals,
});

export function runConstitution({ rootDir, config, args = [], json = false }) {
  const subcommand = args[0] || 'status';
  const handler = CONSTITUTION_SUBCOMMANDS[subcommand];
  if (!handler) {
    console.error(CONSTITUTION_USAGE);
    process.exitCode = 1;
    return;
  }
  return handler({ rootDir, config, args, json });
}
