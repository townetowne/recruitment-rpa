#!/usr/bin/env node

import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const DEFAULT_REPO = 'https://github.com/pa1nrui1/career-ops-cn.git';
const DEFAULT_ARCHIVE = 'https://codeload.github.com/pa1nrui1/career-ops-cn/tar.gz/refs/heads/main';
const REQUIRED_SCRIPTS = ['boss:score', 'boss:match', 'boss:review'];

function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
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

async function pathExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function run(command, args, { cwd }) {
  return new Promise((resolveRun, reject) => {
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
        resolveRun({ stdout, stderr });
        return;
      }
      const error = new Error(`command_failed:${command}:${code}`);
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

async function commandAvailable(command) {
  try {
    await run(command, ['--version'], { cwd: process.cwd() });
    return true;
  } catch {
    return false;
  }
}

async function downloadCareerOpsArchive({ archiveUrl, targetRoot }) {
  const tempRoot = await mkdtemp(join(tmpdir(), 'career-ops-cn-'));
  try {
    const archivePath = join(tempRoot, 'career-ops-cn.tar.gz');
    const response = await fetch(archiveUrl, {
      headers: { 'User-Agent': 'genesis-recruitment-rpa-setup' },
    });
    if (!response.ok) {
      throw new Error(`career_ops_archive_download_failed:${response.status}`);
    }
    await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
    await run('tar', ['-xzf', archivePath, '-C', tempRoot], { cwd: tempRoot });

    const entries = await readdir(tempRoot, { withFileTypes: true });
    const extracted = entries.find((entry) => entry.isDirectory() && entry.name.startsWith('career-ops-cn-'));
    if (!extracted) throw new Error('career_ops_archive_missing_root');

    await cp(join(tempRoot, extracted.name), targetRoot, { recursive: true });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function copyBundledCareerOps({ bundledRoot, targetRoot }) {
  if (!(await pathExists(resolve(bundledRoot, 'package.json')))) {
    throw new Error('bundled_career_ops_missing');
  }
  await cp(bundledRoot, targetRoot, { recursive: true });
}

async function readPackageJson(root) {
  return JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
}

function print(stage, data = {}) {
  console.log(JSON.stringify({ stage, ...data }, null, 2));
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log('Usage: npm run setup:career-ops -- --target ../career-ops-cn --repo https://github.com/pa1nrui1/career-ops-cn.git --archive https://codeload.github.com/pa1nrui1/career-ops-cn/tar.gz/refs/heads/main');
    return;
  }

  const projectRoot = resolve(new URL('..', import.meta.url).pathname);
  const BUNDLED_CAREER_OPS_ROOT = resolve(projectRoot, 'vendor/career-ops-cn');
  const targetRoot = resolve(args.target || `${projectRoot}/../career-ops-cn`);
  const repo = String(args.repo || process.env.CAREER_OPS_REPO || DEFAULT_REPO);
  const archiveUrl = String(args.archive || process.env.CAREER_OPS_ARCHIVE || DEFAULT_ARCHIVE);
  const skipInstall = args['skip-install'] === true || args.install === 'false';

  print('setup_started', { targetRoot, bundledRoot: BUNDLED_CAREER_OPS_ROOT, repo, archiveUrl });

  const packageExists = await pathExists(resolve(targetRoot, 'package.json'));
  if (!packageExists) {
    await mkdir(dirname(targetRoot), { recursive: true });
    if (await pathExists(resolve(BUNDLED_CAREER_OPS_ROOT, 'package.json'))) {
      await copyBundledCareerOps({ bundledRoot: BUNDLED_CAREER_OPS_ROOT, targetRoot });
      print('career_ops_bundled', { targetRoot });
    } else if (await commandAvailable('git')) {
      await run('git', ['clone', '--depth', '1', repo, targetRoot], { cwd: projectRoot });
      print('career_ops_cloned', { targetRoot });
    } else {
      await downloadCareerOpsArchive({ archiveUrl, targetRoot });
      print('career_ops_downloaded', { targetRoot });
    }
  } else {
    print('career_ops_existing', { targetRoot });
  }

  const pkg = await readPackageJson(targetRoot);
  const missing = REQUIRED_SCRIPTS.filter((name) => !pkg.scripts?.[name]);
  if (missing.length > 0) {
    throw new Error(`career_ops_missing_required_scripts:${missing.join(',')}`);
  }

  if (!skipInstall) {
    await run('npm', ['install', '--ignore-scripts'], { cwd: targetRoot });
    print('career_ops_dependencies_installed', { targetRoot });
  }

  print('setup_completed', {
    careerOpsRoot: targetRoot,
    nextCommand: 'npm run boss:collect-score -- --query "AI 架构师" --city 武汉 --target 50 --limit 50 --threshold 4',
  });
}

main().catch((error) => {
  console.error(JSON.stringify({
    stage: 'setup_failed',
    error: error.message,
    stdout: error.stdout || '',
    stderr: error.stderr || '',
  }, null, 2));
  process.exitCode = 1;
});
