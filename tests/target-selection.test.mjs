import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isSupportedRecruitmentTab,
  selectDefaultTargetTab,
  selectDispatchTab,
  summarizeRecruitmentTab,
} from '../chrome-extension/src/target-selection.js';

test('recognizes only Boss tabs as supported recruitment tabs', () => {
  assert.equal(isSupportedRecruitmentTab({ id: 1, url: 'https://www.zhipin.com/web/geek/jobs' }), true);
  assert.equal(isSupportedRecruitmentTab({ id: 2, url: 'https://www.liepin.com/job/1.shtml' }), false);
  assert.equal(isSupportedRecruitmentTab({ id: 3, url: 'chrome://extensions/' }), false);
  assert.equal(isSupportedRecruitmentTab({ id: null, url: 'https://www.zhipin.com/web/geek/jobs' }), false);
});

test('selects an explicit supported target tab before the active tab', () => {
  const result = selectDispatchTab({
    activeTabs: [{ id: 1, url: 'https://www.zhipin.com/wuhan/' }],
    supportedTabs: [
      { id: 1, title: 'Boss home', url: 'https://www.zhipin.com/wuhan/' },
      { id: 2, title: 'Boss jobs', url: 'https://www.zhipin.com/web/geek/jobs' },
    ],
    targetTabId: 2,
  });

  assert.equal(result.ok, true);
  assert.equal(result.tab.id, 2);
});

test('recovers a stale explicit target id by selecting the active Boss tab', () => {
  const result = selectDispatchTab({
    activeTabs: [{ id: 3, url: 'https://www.zhipin.com/wuhan/' }],
    supportedTabs: [
      { id: 3, title: 'Boss home', url: 'https://www.zhipin.com/wuhan/' },
      { id: 4, title: 'Boss jobs', url: 'https://www.zhipin.com/web/geek/jobs' },
    ],
    targetTabId: 811245286,
  });

  assert.equal(result.ok, true);
  assert.equal(result.tab.id, 3);
  assert.equal(result.recoveredFromStaleTarget, true);
});

test('recovers a stale explicit target id when exactly one Boss tab exists', () => {
  const result = selectDispatchTab({
    activeTabs: [{ id: 9, url: 'chrome-extension://abc/popup/popup.html' }],
    supportedTabs: [
      { id: 5, title: 'Boss jobs', url: 'https://www.zhipin.com/web/geek/jobs' },
    ],
    targetTabId: 811245286,
  });

  assert.equal(result.ok, true);
  assert.equal(result.tab.id, 5);
  assert.equal(result.recoveredFromStaleTarget, true);
});

test('requires an explicit target when multiple Boss tabs exist and no active Boss tab is selected', () => {
  const result = selectDispatchTab({
    activeTabs: [{ id: 9, url: 'chrome-extension://abc/popup/popup.html' }],
    supportedTabs: [
      { id: 1, title: 'Boss jobs A', url: 'https://www.zhipin.com/web/geek/jobs?query=AI&city=101200100' },
      { id: 2, title: 'Boss jobs B', url: 'https://www.zhipin.com/web/geek/jobs?query=Java&city=101200100' },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'target_tab_required');
  assert.deepEqual(result.candidates.map((tab) => tab.id), [1, 2]);
});

test('selects the only Boss job-list tab among multiple inactive Boss tabs', () => {
  const result = selectDispatchTab({
    activeTabs: [{ id: 9, url: 'chrome-extension://abc/popup/popup.html' }],
    supportedTabs: [
      { id: 1, title: 'Boss chat', url: 'https://www.zhipin.com/web/geek/chat' },
      { id: 2, title: 'Boss jobs', url: 'https://www.zhipin.com/web/geek/jobs?query=AI&city=101200100' },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.tab.id, 2);
  assert.equal(result.source, 'unique_job_route');
});

test('default target selection preserves a valid stored Boss tab', () => {
  const result = selectDefaultTargetTab({
    activeTabs: [{ id: 9, url: 'chrome-extension://abc/popup/popup.html' }],
    supportedTabs: [
      { id: 1, title: 'Boss home', url: 'https://www.zhipin.com/wuhan/' },
      { id: 2, title: 'Boss jobs', url: 'https://www.zhipin.com/web/geek/jobs' },
    ],
    storedTargetTabId: 2,
  });

  assert.equal(result.ok, true);
  assert.equal(result.tab.id, 2);
  assert.equal(result.source, 'stored');
});

test('default target selection safely binds the active Boss tab before a unique fallback', () => {
  const result = selectDefaultTargetTab({
    activeTabs: [{ id: 1, title: 'Boss active', url: 'https://www.zhipin.com/web/geek/jobs' }],
    supportedTabs: [
      { id: 1, title: 'Boss active', url: 'https://www.zhipin.com/web/geek/jobs' },
      { id: 2, title: 'Boss other', url: 'https://www.zhipin.com/wuhan/' },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.tab.id, 1);
  assert.equal(result.source, 'active');
});

test('default target selection uses the only Boss tab without requiring a click', () => {
  const result = selectDefaultTargetTab({
    activeTabs: [{ id: 9, url: 'chrome-extension://abc/popup/popup.html' }],
    supportedTabs: [
      { id: 2, title: 'Boss jobs', url: 'https://www.zhipin.com/web/geek/jobs' },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.tab.id, 2);
  assert.equal(result.source, 'unique');
});

test('default target selection uses the only inactive Boss job-list tab', () => {
  const result = selectDefaultTargetTab({
    activeTabs: [{ id: 9, url: 'chrome-extension://abc/popup/popup.html' }],
    supportedTabs: [
      { id: 1, title: 'Boss chat', url: 'https://www.zhipin.com/web/geek/chat' },
      { id: 2, title: 'Boss jobs', url: 'https://www.zhipin.com/web/geek/jobs?query=AI&city=101200100' },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.tab.id, 2);
  assert.equal(result.source, 'unique_job_route');
});

test('default target selection does not guess among multiple inactive Boss job-list tabs', () => {
  const result = selectDefaultTargetTab({
    activeTabs: [{ id: 9, url: 'chrome-extension://abc/popup/popup.html' }],
    supportedTabs: [
      { id: 1, title: 'Boss jobs A', url: 'https://www.zhipin.com/web/geek/jobs?query=AI&city=101200100' },
      { id: 2, title: 'Boss jobs B', url: 'https://www.zhipin.com/web/geek/jobs?query=Java&city=101200100' },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'target_tab_required');
  assert.deepEqual(result.candidates.map((tab) => tab.id), [1, 2]);
});

test('summarizes candidate tabs without page contents', () => {
  assert.deepEqual(
    summarizeRecruitmentTab({
      id: 7,
      windowId: 3,
      active: false,
      title: 'Boss jobs',
      url: 'https://www.zhipin.com/web/geek/jobs',
    }),
    {
      id: 7,
      windowId: 3,
      active: false,
      host: 'www.zhipin.com',
      title: 'Boss jobs',
      url: 'https://www.zhipin.com/web/geek/jobs',
    },
  );
});
