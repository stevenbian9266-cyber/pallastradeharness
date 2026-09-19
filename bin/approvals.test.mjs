/**
 * approvals.test.mjs — Approval Artifact Hash + Staleness（Batch C / C11 / AC-007）
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  approvalStatuses, designApprovalFiles, listApprovals, recordApproval,
  requirementApprovalFiles, validApprovals,
} from './approvals.mjs';

const CONFIG = { paths: { state: '.harness-state' }, constitution: { dir: 'harness/constitution' } };

function project() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-approvals-'));
  mkdirSync(join(rootDir, 'docs/prd/other'), { recursive: true });
  mkdirSync(join(rootDir, 'harness/requirements'), { recursive: true });
  mkdirSync(join(rootDir, 'docs/designs/TASK-C1'), { recursive: true });
  writeFileSync(join(rootDir, 'docs/prd/other/PRD-20260919-other-x.md'), '# PRD-X\n');
  writeFileSync(join(rootDir, 'harness/requirements/REQ-20260919-x.md'), '# REQ\n> Task: TASK-C1\n');
  writeFileSync(join(rootDir, 'docs/designs/TASK-C1/ui.md'), '# UI\n');
  writeFileSync(join(rootDir, 'docs/designs/TASK-C1/tech-design.md'), '# Tech\n');
  return rootDir;
}

const TASK = { id: 'TASK-C1', linkedPrd: 'PRD-20260919-other-x' };

test('AC-007: 审批绑定文件发现（requirement / ui）', () => {
  const rootDir = project();
  try {
    const requirementFiles = requirementApprovalFiles({ rootDir, config: CONFIG, task: TASK });
    assert.deepEqual(requirementFiles, [
      'docs/prd/other/PRD-20260919-other-x.md',
      'harness/requirements/REQ-20260919-x.md',
    ]);
    assert.deepEqual(designApprovalFiles({ rootDir, config: CONFIG, task: TASK }), [
      'docs/designs/TASK-C1/tech-design.md',
      'docs/designs/TASK-C1/ui.md',
    ]);
    assert.deepEqual(requirementApprovalFiles({ rootDir, config: CONFIG, task: { id: 'TASK-X' } }), []);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('AC-007: 记录审批 → VALID；制品变化 → STALE（不得复用旧确认）', () => {
  const rootDir = project();
  try {
    const record = recordApproval({
      rootDir, config: CONFIG, taskId: TASK.id, type: 'requirement',
      summary: 'user-confirmed (test)', files: requirementApprovalFiles({ rootDir, config: CONFIG, task: TASK }),
    });
    assert.equal(record.status, 'VALID');
    assert.match(record.artifact_hash, /^sha256:/);
    assert.deepEqual(validApprovals({ rootDir, config: CONFIG, taskId: TASK.id, type: 'requirement' }).map(item => item.id), [record.id]);

    writeFileSync(join(rootDir, 'docs/prd/other/PRD-20260919-other-x.md'), '# PRD-X（修改后）\n');
    const statuses = approvalStatuses({ rootDir, config: CONFIG });
    assert.equal(statuses[0].status, 'STALE');
    assert.deepEqual(validApprovals({ rootDir, config: CONFIG, taskId: TASK.id, type: 'requirement' }), []);
    assert.deepEqual(validApprovals({ rootDir, config: CONFIG, taskId: 'TASK-OTHER', type: 'requirement' }), []);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('AC-007: UNBOUND（无绑定文件）· 幂等 · 类型校验', () => {
  const rootDir = project();
  try {
    assert.throws(() => recordApproval({ rootDir, config: CONFIG, taskId: 'T', type: 'nope' }), /unknown approval type/);
    const unbound = recordApproval({ rootDir, config: CONFIG, taskId: 'T', type: 'high_risk', summary: 'no files' });
    assert.equal(unbound.status, 'UNBOUND');
    assert.equal(approvalStatuses({ rootDir, config: CONFIG }).find(item => item.id === unbound.id).status, 'UNBOUND');
    assert.deepEqual(validApprovals({ rootDir, config: CONFIG }).filter(item => item.id === unbound.id), []);
    const first = recordApproval({
      rootDir, config: CONFIG, taskId: TASK.id, type: 'ui',
      files: designApprovalFiles({ rootDir, config: CONFIG, task: TASK }),
    });
    const second = recordApproval({
      rootDir, config: CONFIG, taskId: TASK.id, type: 'ui',
      files: designApprovalFiles({ rootDir, config: CONFIG, task: TASK }),
    });
    assert.equal(first.id, second.id, 'same binding is idempotent');
    assert.equal(listApprovals({ rootDir, config: CONFIG }).length, 2);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
