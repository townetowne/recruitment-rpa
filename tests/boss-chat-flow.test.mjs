import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectBossChatReport,
  createMemoryChatCheckpointStore,
  redactChatText,
} from '../src/boss-chat-flow.mjs';

function createDispatcher({ threads }) {
  const calls = [];
  const dispatcher = async (task) => {
    calls.push(task);
    if (task.action === 'ensure_chat_route') {
      return {
        ok: true,
        navigated: true,
        host: 'www.zhipin.com',
        path: '/web/geek/chat',
        url: 'https://www.zhipin.com/web/geek/chat',
      };
    }
    if (task.action === 'read_chat_threads') {
      return {
        coverage: {
          scope: 'loaded_chat_list',
          loadedCount: threads.length,
          partial: false,
        },
        threads,
      };
    }
    throw new Error(`unexpected_task:${task.action}`);
  };
  dispatcher.calls = calls;
  return dispatcher;
}

test('Boss chat report reads loaded threads, checkpoints every decision, and classifies stalled target chats', async () => {
  const checkpoint = createMemoryChatCheckpointStore();
  const dispatcher = createDispatcher({
    threads: [
      {
        conversationKey: 'chat:1',
        company: '长江云通',
        title: '资深AI应用技术专家',
        lastMessage: '方便发一下简历吗？',
        lastSpeaker: 'recruiter',
        lastMessageAt: '2026-09-04 09:10',
        deliveryStatus: '对方已回复',
        unread: true,
      },
      {
        conversationKey: 'chat:2',
        company: '科大讯飞',
        title: '技术中心-大数据解决方案架构师-武汉',
        lastMessage: '我这边主要看大数据和AI工程化方向。',
        lastSpeaker: 'me',
        lastMessageAt: '2026-09-02 09:05',
        deliveryStatus: '已读',
      },
      {
        conversationKey: 'chat:3',
        company: '秦九',
        title: 'AI真人制作师',
        lastMessage: '可以来面谈短视频制作岗位。',
        lastSpeaker: 'recruiter',
        lastMessageAt: '2026-09-04 08:20',
        deliveryStatus: '对方已回复',
      },
      {
        conversationKey: 'chat:4',
        company: '某外包公司',
        title: '大数据驻场开发',
        lastMessage: '本岗位为外包驻场。',
        lastSpeaker: 'recruiter',
        lastMessageAt: '2026-09-03 18:00',
        deliveryStatus: '对方已回复',
      },
    ],
  });

  const result = await collectBossChatReport({
    keywords: ['大数据', 'AI Agent', 'AI应用', 'AI工程化', '架构'],
    limit: 80,
    runId: 'chat-report-test',
    checkpoint,
    dispatcher,
    now: () => new Date('2026-09-04T10:00:00+08:00'),
  });

  assert.deepEqual(dispatcher.calls.map((task) => task.action), [
    'ensure_chat_route',
    'read_chat_threads',
  ]);
  assert.equal(result.coverage.loadedCount, 4);
  assert.equal(result.items.length, 3);
  assert.deepEqual(result.summary, {
    totalLoaded: 4,
    matched: 3,
    p0: 1,
    p1: 1,
    p2: 0,
    stop: 1,
  });
  assert.deepEqual(
    result.items.map((item) => [item.company, item.bucket, item.reason]),
    [
      ['长江云通', 'P0', 'recruiter_waiting_for_reply'],
      ['科大讯飞', 'P1', 'user_last_message_stalled_48h'],
      ['某外包公司', 'Stop', 'outsourcing_or_onsite_risk'],
    ],
  );
  assert.deepEqual(
    checkpoint.records
      .filter((record) => record.kind === 'chat_decision')
      .map((record) => [record.status, record.company, record.bucket]),
    [
      ['classified', '长江云通', 'P0'],
      ['classified', '科大讯飞', 'P1'],
      ['ignored', '秦九', 'ignored'],
      ['classified', '某外包公司', 'Stop'],
    ],
  );
  assert.match(result.markdown, /当前证据范围/);
  assert.match(result.markdown, /长江云通/);
  assert.match(result.markdown, /P0/);
  assert.match(result.markdown, /科大讯飞/);
});

test('Boss chat text redaction removes contact secrets before JSONL evidence is written', () => {
  const syntheticPhone = ['138', '0000', '0000'].join('');
  const syntheticEmail = ['candidate', '@example.com'].join('');
  assert.equal(
    redactChatText(`电话 ${syntheticPhone}，邮箱 ${syntheticEmail}，微信 test_account`),
    '电话 [PHONE]，邮箱 [EMAIL]，微信 [WECHAT]',
  );
});

test('Boss chat report does not mark candidate-authored target intro as P0 without recruiter reply evidence', async () => {
  const checkpoint = createMemoryChatCheckpointStore();
  const dispatcher = createDispatcher({
    threads: [
      {
        conversationKey: 'chat:intro',
        company: '顺丰数据',
        title: '大数据架构师',
        lastMessage: '您好，我有多年研发和架构经验，主线是 Java 架构、大数据平台和 Agentic AI 工具链。',
        lastSpeaker: 'me',
        lastMessageAt: '2026-09-04 08:15',
        deliveryStatus: '送达',
      },
    ],
  });

  const result = await collectBossChatReport({
    keywords: ['大数据', 'Agent', '架构'],
    runId: 'chat-candidate-intro-test',
    checkpoint,
    dispatcher,
    now: () => new Date('2026-09-04T10:00:00+08:00'),
  });

  assert.equal(result.items[0].bucket, 'P2');
  assert.equal(result.items[0].reason, 'delivered_or_ambiguous_no_progress');
});
