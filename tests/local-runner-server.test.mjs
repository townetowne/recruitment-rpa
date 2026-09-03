import assert from 'node:assert/strict';
import test from 'node:test';

import { createLocalRunnerServer } from '../src/local-runner-server.mjs';

test('local runner server dispatches queued tasks and resolves posted results', async () => {
  const runner = createLocalRunnerServer({ port: 0 });
  await runner.start();
  try {
    const resultPromise = runner.enqueue({
      platform: 'boss',
      action: 'read_route_contract',
    });

    const nextResponse = await fetch(`${runner.url}/tasks/next?clientId=test-client`);
    const next = await nextResponse.json();

    assert.equal(next.ok, true);
    assert.equal(next.task.platform, 'boss');
    assert.equal(next.task.action, 'read_route_contract');
    assert.equal(typeof next.task.id, 'string');

    const postResponse = await fetch(`${runner.url}/tasks/${next.task.id}/result`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        result: { host: 'www.zhipin.com', hasJobCards: true },
      }),
    });

    assert.equal(postResponse.status, 200);
    assert.deepEqual(await resultPromise, { host: 'www.zhipin.com', hasJobCards: true });
  } finally {
    await runner.stop();
  }
});

test('local runner server rejects tasks when the extension posts a failed result', async () => {
  const runner = createLocalRunnerServer({ port: 0 });
  await runner.start();
  try {
    const resultPromise = runner.enqueue({
      platform: 'boss',
      action: 'read_job_cards',
    });
    const rejection = assert.rejects(resultPromise, /boss_job_list_contract_not_satisfied/);

    const next = await (await fetch(`${runner.url}/tasks/next`)).json();
    await fetch(`${runner.url}/tasks/${next.task.id}/result`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'boss_job_list_contract_not_satisfied' }),
    });

    await rejection;
  } finally {
    await runner.stop();
  }
});

test('local runner server waits for an extension client before tasks are enqueued', async () => {
  const runner = createLocalRunnerServer({ port: 0 });
  await runner.start();
  try {
    const readyPromise = runner.waitForClient({ timeoutMs: 1000 });
    const nextResponse = await fetch(`${runner.url}/tasks/next?clientId=extension-client`);
    const next = await nextResponse.json();

    assert.deepEqual(next, { ok: true, task: null });
    assert.deepEqual(await readyPromise, { clientId: 'extension-client' });
  } finally {
    await runner.stop();
  }
});

test('local runner server fails readiness when no extension client polls', async () => {
  const runner = createLocalRunnerServer({ port: 0 });
  await runner.start();
  try {
    await assert.rejects(
      runner.waitForClient({ timeoutMs: 10 }),
      /runner_client_timeout/,
    );
  } finally {
    await runner.stop();
  }
});

test('local runner server expires a stale extension client before reporting readiness', async () => {
  let now = 1_000;
  const runner = createLocalRunnerServer({
    port: 0,
    clock: () => now,
    clientFreshnessMs: 5_000,
  });
  await runner.start();
  try {
    await fetch(`${runner.url}/tasks/next?clientId=extension-client`);
    assert.deepEqual(
      await runner.waitForClient({ timeoutMs: 10 }),
      { clientId: 'extension-client' },
    );

    now += 5_001;

    await assert.rejects(
      runner.waitForClient({ timeoutMs: 10 }),
      /runner_client_timeout/,
    );
  } finally {
    await runner.stop();
  }
});
