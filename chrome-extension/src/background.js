import {
  isSupportedRecruitmentTab,
  selectDefaultTargetTab,
  selectDispatchTab,
  summarizeRecruitmentTab,
} from './target-selection.js';
import { unwrapContentResponse } from './extension-response.js';

const ALLOWED_ACTIONS = new Set([
  'read_runtime_diagnostics',
  'ensure_search_route',
  'read_route_contract',
  'read_job_cards',
  'read_job_detail',
  'page_context_fetch',
]);

const DEFAULT_RUNNER_URL = 'http://127.0.0.1:17333';
const LOCAL_RUNNER_HOSTS = new Set(['127.0.0.1', 'localhost']);
const AUTOCONNECT_ALARM_NAME = 'genesis-rpa-autoconnect';
const AUTOCONNECT_PERIOD_MINUTES = 0.5;
const EXPECTED_CONTENT_VERSION = '0.1.16';
const EXECUTE_MESSAGE_TYPE = 'RECRUITMENT_RPA_EXECUTE_V0_1_16';

const runnerState = {
  connected: false,
  polling: false,
  runnerUrl: DEFAULT_RUNNER_URL,
  handledTasks: 0,
  lastError: '',
};

function assertAllowedTask(task) {
  if (!task || typeof task !== 'object') throw new Error('task_required');
  if (!ALLOWED_ACTIONS.has(task.action)) throw new Error(`unsupported_task:${task.action}`);
}

function assertLocalRunnerUrl(value) {
  const url = new URL(value || DEFAULT_RUNNER_URL);
  if (url.protocol !== 'http:' || !LOCAL_RUNNER_HOSTS.has(url.hostname)) {
    throw new Error(`unsupported_runner_url:${value}`);
  }
  return url.origin;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function assertBossSearchRoute(route) {
  const url = new URL(route?.url || '');
  const expectedPage = String(route?.page || 1);
  const actualPage = url.searchParams.get('page') || '1';
  if (
    url.hostname !== 'www.zhipin.com' ||
    url.pathname !== '/web/geek/jobs' ||
    url.searchParams.get('query') !== route?.query ||
    url.searchParams.get('city') !== route?.cityCode ||
    actualPage !== expectedPage
  ) {
    throw new Error('unsupported_boss_search_route');
  }
  return url;
}

function isBossSearchRouteMatch(urlValue, route) {
  try {
    const url = new URL(urlValue || '');
    return (
      url.hostname === 'www.zhipin.com' &&
      url.pathname === '/web/geek/jobs' &&
      url.searchParams.get('query') === route.query &&
      url.searchParams.get('city') === route.cityCode &&
      (url.searchParams.get('page') || '1') === String(route.page || 1)
    );
  } catch {
    return false;
  }
}

function assertBossDetailRoute(route) {
  const url = new URL(route?.url || '');
  if (url.hostname !== 'www.zhipin.com' || !url.pathname.startsWith('/job_detail/')) {
    throw new Error('unsupported_boss_detail_route');
  }
  if (route?.path && route.path !== url.pathname) {
    throw new Error('unsupported_boss_detail_route');
  }
  return url;
}

function isBossDetailRouteMatch(urlValue, route) {
  try {
    const url = new URL(urlValue || '');
    return (
      url.hostname === 'www.zhipin.com' &&
      url.pathname === route.path
    );
  } catch {
    return false;
  }
}

function waitForTabSearchRoute(tabId, route, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let settled = false;

    function cleanup() {
      clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    }

    function settle(fn, value) {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    }

    function inspect(tab) {
      if (isBossSearchRouteMatch(tab?.url, route)) settle(resolve, tab);
    }

    function onUpdated(updatedTabId, _changeInfo, tab) {
      if (updatedTabId !== tabId) return;
      inspect(tab);
    }

    const timeoutId = setTimeout(() => {
      settle(reject, new Error('boss_search_route_timeout'));
    }, timeoutMs);

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then(inspect).catch((error) => settle(reject, error));
  });
}

function waitForTabDetailRoute(tabId, route, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let settled = false;

    function cleanup() {
      clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    }

    function settle(fn, value) {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    }

    function inspect(tab) {
      if (isBossDetailRouteMatch(tab?.url, route)) settle(resolve, tab);
    }

    function onUpdated(updatedTabId, _changeInfo, tab) {
      if (updatedTabId !== tabId) return;
      inspect(tab);
    }

    const timeoutId = setTimeout(() => {
      settle(reject, new Error('boss_detail_route_timeout'));
    }, timeoutMs);

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then(inspect).catch((error) => settle(reject, error));
  });
}

async function listSupportedTabs() {
  const tabs = await chrome.tabs.query({ url: ['https://www.zhipin.com/*'] });
  return tabs.filter(isSupportedRecruitmentTab);
}

async function readSelectedTargetTabId() {
  const state = await chrome.storage.local.get(['selectedTargetTabId']);
  return state.selectedTargetTabId ?? null;
}

async function writeSelectedTargetTabId(targetTabId) {
  await chrome.storage.local.set({ selectedTargetTabId: Number(targetTabId) });
}

async function resolveDispatchTab(targetTabId) {
  const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const supportedTabs = await listSupportedTabs();
  const selection = selectDispatchTab({ activeTabs, supportedTabs, targetTabId });
  if (!selection.ok) {
    const error = new Error(selection.error);
    error.candidates = selection.candidates;
    throw error;
  }
  await writeSelectedTargetTabId(selection.tab.id);
  return selection.tab;
}

async function resolveDefaultTargetTab() {
  const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const supportedTabs = await listSupportedTabs();
  const storedTargetTabId = await readSelectedTargetTabId();
  const defaultSelection = selectDefaultTargetTab({
    activeTabs,
    supportedTabs,
    storedTargetTabId,
  });

  if (defaultSelection.ok) {
    await writeSelectedTargetTabId(defaultSelection.tab.id);
  }

  return {
    tabs: supportedTabs,
    selectedTargetTabId: defaultSelection.ok ? defaultSelection.tab.id : null,
    selectionSource: defaultSelection.ok ? defaultSelection.source : '',
    error: defaultSelection.ok ? '' : defaultSelection.error,
  };
}

async function ensureBossSearchRoute(task, targetTabId) {
  const routeUrl = assertBossSearchRoute(task.route);
  const tab = await resolveDispatchTab(targetTabId);

  if (isBossSearchRouteMatch(tab.url, task.route)) {
    return {
      ok: true,
      navigated: false,
      host: routeUrl.hostname,
      path: routeUrl.pathname,
      query: task.route.query,
      cityCode: task.route.cityCode,
      page: task.route.page || 1,
      url: routeUrl.toString(),
    };
  }

  await chrome.tabs.update(tab.id, {
    url: routeUrl.toString(),
    active: true,
  });
  const loadedTab = await waitForTabSearchRoute(tab.id, task.route, task.timeoutMs || 20000);

  return {
    ok: true,
    navigated: true,
    host: routeUrl.hostname,
    path: routeUrl.pathname,
    query: task.route.query,
    cityCode: task.route.cityCode,
    page: task.route.page || 1,
    url: loadedTab.url || routeUrl.toString(),
  };
}

async function ensureBossDetailRoute(task, targetTabId) {
  const routeUrl = assertBossDetailRoute(task.route || { url: task.url, jobKey: task.jobKey });
  const route = {
    ...(task.route || {}),
    host: routeUrl.hostname,
    path: routeUrl.pathname,
    url: routeUrl.toString(),
  };
  const tab = await resolveDispatchTab(targetTabId);
  let dispatchTab = tab;
  let routeNavigated = false;

  if (!isBossDetailRouteMatch(tab.url, route)) {
    await chrome.tabs.update(tab.id, {
      url: routeUrl.toString(),
      active: true,
    });
    dispatchTab = await waitForTabDetailRoute(tab.id, route, task.timeoutMs || 20000);
    routeNavigated = true;
  }

  await ensureContentScript(dispatchTab.id);
  const response = await chrome.tabs.sendMessage(dispatchTab.id, {
    type: EXECUTE_MESSAGE_TYPE,
    task: {
      ...task,
      url: routeUrl.toString(),
    },
  });
  return {
    ...unwrapContentResponse(response),
    routeNavigated,
    routePath: route.path,
  };
}

async function ensureContentScript(tabId) {
  const [{ result: state } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      ready: Boolean(globalThis.__genesisRecruitmentRpaContentReady),
      version: globalThis.__genesisRecruitmentRpaContentVersion || '',
    }),
  });
  const ready = state?.ready === true;
  const version = state?.version || '';

  if (ready && version === EXPECTED_CONTENT_VERSION) return;

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/content.js'],
  });
}

async function dispatchTask(task, targetTabId) {
  assertAllowedTask(task);
  const selectedTargetTabId = targetTabId ?? await readSelectedTargetTabId();
  if (task.action === 'read_runtime_diagnostics' && task.route) {
    await ensureBossSearchRoute(task, selectedTargetTabId);
  }
  if (task.action === 'ensure_search_route') {
    return ensureBossSearchRoute(task, selectedTargetTabId);
  }
  if (task.action === 'read_job_detail') {
    return ensureBossDetailRoute(task, selectedTargetTabId);
  }
  const tab = await resolveDispatchTab(selectedTargetTabId);
  await ensureContentScript(tab.id);
  const response = await chrome.tabs.sendMessage(tab.id, {
    type: EXECUTE_MESSAGE_TYPE,
    task,
  });
  return unwrapContentResponse(response);
}

function withTimeout(promise, timeoutMs, errorCode) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(errorCode));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function dispatchTaskWithTimeout(task, targetTabId) {
  return withTimeout(
    dispatchTask(task, targetTabId),
    task.timeoutMs || 55000,
    `${task.action || 'unknown'}_dispatch_timeout`,
  );
}

function runnerEndpoint(path) {
  return `${runnerState.runnerUrl}${path}`;
}

function runnerClientId() {
  return `chrome-extension:${chrome.runtime.id || 'unknown'}`;
}

async function postRunnerResult(taskId, payload) {
  await fetch(runnerEndpoint(`/tasks/${encodeURIComponent(taskId)}/result`), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function pollRunner() {
  if (runnerState.polling) return;
  runnerState.polling = true;
  try {
    while (runnerState.connected) {
      try {
        const response = await fetch(
          runnerEndpoint(`/tasks/next?clientId=${encodeURIComponent(runnerClientId())}`),
          { cache: 'no-store' },
        );
        const body = await response.json();
        const task = body?.task;
        if (!task) {
          await sleep(800);
          continue;
        }

        try {
          const result = await dispatchTaskWithTimeout(task, task.targetTabId);
          runnerState.handledTasks += 1;
          runnerState.lastError = '';
          await postRunnerResult(task.id, { ok: true, result });
        } catch (error) {
          runnerState.lastError = error.message;
          await postRunnerResult(task.id, {
            ok: false,
            error: error.message,
            candidates: error.candidates || [],
          });
        }
      } catch (error) {
        runnerState.lastError = error.message;
        runnerState.connected = false;
        await sleep(1500);
      }
    }
  } finally {
    runnerState.polling = false;
  }
}

function runnerStatus() {
  return {
    connected: runnerState.connected,
    polling: runnerState.polling,
    runnerUrl: runnerState.runnerUrl,
    handledTasks: runnerState.handledTasks,
    lastError: runnerState.lastError,
  };
}

async function connectRunner(runnerUrl) {
  runnerState.runnerUrl = assertLocalRunnerUrl(runnerUrl);
  runnerState.connected = true;
  runnerState.lastError = '';
  pollRunner();
  return runnerStatus();
}

function disconnectRunner() {
  runnerState.connected = false;
  return runnerStatus();
}

async function connectDefaultRunnerIfAvailable() {
  return connectRunnerIfAvailable(DEFAULT_RUNNER_URL);
}

async function connectRunnerIfAvailable(runnerUrl = DEFAULT_RUNNER_URL) {
  const normalizedRunnerUrl = assertLocalRunnerUrl(runnerUrl);

  if (runnerState.connected && runnerState.runnerUrl === normalizedRunnerUrl) {
    pollRunner();
    return runnerStatus();
  }

  runnerState.runnerUrl = normalizedRunnerUrl;
  try {
    const response = await fetch(`${normalizedRunnerUrl}/health`, { cache: 'no-store' });
    if (!response.ok) return runnerStatus();
    return connectRunner(normalizedRunnerUrl);
  } catch (_error) {
    runnerState.connected = false;
    return runnerStatus();
  }
}

function scheduleRunnerAutoconnect() {
  chrome.alarms.create(AUTOCONNECT_ALARM_NAME, {
    delayInMinutes: 0.01,
    periodInMinutes: AUTOCONNECT_PERIOD_MINUTES,
  });
  connectDefaultRunnerIfAvailable().catch((error) => {
    runnerState.lastError = error.message;
  });
}

async function selectTargetTab(targetTabId) {
  const supportedTabs = await listSupportedTabs();
  const selected = supportedTabs.find((tab) => tab.id === Number(targetTabId));
  if (!selected) {
    const error = new Error(`target_tab_not_supported:${targetTabId}`);
    error.candidates = supportedTabs.map(summarizeRecruitmentTab);
    throw error;
  }
  await writeSelectedTargetTabId(selected.id);
  return summarizeRecruitmentTab(selected);
}

chrome.runtime.onStartup.addListener(scheduleRunnerAutoconnect);
chrome.runtime.onInstalled.addListener(scheduleRunnerAutoconnect);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== AUTOCONNECT_ALARM_NAME) return;
  connectDefaultRunnerIfAvailable().catch((error) => {
    runnerState.lastError = error.message;
  });
});
scheduleRunnerAutoconnect();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'RECRUITMENT_RPA_CONNECT_RUNNER') {
    connectRunner(message.runnerUrl)
      .then((status) => sendResponse({ ok: true, status }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message?.type === 'RECRUITMENT_RPA_DISCONNECT_RUNNER') {
    sendResponse({ ok: true, status: disconnectRunner() });
    return false;
  }

  if (message?.type === 'RECRUITMENT_RPA_RUNNER_STATUS') {
    sendResponse({ ok: true, status: runnerStatus() });
    return false;
  }

  if (message?.type === 'RECRUITMENT_RPA_AUTOCONNECT_RUNNER') {
    connectRunnerIfAvailable(message.runnerUrl)
      .then((status) => sendResponse({ ok: true, status }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message?.type === 'RECRUITMENT_RPA_LIST_TABS') {
    resolveDefaultTargetTab()
      .then(({ tabs, selectedTargetTabId, selectionSource, error }) => sendResponse({
        ok: true,
        tabs: tabs.map(summarizeRecruitmentTab),
        selectedTargetTabId,
        selectionSource,
        error,
      }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message?.type === 'RECRUITMENT_RPA_SET_TARGET_TAB') {
    selectTargetTab(message.targetTabId)
      .then((tab) => sendResponse({ ok: true, tab }))
      .catch((error) => sendResponse({
        ok: false,
        error: error.message,
        candidates: error.candidates || [],
      }));

    return true;
  }

  if (message?.type !== 'RECRUITMENT_RPA_DISPATCH') return false;

  dispatchTask(message.task, message.targetTabId)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({
      ok: false,
      error: error.message,
      candidates: error.candidates || [],
    }));

  return true;
});
