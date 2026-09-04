(function () {
  const GENESIS_RECRUITMENT_RPA_INJECTED_VERSION = '0.1.17';
  const PAGE_FETCH_MESSAGE = 'RECRUITMENT_RPA_PAGE_FETCH_V0_1_17';
  const PAGE_FETCH_RESULT_MESSAGE = 'RECRUITMENT_RPA_PAGE_FETCH_RESULT_V0_1_17';
  const PAGE_EXTRACT_BOSS_JOBS_MESSAGE = 'RECRUITMENT_RPA_PAGE_EXTRACT_BOSS_JOBS_V0_1_17';
  const PAGE_EXTRACT_BOSS_JOBS_RESULT_MESSAGE = 'RECRUITMENT_RPA_PAGE_EXTRACT_BOSS_JOBS_RESULT_V0_1_17';
  const PAGE_DIAGNOSTICS_MESSAGE = 'RECRUITMENT_RPA_PAGE_DIAGNOSTICS_V0_1_17';
  const PAGE_DIAGNOSTICS_RESULT_MESSAGE = 'RECRUITMENT_RPA_PAGE_DIAGNOSTICS_RESULT_V0_1_17';

  if (window.__genesisRecruitmentRpaInjectedVersion === GENESIS_RECRUITMENT_RPA_INJECTED_VERSION) {
    return;
  }
  window.__genesisRecruitmentRpaInjected = true;
  window.__genesisRecruitmentRpaInjectedVersion = GENESIS_RECRUITMENT_RPA_INJECTED_VERSION;

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function inferBossContactState(value) {
    const contactText = cleanText(Array.isArray(value) ? value.join(' ') : value).slice(0, 120);
    if (/停止招聘|停止招募|职位关闭|职位已关闭|招聘已结束|岗位已下线|职位已下线|已下架|暂停招聘/.test(contactText)) {
      return {
        contactState: 'closed_or_stopped',
        canChat: false,
        alreadyContacted: false,
        closedOrStopped: true,
        contactText,
      };
    }
    if (/继续沟通|已沟通|沟通过|查看沟通|进入沟通|沟通中/.test(contactText)) {
      return {
        contactState: 'already_contacted',
        canChat: false,
        alreadyContacted: true,
        closedOrStopped: false,
        contactText,
      };
    }
    if (/立即沟通|立即联系|打招呼|开聊|马上沟通/.test(contactText)) {
      return {
        contactState: 'can_chat',
        canChat: true,
        alreadyContacted: false,
        closedOrStopped: false,
        contactText,
      };
    }
    return {
      contactState: 'unknown',
      canChat: false,
      alreadyContacted: false,
      closedOrStopped: false,
      contactText,
    };
  }

  function readBossContactStateFromRoot(root) {
    const controlTexts = [...root.querySelectorAll('button, a, [role="button"], [class*="btn"], [class*="op"]')]
      .map((node) => cleanText(node.textContent))
      .filter(Boolean);
    const controlText = controlTexts.find((text) => /停止招聘|停止招募|职位关闭|职位已关闭|招聘已结束|岗位已下线|职位已下线|已下架|暂停招聘|继续沟通|已沟通|沟通过|查看沟通|进入沟通|沟通中|立即沟通|立即联系|打招呼|开聊|马上沟通/.test(text));
    if (controlText) return inferBossContactState(controlText);

    const bodyText = cleanText(root.textContent);
    if (/停止招聘|停止招募|职位关闭|职位已关闭|招聘已结束|岗位已下线|职位已下线|已下架|暂停招聘/.test(bodyText)) {
      return inferBossContactState(bodyText.match(/停止招聘|停止招募|职位关闭|职位已关闭|招聘已结束|岗位已下线|职位已下线|已下架|暂停招聘/)?.[0] || '');
    }

    return inferBossContactState('');
  }

  function keyFromUrl(url) {
    const match = String(url || '').match(/\/job_detail\/([^/?#]+)/);
    return match ? `boss:${match[1]}` : '';
  }

  function valueAtPath(source, path) {
    return path.reduce((current, segment) => {
      if (!current || typeof current !== 'object') return undefined;
      return current[segment];
    }, source);
  }

  function firstValue(sources, paths) {
    for (const source of sources) {
      if (!source || typeof source !== 'object') continue;
      for (const path of paths) {
        const value = valueAtPath(source, path);
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
    }
    return '';
  }

  function vueRecordCandidates(vue) {
    if (!vue || typeof vue !== 'object') return [];
    return [
      vue.data,
      vue.item,
      vue.job,
      vue.jobInfo,
      vue.$props?.data,
      vue.$props?.item,
      vue.$props?.job,
      vue.$attrs?.data,
      vue.$attrs?.item,
      vue.$data?.data,
      vue.$data?.item,
      vue.$data?.job,
      vue.$data?.jobInfo,
      vue.$vnode?.data?.attrs?.data,
      vue.$vnode?.data?.attrs?.item,
    ].filter(Boolean);
  }

  function collectPageRecords(root) {
    const records = [];
    let node = root;

    while (node) {
      records.push(...vueRecordCandidates(node.__vue__));
      records.push(...vueRecordCandidates(node.__vueParentComponent));
      node = node.parentElement;
    }

    return records;
  }

  function extractBossJobCardsFromPageContext({ limit = 50 } = {}) {
    const anchors = [...document.querySelectorAll('a[href*="/job_detail/"]')];
    const seen = new Set();
    const jobs = [];

    for (const anchor of anchors) {
      const absoluteUrl = new URL(anchor.getAttribute('href'), window.location.href);
      const jobKey = keyFromUrl(absoluteUrl.toString());
      if (!jobKey || seen.has(jobKey)) continue;

      const root =
        anchor.closest('[class*="job-card"], [class*="job-primary"], li') ||
        anchor;
      const records = collectPageRecords(root);
      const allText = cleanText(root.textContent);
      const salaryMatch = allText.match(/\d+\s*-\s*\d+\s*[Kk](?:·\d+薪)?|薪资面议|面议/);
      const cityMatch = allText.match(/武汉(?:·[\u4e00-\u9fa5A-Za-z0-9]+)?|北京|上海|深圳|广州|杭州|成都|南京|苏州|西安|长沙|全国/);
      const encryptJobId =
        cleanText(firstValue(records, [['encryptJobId'], ['encryptId'], ['jobInfo', 'encryptId']])) ||
        jobKey.replace(/^boss:/, '').replace(/\.html$/, '');
      const contact = readBossContactStateFromRoot(root);

      seen.add(jobKey);
      jobs.push({
        jobKey,
        url: absoluteUrl.toString(),
        title:
          cleanText(firstValue(records, [['jobName'], ['name'], ['title'], ['jobInfo', 'jobName']])) ||
          cleanText(anchor.textContent),
        company: cleanText(firstValue(records, [
          ['brandName'],
          ['companyName'],
          ['bossInfo', 'brandName'],
          ['brandComInfo', 'brandName'],
          ['jobInfo', 'brandName'],
        ])),
        salary: cleanText(firstValue(records, [['salaryDesc'], ['salary'], ['jobInfo', 'salaryDesc']])) || salaryMatch?.[0] || '',
        baseCity:
          cleanText(firstValue(records, [
            ['cityName'],
            ['locationName'],
            ['areaDistrict'],
            ['businessDistrict'],
            ['jobInfo', 'cityName'],
            ['jobInfo', 'locationName'],
          ])) || cityMatch?.[0] || '',
        securityId: cleanText(firstValue(records, [['securityId'], ['jobInfo', 'securityId']])) || absoluteUrl.searchParams.get('securityId') || '',
        lid: cleanText(firstValue(records, [['lid'], ['jobInfo', 'lid']])) || absoluteUrl.searchParams.get('lid') || '',
        encryptJobId,
        text: allText.slice(0, 500),
        ...contact,
      });

      if (jobs.length >= limit) break;
    }

    return { jobs };
  }

  function postResult({ type, requestId, ok, result, error }) {
    window.postMessage(
      {
        type,
        requestId,
        ok,
        result,
        error,
      },
      window.location.origin,
    );
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== PAGE_FETCH_MESSAGE) return;

    const { requestId, request } = event.data;
    try {
      const response = await window.fetch(request.url, {
        ...(request.options || {}),
        credentials: request.options?.credentials || 'include',
      });
      const contentType = response.headers.get('content-type') || '';
      const body = contentType.includes('application/json')
        ? await response.json()
        : await response.text();

      postResult({
        type: PAGE_FETCH_RESULT_MESSAGE,
        requestId,
        ok: true,
        result: {
          ok: response.ok,
          status: response.status,
          body,
        },
      });
    } catch (error) {
      postResult({
        type: PAGE_FETCH_RESULT_MESSAGE,
        requestId,
        ok: false,
        error: error.message,
      });
    }
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== PAGE_EXTRACT_BOSS_JOBS_MESSAGE) return;

    const { requestId, request } = event.data;
    try {
      postResult({
        type: PAGE_EXTRACT_BOSS_JOBS_RESULT_MESSAGE,
        requestId,
        ok: true,
        result: extractBossJobCardsFromPageContext(request || {}),
      });
    } catch (error) {
      postResult({
        type: PAGE_EXTRACT_BOSS_JOBS_RESULT_MESSAGE,
        requestId,
        ok: false,
        error: error.message,
      });
    }
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== PAGE_DIAGNOSTICS_MESSAGE) return;

    postResult({
      type: PAGE_DIAGNOSTICS_RESULT_MESSAGE,
      requestId: event.data.requestId,
      ok: true,
      result: {
        injectedVersion: GENESIS_RECRUITMENT_RPA_INJECTED_VERSION,
        hasFetch: typeof window.fetch === 'function',
      },
    });
  });
})();
