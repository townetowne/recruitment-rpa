import assert from 'node:assert/strict';
import test from 'node:test';

import { unwrapContentResponse } from '../chrome-extension/src/extension-response.js';

test('unwraps content script success response into the business payload', () => {
  assert.deepEqual(
    unwrapContentResponse({
      ok: true,
      result: {
        host: 'www.zhipin.com',
        path: '/web/geek/jobs',
        hasJobCards: true,
      },
    }),
    {
      host: 'www.zhipin.com',
      path: '/web/geek/jobs',
      hasJobCards: true,
    },
  );
});

test('throws content script failures with the original error code', () => {
  assert.throws(
    () => unwrapContentResponse({ ok: false, error: 'boss_detail_fetch_failed:403' }),
    /boss_detail_fetch_failed:403/,
  );
});
