import assert from 'node:assert/strict';
import test from 'node:test';

import { extractVerifiedBossCandidatesFromJsonl } from '../src/boss-checkpoint-score.mjs';

test('extracts latest verified Boss candidates from JSONL checkpoint records', () => {
  const jsonl = [
    JSON.stringify({
      kind: 'job_decision',
      status: 'verified',
      jobKey: 'boss:1',
      candidate: {
        company: 'Old',
        title: 'AI 架构师',
        url: 'https://www.zhipin.com/job_detail/1.html',
      },
    }),
    JSON.stringify({
      kind: 'job_decision',
      status: 'skipped',
      jobKey: 'boss:1',
      reason: 'already_contacted',
    }),
    JSON.stringify({
      kind: 'job_decision',
      status: 'verified',
      jobKey: 'boss:2',
      candidate: {
        company: 'Today',
        title: '大数据平台架构师',
        url: 'https://www.zhipin.com/job_detail/2.html',
      },
    }),
    JSON.stringify({ kind: 'step', stage: 'flow_completed' }),
  ].join('\n');

  const candidates = extractVerifiedBossCandidatesFromJsonl(jsonl);

  assert.deepEqual(candidates.map((candidate) => candidate.company), ['Today']);
});
