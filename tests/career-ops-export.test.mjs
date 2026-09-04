import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createCareerOpsScoreCommands,
  writeCareerOpsCandidates,
  writeCareerOpsSessionCandidates,
} from '../src/career-ops-export.mjs';

test('writes RPA candidates into career-ops candidate file with stable dedupe', async () => {
  const root = await mkdtemp(join(tmpdir(), 'recruitment-rpa-career-ops-'));
  try {
    await mkdir(join(root, 'data'), { recursive: true });
    const result = await writeCareerOpsCandidates({
      careerOpsRoot: root,
      candidates: [
        {
          source: 'boss-rpa',
          company: 'A',
          title: 'AI 架构师',
          city: '武汉',
          url: 'https://www.zhipin.com/job_detail/1.html',
          job_key: 'boss:1',
          desc: '岗位职责：负责 AI 平台架构、数据治理和服务稳定性。任职要求：熟悉 Java、云原生、数据平台和大模型工程。',
        },
        {
          source: 'boss-rpa',
          company: 'A',
          title: 'AI 架构师',
          city: '武汉',
          url: 'https://www.zhipin.com/job_detail/1.html',
          job_key: 'boss:1',
          desc: '更新后的完整 JD',
        },
      ],
    });

    const written = JSON.parse(await readFile(result.outputPath, 'utf8'));
    assert.equal(result.insertedOrUpdated, 1);
    assert.equal(written.length, 1);
    assert.equal(written[0].desc, '更新后的完整 JD');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('creates the exact career-ops scoring command chain', () => {
  const commands = createCareerOpsScoreCommands({
    threshold: 4,
    limit: 50,
    candidatesPath: 'data/boss-candidates.json',
  });

  assert.deepEqual(commands.map((command) => command.file), [
    'boss-score.mjs',
    'boss-match.mjs',
    'boss-review.mjs',
  ]);
  assert.deepEqual(commands[0].args, ['boss-score.mjs', '--input', 'data/boss-candidates.json', '--threshold', '4']);
  assert.deepEqual(commands[1].args, ['boss-match.mjs', '--input', 'data/boss-queue.json', '--limit', '50']);
  assert.deepEqual(commands[2].args, ['boss-review.mjs', '--input', 'data/boss-match-pool.json', '--limit', '50', '--threshold', '4']);
});

test('writes session candidates without merging historical candidate state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'recruitment-rpa-career-ops-session-'));
  try {
    const result = await writeCareerOpsSessionCandidates({
      careerOpsRoot: root,
      candidatesPath: 'data/boss-collected-武汉-20260904.json',
      candidates: [
        {
          source: 'boss-rpa',
          company: 'Today A',
          title: 'AI Agent 架构师',
          city: '武汉',
          url: 'https://www.zhipin.com/job_detail/today-a.html',
        },
      ],
    });

    const written = JSON.parse(await readFile(result.outputPath, 'utf8'));
    assert.equal(result.total, 1);
    assert.equal(written.length, 1);
    assert.equal(written[0].company, 'Today A');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
