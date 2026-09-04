import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  createBossChatRouteTask,
  createBossChatThreadsTask,
} from './adapters/boss.mjs';
import { createAuditRecord } from './audit-log.mjs';

const DEFAULT_TARGET_KEYWORDS = Object.freeze([
  '大数据',
  'AI Agent',
  'AI Agents',
  'Agent',
  'AI应用',
  'AI工程化',
  '系统设计',
  '系统架构',
  '架构',
]);

const STOP_PATTERN = /外包|派遣|驻场|加盟|代理|培训|短视频|真人制作|主播|销售|兼职|实习|明确拒绝|不合适|停止招聘|职位关闭|岗位下线/;
const RECRUITER_WAITING_PATTERN = /简历|JD|职位描述|岗位详情|面试|薪资|工资|薪酬|什么时候|到岗|方便|可以|聊|电话|微信|项目|经验|介绍|约/;

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeKeywordList(keywords) {
  const values = Array.isArray(keywords) && keywords.length > 0
    ? keywords
    : DEFAULT_TARGET_KEYWORDS;
  const normalized = [];
  const seen = new Set();
  for (const keyword of values) {
    const text = cleanText(keyword);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    normalized.push(text);
  }
  return normalized.length ? normalized : [...DEFAULT_TARGET_KEYWORDS];
}

export function redactChatText(value) {
  return cleanText(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, '[PHONE]')
    .replace(/微信\s*[:：]?\s*[A-Za-z][-_A-Za-z0-9]{5,20}/g, '微信 [WECHAT]');
}

function normalizeSpeaker(value, deliveryStatus, lastMessage) {
  const text = cleanText([value, deliveryStatus, lastMessage].filter(Boolean).join(' '));
  if (/^(me|self|user)$/i.test(cleanText(value))) return 'me';
  if (/^(recruiter|boss|hr)$/i.test(cleanText(value))) return 'recruiter';
  if (/我[:：]|我已|已发送|送达|已读|候选人|求职者/.test(text)) return 'me';
  if (/对方|招聘者|招聘方|HR|hr|Boss|boss|回复|发来|问/.test(text)) return 'recruiter';
  return 'unknown';
}

function parseAbsoluteDate(text) {
  const value = cleanText(text);
  const absolute = value.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!absolute) return null;
  const [, year, month, day, hour = '0', minute = '0', second = '0'] = absolute;
  return new Date(
    `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:${second.padStart(2, '0')}+08:00`,
  );
}

function parseRelativeDate(text, now) {
  const value = cleanText(text);
  if (!value) return null;
  const base = now instanceof Date ? now : new Date(now);

  const minutes = value.match(/(\d+)\s*分钟前/);
  if (minutes) return new Date(base.getTime() - Number(minutes[1]) * 60_000);

  const hours = value.match(/(\d+)\s*小时前/);
  if (hours) return new Date(base.getTime() - Number(hours[1]) * 3_600_000);

  if (/刚刚|刚才/.test(value)) return base;

  const time = value.match(/(\d{1,2}):(\d{2})/);
  if (!time) return null;

  const date = new Date(base);
  if (/昨天/.test(value)) date.setDate(date.getDate() - 1);
  date.setHours(Number(time[1]), Number(time[2]), 0, 0);
  return date;
}

function parseChatDate(value, now) {
  return parseAbsoluteDate(value) || parseRelativeDate(value, now);
}

function hoursSince(value, now) {
  const parsed = parseChatDate(value, now);
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - parsed.getTime()) / 3_600_000));
}

function matchesKeywords(thread, keywords) {
  const haystack = [
    thread.company,
    thread.title,
    thread.lastMessage,
    thread.deliveryStatus,
    thread.threadText,
  ].map((item) => cleanText(item).toLowerCase()).join(' ');

  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function classifyThread(thread, now) {
  const text = [
    thread.company,
    thread.title,
    thread.lastMessage,
    thread.deliveryStatus,
  ].map(cleanText).join(' ');
  const stalledHours = hoursSince(thread.lastMessageAt, now);

  if (STOP_PATTERN.test(text)) {
    return {
      bucket: 'Stop',
      reason: 'outsourcing_or_onsite_risk',
      action: '不跟进；保留记录用于去重。',
      stalledHours,
    };
  }

  const recruiterReplyEvidence =
    thread.lastSpeaker === 'recruiter' ||
    thread.unread === true ||
    /对方已回复|新消息|未读|回复/.test(thread.deliveryStatus);
  const unknownInboundEvidence =
    thread.lastSpeaker !== 'me' &&
    RECRUITER_WAITING_PATTERN.test(thread.lastMessage);

  if (recruiterReplyEvidence || unknownInboundEvidence) {
    return {
      bucket: 'P0',
      reason: 'recruiter_waiting_for_reply',
      action: '需要人工看完整上下文后回复；不要再发通用模板。',
      stalledHours,
    };
  }

  if (thread.lastSpeaker === 'me') {
    if (stalledHours !== null && stalledHours >= 48) {
      return {
        bucket: 'P1',
        reason: 'user_last_message_stalled_48h',
        action: '可轻跟进一次，先索要完整 JD/团队/薪资结构。',
        stalledHours,
      };
    }
    if (stalledHours !== null && stalledHours >= 24) {
      return {
        bucket: 'P1',
        reason: 'user_last_message_stalled_24h',
        action: '可等到 48h 后再轻跟进。',
        stalledHours,
      };
    }
    if (/已读/.test(thread.deliveryStatus)) {
      return {
        bucket: 'P1',
        reason: 'read_no_reply',
        action: '先观察；超过 48h 再跟进。',
        stalledHours,
      };
    }
  }

  return {
    bucket: 'P2',
    reason: 'delivered_or_ambiguous_no_progress',
    action: '低频观察，不占用今日主动沟通额度。',
    stalledHours,
  };
}

function normalizeThread(raw, index, now) {
  const company = cleanText(raw.company || raw.brandName || raw.companyName || raw.recruiterCompany || '');
  const title = cleanText(raw.title || raw.jobTitle || raw.jobName || raw.positionName || '');
  const lastMessage = redactChatText(raw.lastMessage || raw.latestMessage || raw.message || raw.summary || raw.threadText || raw.text || '');
  const deliveryStatus = cleanText(raw.deliveryStatus || raw.status || raw.readStatus || '');
  const lastSpeaker = normalizeSpeaker(raw.lastSpeaker || raw.sender || raw.senderType || '', deliveryStatus, lastMessage);
  const lastMessageAt = cleanText(raw.lastMessageAt || raw.time || raw.lastTime || raw.updatedAt || '');
  const threadText = redactChatText(raw.threadText || raw.text || '');
  const conversationKey = cleanText(raw.conversationKey || raw.friendId || raw.encryptBossId || raw.url || `${company}:${title}:${index + 1}`);
  const stalledHours = hoursSince(lastMessageAt, now);

  return {
    conversationKey,
    company,
    title,
    lastMessage,
    lastSpeaker,
    lastMessageAt,
    deliveryStatus,
    unread: raw.unread === true || raw.hasUnread === true || /未读|新消息/.test(deliveryStatus),
    threadText,
    stalledHours,
  };
}

function createRecorder({ checkpoint, runId }) {
  let seq = 0;
  return async function record({ kind = 'step', stage, action, status = 'completed', payload = {}, ...fields }) {
    await checkpoint.append({
      ...createAuditRecord({
        runId,
        seq: ++seq,
        platform: 'boss',
        stage,
        action,
        status,
        payload,
      }),
      kind,
      ...fields,
    });
  };
}

export function createMemoryChatCheckpointStore(initialRecords = []) {
  const records = [...initialRecords];
  return {
    records,
    async append(record) {
      records.push(record);
    },
  };
}

export function createFileChatCheckpointStore(checkpointPath) {
  return {
    async append(record) {
      await mkdir(dirname(checkpointPath), { recursive: true });
      await appendFile(checkpointPath, `${JSON.stringify(record)}\n`);
    },
  };
}

function makeSummary(items, totalLoaded) {
  return {
    totalLoaded,
    matched: items.length,
    p0: items.filter((item) => item.bucket === 'P0').length,
    p1: items.filter((item) => item.bucket === 'P1').length,
    p2: items.filter((item) => item.bucket === 'P2').length,
    stop: items.filter((item) => item.bucket === 'Stop').length,
  };
}

function markdownRow(index, item) {
  return [
    index + 1,
    item.company || item.title || '当前证据不足',
    item.title || '当前证据不足',
    item.lastMessageAt || '当前证据不足',
    item.lastSpeaker,
    item.deliveryStatus || '当前证据不足',
    item.bucket,
    item.reason,
    item.action,
  ].join(' | ');
}

export function renderBossChatReportMarkdown({
  reportDate,
  keywords,
  coverage,
  summary,
  items,
}) {
  const lines = [
    '# BOSS 沟通停滞报告',
    '',
    `生成日期：${reportDate}`,
    '',
    '## 当前证据范围',
    '',
    `- 来源：BOSS 当前已加载聊天列表，只读 DOM 合同。`,
    `- 覆盖：loaded=${coverage.loadedCount || 0}，partial=${coverage.partial === true ? 'true' : 'false'}，scope=${coverage.scope || 'loaded_chat_list'}。`,
    `- 关键词：${keywords.join('、')}`,
    `- 外部副作用：无发送、无投递、无简历修改。`,
    '',
    '## 统计',
    '',
    `- 命中目标沟通：${summary.matched}`,
    `- P0 需回复/推进：${summary.p0}`,
    `- P1 已读或超过 24-48h 停滞：${summary.p1}`,
    `- P2 低信号等待：${summary.p2}`,
    `- Stop 不跟进：${summary.stop}`,
    '',
    '## 明细',
    '',
    '| # | 公司 | 岗位或线索 | 最近时间 | 最后一方 | 状态 | 分类 | 原因 | 建议动作 |',
    '|---:|---|---|---|---|---|---|---|---|',
    ...items.map((item, index) => `| ${markdownRow(index, item)} |`),
    '',
  ];

  return `${lines.join('\n')}\n`;
}

export async function collectBossChatReport({
  keywords,
  limit = 80,
  runId = `boss-chat-report-${Date.now()}`,
  checkpointPath,
  checkpoint = checkpointPath ? createFileChatCheckpointStore(checkpointPath) : createMemoryChatCheckpointStore(),
  dispatcher,
  now = () => new Date(),
} = {}) {
  if (typeof dispatcher !== 'function') throw new Error('dispatcher_required');
  const currentNow = now();
  const normalizedKeywords = normalizeKeywordList(keywords);
  const record = createRecorder({ checkpoint, runId });

  await record({
    stage: 'chat_plan_created',
    action: 'create_boss_chat_report_plan',
    payload: {
      keywords: normalizedKeywords,
      limit,
      checkpointPath: checkpointPath || '',
    },
  });

  const route = await dispatcher(createBossChatRouteTask());
  if (route?.host !== 'www.zhipin.com' || route?.path !== '/web/geek/chat') {
    throw new Error('boss_chat_route_not_satisfied');
  }
  await record({
    stage: 'chat_route_verified',
    action: 'ensure_chat_route',
    payload: {
      host: route.host,
      path: route.path,
      navigated: route.navigated === true,
    },
  });

  const chatResult = await dispatcher(createBossChatThreadsTask({ limit }));
  const rawThreads = Array.isArray(chatResult?.threads) ? chatResult.threads : [];
  const coverage = {
    scope: chatResult?.coverage?.scope || 'loaded_chat_list',
    loadedCount: Number(chatResult?.coverage?.loadedCount ?? rawThreads.length),
    partial: chatResult?.coverage?.partial === true,
  };
  await record({
    stage: 'chat_threads_read',
    action: 'read_chat_threads',
    payload: coverage,
  });

  const items = [];
  for (const [index, raw] of rawThreads.entries()) {
    const thread = normalizeThread(raw, index, currentNow);
    const matched = matchesKeywords(thread, normalizedKeywords);
    const classification = matched ? classifyThread(thread, currentNow) : {
      bucket: 'ignored',
      reason: 'keyword_mismatch',
      action: '不进入本次大数据/AI Agents 跟进报告。',
      stalledHours: thread.stalledHours,
    };
    const item = {
      ...thread,
      ...classification,
    };

    await record({
      kind: 'chat_decision',
      stage: 'chat_checkpoint',
      action: 'classify_chat_thread',
      status: matched ? 'classified' : 'ignored',
      payload: {
        conversationKey: thread.conversationKey,
        bucket: item.bucket,
        reason: item.reason,
      },
      conversationKey: thread.conversationKey,
      company: thread.company,
      title: thread.title,
      bucket: item.bucket,
      reason: item.reason,
      lastMessageAt: thread.lastMessageAt,
      lastSpeaker: thread.lastSpeaker,
      deliveryStatus: thread.deliveryStatus,
      lastMessage: thread.lastMessage.slice(0, 160),
    });

    if (matched) items.push(item);
  }

  const summary = makeSummary(items, coverage.loadedCount);
  await record({
    stage: 'chat_flow_completed',
    action: 'render_boss_chat_report',
    payload: summary,
  });

  const reportDate = currentNow.toISOString().slice(0, 10);
  const markdown = renderBossChatReportMarkdown({
    reportDate,
    keywords: normalizedKeywords,
    coverage,
    summary,
    items,
  });

  return {
    reportDate,
    keywords: normalizedKeywords,
    coverage,
    summary,
    items,
    markdown,
  };
}

export async function writeBossChatReportFiles({ result, jsonOutputPath, markdownOutputPath }) {
  if (!result || typeof result !== 'object') throw new Error('boss_chat_report_result_required');
  if (jsonOutputPath) {
    await mkdir(dirname(jsonOutputPath), { recursive: true });
    await writeFile(jsonOutputPath, `${JSON.stringify({
      reportDate: result.reportDate,
      keywords: result.keywords,
      coverage: result.coverage,
      summary: result.summary,
      items: result.items,
    }, null, 2)}\n`);
  }
  if (markdownOutputPath) {
    await mkdir(dirname(markdownOutputPath), { recursive: true });
    await writeFile(markdownOutputPath, result.markdown);
  }
  return { jsonOutputPath, markdownOutputPath };
}
