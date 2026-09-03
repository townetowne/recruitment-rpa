import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  assert.match(script, /const maxPages = Number/);
  assert.match(script, /maxPages,/);
  assert.doesNotMatch(script, /点击 Runner Connect/);
});
