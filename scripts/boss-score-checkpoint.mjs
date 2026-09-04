#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { extractVerifiedBossCandidatesFromJsonl } from '../src/boss-checkpoint-score.mjs';
import {
  createCareerOpsScoreCommands,
  runCareerOpsScoreCommands,
  writeCareerOpsSessionCandidates,
} from '../src/career-ops-export.mjs';

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

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log('Usage: node scripts/boss-score-checkpoint.mjs --checkpoint ~/.codex/state/recruitment-rpa/boss-武汉-YYYYMMDD.jsonl --city 武汉 --limit 50 --threshold 4');
    return;
  }

  const projectRoot = resolve(new URL('..', import.meta.url).pathname);
  const careerOpsRoot = resolve(args['career-ops-root'] || `${projectRoot}/../career-ops-cn`);
  const baseCity = String(args.city || args.baseCity || '武汉');
  const checkpointPath = resolve(
    String(args.checkpoint || `${process.env.HOME}/.codex/state/recruitment-rpa/boss-${baseCity}-${todayCompact()}.jsonl`),
  );
  const sessionCandidatesPath = String(
    args['session-candidates-path']
      || args.sessionCandidatesPath
      || `data/boss-collected-${baseCity}-${todayCompact()}.json`,
  );
  const threshold = Number(args.threshold || 4);
  const limit = Number(args.limit || 50);

  const candidates = extractVerifiedBossCandidatesFromJsonl(await readFile(checkpointPath, 'utf8'));
  const sessionExportResult = await writeCareerOpsSessionCandidates({
    careerOpsRoot,
    candidates,
    candidatesPath: sessionCandidatesPath,
  });
  const commands = createCareerOpsScoreCommands({
    threshold,
    limit,
    candidatesPath: sessionCandidatesPath,
  });
  const commandResults = await runCareerOpsScoreCommands({ careerOpsRoot, commands });

  console.log(JSON.stringify({
    stage: 'checkpoint_score_completed',
    checkpointPath,
    accepted: candidates.length,
    careerOpsSessionCandidatesPath: sessionExportResult.outputPath,
    careerOpsSessionCandidates: sessionExportResult.total,
    scoreCommands: commandResults.map((result) => ({
      file: result.file,
      stdout: result.stdout.trim(),
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    stage: 'checkpoint_score_failed',
    error: error.message,
    stdout: error.stdout || '',
    stderr: error.stderr || '',
  }, null, 2));
  process.exitCode = 1;
});
