import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  BOSS_RPA_CONTENT_VERSION,
  BOSS_RPA_PROTOCOL_VERSION,
  createBossDiscoveryPlan,
  createBossJobDetailTask,
  createBossJobListTask,
  createBossRouteProbeTask,
  createBossRuntimeDiagnosticsTask,
  createBossSearchRouteTask,
} from './adapters/boss.mjs';
import { createAuditRecord } from './audit-log.mjs';

const MIN_USEFUL_JD_LENGTH = 80;
const BOSS_NON_JD_TEXT_PATTERNS = [
  /BOSS\s*正在加载中/i,
  /function\s+getCookie/i,
  /SecurityJsHelper/i,
  /passport_page_/i,
  /window\._passportConfig/i,
  /XMLHttpRequest/i,
  /security-js\//i,
  /__zp_stoken__/i,
];
const COMPLETED_DECISION_STATUSES = new Set(['verified', 'skipped']);
const CONTACT_STATES = new Set(['can_chat', 'already_contacted', 'closed_or_stopped', 'unknown']);

export function isBossBaseCityMatch(actual, required) {
  const actualText = String(actual || '').replace(/\s+/g, '');
  const requiredText = String(required || '').replace(/\s+/g, '');
  if (!actualText || !requiredText) return false;
  if (actualText === '全国') return false;
  return actualText.includes(requiredText);
}

function assertText(value, code) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
  return value.trim();
}

function isCheckpointDecision(record) {
  return record?.jobKey && record?.status && (!record.kind || record.kind === 'job_decision');
}

function completedKeysFromRecords(records) {
  const latestByJobKey = new Map();
  for (const record of records) {
    if (isCheckpointDecision(record)) latestByJobKey.set(record.jobKey, record.status);
  }
  return new Set(
    [...latestByJobKey]
      .filter(([_jobKey, status]) => COMPLETED_DECISION_STATUSES.has(status))
      .map(([jobKey]) => jobKey),
  );
}

function assertUsefulBossJdText(value) {
  const compactLength = value.replace(/\s+/g, '').length;
  if (compactLength < MIN_USEFUL_JD_LENGTH) {
    throw new Error('boss_complete_jd_required');
  }
  if (BOSS_NON_JD_TEXT_PATTERNS.some((pattern) => pattern.test(value))) {
    throw new Error('boss_complete_jd_required');
  }
}

export function assertCompleteBossJobDetail(job) {
  const jobKey = assertText(job?.jobKey, 'boss_detail_job_key_required');
  const url = assertText(job?.url, 'boss_detail_url_required');
  const title = assertText(job?.title, 'boss_detail_title_required');
  const company = assertText(job?.company, 'boss_detail_company_required');
  const baseCity = assertText(job?.baseCity || job?.city, 'boss_detail_base_city_required');
  const description = assertText(job?.description || job?.desc, 'boss_complete_jd_required');

  if (!url.startsWith('https://www.zhipin.com/job_detail/')) {
    throw new Error('boss_detail_url_required');
  }
  assertUsefulBossJdText(description);

  return {
    ok: true,
    job: {
      ...job,
      jobKey,
      url,
      title,
      company,
      baseCity,
      description,
    },
  };
}

function booleanFrom(value) {
  return value === true || value === 'true';
}

function normalizeContactStatusText(job) {
  return String(
    job?.contactText ||
      job?.contactStatusText ||
      job?.contact_status_text ||
      job?.communicationText ||
      job?.communication_text ||
      '',
  ).trim();
}

export function normalizeBossContactState(job = {}) {
  const rawState = String(job.contactState || job.contact_state || '').trim();
  const contactStatusText = normalizeContactStatusText(job);
  let contactState = CONTACT_STATES.has(rawState) ? rawState : '';

  if (!contactState) {
    if (/停止招聘|停止招募|职位关闭|职位已关闭|招聘已结束|岗位已下线|职位已下线|已下架|暂停招聘/.test(contactStatusText)) {
      contactState = 'closed_or_stopped';
    } else if (/继续沟通|已沟通|沟通过|查看沟通|进入沟通|沟通中/.test(contactStatusText)) {
      contactState = 'already_contacted';
    } else if (/立即沟通|立即联系|打招呼|开聊|马上沟通/.test(contactStatusText)) {
      contactState = 'can_chat';
    }
  }

  if (!contactState && (booleanFrom(job.closedOrStopped) || booleanFrom(job.closed_or_stopped))) {
    contactState = 'closed_or_stopped';
  }
  if (!contactState && (booleanFrom(job.alreadyContacted) || booleanFrom(job.already_contacted))) {
    contactState = 'already_contacted';
  }
  if (!contactState) contactState = 'unknown';

  return {
    contactState,
    canChat: contactState === 'can_chat',
    alreadyContacted: contactState === 'already_contacted',
    closedOrStopped: contactState === 'closed_or_stopped',
    contactStatusText,
  };
}

export function toCareerOpsCandidate(job) {
  const contact = normalizeBossContactState(job);
  return {
    source: 'boss-rpa',
    company: job.company,
    title: job.title,
    salary: job.salary || '',
    city: job.baseCity || job.city || '',
    desc: job.description || job.desc || '',
    hr_active: job.hrActive || job.hr_active || '',
    tags: Array.isArray(job.tags) ? job.tags : [],
    url: job.url,
    contact_state: contact.contactState,
    contact_status_text: contact.contactStatusText,
    can_chat: contact.canChat,
    already_contacted: contact.alreadyContacted,
    closed_or_stopped: contact.closedOrStopped,
    scanned_at: job.scannedAt || new Date().toISOString(),
    detail_status: 'full_jd',
    captured_scope: 'recruitment_rpa_boss',
    job_key: job.jobKey,
  };
}

export function createMemoryCheckpointStore(initialRecords = []) {
  const records = [...initialRecords];
  return {
    records,
    async completedKeys() {
      return completedKeysFromRecords(records);
    },
    async append(record) {
      records.push(record);
    },
  };
}

export function createFileCheckpointStore(checkpointPath) {
  return {
    async completedKeys() {
      try {
        const text = await readFile(checkpointPath, 'utf8');
        return completedKeysFromRecords(
          text
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line))
        );
      } catch (error) {
        if (error.code === 'ENOENT') return new Set();
        throw error;
      }
    },
    async append(record) {
      await mkdir(dirname(checkpointPath), { recursive: true });
      await appendFile(checkpointPath, `${JSON.stringify(record)}\n`);
    },
  };
}

function assertRouteContract(route) {
  if (route?.host !== 'www.zhipin.com' || route?.hasJobCards !== true) {
    throw new Error('boss_job_list_contract_not_satisfied');
  }
}

function normalizeMaxPages(maxPages = 1) {
  const normalized = Number(maxPages === undefined || maxPages === null || maxPages === '' ? 1 : maxPages);
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 10) {
    throw new Error('boss_max_pages_out_of_range');
  }
  return normalized;
}

function normalizeQueryVariants(query, queryVariants) {
  const values = Array.isArray(queryVariants) && queryVariants.length > 0
    ? queryVariants
    : [query];
  const normalized = [];
  const seen = new Set();

  for (const value of values) {
    const text = assertText(value, 'boss_query_required');
    if (seen.has(text)) continue;
    seen.add(text);
    normalized.push(text);
  }

  if (normalized.length === 0) throw new Error('boss_query_required');
  return normalized;
}

function assertBossRuntimeDiagnostics(runtime) {
  if (
    runtime?.contentVersion !== BOSS_RPA_CONTENT_VERSION ||
    runtime?.protocolVersion !== BOSS_RPA_PROTOCOL_VERSION ||
    runtime?.pageBridgeVersion !== BOSS_RPA_CONTENT_VERSION
  ) {
    throw new Error('boss_runtime_protocol_mismatch');
  }
  if (runtime.host !== 'www.zhipin.com') {
    throw new Error('boss_runtime_host_mismatch');
  }
}

function normalizeDetail(summary, detail) {
  return {
    ...summary,
    ...(detail || {}),
    jobKey: detail?.jobKey || summary.jobKey,
    url: detail?.url || summary.url,
    title: detail?.title || summary.title,
    company: detail?.company || summary.company,
    baseCity: detail?.baseCity || detail?.city || summary.baseCity || summary.city,
    description: detail?.description || detail?.desc || '',
    contactState: detail?.contactState || detail?.contact_state || summary.contactState || summary.contact_state || '',
    contactText: detail?.contactText || detail?.contactStatusText || detail?.contact_status_text || summary.contactText || summary.contactStatusText || summary.contact_status_text || '',
    canChat: detail?.canChat ?? detail?.can_chat ?? summary.canChat ?? summary.can_chat,
    alreadyContacted: detail?.alreadyContacted ?? detail?.already_contacted ?? summary.alreadyContacted ?? summary.already_contacted,
    closedOrStopped: detail?.closedOrStopped ?? detail?.closed_or_stopped ?? summary.closedOrStopped ?? summary.closed_or_stopped,
  };
}

function createJsonlRecorder({ checkpoint, runId }) {
  let seq = 0;

  return async function record({ kind = 'step', stage, action, status = 'completed', payload = {}, ...fields }) {
    const audit = createAuditRecord({
      runId,
      seq: ++seq,
      platform: 'boss',
      stage,
      action,
      status,
      payload,
    });
    await checkpoint.append({
      ...audit,
      kind,
      ...fields,
    });
  };
}

export async function collectBossJobs({
  query,
  queryVariants,
  baseCity,
  targetCount,
  checkpointPath,
  runId = `boss-discovery-${Date.now()}`,
  dispatcher,
  checkpoint = createFileCheckpointStore(checkpointPath),
  maxPages = 1,
}) {
  if (typeof dispatcher !== 'function') throw new Error('dispatcher_required');

  const normalizedQueries = normalizeQueryVariants(query, queryVariants);
  const plan = createBossDiscoveryPlan({ query: normalizedQueries[0], baseCity, targetCount, checkpointPath });
  const maxPageCount = normalizeMaxPages(maxPages);
  const record = createJsonlRecorder({ checkpoint, runId });
  await record({
    stage: 'plan_created',
    action: 'create_boss_discovery_plan',
    payload: {
      query: plan.filters.query,
      baseCity: plan.filters.baseCity,
      targetCount: plan.targetCount,
      checkpointPath: plan.contract.checkpointPath,
      queryVariants: normalizedQueries,
    },
  });

  const completed = await checkpoint.completedKeys();
  await record({
    stage: 'checkpoint_loaded',
    action: 'load_completed_keys',
    payload: { completedCount: completed.size },
  });

  let runtime;
  try {
    runtime = await dispatcher(createBossRuntimeDiagnosticsTask({ filters: plan.filters }));
    assertBossRuntimeDiagnostics(runtime);
  } catch (error) {
    await record({
      stage: 'runtime_diagnostics_failed',
      action: 'read_runtime_diagnostics',
      status: 'failed',
      payload: {
        error: error.message,
        expectedContentVersion: BOSS_RPA_CONTENT_VERSION,
        expectedProtocolVersion: BOSS_RPA_PROTOCOL_VERSION,
        actualContentVersion: runtime?.contentVersion || '',
        actualProtocolVersion: runtime?.protocolVersion || '',
        actualPageBridgeVersion: runtime?.pageBridgeVersion || '',
        host: runtime?.host || '',
        path: runtime?.path || '',
      },
    });
    throw error;
  }
  await record({
    stage: 'runtime_diagnostics_verified',
    action: 'read_runtime_diagnostics',
    payload: {
      contentVersion: runtime.contentVersion,
      protocolVersion: runtime.protocolVersion,
      pageBridgeVersion: runtime.pageBridgeVersion,
      host: runtime.host,
      path: runtime.path || '',
    },
  });

  const jobs = [];
  let observedCount = 0;
  let pagesVisited = 0;

  async function processSummary(summary, queryText) {
    if (!summary?.jobKey || completed.has(summary.jobKey)) return;

    await record({
      stage: 'job_seen',
      action: 'inspect_job_summary',
      payload: {
        jobKey: summary.jobKey,
        query: queryText,
        title: summary.title || '',
        company: summary.company || '',
        url: summary.url || '',
        baseCity: summary.baseCity || summary.city || '',
        hasSecurityId: typeof summary.securityId === 'string' && summary.securityId.trim() !== '',
        hasLid: typeof summary.lid === 'string' && summary.lid.trim() !== '',
        hasEncryptJobId: typeof summary.encryptJobId === 'string' && summary.encryptJobId.trim() !== '',
      },
    });

    if (!isBossBaseCityMatch(summary.baseCity || summary.city, plan.filters.baseCity)) {
      await record({
        stage: 'job_skipped',
        action: 'base_city_precheck',
        payload: {
          jobKey: summary.jobKey,
          query: queryText,
          reason: 'base_city_mismatch',
          actualBaseCity: summary.baseCity || summary.city || '',
          requiredBaseCity: plan.filters.baseCity,
        },
      });
      await record({
        kind: 'job_decision',
        stage: 'job_checkpoint',
        action: 'append_job_decision',
        status: 'skipped',
        jobKey: summary.jobKey,
        reason: 'base_city_mismatch',
        query: queryText,
        title: summary.title || '',
        company: summary.company || '',
        url: summary.url || '',
      });
      completed.add(summary.jobKey);
      return;
    }

    let detailResult;
    try {
      detailResult = await dispatcher(
        createBossJobDetailTask({
          jobKey: summary.jobKey,
          url: summary.url,
          securityId: summary.securityId,
          lid: summary.lid,
          encryptJobId: summary.encryptJobId,
        }),
      );
    } catch (error) {
      await record({
        stage: 'job_detail_failed',
        action: 'read_job_detail',
        status: 'failed',
        payload: {
          jobKey: summary.jobKey,
          query: queryText,
          title: summary.title || '',
          company: summary.company || '',
          url: summary.url || '',
          error: error.message,
        },
      });
      await record({
        kind: 'job_decision',
        stage: 'job_checkpoint',
        action: 'append_job_decision',
        status: 'skipped',
        jobKey: summary.jobKey,
        reason: 'detail_read_failed',
        query: queryText,
        title: summary.title || '',
        company: summary.company || '',
        url: summary.url || '',
        baseCity: summary.baseCity || summary.city || '',
      });
      completed.add(summary.jobKey);
      return;
    }

    const detail = normalizeDetail(summary, detailResult);
    const contact = normalizeBossContactState(detail);
    await record({
      stage: 'job_detail_read',
      action: 'read_job_detail',
      payload: {
        jobKey: detail.jobKey,
        query: queryText,
        title: detail.title || '',
        company: detail.company || '',
        url: detail.url || '',
        baseCity: detail.baseCity || detail.city || '',
        descriptionLength: String(detail.description || detail.desc || '').replace(/\s+/g, '').length,
        contactState: contact.contactState,
        contactStatusText: contact.contactStatusText,
        routeNavigated: detail.routeNavigated === true,
        routePath: detail.routePath || '',
      },
    });

    if (!isBossBaseCityMatch(detail.baseCity || detail.city, plan.filters.baseCity)) {
      await record({
        stage: 'job_skipped',
        action: 'base_city_postcheck',
        payload: {
          jobKey: summary.jobKey,
          query: queryText,
          reason: 'base_city_mismatch',
          actualBaseCity: detail.baseCity || detail.city || '',
          requiredBaseCity: plan.filters.baseCity,
        },
      });
      await record({
        kind: 'job_decision',
        stage: 'job_checkpoint',
        action: 'append_job_decision',
        status: 'skipped',
        jobKey: summary.jobKey,
        reason: 'base_city_mismatch',
        query: queryText,
        title: detail.title || '',
        company: detail.company || '',
        url: detail.url || '',
        contactState: contact.contactState,
        contactStatusText: contact.contactStatusText,
      });
      completed.add(summary.jobKey);
      return;
    }

    if (!contact.canChat) {
      const reason = contact.contactState === 'unknown' ? 'contact_state_unknown' : contact.contactState;
      await record({
        stage: 'job_skipped',
        action: 'contact_state_gate',
        payload: {
          jobKey: summary.jobKey,
          query: queryText,
          reason,
          contactState: contact.contactState,
          contactStatusText: contact.contactStatusText,
        },
      });
      await record({
        kind: 'job_decision',
        stage: 'job_checkpoint',
        action: 'append_job_decision',
        status: 'skipped',
        jobKey: summary.jobKey,
        reason,
        query: queryText,
        title: detail.title || '',
        company: detail.company || '',
        url: detail.url || '',
        baseCity: detail.baseCity || detail.city || '',
        contactState: contact.contactState,
        contactStatusText: contact.contactStatusText,
      });
      completed.add(summary.jobKey);
      return;
    }

    let checked;
    try {
      checked = assertCompleteBossJobDetail(detail).job;
    } catch {
      await record({
        stage: 'job_skipped',
        action: 'complete_jd_gate',
        payload: {
          jobKey: summary.jobKey,
          query: queryText,
          reason: 'incomplete_jd',
          descriptionLength: String(detail.description || detail.desc || '').replace(/\s+/g, '').length,
        },
      });
      await record({
        kind: 'job_decision',
        stage: 'job_checkpoint',
        action: 'append_job_decision',
        status: 'skipped',
        jobKey: summary.jobKey,
        reason: 'incomplete_jd',
        query: queryText,
        title: detail.title || '',
        company: detail.company || '',
        url: detail.url || '',
        contactState: contact.contactState,
        contactStatusText: contact.contactStatusText,
      });
      completed.add(summary.jobKey);
      return;
    }

    jobs.push(checked);
    await record({
      stage: 'complete_jd_verified',
      action: 'complete_jd_gate',
      payload: {
        jobKey: checked.jobKey,
        query: queryText,
        descriptionLength: checked.description.replace(/\s+/g, '').length,
        contactState: contact.contactState,
      },
    });
    await record({
      kind: 'job_decision',
      stage: 'job_checkpoint',
      action: 'append_job_decision',
      status: 'verified',
      jobKey: checked.jobKey,
      query: queryText,
      title: checked.title,
      company: checked.company,
      url: checked.url,
      baseCity: checked.baseCity,
      contactState: contact.contactState,
      contactStatusText: contact.contactStatusText,
      detailStatus: 'full_jd',
      candidate: toCareerOpsCandidate(checked),
    });
    completed.add(checked.jobKey);
  }

  for (const queryText of normalizedQueries) {
    const queryFilters = { ...plan.filters, query: queryText };
    const seenJobKeysForQuery = new Set();

    for (let page = 1; page <= maxPageCount && jobs.length < plan.targetCount; page += 1) {
      let searchRoute;
      try {
        searchRoute = await dispatcher(createBossSearchRouteTask({ filters: queryFilters, page }));
      } catch (error) {
        await record({
          stage: 'search_route_failed',
          action: 'ensure_search_route',
          status: 'failed',
          payload: {
            error: error.message,
            query: queryText,
            baseCity: plan.filters.baseCity,
            page,
          },
        });
        throw error;
      }
      await record({
        stage: 'search_route_verified',
        action: 'ensure_search_route',
        payload: {
          host: searchRoute.host || '',
          path: searchRoute.path || '',
          query: searchRoute.query || queryText,
          cityCode: searchRoute.cityCode || '',
          page,
          navigated: searchRoute.navigated === true,
        },
      });

      const route = await dispatcher(createBossRouteProbeTask());
      try {
        assertRouteContract(route);
      } catch (error) {
        await record({
          stage: 'route_contract_failed',
          action: 'read_route_contract',
          status: 'failed',
          payload: {
            error: error.message,
            host: route?.host || '',
            path: route?.path || '',
            hasJobCards: route?.hasJobCards === true,
            query: queryText,
            page,
          },
        });
        throw error;
      }
      await record({
        stage: 'route_contract_verified',
        action: 'read_route_contract',
        payload: {
          host: route.host,
          path: route.path || '',
          hasJobCards: route.hasJobCards === true,
          query: queryText,
          page,
        },
      });

      const listResult = await dispatcher(
        createBossJobListTask({
          filters: queryFilters,
          limit: plan.targetCount,
          page,
        }),
      );

      const summaries = Array.isArray(listResult?.jobs) ? listResult.jobs : [];
      const summaryKeys = summaries.map((summary) => summary?.jobKey).filter(Boolean);
      const repeatedCount = summaryKeys.filter((jobKey) => seenJobKeysForQuery.has(jobKey)).length;
      const pendingCount = summaries.filter((summary) => summary?.jobKey && !completed.has(summary.jobKey)).length;
      observedCount += summaries.length;
      pagesVisited += 1;
      await record({
        stage: 'job_cards_read',
        action: 'read_job_cards',
        payload: {
          query: queryText,
          page,
          count: summaries.length,
          pendingCount,
          repeatedCount,
          limit: plan.targetCount,
        },
      });

      if (summaries.length === 0) {
        await record({
          stage: 'job_page_exhausted',
          action: 'read_job_cards',
          payload: {
            query: queryText,
            page,
            reason: 'no_job_cards',
          },
        });
        break;
      }

      if (page > 1 && summaryKeys.length > 0 && repeatedCount === summaryKeys.length) {
        await record({
          stage: 'job_page_exhausted',
          action: 'read_job_cards',
          payload: {
            query: queryText,
            page,
            reason: 'repeated_job_keys',
          },
        });
        break;
      }

      for (const jobKey of summaryKeys) seenJobKeysForQuery.add(jobKey);

      for (const summary of summaries) {
        await processSummary(summary, queryText);
        if (jobs.length >= plan.targetCount) break;
      }
    }

    if (jobs.length >= plan.targetCount) break;
  }

  await record({
    stage: 'flow_completed',
    action: 'collect_boss_jobs',
    payload: {
      acceptedCount: jobs.length,
      observedCount,
      pagesVisited,
      queryCount: normalizedQueries.length,
    },
  });

  return {
    platform: 'boss',
    filters: plan.filters,
    queryVariants: normalizedQueries,
    targetCount: plan.targetCount,
    jobs,
    careerOpsCandidates: jobs.map((job) => toCareerOpsCandidate(job)),
  };
}
