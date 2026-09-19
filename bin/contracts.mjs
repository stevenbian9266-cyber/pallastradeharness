export const SCHEMA_VERSION = '1.0';

export const CONTRACT_TYPES = Object.freeze([
  'Task',
  'Standard',
  'Risk',
  'Finding',
  'Evidence',
  'KnowledgeAsset',
  'AgentRun',
  'ProjectProfile',
  'ChangePlan',
  'Decision',
  'ContextPack',
  'TaskCheckpoint',
  'EvidenceBundle',
  'RecoveryPlan',
  'KnowledgeAssessment',
  'HandoffPackage',
  'Template',
  'ProjectArtifact',
  'ConstitutionVersion',
]);

export const TASK_STATUSES = Object.freeze([
  'draft',
  'planned',
  'approved',
  'implementing',
  'reviewing',
  'verifying',
  'completed',
  'paused',
  'blocked',
  'cancelled',
  'superseded',
]);

export const EVIDENCE_TYPES = Object.freeze([
  'command',
  'test',
  'build',
  'screenshot',
  'dom',
  'log',
  'database',
  'review',
  'approval',
  'ui-approval',
  'knowledge',
]);

/** 审批类型（单一来源；本地审批与 Cloud 工具共用）。 */
export const APPROVAL_TYPES = Object.freeze([
  'baseline', 'requirement', 'ui', 'architecture', 'tech_stack', 'high_risk', 'waiver',
]);

export const STANDARD_CATEGORIES = Object.freeze([
  'architecture',
  'technology-selection',
  'code-quality',
  'database',
  'api',
  'security',
  'ui-style',
  'interaction',
  'accessibility',
  'testing',
  'documentation',
  'knowledge',
  'deployment',
]);

export const ENFORCEMENT_LEVELS = Object.freeze([
  'documented',
  'advisory',
  'review-required',
  'verified',
  'blocking',
  'critical',
]);

// Batch C（C07/C08）：统一影响评估枚举
export const ARCHITECTURE_IMPACTS = Object.freeze(['NONE', 'LOCAL', 'CROSS_MODULE', 'ARCHITECTURE_CHANGE']);
export const TECH_STACK_IMPACTS = Object.freeze(['NONE', 'DEPENDENCY_CHANGE', 'TECH_STACK_CHANGE']);
export const ARTIFACT_STATUSES = Object.freeze(['ACTIVE', 'STALE', 'SUPERSEDED']);

const REQUIRED_FIELDS = Object.freeze({
  Task: ['id', 'title', 'status', 'riskLevel', 'createdAt'],
  Standard: ['id', 'category', 'title', 'authority', 'scope', 'severity', 'enforcement'],
  Risk: ['id', 'level', 'reasons'],
  Finding: ['id', 'standardId', 'message', 'risk', 'recommendation', 'confidence', 'blocking'],
  Evidence: ['id', 'evidenceType', 'taskId', 'capturedAt', 'summary'],
  KnowledgeAsset: ['id', 'path', 'status'],
  AgentRun: ['id', 'taskId', 'agent', 'startedAt', 'status'],
  ProjectProfile: ['id', 'name', 'repository', 'generatedAt', 'stacks', 'layers'],
  ChangePlan: ['id', 'taskId', 'allow', 'deny', 'standards', 'requiredEvidence', 'createdAt'],
  Decision: ['id', 'taskId', 'title', 'decision', 'reason', 'createdAt'],
  ContextPack: ['id', 'taskId', 'generatedAt', 'assets', 'nextActions'],
  TaskCheckpoint: ['id', 'taskId', 'createdAt', 'status', 'git', 'nextActions'],
  EvidenceBundle: ['id', 'taskId', 'createdAt', 'evidence', 'verification'],
  RecoveryPlan: ['id', 'taskId', 'createdAt', 'failureCriteria', 'stopConditions', 'codeRecovery', 'dataRecovery', 'verification'],
  KnowledgeAssessment: ['id', 'taskId', 'asset', 'status', 'reason', 'assessedAt'],
  HandoffPackage: ['id', 'taskId', 'createdAt', 'status', 'nextActions'],
  Template: [
    'template_id', 'version', 'category', 'scope', 'source_path',
    'applies_to', 'required_when', 'owner_role', 'consumed_by', 'stale_when', 'status',
  ],
  ProjectArtifact: [
    'id', 'type', 'path', 'template_id', 'template_version', 'artifact_version',
    'content_hash', 'status', 'created_at', 'updated_at',
  ],
  ConstitutionVersion: ['version', 'created_at', 'artifacts'],
});

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateStandard(value) {
  const errors = [];
  if (!STANDARD_CATEGORIES.includes(value.category)) errors.push(`category must be one of: ${STANDARD_CATEGORIES.join(', ')}`);
  if (!Array.isArray(value.scope) || value.scope.length === 0) errors.push('scope must be a non-empty array');
  if (!isObject(value.authority) || !value.authority.file) errors.push('authority.file is required');
  const level = typeof value.enforcement === 'string' ? value.enforcement : value.enforcement?.level;
  if (!ENFORCEMENT_LEVELS.includes(level)) errors.push(`enforcement level must be one of: ${ENFORCEMENT_LEVELS.join(', ')}`);
  return errors;
}

function validateFinding(value) {
  const errors = [];
  if (typeof value.confidence !== 'number' || value.confidence < 0 || value.confidence > 1) {
    errors.push('confidence must be a number between 0 and 1');
  }
  if (typeof value.blocking !== 'boolean') errors.push('blocking must be a boolean');
  return errors;
}

function validateTemplate(value) {
  const errors = [];
  if (!/^\d+\.\d+\.\d+$/.test(String(value.version))) errors.push('version must be semver x.y.z');
  for (const field of ['template_id', 'category', 'scope', 'source_path', 'required_when', 'owner_role', 'status']) {
    if (typeof value[field] !== 'string' || value[field].length === 0) errors.push(`${field} must be a non-empty string`);
  }
  for (const field of ['applies_to', 'consumed_by', 'stale_when']) {
    if (!Array.isArray(value[field]) || value[field].length === 0) errors.push(`${field} must be a non-empty array`);
  }
  if (value.contract_path !== undefined && (typeof value.contract_path !== 'string' || value.contract_path.length === 0)) {
    errors.push('contract_path must be a non-empty string when present');
  }
  return errors;
}

function validateProjectArtifact(value) {
  const errors = [];
  if (!ARTIFACT_STATUSES.includes(value.status)) errors.push(`status must be one of: ${ARTIFACT_STATUSES.join(', ')}`);
  if (!/^sha256:[a-f0-9]{12,64}$/.test(String(value.content_hash))) errors.push('content_hash must be sha256:<hex>');
  if (!/^\d+\.\d+\.\d+$/.test(String(value.artifact_version))) errors.push('artifact_version must be semver x.y.z');
  if (!/^\d+\.\d+\.\d+$/.test(String(value.template_version))) errors.push('template_version must be semver x.y.z');
  return errors;
}

function validateConstitutionVersion(value) {
  const errors = [];
  if (!/^constitution-[a-f0-9]{12}$/.test(String(value.version))) errors.push('version must be constitution-<hex12>');
  if (!Array.isArray(value.artifacts) || value.artifacts.length === 0) errors.push('artifacts must be a non-empty array');
  return errors;
}

function validateTypeSpecificFields(type, value) {
  if (type === 'Standard') return validateStandard(value);
  if (type === 'Finding') return validateFinding(value);
  if (type === 'Template') return validateTemplate(value);
  if (type === 'ProjectArtifact') return validateProjectArtifact(value);
  if (type === 'ConstitutionVersion') return validateConstitutionVersion(value);
  if (type === 'Risk' && !['quick', 'standard', 'critical'].includes(value.level)) {
    return ['level must be quick, standard, or critical'];
  }
  if (type === 'Task' && !TASK_STATUSES.includes(value.status)) {
    return [`status must be one of: ${TASK_STATUSES.join(', ')}`];
  }
  if (type === 'Evidence' && !EVIDENCE_TYPES.includes(value.evidenceType)) {
    return [`evidenceType must be one of: ${EVIDENCE_TYPES.join(', ')}`];
  }
  if (type === 'KnowledgeAsset' && !['updated', 'reviewed-no-change', 'not-applicable', 'pending'].includes(value.status)) {
    return ['status must be updated, reviewed-no-change, not-applicable, or pending'];
  }
  if (type === 'KnowledgeAssessment' && !['updated', 'reviewed-no-change', 'not-applicable'].includes(value.status)) {
    return ['status must be updated, reviewed-no-change, or not-applicable'];
  }
  if (['ProjectProfile', 'ChangePlan', 'ContextPack', 'TaskCheckpoint', 'EvidenceBundle', 'HandoffPackage'].includes(type)) {
    const arrayFields = {
      ProjectProfile: ['stacks', 'layers'],
      ChangePlan: ['allow', 'deny', 'standards', 'requiredEvidence'],
      ContextPack: ['assets', 'nextActions'],
      TaskCheckpoint: ['nextActions'],
      EvidenceBundle: ['evidence'],
      HandoffPackage: ['nextActions'],
    }[type];
    return arrayFields.filter(field => !Array.isArray(value[field])).map(field => `${field} must be an array`);
  }
  return [];
}

export function validateContract(type, value) {
  const errors = [];
  if (!CONTRACT_TYPES.includes(type)) return [`unknown contract type: ${type}`];
  if (!isObject(value)) return [`${type} must be an object`];
  if (value.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  if (value.type !== type) errors.push(`type must be ${type}`);

  for (const field of REQUIRED_FIELDS[type]) {
    if (value[field] === undefined || value[field] === null || value[field] === '') {
      errors.push(`${field} is required`);
    }
  }

  errors.push(...validateTypeSpecificFields(type, value));
  return errors;
}

export function createContract(type, fields) {
  const value = { schemaVersion: SCHEMA_VERSION, ...fields, type };
  const errors = validateContract(type, value);
  if (errors.length > 0) {
    throw new TypeError(`Invalid ${type}: ${errors.join('; ')}`);
  }
  return value;
}

export function createFinding(fields) {
  return createContract('Finding', fields);
}
