import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { assessRisk, mergeRisk } from './risk-engine.mjs';

test('risk is the maximum of declaration, paths, semantics, and task text', () => {
  assert.equal(assessRisk({ task: 'copy edit', files: ['README.md'], config: DEFAULT_CONFIG }).level, 'quick');
  assert.equal(assessRisk({ task: 'refactor API', files: ['src/a.js'], config: DEFAULT_CONFIG }).level, 'standard');
  const critical = assessRisk({ task: 'small change', files: ['db/migrate/1.rb'], config: DEFAULT_CONFIG });
  assert.equal(critical.level, 'critical');
  assert.equal(critical.recoveryRequired, true);
  assert.equal(assessRisk({ task: 'small', diff: '+ DROP TABLE users', config: DEFAULT_CONFIG }).level, 'critical');
});

test('risk only auto-escalates and explicit downgrade requires a reason', () => {
  const current = assessRisk({ task: 'payment change', config: DEFAULT_CONFIG });
  const quick = assessRisk({ task: 'copy edit', config: DEFAULT_CONFIG });
  assert.equal(mergeRisk(current, quick).level, 'critical');
  assert.throws(() => mergeRisk(current, quick, { override: 'quick' }), /requires a reason/);
  assert.equal(mergeRisk(current, quick, { override: 'quick', reason: 'docs only' }).level, 'quick');
});
