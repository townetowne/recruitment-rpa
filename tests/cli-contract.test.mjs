import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const projectRoot = new URL('..', import.meta.url);

function readProjectFile(...segments) {
  return readFileSync(join(projectRoot.pathname, ...segments), 'utf8');
}

test('Boss collect-score CLI describes automatic extension runner pickup', () => {
  const script = readProjectFile('scripts', 'boss-collect-score.mjs');

  assert.match(script, /extension auto-connects to the local runner/i);
  assert.match(script, /runner\.waitForClient/);
  assert.match(script, /runner-ready-timeout-ms/);
  assert.match(script, /clientTaskTimeoutMs/);
  assert.match(script, /\.\.\.task,\s*timeoutMs: task\.timeoutMs \|\| clientTaskTimeoutMs/s);
  assert.match(script, /stage: 'runner_ready'/);
  assert.match(script, /--max-pages 10/);
  assert.match(script, /--queries/);
  assert.match(script, /queryVariants/);
  assert.match(script, /reviewScope/);
  assert.match(script, /writeCareerOpsSessionCandidates/);
  assert.match(script, /careerOpsSessionCandidatesPath/);
  assert.match(script, /const maxPages = Number/);
  assert.match(script, /maxPages,/);
  assert.doesNotMatch(script, /点击 Runner Connect/);
});

test('public CLI does not expose the retired Maimai work-experience helper', () => {
  const packageJson = JSON.parse(readProjectFile('package.json'));

  assert.equal(packageJson.scripts['maimai:assist'], undefined);
  assert.equal(existsSync(join(projectRoot.pathname, 'scripts', 'maimai-work-experience-assist.mjs')), false);
  assert.equal(existsSync(join(projectRoot.pathname, 'src', 'maimai-work-experience-assist.mjs')), false);
});

test('Boss chat-report CLI exposes read-only stalled communication reporting', () => {
  const script = readProjectFile('scripts', 'boss-chat-report.mjs');
  const packageJson = JSON.parse(readProjectFile('package.json'));

  assert.match(script, /collectBossChatReport/);
  assert.match(script, /createLocalRunnerServer/);
  assert.match(script, /runner\.waitForClient/);
  assert.match(script, /--keywords/);
  assert.match(script, /stage: 'chat_report_completed'/);
  assert.equal(
    packageJson.scripts['boss:chat-report'],
    'node scripts/boss-chat-report.mjs',
  );
});

test('Boss checkpoint-score CLI replays JSONL checkpoints into session scoring', () => {
  const script = readProjectFile('scripts', 'boss-score-checkpoint.mjs');
  const packageJson = JSON.parse(readProjectFile('package.json'));

  assert.match(script, /extractVerifiedBossCandidatesFromJsonl/);
  assert.match(script, /writeCareerOpsSessionCandidates/);
  assert.match(script, /createCareerOpsScoreCommands/);
  assert.match(script, /stage: 'checkpoint_score_completed'/);
  assert.equal(
    packageJson.scripts['boss:score-checkpoint'],
    'node scripts/boss-score-checkpoint.mjs',
  );
});
