import assert from 'node:assert/strict';
import test from 'node:test';

import { getGptPluginDecision } from '../src/plugin-decision.mjs';

test('GPT plugin is not a core dependency of the recruitment RPA execution layer', () => {
  const decision = getGptPluginDecision();

  assert.equal(decision.requiredForCoreExecution, false);
  assert.equal(decision.runtimeStatus, 'removed');
  assert.equal(decision.removalReason, 'uncontrolled_execution_surface');
  assert.equal(decision.coreExecutionLayer, 'chrome_extension_page_context');
  assert.equal(decision.allowedRole, 'none_in_runtime');
  assert.equal(decision.forbiddenRole, 'browser_execution_fallback');
});

test('decision records that platform adapters own site actions', () => {
  const decision = getGptPluginDecision();

  assert.deepEqual(decision.platformExecutionOwners, {
    boss: 'boss_adapter',
    liepin: 'liepin_adapter',
    linkedin: 'linkedin_adapter',
  });
});
