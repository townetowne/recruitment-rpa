#!/usr/bin/env node

import { resolve } from 'node:path';

import { collectBossJobs } from '../src/boss-discovery-flow.mjs';
import {
  createCareerOpsScoreCommands,
  runCareerOpsScoreCommands,
  writeCareerOpsCandidates,
  writeCareerOpsSessionCandidates,
} from '../src/career-ops-export.mjs';
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

function parseQueries(value, fallback) {
  if (!value) return [fallback];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log('Usage: node scripts/boss-collect-score.mjs --query "AI 架构师" --queries "AI 架构师,大模型架构师" --city 武汉 --target 50 --max-pages 10 [--review-scope session|all]');
    return;
  }

  const projectRoot = resolve(new URL('..', import.meta.url).pathname);
  const careerOpsRoot = resolve(args['career-ops-root'] || `${projectRoot}/../career-ops-cn`);
  const query = String(args.query || 'AI 架构师');
  const queryVariants = parseQueries(args.queries || args.queryVariants, query);
  const baseCity = String(args.city || args.baseCity || '武汉');
  const targetCount = Number(args.target || args.targetCount || 50);
  const threshold = Number(args.threshold || 4);
  const limit = Number(args.limit || 50);
  const maxPages = Number(args['max-pages'] || args.maxPages || 10);
  const reviewScope = String(args['review-scope'] || args.reviewScope || 'session');
  const taskTimeoutMs = Number(args['task-timeout-ms'] || 60000);
  const clientTaskTimeoutMs = Math.max(1000, taskTimeoutMs - 5000);
  const runnerReadyTimeoutMs = Number(args['runner-ready-timeout-ms'] || 90000);
  const checkpointPath = resolve(
    args.checkpoint || `${process.env.HOME}/.codex/state/recruitment-rpa/boss-${baseCity}-${todayCompact()}.jsonl`,
  );

  const runner = createLocalRunnerServer({
    port: Number(args.port || 17333),
  });
  await runner.start();
  console.log(JSON.stringify({
    stage: 'runner_started',
    runnerUrl: runner.url,
    checkpointPath,
    instruction: 'Genesis RPA extension auto-connects to the local runner after the Boss tab is selected.',
  }, null, 2));

  try {
    const client = await runner.waitForClient({ timeoutMs: runnerReadyTimeoutMs });
    console.log(JSON.stringify({
      stage: 'runner_ready',
      runnerUrl: runner.url,
      clientId: client.clientId,
    }, null, 2));

    const collected = await collectBossJobs({
      query,
      queryVariants,
      baseCity,
      targetCount,
      checkpointPath,
      maxPages,
      dispatcher: (task) => runner.enqueue({
        ...task,
        timeoutMs: task.timeoutMs || clientTaskTimeoutMs,
      }, { timeoutMs: taskTimeoutMs }),
    });

    const exportResult = await writeCareerOpsCandidates({
      careerOpsRoot,
      candidates: collected.careerOpsCandidates,
    });
    const sessionCandidatesPath = String(
      args['session-candidates-path']
        || args.sessionCandidatesPath
        || `data/boss-collected-${baseCity}-${todayCompact()}.json`,
    );
    const sessionExportResult = await writeCareerOpsSessionCandidates({
      careerOpsRoot,
      candidates: collected.careerOpsCandidates,
      candidatesPath: sessionCandidatesPath,
    });
    const scoringCandidatesPath = reviewScope === 'all'
      ? 'data/boss-candidates.json'
      : sessionCandidatesPath;

    const commands = createCareerOpsScoreCommands({
      threshold,
      limit,
      candidatesPath: scoringCandidatesPath,
    });
    const commandResults = await runCareerOpsScoreCommands({ careerOpsRoot, commands });

    console.log(JSON.stringify({
      stage: 'completed',
      accepted: collected.careerOpsCandidates.length,
      reviewScope,
      careerOpsCandidatesPath: exportResult.outputPath,
      careerOpsTotalCandidates: exportResult.total,
      careerOpsSessionCandidatesPath: sessionExportResult.outputPath,
      careerOpsSessionCandidates: sessionExportResult.total,
      scoreCommands: commandResults.map((result) => ({
        file: result.file,
        stdout: result.stdout.trim(),
      })),
    }, null, 2));
  } finally {
    await runner.stop();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    stage: 'failed',
    error: error.message,
    stdout: error.stdout || '',
    stderr: error.stderr || '',
  }, null, 2));
  process.exitCode = 1;
});
