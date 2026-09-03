import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const projectRoot = new URL('..', import.meta.url).pathname;

function readProjectFile(...segments) {
  return readFileSync(join(projectRoot, ...segments), 'utf8');
}

test('package metadata is ready for an open source GitHub repository', () => {
  const pkg = JSON.parse(readProjectFile('package.json'));

  assert.equal(pkg.private, false);
  assert.equal(pkg.license, 'MIT');
  assert.ok(pkg.repository?.url?.includes('github.com/townetowne/recruitment-rpa'));
});

test('public docs do not contain local absolute user paths', () => {
  const docs = ['README.md', 'USAGE.md', 'QUICKSTART.zh-CN.md'];

  for (const file of docs) {
    const text = readProjectFile(file);
    assert.doesNotMatch(text, /\/Users\/towne/);
    assert.doesNotMatch(text, /Documents\/Giikin/);
  }
});

test('public package does not contain local absolute owner paths or tokens', () => {
  const ignoredDirs = new Set(['.git', 'node_modules']);
  const forbiddenPatterns = [
    ['/Users', 'towne'].join('/'),
    ['Documents', 'Giikin'].join('/'),
    ['ghp', '_'].join(''),
    ['github', '_pat', '_'].join(''),
    ['GITHUB', '_TOKEN='].join(''),
    ['GITHUB', '_PAT='].join(''),
  ];
  const findings = [];
  const scan = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (ignoredDirs.has(entry)) continue;
      const path = join(dir, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        scan(path);
        continue;
      }
      if (stat.size > 500_000) continue;
      const text = readFileSync(path, 'utf8');
      if (forbiddenPatterns.some((pattern) => text.includes(pattern))) {
        findings.push(path.replace(projectRoot, '').replace(/^\//, ''));
      }
    }
  };
  scan(projectRoot);
  assert.deepEqual(findings, []);
});

test('public package includes beginner quickstart and excludes macOS metadata', () => {
  assert.equal(existsSync(join(projectRoot, 'QUICKSTART.zh-CN.md')), true);
  assert.equal(existsSync(join(projectRoot, 'LICENSE')), true);

  const rootFiles = readdirSync(projectRoot, { recursive: true });
  assert.equal(rootFiles.some((file) => String(file).endsWith('.DS_Store')), false);
});

test('blank-machine onboarding documents and scripts the career-ops companion install', () => {
  const pkg = JSON.parse(readProjectFile('package.json'));
  const quickstart = readProjectFile('QUICKSTART.zh-CN.md');
  const usage = readProjectFile('USAGE.md');
  const setupScript = readProjectFile('scripts', 'setup-career-ops.mjs');

  assert.equal(pkg.scripts?.['setup:career-ops'], 'node scripts/setup-career-ops.mjs');
  assert.equal(existsSync(join(projectRoot, 'scripts', 'setup-career-ops.mjs')), true);
  assert.match(quickstart, /从一台空白机器跑通/);
  assert.match(quickstart, /npm run setup:career-ops/);
  assert.match(quickstart, /Chrome 插件/);
  assert.match(quickstart, /Node\.js/);
  assert.match(quickstart, /career-ops-cn/);
  assert.match(usage, /recruitment-rpa =/);
  assert.match(usage, /career-ops-cn =/);
  assert.match(usage, /不建议直接上传你的本地 career-ops-cn/);
  assert.equal(existsSync(join(projectRoot, 'vendor', 'career-ops-cn', 'package.json')), true);
  assert.equal(existsSync(join(projectRoot, 'vendor', 'career-ops-cn', 'boss-match.mjs')), true);
  assert.equal(existsSync(join(projectRoot, 'vendor', 'career-ops-cn', 'config', 'profile.yml')), true);
  assert.match(setupScript, /BUNDLED_CAREER_OPS_ROOT/);
  assert.match(setupScript, /copyBundledCareerOps/);
  assert.match(setupScript, /DEFAULT_ARCHIVE/);
  assert.match(setupScript, /commandAvailable\('git'\)/);
  assert.match(setupScript, /fetch\(archiveUrl/);
  assert.match(setupScript, /tar/);
  assert.match(quickstart, /没有安装 Git/);
  assert.match(quickstart, /内置干净版/);
});
