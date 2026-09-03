import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_SITE_ADAPTERS, getSiteAdapter } from '../src/site-registry.mjs';

test('default registry covers Boss, Liepin, and LinkedIn as separate adapters', () => {
  assert.deepEqual(
    DEFAULT_SITE_ADAPTERS.map((adapter) => adapter.platform),
    ['boss', 'liepin', 'linkedin'],
  );

  assert.equal(DEFAULT_SITE_ADAPTERS[0].priority, 'primary');
});

test('Boss adapter is the primary execution target and delegates scoring to career-ops-cn', () => {
  const boss = getSiteAdapter('boss');

  assert.deepEqual(boss.hosts, ['www.zhipin.com']);
  assert.equal(boss.priority, 'primary');
  assert.equal(boss.contracts.jobDetail.source, 'dom_contract_query');
  assert.equal(boss.contracts.reviewGate.source, 'career_ops_cn_review_artifact');
  assert.equal(boss.contracts.messageSend.source, 'dom_contract_query');
  assert.equal(boss.contracts.messageSend.postcondition, 'chatHistoryContainsApprovedMessage');
  assert.equal(boss.disallowedFallbacks.includes('screenshot'), true);
  assert.equal(boss.disallowedFallbacks.includes('coordinate_click'), true);
});

test('Liepin adapter is API and DOM contract driven for jobs and attachment resumes', () => {
  const liepin = getSiteAdapter('liepin');

  assert.deepEqual(liepin.hosts, ['c.liepin.com', 'www.liepin.com']);
  assert.equal(liepin.contracts.jobDetail.source, 'site_api');
  assert.equal(liepin.contracts.attachmentUpload.source, 'dom_file_input');
  assert.equal(liepin.contracts.attachmentUpload.postcondition, 'attachmentListContainsUploadedFile');
  assert.equal(liepin.disallowedFallbacks.includes('screenshot'), true);
  assert.equal(liepin.disallowedFallbacks.includes('coordinate_click'), true);
});

test('unknown sites fail closed until a tested adapter exists', () => {
  assert.throws(() => getSiteAdapter('lagou'), /site_adapter_not_found:lagou/);
});
