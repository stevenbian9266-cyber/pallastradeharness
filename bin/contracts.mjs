export const SCHEMA_VERSION = '1.0';

export const CONTRACT_TYPES = Object.freeze([
  'Task',
  'Standard',
  'Risk',
  'Finding',
  'Evidence',
  'KnowledgeAsset',
  'AgentRun',
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

const REQUIRED_FIELDS = Object.freeze({
  Task: ['id', 'title', 'status', 'riskLevel', 'createdAt'],
  Standard: ['id', 'category', 'title', 'authority', 'scope', 'severity', 'enforcement'],
  Risk: ['id', 'level', 'reasons'],
  Finding: ['id', 'standardId', 'message', 'risk', 'recommendation', 'confidence', 'blocking'],
  Evidence: ['id', 'evidenceType', 'taskId', 'capturedAt', 'summary'],
  KnowledgeAsset: ['id', 'path', 'status'],
  AgentRun: ['id', 'taskId', 'agent', 'startedAt', 'status'],
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

function validateTypeSpecificFields(type, value) {
  if (type === 'Standard') return validateStandard(value);
  if (type === 'Finding') return validateFinding(value);
  if (type === 'Risk' && !['quick', 'standard', 'critical'].includes(value.level)) {
    return ['level must be quick, standard, or critical'];
  }
  if (type === 'KnowledgeAsset' && !['updated', 'reviewed-no-change', 'not-applicable', 'pending'].includes(value.status)) {
    return ['status must be updated, reviewed-no-change, not-applicable, or pending'];
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
