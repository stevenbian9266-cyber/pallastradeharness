import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GATE_PHASES, migrateGateState, recomputeGateState } from './gate-lifecycle.mjs';

test('legacy gate migrates verify-test into verification phase', () => {
  const gate = migrateGateState({
    id: 'GATE-1',
    checks: [
      { id: 'search-app', status: 'done' },
      { id: 'verify-test', status: 'pending' },
    ],
    cleared: false,
  });
  assert.equal(gate.schemaVersion, '2.0');
  assert.equal(gate.checks[0].phase, GATE_PHASES.PREPARATION);
  assert.equal(gate.checks[1].phase, GATE_PHASES.VERIFICATION);
  assert.equal(gate.implementationReady, true);
  assert.equal(gate.phase, GATE_PHASES.IMPLEMENTATION);
  assert.equal(gate.cleared, false);
});

test('gate finishes only after verification evidence check is done', () => {
  const gate = migrateGateState({ checks: [{ id: 'verify-test', status: 'pending' }] });
  gate.checks[0].status = 'done';
  recomputeGateState(gate);
  assert.equal(gate.phase, GATE_PHASES.FINISHED);
  assert.equal(gate.cleared, true);
});
