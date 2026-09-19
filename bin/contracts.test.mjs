import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONTRACT_TYPES, createContract, SCHEMA_VERSION, validateContract } from './contracts.mjs';

test('ProjectArtifact / ConstitutionVersion contracts enforce hash and immutability shape', () => {
  const artifactErrors = validateContract('ProjectArtifact', {
    schemaVersion: SCHEMA_VERSION, type: 'ProjectArtifact',
    id: 'x', path: 'p', template_id: 't', template_version: '1.0.0',
    artifact_version: '1.0', content_hash: 'md5:abc', status: 'DONE', created_at: 'a', updated_at: 'b',
  });
  assert.ok(artifactErrors.includes('status must be one of: ACTIVE, STALE, SUPERSEDED'));
  assert.ok(artifactErrors.includes('content_hash must be sha256:<hex>'));
  assert.ok(artifactErrors.includes('artifact_version must be semver x.y.z'));

  const versionErrors = validateContract('ConstitutionVersion', {
    schemaVersion: SCHEMA_VERSION, type: 'ConstitutionVersion', version: 'v1', created_at: 'a', artifacts: [],
  });
  assert.ok(versionErrors.includes('version must be constitution-<hex12>'));
  assert.ok(versionErrors.includes('artifacts must be a non-empty array'));
});

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
  Template: {
    template_id: 'task-tech-design',
    version: '1.0.0',
    category: 'task',
    scope: 'runtime',
    source_path: 'templates/designs/tech-design.md',
    applies_to: ['feature'],
    required_when: 'feature task enters design stage',
    owner_role: 'tech_lead',
    consumed_by: ['design-check'],
    stale_when: ['task_scope_change'],
    status: 'active',
  },
  ProjectArtifact: {
    id: 'project_overview',
    type: 'constitution',
    path: 'harness/constitution/project-overview.md',
    template_id: 'project-overview',
    template_version: '1.0.0',
    artifact_version: '1.0.0',
    content_hash: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  ConstitutionVersion: {
    version: 'constitution-0123456789ab',
    created_at: new Date().toISOString(),
    artifacts: [{ id: 'project_overview', hash: 'sha256:abc123def456abc123def456', status: 'ACTIVE' }],
  },
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

test('Template contract enforces semver, non-empty arrays and field types', () => {
  const base = {
    schemaVersion: SCHEMA_VERSION, type: 'Template',
    template_id: 'x', version: '1.0', category: 'task', scope: 'runtime', source_path: 'a',
    applies_to: [], required_when: 'w', owner_role: 'tech_lead', consumed_by: ['c'], stale_when: ['s'], status: 'active',
  };
  const errors = validateContract('Template', base);
  assert.ok(errors.includes('version must be semver x.y.z'));
  assert.ok(errors.includes('applies_to must be a non-empty array'));

  const missing = validateContract('Template', { schemaVersion: SCHEMA_VERSION, type: 'Template' });
  assert.ok(missing.includes('template_id is required'));
  assert.ok(missing.includes('source_path is required'));
});
