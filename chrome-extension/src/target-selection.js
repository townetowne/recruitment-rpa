export const SUPPORTED_HOSTS = Object.freeze([
  'www.zhipin.com',
]);

const SUPPORTED_HOST_SET = new Set(SUPPORTED_HOSTS);

export function getSupportedRecruitmentHost(urlValue) {
  if (!urlValue || typeof urlValue !== 'string') return null;

  try {
    const url = new URL(urlValue);
    return SUPPORTED_HOST_SET.has(url.hostname) ? url.hostname : null;
  } catch {
    return null;
  }
}

export function isSupportedRecruitmentTab(tab) {
  return Boolean(tab?.id && getSupportedRecruitmentHost(tab.url));
}

export function isBossJobListTab(tab) {
  if (!isSupportedRecruitmentTab(tab)) return false;

  try {
    const url = new URL(tab.url);
    return url.hostname === 'www.zhipin.com' && url.pathname === '/web/geek/jobs';
  } catch {
    return false;
  }
}

export function summarizeRecruitmentTab(tab) {
  return {
    id: tab.id,
    windowId: tab.windowId,
    active: Boolean(tab.active),
    host: getSupportedRecruitmentHost(tab.url),
    title: tab.title || '',
    url: tab.url || '',
  };
}

function selectUniqueJobRouteTab(supportedTabs) {
  const jobRouteTabs = supportedTabs.filter(isBossJobListTab);
  return jobRouteTabs.length === 1 ? jobRouteTabs[0] : null;
}

export function selectDefaultTargetTab({ activeTabs = [], supportedTabs = [], storedTargetTabId = null } = {}) {
  const supported = supportedTabs.filter(isSupportedRecruitmentTab);
  const activeSupported = activeTabs.find(isSupportedRecruitmentTab);

  if (storedTargetTabId !== null && storedTargetTabId !== undefined && storedTargetTabId !== '') {
    const numericStoredTargetTabId = Number(storedTargetTabId);
    const stored = supported.find((tab) => tab.id === numericStoredTargetTabId);
    if (stored) return { ok: true, tab: stored, source: 'stored' };
  }

  if (activeSupported) return { ok: true, tab: activeSupported, source: 'active' };
  if (supported.length === 1) return { ok: true, tab: supported[0], source: 'unique' };

  const uniqueJobRouteTab = selectUniqueJobRouteTab(supported);
  if (uniqueJobRouteTab) return { ok: true, tab: uniqueJobRouteTab, source: 'unique_job_route' };

  if (supported.length > 1) {
    return {
      ok: false,
      error: 'target_tab_required',
      candidates: supported.map(summarizeRecruitmentTab),
    };
  }

  return {
    ok: false,
    error: 'supported_tab_required',
    candidates: [],
  };
}

export function selectDispatchTab({ activeTabs = [], supportedTabs = [], targetTabId = null } = {}) {
  const supported = supportedTabs.filter(isSupportedRecruitmentTab);
  const activeSupported = activeTabs.find(isSupportedRecruitmentTab);

  if (targetTabId !== null && targetTabId !== undefined && targetTabId !== '') {
    const numericTargetTabId = Number(targetTabId);
    const target = supported.find((tab) => tab.id === numericTargetTabId);
    if (!target) {
      if (activeSupported) {
        return { ok: true, tab: activeSupported, recoveredFromStaleTarget: true };
      }
      if (supported.length === 1) {
        return { ok: true, tab: supported[0], recoveredFromStaleTarget: true };
      }
      const uniqueJobRouteTab = selectUniqueJobRouteTab(supported);
      if (uniqueJobRouteTab) {
        return {
          ok: true,
          tab: uniqueJobRouteTab,
          recoveredFromStaleTarget: true,
          source: 'unique_job_route',
        };
      }
      return {
        ok: false,
        error: supported.length > 1 ? 'target_tab_required' : `target_tab_not_supported:${targetTabId}`,
        candidates: supported.map(summarizeRecruitmentTab),
      };
    }
    return { ok: true, tab: target };
  }

  if (activeSupported) return { ok: true, tab: activeSupported };

  if (supported.length === 1) return { ok: true, tab: supported[0] };

  const uniqueJobRouteTab = selectUniqueJobRouteTab(supported);
  if (uniqueJobRouteTab) return { ok: true, tab: uniqueJobRouteTab, source: 'unique_job_route' };

  if (supported.length > 1) {
    return {
      ok: false,
      error: 'target_tab_required',
      candidates: supported.map(summarizeRecruitmentTab),
    };
  }

  return {
    ok: false,
    error: 'supported_tab_required',
    candidates: [],
  };
}
