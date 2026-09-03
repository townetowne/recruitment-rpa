import { FORBIDDEN_OPERATION_KINDS } from './execution-policy.mjs';

const SECRET_KEY_PATTERN = /cookie|authorization|token|password|secret|session/i;
const COORDINATE_KEYS = new Set(['x', 'y']);

function containsForbiddenVisualEvidence(value) {
  if (!value || typeof value !== 'object') return false;
  if (
    Object.hasOwn(value, 'screenshot') ||
    Object.hasOwn(value, 'screenshotPath') ||
    Object.hasOwn(value, 'screenCapture') ||
    Object.hasOwn(value, 'rawDom')
  ) {
    return true;
  }
  return Object.values(value).some((item) => containsForbiddenVisualEvidence(item));
}

function containsCoordinateEvidence(value) {
  if (!value || typeof value !== 'object') return false;
  if ([...COORDINATE_KEYS].some((key) => Object.hasOwn(value, key))) return true;
  return Object.values(value).some((item) => containsCoordinateEvidence(item));
}

function redact(value) {
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? '[REDACTED]' : redact(item),
    ]),
  );
}

export function createAuditRecord(input) {
  if (!input || typeof input !== 'object') throw new Error('audit_record_required');

  if (containsForbiddenVisualEvidence(input)) {
    throw new Error('audit_visual_evidence_forbidden');
  }
  if (containsCoordinateEvidence(input)) {
    throw new Error('audit_coordinate_evidence_forbidden');
  }
  if (FORBIDDEN_OPERATION_KINDS.includes(input.action)) {
    throw new Error('audit_forbidden_action');
  }

  const at = input.at || new Date().toISOString();
  return {
    at,
    runId: input.runId,
    seq: input.seq,
    platform: input.platform,
    stage: input.stage,
    action: input.action,
    status: input.status || 'observed',
    payload: redact(input.payload || {}),
  };
}

export function serializeAuditRecord(record) {
  return `${JSON.stringify(record)}\n`;
}
