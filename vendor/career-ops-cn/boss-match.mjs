#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  CANDIDATES_PATH,
  loadProfile,
  loadSentCompanyKeys,
  loadSentKeys,
  parseArgs,
  readJson,
  uniqueCompanyKey,
  uniqueJobKey,
  writeJson,
} from './boss-common.mjs';
import { evaluateJob } from './boss-score.mjs';

const SENIOR_ROLE = /架构师|技术专家|研发专家|技术负责人|研发负责人|技术总监|首席/i;
const INDIVIDUAL_CONTRIBUTOR = /工程师|开发/i;
const RECENT_HR = /刚刚|今日|今天|小时|分钟|本周|日内|天内|活跃/;
const STALE_HR = /\d+\s*(?:周|月|年)前|上周|上月|去年/;

function isRecentHr(value) {
  const text = String(value || '');
  return !STALE_HR.test(text) && RECENT_HR.test(text);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isLocal(city, targetCities) {
  return targetCities.some((target) => String(city || '').includes(target));
}

function likelihood(job, { targetCities, recentSentCompanies }) {
  const signals = [];
  let index = Number(job.score || 0) * 12;
  const local = isLocal(job.city, targetCities);
  const senior = SENIOR_ROLE.test(job.title || '');
  const pureIndividual = INDIVIDUAL_CONTRIBUTOR.test(job.title || '') && !senior;
  const recentlyContacted = job.already_contacted === true || recentSentCompanies.has(uniqueCompanyKey(job));

  if (local) {
    index += 18;
    signals.push('目标城市直接匹配');
  } else if (!job.city) {
    index -= 8;
    signals.push('城市信息缺失');
  } else {
    index -= 4;
    signals.push('异地机会');
  }

  if (senior) {
    index += 10;
    signals.push('岗位级别匹配架构/专家经历');
  } else if (pureIndividual) {
    index -= 8;
    signals.push('岗位级别偏执行，存在资历和成本错配');
  }

  if (STALE_HR.test(job.hr_active || '')) {
    index -= 10;
    signals.push('HR 活跃度偏低');
  } else if (isRecentHr(job.hr_active)) {
    index += 8;
    signals.push('HR 近期活跃');
  } else {
    signals.push('HR 活跃度待核实');
  }

  if (job.can_chat === false) {
    index -= 9;
    signals.push('当前不可立即沟通');
  }
  if (Number(job.score_detail?.salary || 0) >= 4) {
    index += 4;
    signals.push('薪资与目标区间匹配');
  } else if (Number(job.score_detail?.salary || 0) <= 2) {
    index -= 12;
    signals.push('薪资与资历成本不匹配');
  }
  if (Number(job.repost_count || job.scan_seen_count || 0) >= 3) {
    index -= 10;
    signals.push('历史重复出现，需核实长期挂岗');
  }
  if (recentlyContacted) {
    index -= 3;
    signals.push('最近已沟通，转入跟进而非重复投递');
  }

  const action = recentlyContacted ? 'follow_up'
    : job.can_chat === false ? 'research_only'
    : 'new_candidate';
  const priority = local && isRecentHr(job.hr_active)
      && action === 'new_candidate' ? 'P0'
    : local && senior && action === 'new_candidate' ? 'P1'
      : 'P2';

  return {
    ...job,
    likelihood_index: Math.round(clamp(index, 0, 100)),
    priority,
    action,
    likelihood_signals: signals,
  };
}

export function rankMatches(jobs, {
  targetCities = ['武汉'],
  recentSentJobs = new Set(),
  recentSentCompanies = new Set(),
  limit = 30,
} = {}) {
  const boundedLimit = clamp(Number(limit) || 30, 20, 50);
  const seen = new Set();
  return jobs
    .filter((job) => job.jd_detail?.ok)
    .filter((job) => Number(job.score || 0) >= 4)
    .filter((job) => !job.risk_hits?.length)
    .filter((job) => job.opportunity_legitimacy?.tier !== 'Suspicious')
    .filter((job) => isLocal(job.city, targetCities))
    .filter((job) => !recentSentJobs.has(uniqueJobKey(job)))
    .map((job) => likelihood(job, { targetCities, recentSentCompanies }))
    .sort((a, b) => {
      const priorityOrder = { P0: 0, P1: 1, P2: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority]
        || b.likelihood_index - a.likelihood_index
        || b.score - a.score;
    })
    .filter((job) => {
      const key = uniqueJobKey(job);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, boundedLimit);
}

function writeReview(path, rows, source) {
  mkdirSync(dirname(path), { recursive: true });
  const table = rows.map((job, index) => [
    index + 1,
    job.priority,
    job.company || '',
    job.title || '',
    job.city || '',
    job.salary || '',
    job.score,
    job.likelihood_index,
    job.action,
    job.likelihood_signals.join('；'),
  ].map((value) => String(value).replace(/\|/g, '\\|')).join(' | '));
  writeFileSync(path, `# BOSS 匹配与入职可能性候选池\n\n- 来源：${source}\n- 说明：likelihood_index 是相对排序指数，不是统计学录用概率。\n- 在线新岗位补读未完成时，本文件不得标记为“今日新增”。\n\n| # | 优先级 | 公司 | 岗位 | 城市 | 薪资 | 匹配分 | 入职指数 | 动作 | 依据 |\n|---:|---|---|---|---|---|---:|---:|---|---|\n${table.map((row) => `| ${row} |`).join('\n')}\n`, 'utf8');
}

function main() {
  const args = parseArgs();
  const input = args.input || CANDIDATES_PATH;
  const output = args.output || 'data/boss-match-pool.json';
  const review = args.review || 'data/boss-match-review.md';
  const profile = loadProfile();
  const jobs = readJson(input, []).map((job) => evaluateJob(job, profile));
  const rows = rankMatches(jobs, {
    targetCities: profile?.target?.cities?.length ? [profile.target.cities[0]] : ['武汉'],
    recentSentJobs: loadSentKeys({ lookbackDays: 30 }),
    recentSentCompanies: loadSentCompanyKeys({ lookbackDays: 30 }),
    limit: Number(args.limit || 30),
  });
  writeJson(output, rows);
  writeReview(review, rows, input);
  console.log(JSON.stringify({
    input,
    total: jobs.length,
    shortlisted: rows.length,
    p0: rows.filter((row) => row.priority === 'P0').length,
    p1: rows.filter((row) => row.priority === 'P1').length,
    p2: rows.filter((row) => row.priority === 'P2').length,
    newCandidates: rows.filter((row) => row.action === 'new_candidate').length,
    followUps: rows.filter((row) => row.action === 'follow_up').length,
    researchOnly: rows.filter((row) => row.action === 'research_only').length,
    output,
    review,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
