const GENESIS_RECRUITMENT_RPA_CONTENT_VERSION = '0.1.17';
const GENESIS_RECRUITMENT_RPA_PROTOCOL_VERSION = 'boss-rpa-v0.1.17';
const GENESIS_RECRUITMENT_RPA_EXECUTE_MESSAGE = 'RECRUITMENT_RPA_EXECUTE_V0_1_17';
const PAGE_FETCH_MESSAGE = 'RECRUITMENT_RPA_PAGE_FETCH_V0_1_17';
const PAGE_FETCH_RESULT_MESSAGE = 'RECRUITMENT_RPA_PAGE_FETCH_RESULT_V0_1_17';
const PAGE_EXTRACT_BOSS_JOBS_MESSAGE = 'RECRUITMENT_RPA_PAGE_EXTRACT_BOSS_JOBS_V0_1_17';
const PAGE_EXTRACT_BOSS_JOBS_RESULT_MESSAGE = 'RECRUITMENT_RPA_PAGE_EXTRACT_BOSS_JOBS_RESULT_V0_1_17';
const PAGE_DIAGNOSTICS_MESSAGE = 'RECRUITMENT_RPA_PAGE_DIAGNOSTICS_V0_1_17';
const PAGE_DIAGNOSTICS_RESULT_MESSAGE = 'RECRUITMENT_RPA_PAGE_DIAGNOSTICS_RESULT_V0_1_17';

if (globalThis.__genesisRecruitmentRpaContentVersion !== GENESIS_RECRUITMENT_RPA_CONTENT_VERSION) {
  globalThis.__genesisRecruitmentRpaContentReady = true;
  globalThis.__genesisRecruitmentRpaContentVersion = GENESIS_RECRUITMENT_RPA_CONTENT_VERSION;

  function injectPageBridge() {
    const injectedUrl = chrome.runtime.getURL('src/injected.js');
    const script = document.createElement('script');
    script.src = injectedUrl;
    script.async = false;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }

  injectPageBridge();

  function requestPageMessage({ messageType, resultType, payload = {}, timeoutMs = 15000, timeoutError }) {
    const requestId = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        window.removeEventListener('message', onMessage);
        reject(new Error(timeoutError));
      }, timeoutMs);

      function onMessage(event) {
        if (event.source !== window) return;
        if (event.data?.type !== resultType) return;
        if (event.data.requestId !== requestId) return;

        clearTimeout(timeoutId);
        window.removeEventListener('message', onMessage);

        if (event.data.ok) {
          resolve(event.data.result);
        } else {
          reject(new Error(event.data.error || timeoutError));
        }
      }

      window.addEventListener('message', onMessage);
      window.postMessage(
        {
          type: messageType,
          requestId,
          ...payload,
        },
        window.location.origin,
      );
    });
  }

  function requestPageFetch(request) {
    return requestPageMessage({
      messageType: PAGE_FETCH_MESSAGE,
      resultType: PAGE_FETCH_RESULT_MESSAGE,
      timeoutMs: request.timeoutMs || 15000,
      timeoutError: 'page_fetch_timeout',
      payload: {
        request: {
          url: request.url,
          options: request.options || {},
        },
      },
    });
  }

  function requestBossJobCards({ limit }) {
    return requestPageMessage({
      messageType: PAGE_EXTRACT_BOSS_JOBS_MESSAGE,
      resultType: PAGE_EXTRACT_BOSS_JOBS_RESULT_MESSAGE,
      timeoutMs: 15000,
      timeoutError: 'boss_job_card_extract_timeout',
      payload: {
        request: { limit },
      },
    });
  }

  function requestPageDiagnostics() {
    return requestPageMessage({
      messageType: PAGE_DIAGNOSTICS_MESSAGE,
      resultType: PAGE_DIAGNOSTICS_RESULT_MESSAGE,
      timeoutMs: 3000,
      timeoutError: 'page_diagnostics_timeout',
    });
  }

  async function requestPageDiagnosticsWithBridgeRecovery() {
    try {
      return await requestPageDiagnostics();
    } catch (_firstError) {
      injectPageBridge();
      return requestPageDiagnostics();
    }
  }

  async function readBossRuntimeDiagnostics() {
    const pageBridge = await requestPageDiagnosticsWithBridgeRecovery().catch((error) => ({
      injectedVersion: '',
      error: error.message,
    }));

    return {
      ok: true,
      contentVersion: GENESIS_RECRUITMENT_RPA_CONTENT_VERSION,
      protocolVersion: GENESIS_RECRUITMENT_RPA_PROTOCOL_VERSION,
      executeMessageType: GENESIS_RECRUITMENT_RPA_EXECUTE_MESSAGE,
      pageBridgeVersion: pageBridge.injectedVersion || '',
      pageBridgeOk: !pageBridge.error,
      pageBridgeError: pageBridge.error || '',
      host: window.location.hostname,
      path: window.location.pathname,
      hasJobCards: document.querySelectorAll('[class*="job-card"], [class*="job-list"]').length > 0,
      hasChatThreads: document.querySelectorAll('[class*="chat"], [class*="friend"], [class*="conversation"]').length > 0,
    };
  }

  function readBossRouteContract() {
    return {
      host: window.location.hostname,
      path: window.location.pathname,
      hasJobCards: document.querySelectorAll('[class*="job-card"], [class*="job-list"]').length > 0,
      hasChatThreads: document.querySelectorAll('[class*="chat"], [class*="friend"], [class*="conversation"]').length > 0,
      hasChatEditor: document.querySelectorAll('textarea, [contenteditable="true"]').length > 0,
    };
  }

  function waitForBossJobCards({ timeoutMs = 10000 } = {}) {
    if (document.querySelector('[class*="job-card"], [class*="job-list"]')) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        observer.disconnect();
        resolve(false);
      }, timeoutMs);

      const observer = new MutationObserver(() => {
        if (!document.querySelector('[class*="job-card"], [class*="job-list"]')) return;
        clearTimeout(timeoutId);
        observer.disconnect();
        resolve(true);
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    });
  }

  function waitForBossJobDetail({ timeoutMs = 10000 } = {}) {
    if (document.querySelector('[class*="job-detail"], [class*="job-sec"], [class*="job-name"], h1')) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        observer.disconnect();
        resolve(false);
      }, timeoutMs);

      const observer = new MutationObserver(() => {
        if (!document.querySelector('[class*="job-detail"], [class*="job-sec"], [class*="job-name"], h1')) return;
        clearTimeout(timeoutId);
        observer.disconnect();
        resolve(true);
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    });
  }

  function waitForBossChatThreads({ timeoutMs = 10000 } = {}) {
    if (document.querySelector('[class*="chat"], [class*="friend"], [class*="conversation"]')) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        observer.disconnect();
        resolve(false);
      }, timeoutMs);

      const observer = new MutationObserver(() => {
        if (!document.querySelector('[class*="chat"], [class*="friend"], [class*="conversation"]')) return;
        clearTimeout(timeoutId);
        observer.disconnect();
        resolve(true);
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    });
  }

  async function readBossRouteContractAfterRender() {
    if (window.location.pathname === '/web/geek/jobs') {
      await waitForBossJobCards();
    }
    if (window.location.pathname === '/web/geek/chat') {
      await waitForBossChatThreads();
    }
    return readBossRouteContract();
  }

  function textOf(root, selectors) {
    for (const selector of selectors) {
      const value = root.querySelector(selector)?.textContent?.trim();
      if (value) return value;
    }
    return '';
  }

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
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
      vue.friend,
      vue.chat,
      vue.conversation,
      vue.job,
      vue.jobInfo,
      vue.bossInfo,
      vue.$props?.data,
      vue.$props?.item,
      vue.$props?.friend,
      vue.$props?.chat,
      vue.$props?.conversation,
      vue.$data?.data,
      vue.$data?.item,
      vue.$data?.friend,
      vue.$data?.chat,
      vue.$data?.conversation,
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

  function htmlToText(value) {
    const normalized = String(value || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|section|h[1-6])>/gi, '\n');
    const parsed = new DOMParser().parseFromString(normalized, 'text/html');
    return cleanText(parsed.body?.textContent || normalized);
  }

  function keyFromUrl(url) {
    const match = String(url || '').match(/\/job_detail\/([^/?#]+)/);
    return match ? `boss:${match[1]}` : '';
  }

  function assertBossDetailUrl(value) {
    const url = new URL(value, window.location.href);
    if (url.hostname !== 'www.zhipin.com' || !url.pathname.startsWith('/job_detail/')) {
      throw new Error(`unsupported_boss_detail_url:${value}`);
    }
    return url.toString();
  }

  function bodyAsJson(response, errorCode) {
    if (response?.body && typeof response.body === 'object') return response.body;
    if (typeof response?.body !== 'string') throw new Error(errorCode);
    try {
      return JSON.parse(response.body);
    } catch (_error) {
      throw new Error(errorCode);
    }
  }

  function readBossJobCardsFromDom({ limit = 50 } = {}) {
    const anchors = [...document.querySelectorAll('a[href*="/job_detail/"]')];
    const seen = new Set();
    const jobs = [];

    for (const anchor of anchors) {
      const url = new URL(anchor.getAttribute('href'), window.location.href).toString();
      const jobKey = keyFromUrl(url);
      if (!jobKey || seen.has(jobKey)) continue;

      const root =
        anchor.closest('[class*="job-card"], [class*="job-primary"], li') ||
        anchor;
      const allText = cleanText(root.textContent);
      const title = cleanText(anchor.textContent) || textOf(root, ['[class*="job-name"]', '[class*="title"]']);
      const company = textOf(root, ['[class*="company-name"]', '[class*="company"]']);
      const salaryMatch = allText.match(/\d+\s*-\s*\d+\s*[Kk](?:·\d+薪)?|薪资面议|面议/);
      const cityMatch = allText.match(/武汉(?:·[\u4e00-\u9fa5A-Za-z0-9]+)?|北京|上海|深圳|广州|杭州|成都|南京|苏州|西安|长沙|全国/);
      const link = new URL(url);
      const contact = readBossContactStateFromRoot(root);

      seen.add(jobKey);
      jobs.push({
        jobKey,
        url,
        title,
        company,
        salary: salaryMatch?.[0] || '',
        baseCity: cityMatch?.[0] || '',
        securityId: link.searchParams.get('securityId') || '',
        lid: link.searchParams.get('lid') || '',
        encryptJobId: jobKey.replace(/^boss:/, '').replace(/\.html$/, ''),
        text: allText.slice(0, 500),
        ...contact,
      });

      if (jobs.length >= limit) break;
    }

    return { jobs };
  }

  async function readBossJobCards(task = {}) {
    const pageResult = await requestBossJobCards({ limit: task.limit || 50 }).catch(() => null);
    const pageJobs = Array.isArray(pageResult?.jobs) ? pageResult.jobs : [];
    if (pageJobs.length > 0) return { jobs: pageJobs.slice(0, task.limit || 50) };
    return readBossJobCardsFromDom(task);
  }

  function inferChatSpeakerFromText(value) {
    const text = cleanText(value);
    if (/我[:：]|我已|已发送|送达|已读|候选人|求职者/.test(text)) return 'me';
    if (/对方|招聘者|招聘方|HR|hr|Boss|boss|回复|发来|问/.test(text)) return 'recruiter';
    return 'unknown';
  }

  function readBossChatThreadRoots() {
    const roots = [];
    const seen = new Set();
    const containers = [
      ...document.querySelectorAll(
        '[class*="chat-list"], [class*="friend-list"], [class*="user-list"], [class*="conversation-list"], [class*="relation-list"]',
      ),
    ];
    const sourceContainers = containers.length > 0 ? containers : [document.body];

    for (const container of sourceContainers) {
      const candidates = [
        ...container.querySelectorAll(
          '[class*="chat-user"], [class*="chat-item"], [class*="friend-item"], [class*="conversation-item"], [class*="user-item"], li',
        ),
      ];
      for (const candidate of candidates) {
        const text = cleanText(candidate.textContent);
        if (text.length < 4 || text.length > 700) continue;
        if (candidate.querySelector('textarea, [contenteditable="true"]')) continue;
        if (seen.has(candidate)) continue;
        seen.add(candidate);
        roots.push(candidate);
      }
    }

    return roots;
  }

  function textFromSelectors(root, selectors) {
    for (const selector of selectors) {
      const value = cleanText(root.querySelector(selector)?.textContent || '');
      if (value) return value;
    }
    return '';
  }

  function extractChatTime(text) {
    return cleanText(
      text.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?/)?.[0] ||
        text.match(/(?:今天|昨天)?\s*\d{1,2}:\d{2}/)?.[0] ||
        text.match(/\d+\s*(?:分钟前|小时前)/)?.[0] ||
        text.match(/刚刚|刚才/)?.[0] ||
        '',
    );
  }

  function normalizeBossChatThread(root, index) {
    const records = collectPageRecords(root);
    const text = cleanText(root.textContent);
    const link = root.querySelector('a[href*="/web/geek/chat"], a[href*="/chat"]');
    const href = link ? new URL(link.getAttribute('href'), window.location.href).toString() : '';
    const company = cleanText(firstValue(records, [
      ['brandName'],
      ['companyName'],
      ['recruiterCompany'],
      ['bossInfo', 'brandName'],
      ['jobInfo', 'brandName'],
    ])) || textFromSelectors(root, [
      '[class*="company"]',
      '[class*="brand"]',
      '[class*="corp"]',
    ]);
    const title = cleanText(firstValue(records, [
      ['jobName'],
      ['jobTitle'],
      ['positionName'],
      ['jobInfo', 'jobName'],
      ['jobInfo', 'positionName'],
    ])) || textFromSelectors(root, [
      '[class*="job"]',
      '[class*="position"]',
      '[class*="title"]',
    ]);
    const lastMessage = cleanText(firstValue(records, [
      ['lastMessage'],
      ['lastMsg'],
      ['lastMsgContent'],
      ['message'],
      ['content'],
      ['summary'],
    ])) || textFromSelectors(root, [
      '[class*="last"]',
      '[class*="msg"]',
      '[class*="message"]',
      '[class*="desc"]',
    ]) || text;
    const lastMessageAt = cleanText(firstValue(records, [
      ['lastMessageAt'],
      ['lastMsgTime'],
      ['lastTime'],
      ['time'],
      ['updateTime'],
      ['updatedAt'],
    ])) || extractChatTime(text);
    const deliveryStatus = cleanText(firstValue(records, [
      ['deliveryStatus'],
      ['readStatus'],
      ['status'],
      ['statusText'],
    ])) || cleanText(text.match(/已读|送达|未读|新消息|对方已回复|已回复/)?.[0] || '');
    const lastSpeaker = cleanText(firstValue(records, [
      ['lastSpeaker'],
      ['sender'],
      ['senderType'],
      ['from'],
    ])) || inferChatSpeakerFromText(`${deliveryStatus} ${lastMessage}`);

    return {
      conversationKey: href || cleanText(firstValue(records, [
        ['friendId'],
        ['encryptBossId'],
        ['encryptGeekId'],
        ['conversationId'],
        ['id'],
      ])) || `boss-chat-visible-${index + 1}`,
      url: href,
      company,
      title,
      lastMessage: lastMessage.slice(0, 240),
      lastSpeaker,
      lastMessageAt,
      deliveryStatus,
      unread: /未读|新消息/.test(`${deliveryStatus} ${text}`),
      threadText: text.slice(0, 500),
    };
  }

  async function readBossChatThreads(task = {}) {
    if (window.location.hostname !== 'www.zhipin.com' || window.location.pathname !== '/web/geek/chat') {
      throw new Error('boss_chat_route_required');
    }
    await waitForBossChatThreads();
    const limit = Number(task.limit || 80);
    const roots = readBossChatThreadRoots();
    const seen = new Set();
    const threads = [];

    for (const [index, root] of roots.entries()) {
      const thread = normalizeBossChatThread(root, index);
      const identity = [thread.conversationKey, thread.company, thread.title, thread.lastMessage].join('|');
      if (seen.has(identity)) continue;
      seen.add(identity);
      threads.push(thread);
      if (threads.length >= limit) break;
    }

    return {
      coverage: {
        scope: 'loaded_chat_list',
        loadedCount: threads.length,
        partial: false,
      },
      threads,
    };
  }

  function readBossJobDetailFromRoot(sourceRoot, task, url) {
    const root =
      sourceRoot.querySelector('[class*="job-detail"], [class*="job-sec"], main') ||
      sourceRoot.body ||
      sourceRoot;
    const descriptionRoot =
      root.querySelector('[class*="job-sec-text"], [class*="job-detail-section"], [class*="detail-content"]') ||
      root;
    const rootContact = readBossContactStateFromRoot(root);
    const pageContact = readBossContactStateFromRoot(sourceRoot.body || sourceRoot);
    const contact = pageContact.contactState !== 'unknown' ? pageContact : rootContact;

    return {
      jobKey: task.jobKey || keyFromUrl(url),
      url,
      title: textOf(root, ['[class*="job-name"]', 'h1', '[class*="title"]']),
      company: textOf(root, ['[class*="company-name"]', '[class*="company"]']),
      salary: textOf(root, ['[class*="salary"]']),
      baseCity: textOf(root, ['[class*="location"]', '[class*="job-address"]']),
      description: cleanText(descriptionRoot.textContent),
      hrActive: textOf(root, ['[class*="active"]']),
      ...contact,
    };
  }

  function bossDetailApiUrl(task) {
    if (!task.securityId) return '';
    const apiUrl = new URL('/wapi/zpgeek/job/detail.json', window.location.origin);
    apiUrl.searchParams.set('securityId', task.securityId);
    if (task.lid) apiUrl.searchParams.set('lid', task.lid);
    return apiUrl.toString();
  }

  function pickFirstText(...values) {
    for (const value of values) {
      const text = cleanText(value);
      if (text) return text;
    }
    return '';
  }

  function firstBooleanValue(sources, paths) {
    for (const source of sources) {
      if (!source || typeof source !== 'object') continue;
      for (const path of paths) {
        const value = path.reduce((current, segment) => current?.[segment], source);
        if (typeof value === 'boolean') return value;
      }
    }
    return null;
  }

  function collectContactTextValues(value, output = []) {
    if (!value || output.length >= 120) return output;
    if (typeof value === 'string') {
      if (/停止招聘|停止招募|职位关闭|职位已关闭|招聘已结束|岗位已下线|职位已下线|已下架|暂停招聘|继续沟通|已沟通|沟通过|查看沟通|进入沟通|沟通中|立即沟通|立即联系|打招呼|开聊|马上沟通/.test(value)) {
        output.push(value);
      }
      return output;
    }
    if (Array.isArray(value)) {
      for (const item of value) collectContactTextValues(item, output);
      return output;
    }
    if (typeof value === 'object') {
      for (const item of Object.values(value)) collectContactTextValues(item, output);
    }
    return output;
  }

  function inferBossApiContactState({ data, jobInfo, bossInfo }) {
    const contactText = pickFirstText(
      jobInfo.chatBtnText,
      jobInfo.contactText,
      jobInfo.contactStatusText,
      jobInfo.contactStatusDesc,
      jobInfo.friendStatusText,
      jobInfo.friendStatusDesc,
      jobInfo.jobStatusDesc,
      jobInfo.statusDesc,
      bossInfo.chatBtnText,
      bossInfo.contactText,
      bossInfo.contactStatusText,
      data.chatBtnText,
      data.contactText,
      data.contactStatusText,
      data.contactStatusDesc,
      data.jobStatusDesc,
      collectContactTextValues(data).join(' '),
    );
    const byText = inferBossContactState(contactText);
    if (byText.contactState !== 'unknown') return byText;

    const canChat = firstBooleanValue([jobInfo, bossInfo, data], [
      ['canChat'],
      ['can_chat'],
      ['showChatBtn'],
      ['chatable'],
      ['canTalk'],
      ['canGreet'],
    ]);
    if (canChat === true) {
      return {
        contactState: 'can_chat',
        canChat: true,
        alreadyContacted: false,
        closedOrStopped: false,
        contactText: 'canChat:true',
      };
    }
    return byText;
  }

  function normalizeBossApiDetail({ body, task, requestedUrl }) {
    const data = body.zpData || body.data || {};
    const jobInfo = data.jobInfo || data.job || data;
    const brandInfo = data.brandComInfo || data.brandInfo || data.companyInfo || {};
    const bossInfo = data.bossInfo || {};
    const locationText = pickFirstText(
      jobInfo.locationName,
      jobInfo.cityName,
      [jobInfo.cityName, jobInfo.areaDistrict, jobInfo.businessDistrict].filter(Boolean).join('·'),
      jobInfo.address,
    );
    const description = htmlToText(
      jobInfo.postDescription ||
        jobInfo.description ||
        jobInfo.jobDescription ||
        data.postDescription ||
        data.description,
    );
    const contact = inferBossApiContactState({ data, jobInfo, bossInfo });

    return {
      jobKey: task.jobKey || keyFromUrl(requestedUrl),
      url: requestedUrl,
      title: pickFirstText(jobInfo.jobName, jobInfo.name, jobInfo.positionName),
      company: pickFirstText(brandInfo.brandName, brandInfo.companyName, brandInfo.name, bossInfo.brandName),
      salary: pickFirstText(jobInfo.salaryDesc, jobInfo.salary, jobInfo.salaryName),
      baseCity: locationText,
      description,
      hrActive: pickFirstText(bossInfo.activeTimeDesc, bossInfo.activeTime, bossInfo.lastLoginTime),
      securityId: task.securityId || '',
      lid: task.lid || '',
      encryptJobId: task.encryptJobId || jobInfo.encryptId || jobInfo.encryptJobId || '',
      ...contact,
    };
  }

  async function readBossJobDetailFromApi(task, requestedUrl) {
    const apiUrl = bossDetailApiUrl(task);
    if (!apiUrl) return null;

    const response = await requestPageFetch({
      url: apiUrl,
      options: {
        method: 'GET',
        credentials: 'include',
        headers: {
          accept: 'application/json, text/plain, */*',
        },
      },
      timeoutMs: task.timeoutMs || 20000,
    });
    if (!response?.ok) {
      throw new Error(`boss_detail_api_failed:${response?.status || 'unknown'}`);
    }

    const body = bodyAsJson(response, 'boss_detail_api_invalid_json');
    if (body.code !== 0 && body.code !== '0') {
      throw new Error(`boss_detail_api_rejected:${body.code ?? 'unknown'}`);
    }

    return normalizeBossApiDetail({ body, task, requestedUrl });
  }

  async function readBossJobDetailFromHtml(task, requestedUrl) {
    if (requestedUrl === window.location.href) {
      await waitForBossJobDetail();
      return readBossJobDetailFromRoot(document, task, requestedUrl);
    }

    const response = await requestPageFetch({
      url: requestedUrl,
      options: {
        method: 'GET',
        credentials: 'include',
        headers: {
          accept: 'text/html',
        },
      },
      timeoutMs: task.timeoutMs || 20000,
    });
    if (!response?.ok || typeof response.body !== 'string') {
      throw new Error(`boss_detail_fetch_failed:${response?.status || 'unknown'}`);
    }
    const documentFromResponse = new DOMParser().parseFromString(response.body, 'text/html');
    return readBossJobDetailFromRoot(documentFromResponse, task, requestedUrl);
  }

  function mergeBossApiAndHtmlDetail(apiDetail, htmlDetail) {
    if (!apiDetail) return htmlDetail;
    if (!htmlDetail) return apiDetail;
    if (htmlDetail.contactState !== 'unknown') {
      return {
        ...htmlDetail,
        ...apiDetail,
        contactState: htmlDetail.contactState,
        canChat: htmlDetail.canChat,
        alreadyContacted: htmlDetail.alreadyContacted,
        closedOrStopped: htmlDetail.closedOrStopped,
        contactText: htmlDetail.contactText,
      };
    }
    return apiDetail;
  }

  async function readBossJobDetail(task) {
    const currentUrl = window.location.href;
    const requestedUrl = task.url ? assertBossDetailUrl(task.url) : currentUrl;
    let apiDetail = null;
    let apiDetailError = null;
    try {
      apiDetail = await readBossJobDetailFromApi(task, requestedUrl);
    } catch (error) {
      apiDetailError = error;
    }

    if (apiDetail && apiDetail.contactState !== 'unknown') return apiDetail;

    let htmlDetail = null;
    try {
      htmlDetail = await readBossJobDetailFromHtml(task, requestedUrl);
    } catch (error) {
      if (!apiDetail) throw apiDetailError || error;
      return apiDetail;
    }

    if (apiDetail && apiDetail.contactState === 'unknown' && htmlDetail.contactState !== 'unknown') {
      return mergeBossApiAndHtmlDetail(apiDetail, htmlDetail);
    }
    return mergeBossApiAndHtmlDetail(apiDetail, htmlDetail);
  }

  async function executeTask(task) {
    if (task.platform === 'boss' && task.action === 'read_runtime_diagnostics') {
      return readBossRuntimeDiagnostics();
    }
    if (task.platform === 'boss' && task.action === 'read_route_contract') {
      return readBossRouteContractAfterRender();
    }
    if (task.platform === 'boss' && task.action === 'read_job_cards') {
      return readBossJobCards(task);
    }
    if (task.platform === 'boss' && task.action === 'read_job_detail') {
      return readBossJobDetail(task);
    }
    if (task.platform === 'boss' && task.action === 'read_chat_threads') {
      return readBossChatThreads(task);
    }
    if (task.action === 'page_context_fetch') {
      return requestPageFetch(task.request);
    }
    throw new Error(`unsupported_task:${task.action}`);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== GENESIS_RECRUITMENT_RPA_EXECUTE_MESSAGE) return false;

    executeTask(message.task)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  });
}
