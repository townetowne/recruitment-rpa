const launchParams = new URLSearchParams(window.location.search);
if (launchParams.get('genesisReload') === '1') {
  window.history.replaceState(null, '', window.location.pathname);
  chrome.runtime.reload();
}

const statusEl = document.getElementById('status');
const outputEl = document.getElementById('output');
const targetTabsEl = document.getElementById('target-tabs');
const runnerUrlInput = document.getElementById('runner-url');
const runnerStatusEl = document.getElementById('runner-status');
const refreshTabsButton = document.querySelector('button[data-role="refresh-tabs"]');
const buttons = [...document.querySelectorAll('button[data-action]')];
let selectedTargetTabId = null;
let runnerPollTimer = null;

const TASK_BUILDERS = {
  read_route_contract: () => ({
    platform: 'boss',
    action: 'read_route_contract',
  }),
  read_job_cards: () => ({
    platform: 'boss',
    action: 'read_job_cards',
    limit: 50,
  }),
  read_job_detail: () => ({
    platform: 'boss',
    action: 'read_job_detail',
    useCurrentVisibleDetail: true,
  }),
};

function setBusy(busy) {
  for (const button of buttons) button.disabled = busy;
  refreshTabsButton.disabled = busy;
}

function render(value) {
  outputEl.textContent = JSON.stringify(value, null, 2);
}

function renderRunnerStatus(status) {
  if (!status) {
    runnerStatusEl.textContent = 'Waiting for runner';
    return;
  }
  const state = status.connected ? 'Connected' : 'Waiting for runner';
  const suffix = status.lastError && status.connected ? ` · ${status.lastError}` : '';
  runnerStatusEl.textContent = `${state} · handled ${status.handledTasks || 0}${suffix}`;
}

function renderTabs(tabs) {
  targetTabsEl.textContent = '';
  if (!tabs?.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No Boss tabs';
    targetTabsEl.append(empty);
    return;
  }

  for (const tab of tabs) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = tab.id === selectedTargetTabId ? 'tab selected' : 'tab';
    button.dataset.tabId = String(tab.id);
    button.textContent = tab.title || tab.url;
    button.title = tab.url;
    button.addEventListener('click', () => {
      selectTargetTab(tab.id);
    });
    targetTabsEl.append(button);
  }
}

async function refreshTabs() {
  statusEl.textContent = 'Loading';
  try {
    const response = await chrome.runtime.sendMessage({ type: 'RECRUITMENT_RPA_LIST_TABS' });
    if (!response?.ok) throw new Error(response?.error || 'list_tabs_failed');
    if (response.selectedTargetTabId) selectedTargetTabId = response.selectedTargetTabId;
    renderTabs(response.tabs || []);
    statusEl.textContent = response.tabs?.length ? `Ready${response.selectionSource ? ` · ${response.selectionSource}` : ''}` : 'No Boss tabs';
    return response.tabs || [];
  } catch (error) {
    statusEl.textContent = 'Failed';
    render({ ok: false, error: error.message });
    return [];
  }
}

async function selectTargetTab(targetTabId) {
  statusEl.textContent = 'Selecting';
  setBusy(true);
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'RECRUITMENT_RPA_SET_TARGET_TAB',
      targetTabId,
    });
    if (!response?.ok) throw new Error(response?.error || 'set_target_tab_failed');
    selectedTargetTabId = response.tab.id;
    statusEl.textContent = 'Selected';
    render(response);
    await refreshTabs();
  } catch (error) {
    statusEl.textContent = 'Failed';
    render({ ok: false, error: error.message });
  } finally {
    setBusy(false);
  }
}

async function autoConnectRunner() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'RECRUITMENT_RPA_AUTOCONNECT_RUNNER',
      runnerUrl: runnerUrlInput.value,
    });
    if (!response?.ok) throw new Error(response?.error || 'connect_runner_failed');
    renderRunnerStatus(response.status);
  } catch (error) {
    renderRunnerStatus({ connected: false, handledTasks: 0, lastError: error.message });
  }
}

async function refreshRunnerStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'RECRUITMENT_RPA_RUNNER_STATUS' });
    if (response?.ok) renderRunnerStatus(response.status);
  } catch {
    renderRunnerStatus(null);
  }
}

async function runAction(action) {
  const buildTask = TASK_BUILDERS[action];
  if (!buildTask) throw new Error(`unsupported_popup_action:${action}`);

  statusEl.textContent = 'Running';
  setBusy(true);
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'RECRUITMENT_RPA_DISPATCH',
      task: buildTask(),
      targetTabId: selectedTargetTabId,
    });
    statusEl.textContent = response?.ok ? 'OK' : 'Failed';
    if (!response?.ok && response?.candidates?.length) renderTabs(response.candidates);
    render(response || { ok: false, error: 'empty_response' });
  } catch (error) {
    statusEl.textContent = 'Failed';
    render({ ok: false, error: error.message });
  } finally {
    setBusy(false);
  }
}

refreshTabsButton.addEventListener('click', () => {
  refreshTabs();
});

runnerUrlInput.addEventListener('change', () => {
  autoConnectRunner();
});

for (const button of buttons) {
  button.addEventListener('click', () => {
    runAction(button.dataset.action);
  });
}

refreshTabs();
autoConnectRunner();
runnerPollTimer = setInterval(() => {
  autoConnectRunner();
}, 1500);
window.addEventListener('unload', () => {
  if (runnerPollTimer) clearInterval(runnerPollTimer);
});
