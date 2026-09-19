/**
 * submitted-context.test.mjs — 提交契约与净化（Batch D / D08，PRD AC-001~AC-005）
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GIT_SNAPSHOT_FIELDS,
  SOURCE_PAYLOAD_KEYS,
  SUBMISSION_KINDS,
  buildGitSnapshotSubmission,
  buildProjectContextSubmission,
  buildTaskContextSubmission,
  stripSourcePayload,
  summarizeSubmission,
  validateSubmission,
} from './submitted-context.mjs';

const GIT_INPUT = {
  id: 'SUB-git-1',
  task_id: 'TASK-1',
  commit: 'a1b2c3d4e5',
  base_commit: 'e4f5a6b7c8',
  changed_files: ['bin/x.mjs', 'docs/y.md'],
  tree_hash: 'sha256:tree',
  diff_hash: 'sha256:diff',
  workspace_hash: 'sha256:ws',
  summary: '2 files changed',
};

test('AC-001: 提交种类与 git 快照字段冻结', () => {
  assert.deepEqual([...SUBMISSION_KINDS], ['ProjectContextSubmission', 'TaskContextSubmission', 'GitSnapshotSubmission']);
  assert.ok(Object.isFrozen(SUBMISSION_KINDS));
  assert.deepEqual(
    [...GIT_SNAPSHOT_FIELDS],
    ['commit', 'base_commit', 'changed_files', 'tree_hash', 'diff_hash', 'workspace_hash'],
  );
  assert.ok(Object.isFrozen(GIT_SNAPSHOT_FIELDS));
  assert.ok(Object.isFrozen(SOURCE_PAYLOAD_KEYS) && SOURCE_PAYLOAD_KEYS.includes('content'));
});

test('AC-002: stripSourcePayload 递归剥离源码/全量 diff 并报告 removed 路径', () => {
  const { value, removed } = stripSourcePayload({
    id: 'SUB-1',
    summary: 'ok',
    content: 'const secret = 1;',
    files: [{ path: 'a.mjs', content: 'inner source', sha256: 'h' }],
    nested: { deep: { patch: 'diff --git a b' } },
  });
  assert.equal(value.content, undefined);
  assert.equal(value.files[0].content, undefined);
  assert.equal(value.files[0].sha256, 'h');
  assert.equal(value.nested.deep.patch, undefined);
  assert.equal(value.summary, 'ok');
  assert.deepEqual(removed.sort(), ['content', 'files[0].content', 'nested.deep.patch']);
});

test('AC-003: validateSubmission 报告缺失字段并接受合法提交', () => {
  const project = validateSubmission('ProjectContextSubmission', { id: 'P-1', summary: 's' });
  assert.equal(project.ok, true);
  const badProject = validateSubmission('ProjectContextSubmission', { id: 'P-1' });
  assert.equal(badProject.ok, false);
  assert.deepEqual(badProject.missing, ['summary']);

  const badTask = validateSubmission('TaskContextSubmission', {});
  assert.deepEqual(badTask.missing, ['task_id', 'summary']);

  const git = validateSubmission('GitSnapshotSubmission', GIT_INPUT);
  assert.deepEqual(git.errors, []);
  const badGit = validateSubmission('GitSnapshotSubmission', { commit: 'x', base_commit: 'y' });
  assert.deepEqual(badGit.missing, ['changed_files', 'tree_hash', 'diff_hash', 'workspace_hash']);
  const gitTypeError = validateSubmission('GitSnapshotSubmission', { ...GIT_INPUT, changed_files: 'not-an-array' });
  assert.ok(gitTypeError.errors.some(error => error.includes('must be an array')));

  assert.deepEqual(validateSubmission('Nope', {}).errors, ['unknown submission kind: Nope']);
});

test('AC-004: build*Submission 净化+校验，非法输入抛 TypeError', () => {
  const built = buildGitSnapshotSubmission({ ...GIT_INPUT, diff: 'FULL DIFF TEXT', content: 'SOURCE' });
  assert.equal(built.kind, 'GitSnapshotSubmission');
  assert.equal(typeof built.submitted_at, 'string');
  assert.equal(built.summary, '2 files changed');
  assert.equal(built.diff, undefined);
  assert.equal(built.content, undefined);
  assert.deepEqual(built.removed.sort(), ['content', 'diff']);
  assert.ok(Object.isFrozen(built));

  const project = buildProjectContextSubmission({ id: 'PROJECT-1', summary: 'project summary', source_code: 'x' });
  assert.equal(project.kind, 'ProjectContextSubmission');
  assert.equal(project.source_code, undefined);

  const task = buildTaskContextSubmission({ task_id: 'TASK-1', summary: 'task summary' });
  assert.equal(task.kind, 'TaskContextSubmission');

  assert.throws(() => buildGitSnapshotSubmission({ task_id: 'TASK-1' }), /invalid GitSnapshotSubmission/);
  assert.throws(() => buildProjectContextSubmission({ summary: 'no id' }), /invalid ProjectContextSubmission/);
});

test('AC-005: 摘要 ≤240 字符且不含源码/完整 diff', () => {
  const longText = 'x'.repeat(400);
  const summary = summarizeSubmission('GitSnapshotSubmission', { ...GIT_INPUT, summary: longText });
  assert.equal(summary.length, 240);

  const auto = summarizeSubmission('GitSnapshotSubmission', { changed_files: ['a', 'b'], commit: '0123456789abcdef' });
  assert.equal(auto, '2 file(s) changed, commit 01234567');

  const built = buildGitSnapshotSubmission({ ...GIT_INPUT, summary: '', patch: 'diff --git secret-source' });
  assert.equal(built.summary.includes('secret-source'), false);
});
