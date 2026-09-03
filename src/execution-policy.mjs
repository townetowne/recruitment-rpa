export const FORBIDDEN_OPERATION_KINDS = Object.freeze([
  'screenshot',
  'screen_ocr',
  'coordinate_click',
  'coordinate_navigation',
  'os_pointer_click',
  'browser_visual_snapshot',
]);

export const ALLOWED_OPERATION_KINDS = Object.freeze([
  'site_api_call',
  'page_context_fetch',
  'dom_contract_query',
  'extension_message',
  'file_input_upload',
  'websocket_dispatch',
  'jsonl_checkpoint',
]);

const FORBIDDEN_KIND_SET = new Set(FORBIDDEN_OPERATION_KINDS);
const ALLOWED_KIND_SET = new Set(ALLOWED_OPERATION_KINDS);

function hasCoordinatePayload(value) {
  if (!value || typeof value !== 'object') return false;
  if (Object.hasOwn(value, 'x') || Object.hasOwn(value, 'y')) return true;
  return Object.values(value).some((item) => hasCoordinatePayload(item));
}

export function authorizeOperation(operation) {
  if (!operation || typeof operation !== 'object') {
    throw new Error('operation_required');
  }

  if (FORBIDDEN_KIND_SET.has(operation.kind)) {
    throw new Error(`${operation.kind}_forbidden`);
  }

  if (!ALLOWED_KIND_SET.has(operation.kind)) {
    throw new Error(`operation_kind_not_allowed:${operation.kind}`);
  }

  if (hasCoordinatePayload(operation)) {
    throw new Error('coordinate_payload_forbidden');
  }

  return { ok: true };
}

export function assertAdapterContract(adapter) {
  if (!adapter || typeof adapter !== 'object') {
    throw new Error('adapter_required');
  }

  if (!adapter.platform) throw new Error('adapter_platform_required');
  if (!Array.isArray(adapter.hosts) || adapter.hosts.length === 0) {
    throw new Error(`adapter_hosts_required:${adapter.platform}`);
  }

  if (adapter.fallback && FORBIDDEN_KIND_SET.has(adapter.fallback.kind)) {
    throw new Error(`${adapter.fallback.kind}_fallback_forbidden`);
  }

  const contracts = adapter.contracts || {};
  if (Object.keys(contracts).length === 0) {
    throw new Error(`adapter_contracts_required:${adapter.platform}`);
  }

  for (const [name, contract] of Object.entries(contracts)) {
    if (!contract || typeof contract !== 'object') {
      throw new Error(`adapter_contract_invalid:${adapter.platform}:${name}`);
    }
    if (!contract.source) {
      throw new Error(`adapter_contract_source_required:${adapter.platform}:${name}`);
    }
    if (
      ![
        'site_api',
        'page_context_fetch',
        'dom_contract_query',
        'dom_file_input',
        'career_ops_cn_review_artifact',
      ].includes(contract.source)
    ) {
      throw new Error(`adapter_contract_source_not_allowed:${adapter.platform}:${name}`);
    }
  }

  for (const fallback of adapter.disallowedFallbacks || []) {
    if (!FORBIDDEN_KIND_SET.has(fallback)) {
      throw new Error(`unknown_disallowed_fallback:${adapter.platform}:${fallback}`);
    }
  }

  return { ok: true };
}
