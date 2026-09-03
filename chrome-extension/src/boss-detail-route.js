function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function bossJobKeyFromDetailUrl(urlValue) {
  const match = String(urlValue || '').match(/\/job_detail\/([^/?#]+)/);
  return match ? `boss:${match[1]}` : '';
}

export function normalizeBossDetailRoute(route = {}) {
  const rawUrl = text(route.url);
  if (!rawUrl) throw new Error('boss_detail_url_required');

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('unsupported_boss_detail_route');
  }

  if (url.hostname !== 'www.zhipin.com' || !url.pathname.startsWith('/job_detail/')) {
    throw new Error('unsupported_boss_detail_route');
  }
  if (route.path && route.path !== url.pathname) {
    throw new Error('unsupported_boss_detail_route');
  }

  return {
    host: url.hostname,
    path: url.pathname,
    jobKey: text(route.jobKey) || bossJobKeyFromDetailUrl(url.toString()),
    url: url.toString(),
  };
}

export function createCurrentBossDetailRoute(tab, task = {}) {
  try {
    return normalizeBossDetailRoute({
      url: tab?.url,
      jobKey: task.jobKey,
    });
  } catch (error) {
    if (error.message === 'boss_detail_url_required' || error.message === 'unsupported_boss_detail_route') {
      throw new Error('boss_current_detail_route_required');
    }
    throw error;
  }
}

export function shouldReadCurrentVisibleBossDetail(task = {}) {
  return (
    task.platform === 'boss' &&
    task.action === 'read_job_detail' &&
    task.useCurrentVisibleDetail === true &&
    !text(task.url) &&
    !task.route
  );
}

export function isBossDetailRouteMatch(urlValue, route) {
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
