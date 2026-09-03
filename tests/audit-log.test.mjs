import assert from 'node:assert/strict';
import test from 'node:test';

import { createAuditRecord, serializeAuditRecord } from '../src/audit-log.mjs';

test('audit records are JSONL-safe and redact secrets by key name', () => {
  const record = createAuditRecord({
    runId: 'run-20260831',
    seq: 1,
    platform: 'liepin',
    stage: 'upload_prepare',
    action: 'resolve_attachment_contract',
    payload: {
      url: 'https://c.liepin.com/resume/edit?res_id_encode=private',
      cookie: 'SESSION=secret',
      Authorization: 'Bearer secret',
      visibleText: '上传附件简历',
    },
  });

  const line = serializeAuditRecord(record);
  const parsed = JSON.parse(line);

  assert.equal(line.endsWith('\n'), true);
  assert.equal(parsed.payload.cookie, '[REDACTED]');
  assert.equal(parsed.payload.Authorization, '[REDACTED]');
  assert.equal(parsed.payload.visibleText, '上传附件简历');
});

test('audit records reject screenshot, raw DOM, and coordinate evidence', () => {
  assert.throws(
    () =>
      createAuditRecord({
        runId: 'run-20260831',
        seq: 2,
        platform: 'liepin',
        stage: 'observe',
        action: 'screen_capture',
        screenshotPath: '/tmp/page.png',
      }),
    /audit_visual_evidence_forbidden/,
  );

  assert.throws(
    () =>
      createAuditRecord({
        runId: 'run-20260831',
        seq: 3,
        platform: 'liepin',
        stage: 'click',
        action: 'click_target',
        payload: { x: 10, y: 20 },
      }),
    /audit_coordinate_evidence_forbidden/,
  );
});
