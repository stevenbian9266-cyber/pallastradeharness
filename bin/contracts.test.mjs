import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONTRACT_TYPES, createContract, SCHEMA_VERSION, validateContract } from './contracts.mjs';

const valid = {
  Task: { id: 'TASK-1', title: 'x', status: 'planned', riskLevel: 'quick', createdAt: new Date().toISOString() },
  Standard: { id: 'STD-X-001', category: 'testing', title: 'x', authority: { file: 'AGENTS.md' }, scope: ['**/*'], severity: 'error', enforcement: { level: 'verified' } },
  Risk: { id: 'RISK-1', level: 'standard', reasons: ['dependency changed'] },
  Finding: { id: 'FND-1', standardId: 'STD-X-001', message: 'x', risk: 'error', recommendation: 'fix', confidence: 0.9, blocking: true },
  Evidence: { id: 'EVD-1', evidenceType: 'test', taskId: 'TASK-1', capturedAt: new Date().toISOString(), summary: 'passed' },
  KnowledgeAsset: { id: 'KNW-1', path: 'README.md', status: 'reviewed-no-change' },
  AgentRun: { id: 'RUN-1', taskId: 'TASK-1', agent: 'test', startedAt: new Date().toISOString(), status: 'running' },
  ProjectProfile: { id: 'PROJECT-1', name: 'x', repository: '/repo', generatedAt: new Date().toISOString(), stacks: ['node'], layers: [] },
  ChangePlan: { id: 'PLAN-1', taskId: 'TASK-1', allow: ['src/**'], deny: [], standards: [], requiredEvidence: ['test'], createdAt: new Date().toISOString() },
  Decision: { id: 'DEC-1', taskId: 'TASK-1', title: 'x', decision: 'y', reason: 'z', createdAt: new Date().toISOString() },
  ContextPack: { id: 'CTX-1', taskId: 'TASK-1', generatedAt: new Date().toISOString(), assets: [], nextActions: [] },
  TaskCheckpoint: { id: 'CHK-1', taskId: 'TASK-1', createdAt: new Date().toISOString(), status: 'paused', git: {}, nextActions: [] },
  EvidenceBundle: { id: 'BUNDLE-1', taskId: 'TASK-1', createdAt: new Date().toISOString(), evidence: [], verification: {} },
  RecoveryPlan: { id: 'REC-1', taskId: 'TASK-1', createdAt: new Date().toISOString(), failureCriteria: ['x'], stopConditions: ['y'], codeRecovery: ['z'], dataRecovery: ['n/a'], verification: ['test'] },
  KnowledgeAssessment: { id: 'KNA-1', taskId: 'TASK-1', asset: 'README.md', status: 'updated', reason: 'changed', assessedAt: new Date().toISOString() },
  HandoffPackage: { id: 'HANDOFF-1', taskId: 'TASK-1', createdAt: new Date().toISOString(), status: 'paused', nextActions: [] },
};

test('all lifecycle domain contracts validate', () => {
  for (const type of CONTRACT_TYPES) {
    const value = createContract(type, valid[type]);
    assert.equal(value.schemaVersion, SCHEMA_VERSION);
    assert.deepEqual(validateContract(type, value), []);
  }
});

test('contract validation reports field-level errors', () => {
  const errors = validateContract('Finding', { schemaVersion: SCHEMA_VERSION, type: 'Finding', confidence: 2 });
  assert.ok(errors.includes('id is required'));
  assert.ok(errors.includes('standardId is required'));
  assert.ok(errors.includes('confidence must be a number between 0 and 1'));
  assert.ok(errors.includes('blocking must be a boolean'));
});
