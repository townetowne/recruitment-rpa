import { FORBIDDEN_OPERATION_KINDS } from './execution-policy.mjs';

export function getRecruitmentRpaBusinessDesign() {
  return {
    name: 'recruitment-rpa',
    primaryPlatform: 'boss',
    careerIntelligenceLayer: 'career-ops-cn',
    executionLayer: 'owned_chrome_extension',
    usesCodexBrowserPluginForCoreExecution: false,
    usesChatGptPluginForCoreExecution: false,
    pipeline: [
      {
        id: 'collect_complete_job_detail',
        owner: 'boss_adapter',
        sideEffect: false,
      },
      {
        id: 'score_and_rank_with_career_ops',
        owner: 'career-ops-cn',
        sideEffect: false,
      },
      {
        id: 'human_review_gate',
        owner: 'career-ops-cn',
        sideEffect: false,
        output: 'approved_review_artifact',
      },
      {
        id: 'execute_reviewed_site_action',
        owner: 'boss_adapter',
        sideEffect: true,
        requiresApproval: true,
      },
      {
        id: 'verify_site_postcondition',
        owner: 'boss_adapter',
        sideEffect: false,
        failureDisposition: 'stop_without_retry',
      },
      {
        id: 'append_jsonl_audit',
        owner: 'audit_log',
        sideEffect: false,
      },
    ],
    forbiddenExecutionPaths: [...FORBIDDEN_OPERATION_KINDS],
  };
}
