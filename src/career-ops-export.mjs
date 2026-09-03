import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function candidateKey(candidate) {
  return normalize(candidate.job_key)
    || normalize(candidate.jobKey)
    || normalize(candidate.url)
    || `${normalize(candidate.company)}::${normalize(candidate.title)}::${normalize(candidate.city)}`;
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function writeCareerOpsCandidates({
  careerOpsRoot,
  candidates,
  candidatesPath = 'data/boss-candidates.json',
}) {
  if (!careerOpsRoot) throw new Error('career_ops_root_required');
  if (!Array.isArray(candidates)) throw new Error('candidates_required');

  const outputPath = join(careerOpsRoot, candidatesPath);
  const existing = await readJson(outputPath, []);
  const merged = [];
  const indexByKey = new Map();

  for (const candidate of [...existing, ...candidates]) {
    const key = candidateKey(candidate);
    if (!key) continue;
    if (indexByKey.has(key)) {
      merged[indexByKey.get(key)] = {
        ...merged[indexByKey.get(key)],
        ...candidate,
      };
      continue;
    }
    indexByKey.set(key, merged.length);
    merged.push(candidate);
  }

  const incomingKeys = new Set(candidates.map(candidateKey).filter(Boolean));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');

  return {
    outputPath,
    total: merged.length,
    insertedOrUpdated: incomingKeys.size,
  };
}

export function createCareerOpsScoreCommands({
  threshold = 4,
  limit = 50,
  candidatesPath = 'data/boss-candidates.json',
} = {}) {
  return [
    {
      file: 'boss-score.mjs',
      command: process.execPath,
      args: ['boss-score.mjs', '--input', candidatesPath, '--threshold', String(threshold)],
    },
    {
      file: 'boss-match.mjs',
      command: process.execPath,
      args: ['boss-match.mjs', '--input', 'data/boss-queue.json', '--limit', String(limit)],
    },
    {
      file: 'boss-review.mjs',
      command: process.execPath,
      args: ['boss-review.mjs', '--input', 'data/boss-match-pool.json', '--limit', String(limit), '--threshold', String(threshold)],
    },
  ];
}

function runCommand({ command, args }, { cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ code, stdout, stderr });
        return;
      }
      const error = new Error(`career_ops_command_failed:${args[0]}:${code}`);
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

export async function runCareerOpsScoreCommands({ careerOpsRoot, commands }) {
  if (!careerOpsRoot) throw new Error('career_ops_root_required');
  const results = [];
  for (const command of commands) {
    results.push({
      file: command.file,
      ...(await runCommand(command, { cwd: careerOpsRoot })),
    });
  }
  return results;
}
