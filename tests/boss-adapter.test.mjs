import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BOSS_ADAPTER,
  createBossDiscoveryPlan,
  createBossJobDetailTask,
  createBossJobListTask,
  createBossReviewedMessageTask,
  createBossRouteProbeTask,
  createBossRuntimeDiagnosticsTask,
  createBossSearchRouteTask,
} from '../src/adapters/boss.mjs';

test('Boss adapter is primary and probes only the current page route contract', () => {
  assert.equal(BOSS_ADAPTER.platform, 'boss');
  assert.equal(BOSS_ADAPTER.priority, 'primary');
  assert.ok(BOSS_ADAPTER.contracts.jobDetail.fields.includes('contactState'));

  assert.deepEqual(createBossRouteProbeTask(), {
    platform: 'boss',
    action: 'read_route_contract',
    allowNavigation: false,
    operation: { kind: 'dom_contract_query', platform: 'boss' },
  });
});

test('Boss adapter requires a runtime diagnostics task before live collection', () => {
  const task = createBossRuntimeDiagnosticsTask({
    filters: {
      query: 'AI 架构师',
      baseCity: '武汉',
    },
  });

  assert.equal(task.platform, 'boss');
  assert.equal(task.action, 'read_runtime_diagnostics');
  assert.equal(task.readOnly, true);
  assert.equal(task.allowNavigation, true);
  assert.equal(task.route.host, 'www.zhipin.com');
  assert.equal(task.route.path, '/web/geek/jobs');
  assert.equal(task.route.query, 'AI 架构师');
  assert.equal(task.route.cityCode, '101200100');
  assert.equal(task.expectedContentVersion, '0.1.16');
  assert.equal(task.expectedProtocolVersion, 'boss-rpa-v0.1.16');
  assert.deepEqual(task.operation, { kind: 'dom_contract_query', platform: 'boss' });
});

test('Boss adapter creates a semantic search route task for Wuhan job discovery', () => {
  const task = createBossSearchRouteTask({
    filters: {
      query: 'AI 架构师',
      baseCity: '武汉',
    },
  });

  assert.equal(task.platform, 'boss');
  assert.equal(task.action, 'ensure_search_route');
  assert.equal(task.readOnly, true);
  assert.equal(task.route.host, 'www.zhipin.com');
  assert.equal(task.route.path, '/web/geek/jobs');
  assert.equal(task.route.cityCode, '101200100');
  assert.equal(task.route.query, 'AI 架构师');
  assert.equal(task.route.url, 'https://www.zhipin.com/web/geek/jobs?query=AI+%E6%9E%B6%E6%9E%84%E5%B8%88&city=101200100');
  assert.deepEqual(task.operation, { kind: 'dom_contract_query', platform: 'boss' });
});

test('Boss adapter creates page-specific search route and job list tasks', () => {
  const routeTask = createBossSearchRouteTask({
    filters: {
      query: 'AI 架构师',
      baseCity: '武汉',
    },
    page: 2,
  });
  const listTask = createBossJobListTask({
    filters: {
      query: 'AI 架构师',
      baseCity: '武汉',
    },
    page: 2,
    limit: 20,
  });

  assert.equal(routeTask.route.page, 2);
  assert.equal(routeTask.route.url, 'https://www.zhipin.com/web/geek/jobs?query=AI+%E6%9E%B6%E6%9E%84%E5%B8%88&city=101200100&page=2');
  assert.equal(listTask.page, 2);
  assert.equal(listTask.limit, 20);
});

test('Boss discovery plan collects complete JD with JSONL checkpoint and Wuhan base filter', () => {
  const plan = createBossDiscoveryPlan({
    query: 'AI 架构师',
    baseCity: '武汉',
    targetCount: 50,
    checkpointPath: '/tmp/recruitment-rpa/boss-wuhan.jsonl',
  });

  assert.equal(plan.platform, 'boss');
  assert.equal(plan.mode, 'job_discovery');
  assert.equal(plan.readOnly, true);
  assert.equal(plan.targetCount, 50);
  assert.deepEqual(plan.filters, { query: 'AI 架构师', baseCity: '武汉' });
  assert.deepEqual(plan.operations.map((operation) => operation.kind), [
    'dom_contract_query',
    'jsonl_checkpoint',
  ]);
  assert.equal(plan.contract.requiredDetail, 'complete_jd');
  assert.equal(plan.contract.checkpointPath, '/tmp/recruitment-rpa/boss-wuhan.jsonl');
});

test('Boss discovery target count is bounded to the 20-50 batch window', () => {
  const base = {
    query: 'AI 架构师',
    baseCity: '武汉',
    checkpointPath: '/tmp/recruitment-rpa/boss-wuhan.jsonl',
  };

  assert.throws(() => createBossDiscoveryPlan({ ...base, targetCount: 19 }), /boss_target_count_out_of_range/);
  assert.throws(() => createBossDiscoveryPlan({ ...base, targetCount: 51 }), /boss_target_count_out_of_range/);
  assert.throws(
    () => createBossSearchRouteTask({ filters: { query: 'AI 架构师', baseCity: '武汉' }, page: 0 }),
    /boss_page_out_of_range/,
  );
});

test('Boss job detail task carries frontend API security context for complete JD reads', () => {
  const task = createBossJobDetailTask({
    jobKey: 'boss:abc.html',
    url: 'https://www.zhipin.com/job_detail/abc.html',
    securityId: 'security-token-1',
    lid: 'lid-token-1',
    encryptJobId: 'abc',
  });

  assert.equal(task.platform, 'boss');
  assert.equal(task.action, 'read_job_detail');
  assert.equal(task.readOnly, true);
  assert.equal(task.allowNavigation, true);
  assert.deepEqual(task.route, {
    host: 'www.zhipin.com',
    path: '/job_detail/abc.html',
    jobKey: 'boss:abc.html',
    url: 'https://www.zhipin.com/job_detail/abc.html',
  });
  assert.equal(task.securityId, 'security-token-1');
  assert.equal(task.lid, 'lid-token-1');
  assert.equal(task.encryptJobId, 'abc');
  assert.equal(task.contract.requiredDetail, 'complete_jd');
  assert.deepEqual(task.operation, { kind: 'dom_contract_query', platform: 'boss' });
});

test('Boss job detail task rejects non-Boss detail routes before dispatch', () => {
  assert.throws(
    () => createBossJobDetailTask({
      jobKey: 'boss:abc.html',
      url: 'https://example.com/job_detail/abc.html',
    }),
    /unsupported_boss_detail_url/,
  );
  assert.throws(
    () => createBossJobDetailTask({
      jobKey: 'boss:abc.html',
      url: 'https://www.zhipin.com/web/geek/jobs',
    }),
    /unsupported_boss_detail_url/,
  );
});

test('Boss reviewed message task requires approved career-ops record and stable action id', () => {
  const task = createBossReviewedMessageTask({
    reviewRecord: {
      platform: 'boss',
      approved: true,
      jobKey: 'boss:job:123',
      actionId: 'send-boss-job-123-20260831',
      approvedMessage: '您好，我关注到这个 AI 架构岗位，和我的系统架构经历匹配。',
    },
  });

  assert.equal(task.platform, 'boss');
  assert.equal(task.action, 'send_reviewed_message');
  assert.equal(task.sideEffect, true);
  assert.equal(task.actionId, 'send-boss-job-123-20260831');
  assert.equal(task.postcondition, 'chatHistoryContainsApprovedMessage');
  assert.deepEqual(task.operations.map((operation) => operation.kind), [
    'dom_contract_query',
    'extension_message',
    'jsonl_checkpoint',
  ]);
});

test('Boss side-effect tasks fail closed without approval, action id, or message', () => {
  const approved = {
    platform: 'boss',
    approved: true,
    jobKey: 'boss:job:123',
    actionId: 'send-boss-job-123-20260831',
    approvedMessage: '您好。',
  };

  assert.throws(
    () => createBossReviewedMessageTask({ reviewRecord: { ...approved, approved: false } }),
    /review_approval_required/,
  );
  assert.throws(
    () => createBossReviewedMessageTask({ reviewRecord: { ...approved, actionId: '' } }),
    /stable_action_id_required/,
  );
  assert.throws(
    () => createBossReviewedMessageTask({ reviewRecord: { ...approved, approvedMessage: '' } }),
    /approved_message_required/,
  );
});
