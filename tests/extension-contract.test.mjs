import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const projectRoot = new URL('..', import.meta.url);

function readProjectFile(...segments) {
  return readFileSync(join(projectRoot.pathname, ...segments), 'utf8');
}

test('Chrome extension manifest uses Boss-only host permissions for the current primary runtime', () => {
  const manifest = JSON.parse(readProjectFile('chrome-extension', 'manifest.json'));

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'Genesis Recruitment RPA');
  assert.equal(manifest.version, '0.1.16');
  assert.deepEqual(manifest.permissions, ['storage', 'scripting', 'alarms']);
  assert.deepEqual(manifest.host_permissions, [
    'https://www.zhipin.com/*',
    'http://127.0.0.1/*',
    'http://localhost/*',
  ]);
  assert.equal(manifest.background.type, 'module');
});

test('extension source contains no visual or coordinate automation vocabulary', () => {
  const files = [
    readProjectFile('chrome-extension', 'src', 'background.js'),
    readProjectFile('chrome-extension', 'src', 'content.js'),
    readProjectFile('chrome-extension', 'src', 'injected.js'),
    readProjectFile('chrome-extension', 'src', 'target-selection.js'),
  ].join('\n');

  assert.doesNotMatch(files, /\b(screenshot|screen_ocr|coordinate|mouse|dom_cua|visual_snapshot)\b/i);
});

test('extension content script delegates page-context fetch through injected bridge', () => {
  const content = readProjectFile('chrome-extension', 'src', 'content.js');
  const injected = readProjectFile('chrome-extension', 'src', 'injected.js');

  assert.match(content, /__genesisRecruitmentRpaContentReady/);
  assert.match(content, /function injectPageBridge/);
  assert.match(content, /function requestPageDiagnosticsWithBridgeRecovery/);
  assert.match(content, /readBossRuntimeDiagnostics/);
  assert.match(content, /await requestPageDiagnosticsWithBridgeRecovery\(\)/);
  assert.match(content, /catch \(_firstError\)/);
  assert.match(content, /injectPageBridge\(\)/);
  assert.match(content, /waitForBossJobCards/);
  assert.match(content, /function waitForBossJobDetail/);
  assert.match(content, /contentVersion/);
  assert.match(content, /protocolVersion/);
  assert.match(content, /boss-rpa-v0\.1\.16/);
  assert.match(content, /RECRUITMENT_RPA_EXECUTE/);
  assert.match(content, /RECRUITMENT_RPA_PAGE_FETCH/);
  assert.match(content, /RECRUITMENT_RPA_PAGE_EXTRACT_BOSS_JOBS/);
  assert.match(content, /read_job_cards/);
  assert.match(content, /read_job_detail/);
  assert.match(content, /readBossJobDetailFromApi/);
  assert.match(content, /await waitForBossJobDetail/);
  assert.match(content, /\/wapi\/zpgeek\/job\/detail\.json/);
  assert.match(content, /securityId/);
  assert.match(content, /postDescription/);
  assert.match(content, /DOMParser/);
  assert.match(content, /boss_detail_fetch_failed/);
  assert.match(injected, /window\.fetch/);
  assert.match(injected, /extractBossJobCardsFromPageContext/);
  assert.match(injected, /RECRUITMENT_RPA_PAGE_EXTRACT_BOSS_JOBS_RESULT/);
  assert.match(injected, /securityId/);
  assert.match(injected, /lid/);
  assert.match(injected, /RECRUITMENT_RPA_PAGE_FETCH_RESULT/);
});

test('extension extracts Boss contact state as structured detail evidence', () => {
  const content = readProjectFile('chrome-extension', 'src', 'content.js');
  const injected = readProjectFile('chrome-extension', 'src', 'injected.js');

  assert.match(content, /function inferBossContactState/);
  assert.match(content, /function readBossContactStateFromRoot/);
  assert.match(content, /contactState/);
  assert.match(content, /closed_or_stopped/);
  assert.match(content, /already_contacted/);
  assert.match(content, /can_chat/);
  assert.match(content, /contactText/);
  assert.match(content, /停止招聘/);
  assert.match(content, /继续沟通/);
  assert.match(content, /立即沟通/);
  assert.match(injected, /function inferBossContactState/);
  assert.match(injected, /contactState/);
});

test('extension reads Boss contact controls from the whole rendered detail page', () => {
  const content = readProjectFile('chrome-extension', 'src', 'content.js');

  assert.match(content, /const rootContact = readBossContactStateFromRoot\(root\)/);
  assert.match(content, /const pageContact = readBossContactStateFromRoot\(sourceRoot\.body \|\| sourceRoot\)/);
  assert.match(content, /pageContact\.contactState !== 'unknown' \? pageContact : rootContact/);
});

test('extension falls back to Boss detail HTML when API contact evidence is unavailable', () => {
  const content = readProjectFile('chrome-extension', 'src', 'content.js');

  assert.match(content, /function readBossJobDetailFromHtml/);
  assert.match(content, /apiDetail\.contactState === 'unknown'/);
  assert.match(content, /htmlDetail\.contactState !== 'unknown'/);
  assert.match(content, /apiDetailError/);
  assert.match(content, /boss_detail_fetch_failed/);
});

test('extension background can connect to the local runner only', () => {
  const background = readProjectFile('chrome-extension', 'src', 'background.js');

  assert.match(background, /selectDefaultTargetTab/);
  assert.match(background, /resolveDefaultTargetTab/);
  assert.match(background, /selectedTargetTabId/);
  assert.match(background, /selectionSource/);
  assert.match(background, /writeSelectedTargetTabId\(defaultSelection\.tab\.id\)/);
  assert.match(background, /RECRUITMENT_RPA_CONNECT_RUNNER/);
  assert.match(background, /RECRUITMENT_RPA_RUNNER_STATUS/);
  assert.match(background, /scheduleRunnerAutoconnect/);
  assert.match(background, /connectDefaultRunnerIfAvailable/);
  assert.match(background, /delayInMinutes/);
  assert.match(background, /chrome\.runtime\.onStartup\.addListener/);
  assert.match(background, /chrome\.runtime\.onInstalled\.addListener/);
  assert.match(background, /chrome\.alarms\.create/);
  assert.match(background, /chrome\.alarms\.onAlarm\.addListener/);
  assert.match(background, /ensureContentScript/);
  assert.match(background, /read_runtime_diagnostics/);
  assert.match(background, /task\.action === 'read_runtime_diagnostics' && task\.route/);
  assert.match(background, /await ensureBossSearchRoute\(task, selectedTargetTabId\)/);
  assert.match(background, /ensure_search_route/);
  assert.match(background, /ensureBossSearchRoute/);
  assert.match(background, /assertBossDetailRoute/);
  assert.match(background, /isBossDetailRouteMatch/);
  assert.match(background, /waitForTabDetailRoute/);
  assert.match(background, /ensureBossDetailRoute/);
  assert.match(background, /function withTimeout/);
  assert.match(background, /dispatchTaskWithTimeout/);
  assert.match(background, /_dispatch_timeout/);
  assert.match(background, /routeNavigated/);
  assert.match(background, /chrome\.tabs\.update/);
  assert.match(background, /chrome\.tabs\.onUpdated\.addListener/);
  assert.match(background, /chrome\.scripting\.executeScript/);
  assert.match(background, /\/tasks\/next/);
  assert.match(background, /assertLocalRunnerUrl/);
  assert.match(background, /url\.protocol !== 'http:'/);
  assert.match(background, /LOCAL_RUNNER_HOSTS/);
  assert.doesNotMatch(background, /isBossSearchRouteMatch\(tab\?\.url, task\.route\) && tab\.status === 'complete'/);
  assert.doesNotMatch(background, /DEFAULT_RUNNER_URL = 'https:/);
});

test('extension background reinjects content script when the page has an older content version', () => {
  const background = readProjectFile('chrome-extension', 'src', 'background.js');
  const content = readProjectFile('chrome-extension', 'src', 'content.js');

  assert.match(background, /EXPECTED_CONTENT_VERSION = '0\.1\.16'/);
  assert.match(background, /EXECUTE_MESSAGE_TYPE = 'RECRUITMENT_RPA_EXECUTE_V0_1_16'/);
  assert.match(background, /__genesisRecruitmentRpaContentVersion/);
  assert.match(background, /ready && version === EXPECTED_CONTENT_VERSION/);
  assert.match(content, /__genesisRecruitmentRpaContentVersion/);
  assert.match(content, /'0\.1\.16'/);
  assert.match(content, /RECRUITMENT_RPA_EXECUTE_V0_1_16/);
});
