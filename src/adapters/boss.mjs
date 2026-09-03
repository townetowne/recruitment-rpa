import { FORBIDDEN_OPERATION_KINDS, authorizeOperation } from '../execution-policy.mjs';

export const BOSS_RPA_CONTENT_VERSION = '0.1.16';
export const BOSS_RPA_PROTOCOL_VERSION = 'boss-rpa-v0.1.16';
const BOSS_CITY_CODES = Object.freeze({
  '武汉': '101200100',
});

export const BOSS_ADAPTER = Object.freeze({
  platform: 'boss',
  priority: 'primary',
  hosts: ['www.zhipin.com'],
  capabilities: ['jobDiscovery', 'completeJobDetail', 'reviewedMessageSend', 'attachmentResumeReplacement'],
  contracts: {
    session: {
      source: 'dom_contract_query',
      signals: ['authenticatedGeekNav', 'chatEntryVisible', 'jobListOrDetailRoute'],
    },
    jobDetail: {
      source: 'dom_contract_query',
      fields: ['title', 'company', 'description', 'baseCity', 'salary', 'hrActiveSignal', 'contactState'],
    },
    reviewGate: {
      source: 'career_ops_cn_review_artifact',
      fields: ['jobKey', 'company', 'score', 'approvedMessage', 'actionId'],
    },
    messageSend: {
      source: 'dom_contract_query',
      postcondition: 'chatHistoryContainsApprovedMessage',
    },
    attachmentUpload: {
      source: 'dom_file_input',
      postcondition: 'attachmentListContainsUploadedFile',
    },
  },
  disallowedFallbacks: [...FORBIDDEN_OPERATION_KINDS],
});

function assertNonEmptyString(value, code) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(code);
  }
  return value.trim();
}

function normalizeBossPage(page = 1) {
  const normalized = Number(page === undefined || page === null || page === '' ? 1 : page);
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 10) {
    throw new Error('boss_page_out_of_range');
  }
  return normalized;
}

function checkedOperation(operation) {
  authorizeOperation(operation);
  return operation;
}

export function createBossRouteProbeTask() {
  return {
    platform: 'boss',
    action: 'read_route_contract',
    allowNavigation: false,
    operation: checkedOperation({ kind: 'dom_contract_query', platform: 'boss' }),
  };
}

export function createBossRuntimeDiagnosticsTask({ filters, page = 1 } = {}) {
  const task = {
    platform: 'boss',
    action: 'read_runtime_diagnostics',
    readOnly: true,
    expectedContentVersion: BOSS_RPA_CONTENT_VERSION,
    expectedProtocolVersion: BOSS_RPA_PROTOCOL_VERSION,
    operation: checkedOperation({ kind: 'dom_contract_query', platform: 'boss' }),
  };

  if (filters) {
    task.allowNavigation = true;
    task.route = bossSearchRoute({
      query: assertNonEmptyString(filters.query, 'boss_query_required'),
      baseCity: assertNonEmptyString(filters.baseCity, 'boss_base_city_required'),
      page,
    });
  }

  return task;
}

function bossSearchRoute({ query, baseCity, page = 1 }) {
  const cityCode = BOSS_CITY_CODES[baseCity];
  if (!cityCode) throw new Error(`unsupported_boss_city:${baseCity}`);
  const normalizedPage = normalizeBossPage(page);

  const url = new URL('https://www.zhipin.com/web/geek/jobs');
  url.searchParams.set('query', query);
  url.searchParams.set('city', cityCode);
  if (normalizedPage > 1) url.searchParams.set('page', String(normalizedPage));

  return {
    host: url.hostname,
    path: url.pathname,
    query,
    baseCity,
    cityCode,
    page: normalizedPage,
    url: url.toString(),
  };
}

function bossDetailRoute({ jobKey, url }) {
  const normalizedJobKey = assertNonEmptyString(jobKey, 'job_key_required');
  let parsed;
  try {
    parsed = new URL(assertNonEmptyString(url, 'job_url_required'));
  } catch {
    throw new Error(`unsupported_boss_detail_url:${url}`);
  }

  if (parsed.hostname !== 'www.zhipin.com' || !parsed.pathname.startsWith('/job_detail/')) {
    throw new Error(`unsupported_boss_detail_url:${url}`);
  }

  return {
    host: parsed.hostname,
    path: parsed.pathname,
    jobKey: normalizedJobKey,
    url: parsed.toString(),
  };
}

export function createBossSearchRouteTask({ filters, page = 1 }) {
  const query = assertNonEmptyString(filters?.query, 'boss_query_required');
  const baseCity = assertNonEmptyString(filters?.baseCity, 'boss_base_city_required');

  return {
    platform: 'boss',
    action: 'ensure_search_route',
    readOnly: true,
    route: bossSearchRoute({ query, baseCity, page }),
    operation: checkedOperation({ kind: 'dom_contract_query', platform: 'boss' }),
  };
}

export function createBossDiscoveryPlan({ query, baseCity, targetCount, checkpointPath }) {
  const normalizedTargetCount = Number(targetCount);
  if (!Number.isInteger(normalizedTargetCount) || normalizedTargetCount < 20 || normalizedTargetCount > 50) {
    throw new Error('boss_target_count_out_of_range');
  }

  return {
    platform: 'boss',
    mode: 'job_discovery',
    readOnly: true,
    targetCount: normalizedTargetCount,
    filters: {
      query: assertNonEmptyString(query, 'boss_query_required'),
      baseCity: assertNonEmptyString(baseCity, 'boss_base_city_required'),
    },
    operations: [
      checkedOperation({ kind: 'dom_contract_query', platform: 'boss' }),
      checkedOperation({ kind: 'jsonl_checkpoint', platform: 'boss' }),
    ],
    contract: {
      requiredDetail: 'complete_jd',
      checkpointPath: assertNonEmptyString(checkpointPath, 'checkpoint_path_required'),
    },
  };
}

export function createBossJobListTask({ filters, limit, page = 1 }) {
  return {
    platform: 'boss',
    action: 'read_job_cards',
    readOnly: true,
    filters: {
      query: assertNonEmptyString(filters?.query, 'boss_query_required'),
      baseCity: assertNonEmptyString(filters?.baseCity, 'boss_base_city_required'),
    },
    page: normalizeBossPage(page),
    limit,
    operation: checkedOperation({ kind: 'dom_contract_query', platform: 'boss' }),
  };
}

export function createBossJobDetailTask({ jobKey, url, securityId, lid, encryptJobId }) {
  const normalizedJobKey = assertNonEmptyString(jobKey, 'job_key_required');
  const normalizedUrl = assertNonEmptyString(url, 'job_url_required');
  const task = {
    platform: 'boss',
    action: 'read_job_detail',
    readOnly: true,
    allowNavigation: true,
    jobKey: normalizedJobKey,
    url: normalizedUrl,
    route: bossDetailRoute({ jobKey: normalizedJobKey, url: normalizedUrl }),
    operation: checkedOperation({ kind: 'dom_contract_query', platform: 'boss' }),
    contract: {
      requiredDetail: 'complete_jd',
    },
  };

  if (typeof securityId === 'string' && securityId.trim()) task.securityId = securityId.trim();
  if (typeof lid === 'string' && lid.trim()) task.lid = lid.trim();
  if (typeof encryptJobId === 'string' && encryptJobId.trim()) task.encryptJobId = encryptJobId.trim();

  return task;
}

export function createBossReviewedMessageTask({ reviewRecord }) {
  if (!reviewRecord || typeof reviewRecord !== 'object') throw new Error('review_record_required');
  if (reviewRecord.platform !== 'boss') throw new Error('review_platform_mismatch');
  if (reviewRecord.approved !== true) throw new Error('review_approval_required');

  const actionId = assertNonEmptyString(reviewRecord.actionId, 'stable_action_id_required');
  const approvedMessage = assertNonEmptyString(reviewRecord.approvedMessage, 'approved_message_required');
  const jobKey = assertNonEmptyString(reviewRecord.jobKey, 'job_key_required');

  return {
    platform: 'boss',
    action: 'send_reviewed_message',
    sideEffect: true,
    actionId,
    jobKey,
    approvedMessage,
    postcondition: BOSS_ADAPTER.contracts.messageSend.postcondition,
    operations: [
      checkedOperation({ kind: 'dom_contract_query', platform: 'boss' }),
      checkedOperation({ kind: 'extension_message', platform: 'boss' }),
      checkedOperation({ kind: 'jsonl_checkpoint', platform: 'boss' }),
    ],
  };
}
