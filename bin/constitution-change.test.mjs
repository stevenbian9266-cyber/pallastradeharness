/**
 * constitution-change.test.mjs — 变更流 + Skill 影响/处置（Batch C / C09 / C10 / AC-006）
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  applyChangeProposal, assessSkillImpact, listChangeProposals, listSkillDispositions,
  openChangeProposal, pendingSkillDispositions, recordSkillDisposition,
} from './constitution-change.mjs';
import { getCurrentConstitutionVersion, lockConstitutionVersion } from './constitution.mjs';
import { upsertArtifact } from './project-artifacts.mjs';

const CONFIG = { paths: { state: '.harness-state' }, constitution: { dir: 'harness/constitution' } };

function project() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-constitution-change-'));
  mkdirSync(join(rootDir, 'harness/constitution'), { recursive: true });
  mkdirSync(join(rootDir, 'skills/quality'), { recursive: true });
  mkdirSync(join(rootDir, 'skills/other'), { recursive: true });
  writeFileSync(join(rootDir, 'architecture.md'), '# Architecture v1\n');
  writeFileSync(join(rootDir, 'skills/quality/SKILL.md'), '---\nname: quality\nrelatedConstitution: [architecture]\n---\n# Quality\n');
  writeFileSync(join(rootDir, 'skills/other/SKILL.md'), '---\nname: other\n---\n# Other\n');
  upsertArtifact({ rootDir, config: CONFIG, id: 'architecture', type: 'constitution', path: 'architecture.md' });
  lockConstitutionVersion({ rootDir, config: CONFIG });
  return rootDir;
}

test('AC-006: openChangeProposal 必须带原因（CHANGE_REQUIRED 载体）', () => {
  const rootDir = project();
  try {
    assert.throws(() => openChangeProposal({ rootDir, config: CONFIG }), /requires a reason/);
    const proposal = openChangeProposal({ rootDir, config: CONFIG, reason: '调整模块边界' });
    assert.match(proposal.id, /^CHG-/);
    assert.equal(proposal.status, 'OPEN');
    assert.deepEqual(proposal.drift, [], '尚未修改制品时 drift 为空');
    assert.equal(listChangeProposals({ rootDir, config: CONFIG }).length, 1);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('AC-006: 变更流 apply → 新版本 + Skill Impact + 处置闭环', () => {
  const rootDir = project();
  try {
    writeFileSync(join(rootDir, 'architecture.md'), '# Architecture v2（边界调整）\n');
    const proposal = openChangeProposal({ rootDir, config: CONFIG, reason: '调整模块边界' });
    assert.deepEqual(proposal.drift.map(item => item.id), ['architecture'], 'drift 捕获');
    const applied = applyChangeProposal({ rootDir, config: CONFIG, proposalId: proposal.id, decision: 'ADR-0001 模块边界调整', approve: true });
    assert.equal(applied.ok, true);
    assert.match(applied.version, /^constitution-[a-f0-9]{12}$/);
    assert.equal(getCurrentConstitutionVersion({ rootDir, config: CONFIG }).version, applied.version);
    assert.deepEqual(applied.skillImpact.map(item => item.skill).sort(), ['skills/other/SKILL.md', 'skills/quality/SKILL.md']);
    assert.equal(listChangeProposals({ rootDir, config: CONFIG })[0].status, 'CLOSED');
    assert.equal(listChangeProposals({ rootDir, config: CONFIG })[0].decision, 'ADR-0001 模块边界调整');

    const pending = pendingSkillDispositions({ rootDir, config: CONFIG });
    assert.deepEqual(pending.sort(), ['skills/other/SKILL.md', 'skills/quality/SKILL.md']);
    recordSkillDisposition({ rootDir, config: CONFIG, skill: 'skills/quality/SKILL.md', status: 'UPDATE', reason: '已同步 architecture 变更' });
    recordSkillDisposition({ rootDir, config: CONFIG, skill: 'skills/other/SKILL.md', status: 'REVIEWED_NO_CHANGE', reason: '与 architecture 无关' });
    assert.deepEqual(pendingSkillDispositions({ rootDir, config: CONFIG }), []);
    assert.equal(listSkillDispositions({ rootDir, config: CONFIG }).length, 2);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('AC-006: apply 失败模式（未知/重复应用）与处置非法状态', () => {
  const rootDir = project();
  try {
    assert.equal(applyChangeProposal({ rootDir, config: CONFIG, proposalId: 'CHG-nope' }).code, 'NOT_FOUND');
    assert.equal(applyChangeProposal({ rootDir, config: CONFIG, proposalId: null }).code, 'USAGE');
    writeFileSync(join(rootDir, 'architecture.md'), '# Architecture v2\n');
    const proposal = openChangeProposal({ rootDir, config: CONFIG, reason: 'x' });
    assert.equal(applyChangeProposal({ rootDir, config: CONFIG, proposalId: proposal.id }).ok, true);
    assert.equal(applyChangeProposal({ rootDir, config: CONFIG, proposalId: proposal.id }).code, 'NOT_OPEN');
    assert.throws(() => recordSkillDisposition({ rootDir, config: CONFIG, skill: 's', status: 'NOPE' }), /status must be one of/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('AC-006: assessSkillImpact 声明过滤（relatedConstitution 交集）', () => {
  const rootDir = project();
  try {
    const byArchitecture = assessSkillImpact({ rootDir, config: CONFIG, changedIds: ['architecture'] });
    assert.deepEqual(byArchitecture.map(item => item.skill).sort(), ['skills/other/SKILL.md', 'skills/quality/SKILL.md']);
    const byTesting = assessSkillImpact({ rootDir, config: CONFIG, changedIds: ['testing'] });
    assert.deepEqual(byTesting.map(item => item.skill), ['skills/other/SKILL.md'], '声明了 relatedConstitution 的 skill 不受无关变更影响');
    assert.deepEqual(assessSkillImpact({ rootDir, config: CONFIG, changedIds: [] }), []);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
