import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertCompleteBossJobDetail,
  collectBossJobs,
  createMemoryCheckpointStore,
  isBossBaseCityMatch,
} from '../src/boss-discovery-flow.mjs';

function createDispatcher({ summaries, summariesByPage, details, route, runtime, searchRoute }) {
  const calls = [];
  const dispatcher = async (task) => {
    calls.push(task);
    if (task.action === 'read_runtime_diagnostics') {
      return runtime || {
        ok: true,
        contentVersion: '0.1.17',
        protocolVersion: 'boss-rpa-v0.1.17',
        pageBridgeVersion: '0.1.17',
        host: 'www.zhipin.com',
        path: '/web/geek/jobs',
      };
    }
    if (task.action === 'ensure_search_route') {
      return searchRoute || {
        ok: true,
        navigated: true,
        host: 'www.zhipin.com',
        path: '/web/geek/jobs',
        query: task.route.query,
        cityCode: task.route.cityCode,
        url: task.route.url,
      };
    }
    if (task.action === 'read_route_contract') {
      return route || { host: 'www.zhipin.com', path: '/web/geek/jobs', hasJobCards: true };
    }
    if (task.action === 'read_job_cards') {
      return { jobs: summariesByPage?.[task.page] || summaries || [] };
    }
    if (task.action === 'read_job_detail') {
      if (details[task.jobKey] instanceof Error) throw details[task.jobKey];
      return {
        ...details[task.jobKey],
        routeNavigated: task.allowNavigation === true,
        routePath: task.route?.path || '',
      };
    }
    throw new Error(`unexpected_task:${task.action}`);
  };
  dispatcher.calls = calls;
  return dispatcher;
}

const longJd =
  '负责 AI 平台架构、数据链路治理、模型工程化、服务稳定性建设、跨团队技术方案落地；要求有复杂系统设计经验、Java 或 Python 工程经验、云原生和数据平台理解，并能推动生产级项目验收。';

function contactableDetail(overrides) {
  return {
    contactState: 'can_chat',
    canChat: true,
    alreadyContacted: false,
    closedOrStopped: false,
    contactText: '立即沟通',
    ...overrides,
  };
}

test('Boss discovery flow collects complete Wuhan JD records and checkpoints each decision', async () => {
  const checkpoint = createMemoryCheckpointStore();
  const dispatcher = createDispatcher({
    summaries: [
      {
        jobKey: 'boss:1',
        url: 'https://www.zhipin.com/job_detail/1.html',
        title: 'AI 架构师',
        company: 'A',
        baseCity: '武汉',
        securityId: 'sec-1',
        lid: 'lid-1',
        encryptJobId: '1',
      },
      { jobKey: 'boss:2', url: 'https://www.zhipin.com/job_detail/2.html', title: 'AI 架构师', company: 'B', baseCity: '上海' },
      {
        jobKey: 'boss:3',
        url: 'https://www.zhipin.com/job_detail/3.html',
        title: 'AI 平台负责人',
        company: 'C',
        baseCity: '武汉·洪山',
        securityId: 'sec-3',
        lid: 'lid-3',
        encryptJobId: '3',
      },
      {
        jobKey: 'boss:4',
        url: 'https://www.zhipin.com/job_detail/4.html',
        title: '大数据架构师',
        company: 'D',
        baseCity: '武汉',
        securityId: 'sec-4',
        lid: 'lid-4',
        encryptJobId: '4',
      },
    ],
    details: {
      'boss:1': contactableDetail({ jobKey: 'boss:1', url: 'https://www.zhipin.com/job_detail/1.html', title: 'AI 架构师', company: 'A', baseCity: '武汉', description: longJd }),
      'boss:3': contactableDetail({ jobKey: 'boss:3', url: 'https://www.zhipin.com/job_detail/3.html', title: 'AI 平台负责人', company: 'C', baseCity: '武汉·洪山', description: '负责 AI。' }),
      'boss:4': contactableDetail({ jobKey: 'boss:4', url: 'https://www.zhipin.com/job_detail/4.html', title: '大数据架构师', company: 'D', baseCity: '武汉', description: `${longJd} 需要负责实时数仓和工程团队建设。` }),
    },
  });

  const result = await collectBossJobs({
    query: 'AI 架构师',
    baseCity: '武汉',
    targetCount: 20,
    checkpointPath: '/tmp/recruitment-rpa/boss-wuhan.jsonl',
    runId: 'run-boss-discovery-test',
    dispatcher,
    checkpoint,
  });

  assert.deepEqual(result.jobs.map((job) => job.jobKey), ['boss:1', 'boss:4']);
  assert.deepEqual(result.careerOpsCandidates.map((job) => job.source), ['boss-rpa', 'boss-rpa']);
  assert.deepEqual(
    dispatcher.calls.map((task) => task.action),
    [
      'read_runtime_diagnostics',
      'ensure_search_route',
      'read_route_contract',
      'read_job_cards',
      'read_job_detail',
      'read_job_detail',
      'read_job_detail',
    ],
  );
  const runtimeTask = dispatcher.calls.find((task) => task.action === 'read_runtime_diagnostics');
  assert.equal(runtimeTask.allowNavigation, true);
  assert.equal(runtimeTask.route.host, 'www.zhipin.com');
  assert.equal(runtimeTask.route.path, '/web/geek/jobs');
  assert.equal(runtimeTask.route.query, 'AI 架构师');
  assert.equal(runtimeTask.route.cityCode, '101200100');
  assert.deepEqual(
    dispatcher.calls
      .filter((task) => task.action === 'read_job_detail')
      .map((task) => [task.jobKey, task.securityId, task.lid, task.encryptJobId]),
    [
      ['boss:1', 'sec-1', 'lid-1', '1'],
      ['boss:3', 'sec-3', 'lid-3', '3'],
      ['boss:4', 'sec-4', 'lid-4', '4'],
    ],
  );
  assert.deepEqual(
    dispatcher.calls
      .filter((task) => task.action === 'read_job_detail')
      .map((task) => [task.jobKey, task.allowNavigation, task.route?.host, task.route?.path]),
    [
      ['boss:1', true, 'www.zhipin.com', '/job_detail/1.html'],
      ['boss:3', true, 'www.zhipin.com', '/job_detail/3.html'],
      ['boss:4', true, 'www.zhipin.com', '/job_detail/4.html'],
    ],
  );
  assert.deepEqual(
    checkpoint.records
      .filter((record) => record.stage === 'job_detail_read')
      .map((record) => [record.payload.jobKey, record.payload.routeNavigated, record.payload.routePath]),
    [
      ['boss:1', true, '/job_detail/1.html'],
      ['boss:3', true, '/job_detail/3.html'],
      ['boss:4', true, '/job_detail/4.html'],
    ],
  );
  assert.deepEqual(
    checkpoint.records
      .filter((record) => record.stage === 'job_seen')
      .map((record) => [
        record.payload.jobKey,
        record.payload.hasSecurityId,
        record.payload.hasLid,
        record.payload.hasEncryptJobId,
      ]),
    [
      ['boss:1', true, true, true],
      ['boss:2', false, false, false],
      ['boss:3', true, true, true],
      ['boss:4', true, true, true],
    ],
  );
  assert.deepEqual(
    checkpoint.records
      .filter((record) => record.kind === 'job_decision')
      .map((record) => [record.status, record.jobKey, record.reason || null]),
    [
      ['verified', 'boss:1', null],
      ['skipped', 'boss:2', 'base_city_mismatch'],
      ['skipped', 'boss:3', 'incomplete_jd'],
      ['verified', 'boss:4', null],
    ],
  );
});

test('Boss discovery flow paginates when the first page is below the target count', async () => {
  const checkpoint = createMemoryCheckpointStore();
  const dispatcher = createDispatcher({
    summariesByPage: {
      1: [
        { jobKey: 'boss:1', url: 'https://www.zhipin.com/job_detail/1.html', title: 'AI 架构师', company: 'A', baseCity: '武汉' },
      ],
      2: [
        { jobKey: 'boss:2', url: 'https://www.zhipin.com/job_detail/2.html', title: 'AI 平台负责人', company: 'B', baseCity: '武汉' },
      ],
    },
    details: {
      'boss:1': contactableDetail({ jobKey: 'boss:1', url: 'https://www.zhipin.com/job_detail/1.html', title: 'AI 架构师', company: 'A', baseCity: '武汉', description: longJd }),
      'boss:2': contactableDetail({ jobKey: 'boss:2', url: 'https://www.zhipin.com/job_detail/2.html', title: 'AI 平台负责人', company: 'B', baseCity: '武汉', description: `${longJd} 还需要负责 Agent 平台治理和跨团队交付。` }),
    },
  });

  const result = await collectBossJobs({
    query: 'AI 架构师',
    baseCity: '武汉',
    targetCount: 20,
    checkpointPath: '/tmp/recruitment-rpa/boss-wuhan.jsonl',
    runId: 'run-boss-pagination-test',
    dispatcher,
    checkpoint,
    maxPages: 2,
  });

  assert.deepEqual(result.jobs.map((job) => job.jobKey), ['boss:1', 'boss:2']);
  assert.deepEqual(
    dispatcher.calls
      .filter((task) => task.action === 'ensure_search_route')
      .map((task) => [task.route.page, task.route.url]),
    [
      [1, 'https://www.zhipin.com/web/geek/jobs?query=AI+%E6%9E%B6%E6%9E%84%E5%B8%88&city=101200100'],
      [2, 'https://www.zhipin.com/web/geek/jobs?query=AI+%E6%9E%B6%E6%9E%84%E5%B8%88&city=101200100&page=2'],
    ],
  );
  assert.deepEqual(
    checkpoint.records
      .filter((record) => record.stage === 'job_cards_read')
      .map((record) => [record.payload.page, record.payload.count]),
    [
      [1, 1],
      [2, 1],
    ],
  );
  assert.deepEqual(
    checkpoint.records
      .filter((record) => record.stage === 'flow_completed')
      .map((record) => [record.payload.acceptedCount, record.payload.pagesVisited]),
    [[2, 2]],
  );
});

test('Boss discovery flow stops repeated result pages before exhausting the page budget', async () => {
  const checkpoint = createMemoryCheckpointStore();
  const dispatcher = createDispatcher({
    summariesByPage: {
      1: [
        { jobKey: 'boss:1', url: 'https://www.zhipin.com/job_detail/1.html', title: 'AI 架构师', company: 'A', baseCity: '武汉' },
      ],
      2: [
        { jobKey: 'boss:1', url: 'https://www.zhipin.com/job_detail/1.html', title: 'AI 架构师', company: 'A', baseCity: '武汉' },
      ],
      3: [
        { jobKey: 'boss:2', url: 'https://www.zhipin.com/job_detail/2.html', title: 'AI 平台负责人', company: 'B', baseCity: '武汉' },
      ],
    },
    details: {
      'boss:1': contactableDetail({ jobKey: 'boss:1', url: 'https://www.zhipin.com/job_detail/1.html', title: 'AI 架构师', company: 'A', baseCity: '武汉', description: longJd }),
      'boss:2': contactableDetail({ jobKey: 'boss:2', url: 'https://www.zhipin.com/job_detail/2.html', title: 'AI 平台负责人', company: 'B', baseCity: '武汉', description: longJd }),
    },
  });

  const result = await collectBossJobs({
    query: 'AI 架构师',
    baseCity: '武汉',
    targetCount: 20,
    checkpointPath: '/tmp/recruitment-rpa/boss-wuhan.jsonl',
    runId: 'run-boss-repeated-page-test',
    dispatcher,
    checkpoint,
    maxPages: 3,
  });

  assert.deepEqual(result.jobs.map((job) => job.jobKey), ['boss:1']);
  assert.deepEqual(
    dispatcher.calls
      .filter((task) => task.action === 'ensure_search_route')
      .map((task) => task.route.page),
    [1, 2],
  );
  assert.deepEqual(
    checkpoint.records
      .filter((record) => record.stage === 'job_page_exhausted')
      .map((record) => [record.payload.page, record.payload.reason]),
    [[2, 'repeated_job_keys']],
  );
});

test('Boss discovery flow continues with query variants when one query is exhausted', async () => {
  const checkpoint = createMemoryCheckpointStore();
  const summariesByQueryPage = new Map([
    ['AI 架构师:1', [
      { jobKey: 'boss:1', url: 'https://www.zhipin.com/job_detail/1.html', title: 'AI 架构师', company: 'A', baseCity: '武汉' },
    ]],
    ['AI 架构师:2', [
      { jobKey: 'boss:1', url: 'https://www.zhipin.com/job_detail/1.html', title: 'AI 架构师', company: 'A', baseCity: '武汉' },
    ]],
    ['大模型架构师:1', [
      { jobKey: 'boss:2', url: 'https://www.zhipin.com/job_detail/2.html', title: '大模型架构师', company: 'B', baseCity: '武汉' },
    ]],
  ]);
  const dispatcher = createDispatcher({
    summariesByPage: new Proxy({}, {
      get(_target, page) {
        const lastRoute = dispatcher.calls.filter((task) => task.action === 'ensure_search_route').at(-1);
        return summariesByQueryPage.get(`${lastRoute.route.query}:${page}`) || [];
      },
    }),
    details: {
      'boss:1': contactableDetail({ jobKey: 'boss:1', url: 'https://www.zhipin.com/job_detail/1.html', title: 'AI 架构师', company: 'A', baseCity: '武汉', description: longJd }),
      'boss:2': contactableDetail({ jobKey: 'boss:2', url: 'https://www.zhipin.com/job_detail/2.html', title: '大模型架构师', company: 'B', baseCity: '武汉', description: `${longJd} 还需要负责大模型平台和推理服务。` }),
    },
  });

  const result = await collectBossJobs({
    query: 'AI 架构师',
    queryVariants: ['AI 架构师', '大模型架构师'],
    baseCity: '武汉',
    targetCount: 20,
    checkpointPath: '/tmp/recruitment-rpa/boss-wuhan.jsonl',
    runId: 'run-boss-query-variants-test',
    dispatcher,
    checkpoint,
    maxPages: 2,
  });

  assert.deepEqual(result.jobs.map((job) => job.jobKey), ['boss:1', 'boss:2']);
  assert.deepEqual(
    dispatcher.calls
      .filter((task) => task.action === 'ensure_search_route')
      .map((task) => [task.route.query, task.route.page]),
    [
      ['AI 架构师', 1],
      ['AI 架构师', 2],
      ['大模型架构师', 1],
      ['大模型架构师', 2],
    ],
  );
  assert.deepEqual(result.queryVariants, ['AI 架构师', '大模型架构师']);
  assert.deepEqual(
    checkpoint.records
      .filter((record) => record.stage === 'job_cards_read')
      .map((record) => [record.payload.query, record.payload.page, record.payload.count]),
    [
      ['AI 架构师', 1, 1],
      ['AI 架构师', 2, 1],
      ['大模型架构师', 1, 1],
      ['大模型架构师', 2, 0],
    ],
  );
});

test('Boss discovery flow accepts only page-confirmed contactable jobs', async () => {
  const checkpoint = createMemoryCheckpointStore();
  const dispatcher = createDispatcher({
    summaries: [
      { jobKey: 'boss:open', url: 'https://www.zhipin.com/job_detail/open.html', title: 'AI 架构师', company: 'A', baseCity: '武汉' },
      { jobKey: 'boss:contacted', url: 'https://www.zhipin.com/job_detail/contacted.html', title: '技术总监', company: 'B', baseCity: '武汉' },
      { jobKey: 'boss:closed', url: 'https://www.zhipin.com/job_detail/closed.html', title: '研发负责人', company: 'C', baseCity: '武汉' },
      { jobKey: 'boss:unknown', url: 'https://www.zhipin.com/job_detail/unknown.html', title: '数据架构师', company: 'D', baseCity: '武汉' },
    ],
    details: {
      'boss:open': contactableDetail({
        jobKey: 'boss:open',
        url: 'https://www.zhipin.com/job_detail/open.html',
        title: 'AI 架构师',
        company: 'A',
        baseCity: '武汉',
        description: longJd,
      }),
      'boss:contacted': {
        jobKey: 'boss:contacted',
        url: 'https://www.zhipin.com/job_detail/contacted.html',
        title: '技术总监',
        company: 'B',
        baseCity: '武汉',
        description: longJd,
        contactState: 'already_contacted',
        canChat: false,
        alreadyContacted: true,
        closedOrStopped: false,
        contactText: '继续沟通',
      },
      'boss:closed': {
        jobKey: 'boss:closed',
        url: 'https://www.zhipin.com/job_detail/closed.html',
        title: '研发负责人',
        company: 'C',
        baseCity: '武汉',
        description: longJd,
        contactState: 'closed_or_stopped',
        canChat: false,
        alreadyContacted: false,
        closedOrStopped: true,
        contactText: '停止招聘',
      },
      'boss:unknown': {
        jobKey: 'boss:unknown',
        url: 'https://www.zhipin.com/job_detail/unknown.html',
        title: '数据架构师',
        company: 'D',
        baseCity: '武汉',
        description: longJd,
      },
    },
  });

  const result = await collectBossJobs({
    query: 'AI 架构师',
    baseCity: '武汉',
    targetCount: 20,
    checkpointPath: '/tmp/recruitment-rpa/boss-wuhan.jsonl',
    runId: 'run-boss-contact-state-test',
    dispatcher,
    checkpoint,
  });

  assert.deepEqual(result.jobs.map((job) => job.jobKey), ['boss:open']);
  assert.deepEqual(result.careerOpsCandidates.map((job) => [job.job_key, job.contact_state, job.can_chat, job.already_contacted, job.closed_or_stopped]), [
    ['boss:open', 'can_chat', true, false, false],
  ]);
  assert.deepEqual(
    checkpoint.records
      .filter((record) => record.kind === 'job_decision')
      .map((record) => [record.status, record.jobKey, record.reason || null, record.contactState || null]),
    [
      ['verified', 'boss:open', null, 'can_chat'],
      ['skipped', 'boss:contacted', 'already_contacted', 'already_contacted'],
      ['skipped', 'boss:closed', 'closed_or_stopped', 'closed_or_stopped'],
      ['skipped', 'boss:unknown', 'contact_state_unknown', 'unknown'],
    ],
  );
});

test('Boss discovery flow skips a single detail API rejection and continues the batch', async () => {
  const checkpoint = createMemoryCheckpointStore();
  const dispatcher = createDispatcher({
    summaries: [
      { jobKey: 'boss:1', url: 'https://www.zhipin.com/job_detail/1.html', title: 'AI 架构师', company: 'A', baseCity: '武汉' },
      { jobKey: 'boss:2', url: 'https://www.zhipin.com/job_detail/2.html', title: 'AI Agent优化工程师', company: 'B', baseCity: '武汉' },
      { jobKey: 'boss:3', url: 'https://www.zhipin.com/job_detail/3.html', title: 'AI 平台负责人', company: 'C', baseCity: '武汉' },
    ],
    details: {
      'boss:1': contactableDetail({ jobKey: 'boss:1', url: 'https://www.zhipin.com/job_detail/1.html', title: 'AI 架构师', company: 'A', baseCity: '武汉', description: longJd }),
      'boss:2': new Error('boss_detail_api_rejected:37'),
      'boss:3': contactableDetail({
        jobKey: 'boss:3',
        url: 'https://www.zhipin.com/job_detail/3.html',
        title: 'AI 平台负责人',
        company: 'C',
        baseCity: '武汉',
        description: `${longJd} 还需要负责 Agent 平台治理和跨团队交付。`,
      }),
    },
  });

  const result = await collectBossJobs({
    query: 'AI 架构师',
    baseCity: '武汉',
    targetCount: 20,
    checkpointPath: '/tmp/recruitment-rpa/boss-wuhan.jsonl',
    runId: 'run-boss-detail-rejection-test',
    dispatcher,
    checkpoint,
  });

  assert.deepEqual(result.jobs.map((job) => job.jobKey), ['boss:1', 'boss:3']);
  assert.deepEqual(
    checkpoint.records
      .filter((record) => record.kind === 'job_decision')
      .map((record) => [record.status, record.jobKey, record.reason || null]),
    [
      ['verified', 'boss:1', null],
      ['skipped', 'boss:2', 'detail_read_failed'],
      ['verified', 'boss:3', null],
    ],
  );
  assert.deepEqual(
    checkpoint.records
      .filter((record) => record.stage === 'job_detail_failed')
      .map((record) => [record.status, record.payload.jobKey, record.payload.error]),
    [['failed', 'boss:2', 'boss_detail_api_rejected:37']],
  );
});

test('Boss discovery flow writes detailed JSONL audit records for every stage', async () => {
  const checkpoint = createMemoryCheckpointStore();
  const dispatcher = createDispatcher({
    summaries: [
      { jobKey: 'boss:1', url: 'https://www.zhipin.com/job_detail/1.html', title: 'AI 架构师', company: 'A', baseCity: '武汉' },
      { jobKey: 'boss:2', url: 'https://www.zhipin.com/job_detail/2.html', title: 'AI 架构师', company: 'B', baseCity: '上海' },
    ],
    details: {
      'boss:1': contactableDetail({ jobKey: 'boss:1', url: 'https://www.zhipin.com/job_detail/1.html', title: 'AI 架构师', company: 'A', baseCity: '武汉', description: longJd }),
    },
  });

  await collectBossJobs({
    query: 'AI 架构师',
    baseCity: '武汉',
    targetCount: 20,
    checkpointPath: '/tmp/recruitment-rpa/boss-wuhan.jsonl',
    runId: 'run-audit-test',
    dispatcher,
    checkpoint,
  });

  assert.deepEqual(
    checkpoint.records.filter((record) => record.kind === 'step').map((record) => record.stage),
    [
      'plan_created',
      'checkpoint_loaded',
      'runtime_diagnostics_verified',
      'search_route_verified',
      'route_contract_verified',
      'job_cards_read',
      'job_seen',
      'job_detail_read',
      'complete_jd_verified',
      'job_seen',
      'job_skipped',
      'flow_completed',
    ],
  );

  assert.deepEqual(
    checkpoint.records.map((record) => record.runId),
    Array(checkpoint.records.length).fill('run-audit-test'),
  );
  assert.deepEqual(
    checkpoint.records.map((record) => record.seq),
    Array.from({ length: checkpoint.records.length }, (_item, index) => index + 1),
  );
});

test('Boss discovery flow skips completed checkpoint keys on resume', async () => {
  const checkpoint = createMemoryCheckpointStore([
    { platform: 'boss', kind: 'job_decision', jobKey: 'boss:done', status: 'verified' },
  ]);
  const dispatcher = createDispatcher({
    summaries: [
      { jobKey: 'boss:done', url: 'https://www.zhipin.com/job_detail/done.html', title: '已完成', company: 'A', baseCity: '武汉' },
      { jobKey: 'boss:new', url: 'https://www.zhipin.com/job_detail/new.html', title: '新岗位', company: 'B', baseCity: '武汉' },
    ],
    details: {
      'boss:new': contactableDetail({ jobKey: 'boss:new', url: 'https://www.zhipin.com/job_detail/new.html', title: '新岗位', company: 'B', baseCity: '武汉', description: longJd }),
    },
  });

  const result = await collectBossJobs({
    query: 'AI 架构师',
    baseCity: '武汉',
    targetCount: 20,
    checkpointPath: '/tmp/recruitment-rpa/boss-wuhan.jsonl',
    dispatcher,
    checkpoint,
  });

  assert.deepEqual(result.jobs.map((job) => job.jobKey), ['boss:new']);
  assert.equal(dispatcher.calls.some((task) => task.jobKey === 'boss:done'), false);
});

test('checkpoint resume ignores job keys whose latest decision was invalidated', async () => {
  const checkpoint = createMemoryCheckpointStore([
    { platform: 'boss', kind: 'job_decision', jobKey: 'boss:bad', status: 'verified' },
    { platform: 'boss', kind: 'job_decision', jobKey: 'boss:done', status: 'skipped' },
    { platform: 'boss', kind: 'job_decision', jobKey: 'boss:bad', status: 'invalidated' },
  ]);

  assert.deepEqual([...(await checkpoint.completedKeys())], ['boss:done']);
});

test('Boss discovery flow rejects invalid pagination budgets', async () => {
  await assert.rejects(
    collectBossJobs({
      query: 'AI 架构师',
      baseCity: '武汉',
      targetCount: 20,
      checkpointPath: '/tmp/recruitment-rpa/boss-wuhan.jsonl',
      dispatcher: async () => {
        throw new Error('dispatcher_should_not_run');
      },
      checkpoint: createMemoryCheckpointStore(),
      maxPages: 0,
    }),
    /boss_max_pages_out_of_range/,
  );
});

test('Boss discovery flow fails closed when current tab is not a Boss job list', async () => {
  const dispatcher = createDispatcher({
    route: { host: 'www.zhipin.com', path: '/web/geek/chat', hasJobCards: false },
    summaries: [],
    details: {},
  });

  await assert.rejects(
    collectBossJobs({
      query: 'AI 架构师',
      baseCity: '武汉',
      targetCount: 20,
      checkpointPath: '/tmp/recruitment-rpa/boss-wuhan.jsonl',
      dispatcher,
      checkpoint: createMemoryCheckpointStore(),
    }),
    /boss_job_list_contract_not_satisfied/,
  );
});

test('Boss discovery flow fails closed and audits runtime diagnostics mismatch', async () => {
  const checkpoint = createMemoryCheckpointStore();
  const dispatcher = createDispatcher({
    runtime: {
      ok: true,
      contentVersion: '0.1.5',
      protocolVersion: 'boss-rpa-v0.1.5',
      pageBridgeVersion: '0.1.5',
      host: 'www.zhipin.com',
      path: '/web/geek/jobs',
    },
    summaries: [],
    details: {},
  });

  await assert.rejects(
    collectBossJobs({
      query: 'AI 架构师',
      baseCity: '武汉',
      targetCount: 20,
      checkpointPath: '/tmp/recruitment-rpa/boss-wuhan.jsonl',
      dispatcher,
      checkpoint,
    }),
    /boss_runtime_protocol_mismatch/,
  );

  assert.deepEqual(
    checkpoint.records.map((record) => [record.stage, record.status, record.payload.actualContentVersion || '']),
    [
      ['plan_created', 'completed', ''],
      ['checkpoint_loaded', 'completed', ''],
      ['runtime_diagnostics_failed', 'failed', '0.1.5'],
    ],
  );
});

test('Boss base city matcher requires Wuhan base and rejects other cities', () => {
  assert.equal(isBossBaseCityMatch('武汉', '武汉'), true);
  assert.equal(isBossBaseCityMatch('武汉·洪山', '武汉'), true);
  assert.equal(isBossBaseCityMatch('湖北武汉', '武汉'), true);
  assert.equal(isBossBaseCityMatch('上海', '武汉'), false);
  assert.equal(isBossBaseCityMatch('全国', '武汉'), false);
});

test('complete Boss job detail requires stable identity, URL, city, and useful JD text', () => {
  assert.equal(
    assertCompleteBossJobDetail({
      jobKey: 'boss:ok',
      url: 'https://www.zhipin.com/job_detail/ok.html',
      title: 'AI 架构师',
      company: 'A',
      baseCity: '武汉',
      description: longJd,
    }).ok,
    true,
  );

  assert.throws(() => assertCompleteBossJobDetail({ jobKey: 'boss:bad' }), /boss_detail_url_required/);
  assert.throws(
    () =>
      assertCompleteBossJobDetail({
        jobKey: 'boss:short',
        url: 'https://www.zhipin.com/job_detail/short.html',
        title: 'AI',
        company: 'A',
        baseCity: '武汉',
        description: '负责 AI。',
      }),
    /boss_complete_jd_required/,
  );
  assert.throws(
    () =>
      assertCompleteBossJobDetail({
        jobKey: 'boss:security',
        url: 'https://www.zhipin.com/job_detail/security.html',
        title: 'AI 架构师',
        company: 'A',
        baseCity: '武汉',
        description:
          'BOSS正在加载中... © copyright BOSS直聘 京ICP备14013441号-5 function getCookie(e){return document.cookie} SecurityJsHelper passport_page_error window._passportConfig XMLHttpRequest '.repeat(4),
      }),
    /boss_complete_jd_required/,
  );
});

test('Boss discovery flow rejects Boss loading shell as incomplete JD', async () => {
  const checkpoint = createMemoryCheckpointStore();
  const dispatcher = createDispatcher({
    summaries: [
      { jobKey: 'boss:security', url: 'https://www.zhipin.com/job_detail/security.html', title: 'AI 架构师', company: 'A', baseCity: '武汉' },
    ],
    details: {
      'boss:security': contactableDetail({
        jobKey: 'boss:security',
        url: 'https://www.zhipin.com/job_detail/security.html',
        title: 'AI 架构师',
        company: 'A',
        baseCity: '武汉',
        description:
          'BOSS正在加载中... © copyright BOSS直聘 京ICP备14013441号-5 function getCookie(e){return document.cookie} SecurityJsHelper passport_page_error window._passportConfig XMLHttpRequest '.repeat(4),
      }),
    },
  });

  const result = await collectBossJobs({
    query: 'AI 架构师',
    baseCity: '武汉',
    targetCount: 20,
    checkpointPath: '/tmp/recruitment-rpa/boss-wuhan.jsonl',
    runId: 'run-boss-security-shell-test',
    dispatcher,
    checkpoint,
  });

  assert.deepEqual(result.jobs, []);
  assert.deepEqual(
    checkpoint.records
      .filter((record) => record.kind === 'job_decision')
      .map((record) => [record.status, record.jobKey, record.reason || null]),
    [['skipped', 'boss:security', 'incomplete_jd']],
  );
});
