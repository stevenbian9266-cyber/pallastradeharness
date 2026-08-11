import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from './config-loader.mjs';
import { validateContract } from './contracts.mjs';
import { reviewDomainSupervisors } from './domain-supervisors.mjs';
import { loadStandards } from './standards.mjs';

function git(rootDir, args) {
  return execFileSync('git', args, { cwd: rootDir, encoding: 'utf-8' });
}

function project() {
  const rootDir = mkdtempSync(join(tmpdir(), 'harness-domain-'));
  mkdirSync(join(rootDir, 'src'), { recursive: true });
  writeFileSync(join(rootDir, 'src', 'index.js'), 'export const value = 1\n');
  git(rootDir, ['init', '-b', 'main']);
  git(rootDir, ['config', 'user.email', 'harness@example.test']);
  git(rootDir, ['config', 'user.name', 'Harness Test']);
  git(rootDir, ['add', '.']);
  git(rootDir, ['commit', '-m', 'baseline']);
  return rootDir;
}

function review(rootDir, config, domains) {
  const registry = loadStandards({ rootDir, config });
  assert.deepEqual(registry.errors, []);
  return reviewDomainSupervisors({ rootDir, config, base: 'HEAD', standards: registry.standards, domains }).report;
}

test('database supervisor blocks backfills and irreversible new migrations', () => {
  const rootDir = project();
  try {
    mkdirSync(join(rootDir, 'db', 'migrate'), { recursive: true });
    writeFileSync(join(rootDir, 'db', 'migrate', '001_add_flag.rb'), `class AddFlag < ActiveRecord::Migration[8.0]\n  def up\n    User.update_all(active: true)\n    change_column_null :users, :active, false\n  end\nend\n`);
    const report = review(rootDir, structuredClone(DEFAULT_CONFIG), ['database']);
    assert.ok(report.findings.some(finding => finding.standardId === 'STD-DB-002' && finding.blocking));
    assert.ok(report.findings.some(finding => finding.standardId === 'STD-DB-003' && finding.blocking));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('UI, interaction, accessibility, API, and security reviews emit traceable findings', () => {
  const rootDir = project();
  try {
    mkdirSync(join(rootDir, 'src', 'api'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'api', 'client.ts'), "export const run = () => fetch('/api/v1/users')\n");
    writeFileSync(join(rootDir, 'src', 'Widget.tsx'), `export function Widget() {\n  eval('alert(1)')\n  return <form style={{ color: '#ff0000' }}><img src="/x" /><div onClick={() => 1}>Go</div><button>Save</button></form>\n}\n`);
    const report = review(rootDir, structuredClone(DEFAULT_CONFIG), ['api', 'security', 'ui-style', 'interaction', 'accessibility', 'knowledge']);
    for (const id of ['STD-API-001', 'STD-API-002', 'STD-SEC-002', 'STD-UI-002', 'STD-INT-002', 'STD-A11Y-002', 'STD-KNOW-002']) {
      assert.ok(report.findings.some(finding => finding.standardId === id), `missing ${id}`);
    }
    for (const finding of report.findings) assert.deepEqual(validateContract('Finding', finding), []);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('external verifier absence is explicit not-run instead of a fake pass', () => {
  const rootDir = project();
  try {
    const config = structuredClone(DEFAULT_CONFIG);
    config.supervisor.verifiers = [{ id: 'axe', domain: 'accessibility', command: ['definitely-not-installed-harness-tool'] }];
    const report = review(rootDir, config, ['accessibility']);
    assert.equal(report.verifiers[0].status, 'not-run');
    assert.match(report.verifiers[0].reason, /not installed/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
