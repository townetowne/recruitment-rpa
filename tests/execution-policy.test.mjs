import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ALLOWED_OPERATION_KINDS,
  FORBIDDEN_OPERATION_KINDS,
  authorizeOperation,
  assertAdapterContract,
} from '../src/execution-policy.mjs';

test('policy permanently forbids screenshot and coordinate driven execution', () => {
  assert.deepEqual(
    FORBIDDEN_OPERATION_KINDS,
    [
      'screenshot',
      'screen_ocr',
      'coordinate_click',
      'coordinate_navigation',
      'os_pointer_click',
      'browser_visual_snapshot',
    ],
  );

  for (const kind of FORBIDDEN_OPERATION_KINDS) {
    assert.throws(
      () => authorizeOperation({ kind, platform: 'liepin' }),
      new RegExp(`${kind}_forbidden`),
    );
  }
});

test('policy allows only reusable semantic execution primitives', () => {
  assert.deepEqual(
    ALLOWED_OPERATION_KINDS,
    [
      'site_api_call',
      'page_context_fetch',
      'dom_contract_query',
      'extension_message',
      'file_input_upload',
      'websocket_dispatch',
      'jsonl_checkpoint',
    ],
  );

  assert.equal(authorizeOperation({ kind: 'site_api_call', platform: 'liepin' }).ok, true);
  assert.equal(authorizeOperation({ kind: 'page_context_fetch', platform: 'linkedin' }).ok, true);
  assert.equal(authorizeOperation({ kind: 'dom_contract_query', platform: 'boss' }).ok, true);
});

test('coordinate payloads are rejected even when the outer operation name is semantic', () => {
  assert.throws(
    () =>
      authorizeOperation({
        kind: 'dom_contract_query',
        platform: 'liepin',
        target: { x: 1200, y: 740 },
      }),
    /coordinate_payload_forbidden/,
  );
});

test('site adapters must declare API or DOM contracts and cannot declare screenshot fallback', () => {
  const adapter = {
    platform: 'liepin',
    hosts: ['c.liepin.com'],
    capabilities: ['jobDiscovery', 'attachmentResumeUpload'],
    contracts: {
      session: { source: 'dom_contract_query', signals: ['authenticatedProfileNav'] },
      jobDetail: { source: 'site_api', fields: ['title', 'company', 'description', 'baseCity'] },
      attachmentUpload: { source: 'dom_file_input', postcondition: 'attachmentListContainsUploadedFile' },
    },
  };

  assert.equal(assertAdapterContract(adapter).ok, true);

  assert.throws(
    () =>
      assertAdapterContract({
        ...adapter,
        fallback: { kind: 'screenshot' },
      }),
    /screenshot_fallback_forbidden/,
  );
});
