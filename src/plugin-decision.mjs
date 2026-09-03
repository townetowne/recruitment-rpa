export function getGptPluginDecision() {
  return {
    requiredForCoreExecution: false,
    runtimeStatus: 'removed',
    removalReason: 'uncontrolled_execution_surface',
    coreExecutionLayer: 'chrome_extension_page_context',
    allowedRole: 'none_in_runtime',
    forbiddenRole: 'browser_execution_fallback',
    platformExecutionOwners: {
      boss: 'boss_adapter',
      liepin: 'liepin_adapter',
      linkedin: 'linkedin_adapter',
    },
    decision: 'GPT plugins are removed from recruitment RPA runtime because the execution surface is not controlled by this project.',
  };
}
