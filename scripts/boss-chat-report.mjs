#!/usr/bin/env node

import { resolve } from 'node:path';

import {
  collectBossChatReport,
  writeBossChatReportFiles,
} from '../src/boss-chat-flow.mjs';
import { createLocalRunnerServer } from '../src/local-runner-server.mjs';

function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      out._.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) out[key] = argv[++index];
    else out[key] = true;
  }
  return out;
}

function todayCompact() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function parseList(value, fallback) {
  if (!value) return fallback;
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log('Usage: node scripts/boss-chat-report.mjs --keywords "大数据,AI Agent,架构" --limit 80');
    return;
  }

  const projectRoot = resolve(new URL('..', import.meta.url).pathname);
  const careerOpsRoot = resolve(args['career-ops-root'] || `${projectRoot}/../career-ops-cn`);
  const date = todayCompact();
  const keywords = parseList(args.keywords, ['大数据', 'AI Agent', 'AI Agents', 'Agent', 'AI应用', 'AI工程化', '系统设计', '系统架构', '架构']);
  const limit = Number(args.limit || 80);
  const taskTimeoutMs = Number(args['task-timeout-ms'] || 60000);
  const runnerReadyTimeoutMs = Number(args['runner-ready-timeout-ms'] || 90000);
  const checkpointPath = resolve(
    args.checkpoint || `${process.env.HOME}/.codex/state/recruitment-rpa/boss-chat-${date}.jsonl`,
  );
  const jsonOutputPath = resolve(args.output || `${careerOpsRoot}/data/boss-chat-report-${date}.json`);
  const markdownOutputPath = resolve(args.markdown || `${careerOpsRoot}/data/boss-chat-report-${date}.md`);

  const runner = createLocalRunnerServer({
    port: Number(args.port || 17333),
  });
  await runner.start();
  console.log(JSON.stringify({
    stage: 'chat_runner_started',
    runnerUrl: runner.url,
    checkpointPath,
    instruction: 'Genesis RPA extension auto-connects to the local runner after the Boss tab is selected.',
  }, null, 2));

  try {
    const client = await runner.waitForClient({ timeoutMs: runnerReadyTimeoutMs });
    console.log(JSON.stringify({
      stage: 'chat_runner_ready',
      runnerUrl: runner.url,
      clientId: client.clientId,
    }, null, 2));

    const result = await collectBossChatReport({
      keywords,
      limit,
      checkpointPath,
      dispatcher: (task) => runner.enqueue({
        ...task,
        timeoutMs: task.timeoutMs || Math.max(1000, taskTimeoutMs - 5000),
      }, { timeoutMs: taskTimeoutMs }),
    });

    await writeBossChatReportFiles({
      result,
      jsonOutputPath,
      markdownOutputPath,
    });

    console.log(JSON.stringify({
      stage: 'chat_report_completed',
      checkpointPath,
      jsonOutputPath,
      markdownOutputPath,
      summary: result.summary,
      coverage: result.coverage,
    }, null, 2));
  } finally {
    await runner.stop();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    stage: 'chat_report_failed',
    error: error.message,
  }, null, 2));
  process.exitCode = 1;
});
