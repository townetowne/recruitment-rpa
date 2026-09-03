import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCurrentBossDetailRoute,
  normalizeBossDetailRoute,
  shouldReadCurrentVisibleBossDetail,
} from '../chrome-extension/src/boss-detail-route.js';

test('Boss detail route rejects missing URL with a business error code', () => {
  assert.throws(
    () => normalizeBossDetailRoute({ jobKey: 'boss:manual-canary' }),
    /boss_detail_url_required/,
  );
});

test('Boss detail route rejects malformed URL without leaking browser Invalid URL', () => {
  assert.throws(
    () => normalizeBossDetailRoute({ jobKey: 'boss:manual-canary', url: 'not a url' }),
    /^((?!Invalid URL).)*unsupported_boss_detail_route/s,
  );
});

test('Boss current-detail canary infers the stable job key from the selected tab URL', () => {
  const route = createCurrentBossDetailRoute({
    id: 7,
    url: 'https://www.zhipin.com/job_detail/abc123.html?securityId=s1&lid=l1',
  });

  assert.deepEqual(route, {
    host: 'www.zhipin.com',
    path: '/job_detail/abc123.html',
    jobKey: 'boss:abc123.html',
    url: 'https://www.zhipin.com/job_detail/abc123.html?securityId=s1&lid=l1',
  });
});

test('Boss current-detail canary fails closed when the selected tab is not a detail page', () => {
  assert.throws(
    () => createCurrentBossDetailRoute({
      id: 8,
      url: 'https://www.zhipin.com/web/geek/jobs?query=AI%E6%9E%B6%E6%9E%84%E5%B8%88&city=101200100',
    }),
    /boss_current_detail_route_required/,
  );
});

test('Boss popup detail canary can read the currently visible detail DOM without a detail URL', () => {
  assert.equal(
    shouldReadCurrentVisibleBossDetail({
      platform: 'boss',
      action: 'read_job_detail',
      useCurrentVisibleDetail: true,
    }),
    true,
  );
});

test('Boss routed detail tasks still require an explicit stable detail URL', () => {
  assert.equal(
    shouldReadCurrentVisibleBossDetail({
      platform: 'boss',
      action: 'read_job_detail',
      useCurrentVisibleDetail: true,
      url: 'https://www.zhipin.com/job_detail/abc123.html',
    }),
    false,
  );
  assert.equal(
    shouldReadCurrentVisibleBossDetail({
      platform: 'boss',
      action: 'read_job_detail',
      route: { url: 'https://www.zhipin.com/job_detail/abc123.html' },
    }),
    false,
  );
});
