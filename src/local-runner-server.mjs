import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    connection: 'close',
  });
  response.end(`${JSON.stringify(value)}\n`);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

export function createLocalRunnerServer({
  host = '127.0.0.1',
  port = 17333,
  clock = () => Date.now(),
  clientFreshnessMs = 5_000,
} = {}) {
  const pending = [];
  const inflight = new Map();
  const clientWaiters = [];
  let server = null;
  let url = '';
  let lastClient = null;
  let lastClientSeenAt = null;

  function removeEntry(id) {
    const pendingIndex = pending.findIndex((entry) => entry.id === id);
    if (pendingIndex >= 0) pending.splice(pendingIndex, 1);
    inflight.delete(id);
  }

  function notifyClientPoll(clientId) {
    lastClientSeenAt = clock();
    lastClient = {
      clientId: clientId || 'anonymous-client',
      at: new Date(lastClientSeenAt).toISOString(),
    };
    for (const waiter of clientWaiters.splice(0)) {
      clearTimeout(waiter.timeoutId);
      waiter.resolve({ clientId: lastClient.clientId });
    }
  }

  async function handleRequest(request, response) {
    if (request.method === 'OPTIONS') {
      sendJson(response, 200, { ok: true });
      return;
    }

    const requestUrl = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);

    if (request.method === 'GET' && requestUrl.pathname === '/health') {
      sendJson(response, 200, {
        ok: true,
        pending: pending.length,
        inflight: inflight.size,
        lastClient,
      });
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/tasks/next') {
      notifyClientPoll(requestUrl.searchParams.get('clientId'));
      const entry = pending.shift();
      if (!entry) {
        sendJson(response, 200, { ok: true, task: null });
        return;
      }

      inflight.set(entry.id, entry);
      sendJson(response, 200, {
        ok: true,
        task: {
          id: entry.id,
          ...entry.task,
        },
      });
      return;
    }

    const resultMatch = requestUrl.pathname.match(/^\/tasks\/([^/]+)\/result$/);
    if (request.method === 'POST' && resultMatch) {
      const id = decodeURIComponent(resultMatch[1]);
      const entry = inflight.get(id);
      if (!entry) {
        sendJson(response, 404, { ok: false, error: `task_not_found:${id}` });
        return;
      }

      try {
        const body = await readJsonBody(request);
        clearTimeout(entry.timeoutId);
        inflight.delete(id);
        if (body.ok) {
          entry.resolve(body.result);
        } else {
          entry.reject(new Error(body.error || 'task_failed'));
        }
        sendJson(response, 200, { ok: true });
      } catch (error) {
        sendJson(response, 400, { ok: false, error: error.message });
      }
      return;
    }

    sendJson(response, 404, { ok: false, error: 'not_found' });
  }

  return {
    get url() {
      return url;
    },
    async start() {
      if (server) return this;
      server = createServer((request, response) => {
        handleRequest(request, response).catch((error) => {
          sendJson(response, 500, { ok: false, error: error.message });
        });
      });
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          const address = server.address();
          url = `http://${host}:${address.port}`;
          resolve();
        });
      });
      return this;
    },
    async stop() {
      for (const entry of [...pending, ...inflight.values()]) {
        clearTimeout(entry.timeoutId);
        entry.reject(new Error('runner_stopped'));
      }
      for (const waiter of clientWaiters.splice(0)) {
        clearTimeout(waiter.timeoutId);
        waiter.reject(new Error('runner_stopped'));
      }
      pending.length = 0;
      inflight.clear();
      if (!server) return;
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      server = null;
      url = '';
    },
    waitForClient({ timeoutMs = 90000 } = {}) {
      if (lastClient && clock() - lastClientSeenAt <= clientFreshnessMs) {
        return Promise.resolve({ clientId: lastClient.clientId });
      }

      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          const index = clientWaiters.findIndex((waiter) => waiter.timeoutId === timeoutId);
          if (index >= 0) clientWaiters.splice(index, 1);
          reject(new Error('runner_client_timeout'));
        }, timeoutMs);
        clientWaiters.push({ resolve, reject, timeoutId });
      });
    },
    enqueue(task, { timeoutMs = 60000 } = {}) {
      if (!task || typeof task !== 'object') throw new Error('task_required');
      const id = randomUUID();
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          removeEntry(id);
          reject(new Error(`runner_task_timeout:${task.action || 'unknown'}`));
        }, timeoutMs);
        pending.push({
          id,
          task,
          resolve,
          reject,
          timeoutId,
        });
      });
    },
  };
}
