/**
 * evidence-boundary.test.mjs — Cloud 证据边界（Batch D / D09，PRD AC-010/AC-011）
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EVIDENCE_BOUNDARY_DEFAULTS,
  EVIDENCE_SOURCES,
  TRUST_LEVELS,
  applyEvidenceBoundary,
  createBoundaryEvidenceRepository,
  resolveTrustLevel,
  validateEvidenceBoundary,
} from './evidence-boundary.mjs';

test('AC-010: 默认边界为 local_agent / cooperative，且来源与信任级别冻结', () => {
  assert.deepEqual({ ...EVIDENCE_BOUNDARY_DEFAULTS }, { source: 'local_agent', trust_level: 'cooperative' });
  assert.ok(Object.isFrozen(EVIDENCE_BOUNDARY_DEFAULTS));
  assert.deepEqual([...EVIDENCE_SOURCES], ['local_agent', 'human', 'ci_attested']);
  assert.deepEqual([...TRUST_LEVELS], ['cooperative', 'verified']);

  const applied = applyEvidenceBoundary({ evidenceType: 'test', summary: 'unit run' });
  assert.equal(applied.source, 'local_agent');
  assert.equal(applied.trust_level, 'cooperative');
  assert.equal(applied.evidenceType, 'test');
  assert.equal(resolveTrustLevel('human', undefined), 'cooperative');
});

test('AC-010: 不得伪装 CI attestation（claim 无佐证 → 抛错；有佐证 → verified）', () => {
  assert.throws(
    () => applyEvidenceBoundary({ evidenceType: 'test', source: 'ci_attested' }),
    /must not fake CI attestation/,
  );
  assert.throws(
    () => applyEvidenceBoundary({ evidenceType: 'test', source: 'ci_attested', attestation: '   ' }),
    /must not fake CI attestation/,
  );

  const attested = applyEvidenceBoundary({ evidenceType: 'test', source: 'ci_attested', attestation: 'ci://run/123' });
  assert.equal(attested.trust_level, 'verified');
  assert.equal(attested.attestation, 'ci://run/123');

  assert.throws(() => applyEvidenceBoundary({ source: 'nope' }), /unknown evidence source/);
  assert.throws(() => applyEvidenceBoundary({ source: 'local_agent', trust_level: 'verified' }), /conflicts with source/);
  assert.equal(applyEvidenceBoundary({ source: 'local_agent', attestation: 'stale' }).attestation, undefined);
});

test('AC-010: validateEvidenceBoundary 检出缺失与非法取值', () => {
  assert.equal(validateEvidenceBoundary(applyEvidenceBoundary({ evidenceType: 'review' })).ok, true);
  const missing = validateEvidenceBoundary({ evidenceType: 'review' });
  assert.deepEqual(missing.missing, ['source', 'trust_level']);
  const invalid = validateEvidenceBoundary({ source: 'robot', trust_level: 'trustme' });
  assert.ok(invalid.errors.some(error => error.includes('unknown evidence source')));
  assert.ok(invalid.errors.some(error => error.includes('unknown trust_level')));
  assert.equal(validateEvidenceBoundary(null).ok, false);
});

test('AC-011: 包装后的 EvidenceRepository 记录带边界标记，list/bundle 行为不变', () => {
  const recorded = [];
  const repo = {
    kind: 'EvidenceRepository',
    list: taskId => recorded.filter(item => item.taskId === taskId),
    record: input => {
      const value = { id: `EVD-${recorded.length + 1}`, ...input };
      recorded.push(value);
      return value;
    },
    bundle: task => ({ taskId: task.id, evidence: repo.list(task.id) }),
  };

  const evidence = createBoundaryEvidenceRepository(repo);
  assert.equal(evidence.kind, 'EvidenceRepository');
  const record = evidence.record({ taskId: 'TASK-1', evidenceType: 'test', summary: 'submitted run' });
  assert.equal(record.source, 'local_agent');
  assert.equal(record.trust_level, 'cooperative');
  assert.equal(evidence.list('TASK-1').length, 1);
  assert.deepEqual(evidence.bundle({ id: 'TASK-1' }).evidence.map(item => item.id), [record.id]);
  assert.throws(() => evidence.record({ taskId: 'TASK-1', source: 'ci_attested' }), /must not fake CI attestation/);
  assert.throws(() => createBoundaryEvidenceRepository({ kind: 'EvidenceRepository' }), /requires an EvidenceRepository/);
});
