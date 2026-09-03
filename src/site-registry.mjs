import { FORBIDDEN_OPERATION_KINDS, assertAdapterContract } from './execution-policy.mjs';
import { BOSS_ADAPTER } from './adapters/boss.mjs';

function disallowedFallbacks() {
  return [...FORBIDDEN_OPERATION_KINDS];
}

export const DEFAULT_SITE_ADAPTERS = Object.freeze([
  BOSS_ADAPTER,
  {
    platform: 'liepin',
    priority: 'later',
    hosts: ['c.liepin.com', 'www.liepin.com'],
    capabilities: ['jobDiscovery', 'completeJobDetail', 'attachmentResumeUpload'],
    contracts: {
      session: {
        source: 'dom_contract_query',
        signals: ['authenticatedProfileNav'],
      },
      jobDetail: {
        source: 'site_api',
        fields: ['title', 'company', 'description', 'baseCity'],
      },
      attachmentUpload: {
        source: 'dom_file_input',
        postcondition: 'attachmentListContainsUploadedFile',
      },
    },
    disallowedFallbacks: disallowedFallbacks(),
  },
  {
    platform: 'linkedin',
    priority: 'later',
    hosts: ['www.linkedin.com'],
    capabilities: ['jobDiscovery', 'completeJobDetail'],
    contracts: {
      session: {
        source: 'dom_contract_query',
        signals: ['authenticatedGlobalNav'],
      },
      jobDetail: {
        source: 'page_context_fetch',
        fields: ['title', 'company', 'description', 'location'],
      },
    },
    disallowedFallbacks: disallowedFallbacks(),
  },
]);

for (const adapter of DEFAULT_SITE_ADAPTERS) {
  assertAdapterContract(adapter);
}

export function getSiteAdapter(platform) {
  const adapter = DEFAULT_SITE_ADAPTERS.find((item) => item.platform === platform);
  if (!adapter) throw new Error(`site_adapter_not_found:${platform}`);
  return adapter;
}
