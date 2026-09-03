import assert from 'node:assert/strict';
import test from 'node:test';

import { getRecruitmentRpaBusinessDesign } from '../src/business-design.mjs';

test('business design separates career intelligence from site execution', () => {
  const design = getRecruitmentRpaBusinessDesign();

  assert.equal(design.name, 'recruitment-rpa');
  assert.equal(design.primaryPlatform, 'boss');
  assert.equal(design.careerIntelligenceLayer, 'career-ops-cn');
  assert.equal(design.executionLayer, 'owned_chrome_extension');
  assert.equal(design.usesCodexBrowserPluginForCoreExecution, false);
  assert.equal(design.usesChatGptPluginForCoreExecution, false);
});

test('business flow keeps side effects behind review and postcondition checks', () => {
  const design = getRecruitmentRpaBusinessDesign();

  assert.deepEqual(
    design.pipeline.map((stage) => stage.id),
    [
      'collect_complete_job_detail',
      'score_and_rank_with_career_ops',
      'human_review_gate',
      'execute_reviewed_site_action',
      'verify_site_postcondition',
      'append_jsonl_audit',
    ],
  );

  assert.equal(
    design.pipeline.find((stage) => stage.id === 'execute_reviewed_site_action').requiresApproval,
    true,
  );
  assert.equal(
    design.pipeline.find((stage) => stage.id === 'verify_site_postcondition').failureDisposition,
    'stop_without_retry',
  );
});

test('business design forbids visual automation paths without fallback exception', () => {
  const design = getRecruitmentRpaBusinessDesign();

  assert.deepEqual(design.forbiddenExecutionPaths, [
    'screenshot',
    'screen_ocr',
    'coordinate_click',
    'coordinate_navigation',
    'os_pointer_click',
    'browser_visual_snapshot',
  ]);
});
