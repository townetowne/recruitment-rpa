import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const projectRoot = new URL('..', import.meta.url);

function readProjectFile(...segments) {
  return readFileSync(join(projectRoot.pathname, ...segments), 'utf8');
}

test('manifest exposes an extension popup for manual canary checks', () => {
  const manifest = JSON.parse(readProjectFile('chrome-extension', 'manifest.json'));

  assert.equal(manifest.action.default_popup, 'popup/popup.html');
  assert.equal(manifest.action.default_title, 'Genesis Recruitment RPA');
});

test('popup exposes only Boss canary actions', () => {
  const html = readProjectFile('chrome-extension', 'popup', 'popup.html');
  const js = readProjectFile('chrome-extension', 'popup', 'popup.js');

  assert.match(html, /id="target-tabs"/);
  assert.match(html, /id="runner-url"/);
  assert.doesNotMatch(html, /data-role="connect-runner"/);
  assert.doesNotMatch(html, />\s*Connect\s*</);
  assert.match(html, /data-role="refresh-tabs"/);
  assert.match(html, /data-action="read_route_contract"/);
  assert.match(html, /data-action="read_job_cards"/);
  assert.match(html, /data-action="read_job_detail"/);
  assert.doesNotMatch(`${html}\n${js}`, /screenshot|screen_ocr|coordinate|dom_cua|visual_snapshot|os_pointer/i);
});

test('popup dispatches tasks through the owned extension background only', () => {
  const js = readProjectFile('chrome-extension', 'popup', 'popup.js');

  assert.match(js, /RECRUITMENT_RPA_DISPATCH/);
  assert.match(js, /RECRUITMENT_RPA_LIST_TABS/);
  assert.match(js, /RECRUITMENT_RPA_SET_TARGET_TAB/);
  assert.match(js, /RECRUITMENT_RPA_AUTOCONNECT_RUNNER/);
  assert.match(js, /chrome\.runtime\.sendMessage/);
  assert.doesNotMatch(js, /fetch\(|XMLHttpRequest|chrome\.tabs\.executeScript|chrome\.scripting\.executeScript/);
});

test('popup auto-connects to the local runner without a manual connect control', () => {
  const js = readProjectFile('chrome-extension', 'popup', 'popup.js');

  assert.match(js, /autoConnectRunner/);
  assert.match(js, /RECRUITMENT_RPA_AUTOCONNECT_RUNNER/);
  assert.match(js, /setInterval\(\(\) => \{\s*autoConnectRunner\(\);/s);
  assert.doesNotMatch(js, /querySelector\('button\[data-role="connect-runner"\]'\)/);
  assert.doesNotMatch(js, /addEventListener\('click', \(\) => \{\s*connectRunner\(\);/s);
});

test('popup adopts the background-selected Boss target tab on refresh', () => {
  const js = readProjectFile('chrome-extension', 'popup', 'popup.js');

  assert.match(js, /response\.selectedTargetTabId/);
  assert.match(js, /selectedTargetTabId = response\.selectedTargetTabId/);
  assert.match(js, /selectionSource/);
});

test('popup exposes an explicit unpacked-extension reload hook for local canary runs', () => {
  const js = readProjectFile('chrome-extension', 'popup', 'popup.js');

  assert.match(js, /URLSearchParams/);
  assert.match(js, /genesisReload/);
  assert.match(js, /chrome\.runtime\.reload/);
});

test('extension exposes a dedicated local reload page for stale popup contexts', () => {
  const html = readProjectFile('chrome-extension', 'popup', 'reload.html');
  const js = readProjectFile('chrome-extension', 'popup', 'reload.js');

  assert.match(html, /reload\.js/);
  assert.match(js, /chrome\.runtime\.reload/);
  assert.doesNotMatch(`${html}\n${js}`, /fetch\(|XMLHttpRequest|chrome\.tabs\.executeScript|chrome\.scripting\.executeScript/);
});
