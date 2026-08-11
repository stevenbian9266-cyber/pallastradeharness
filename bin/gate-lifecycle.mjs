export const GATE_PHASES = Object.freeze({
  PREPARATION: 'preparation',
  IMPLEMENTATION: 'implementation',
  VERIFICATION: 'verification',
  FINISHED: 'finished',
});

export function checkPhase(check) {
  if (check.phase) return check.phase;
  return check.id === 'verify-test' ? GATE_PHASES.VERIFICATION : GATE_PHASES.PREPARATION;
}

export function migrateGateState(input) {
  const gate = structuredClone(input);
  gate.schemaVersion ||= '2.0';
  gate.checks = (gate.checks || []).map(check => ({ ...check, phase: checkPhase(check) }));
  return recomputeGateState(gate);
}

export function recomputeGateState(input) {
  const gate = input;
  const preparation = gate.checks.filter(check => checkPhase(check) === GATE_PHASES.PREPARATION);
  const verification = gate.checks.filter(check => checkPhase(check) === GATE_PHASES.VERIFICATION);
  gate.implementationReady = preparation.every(check => check.status === 'done');
  gate.cleared = gate.implementationReady && verification.every(check => check.status === 'done');
  gate.phase = gate.cleared
    ? GATE_PHASES.FINISHED
    : gate.implementationReady
      ? GATE_PHASES.IMPLEMENTATION
      : GATE_PHASES.PREPARATION;
  return gate;
}

export function pendingChecks(gate, phase) {
  return (gate.checks || []).filter(check => checkPhase(check) === phase && check.status !== 'done');
}
